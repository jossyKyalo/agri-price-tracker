from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
from typing import List
import os
import sys 

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI(title="Kamis Price Prediction API")
 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'kamis_model.pkl')
SCALER_PATH = os.path.join(BASE_DIR, 'models', 'kamis_scaler.pkl')
ENCODER_PATH = os.path.join(BASE_DIR, 'models', 'kamis_encoder.pkl')  
METADATA_PATH = os.path.join(BASE_DIR, 'models', 'kamis_metadata.json')
RECENT_DATA_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'recent_prices.csv')
 
model = None
scaler = None
encoder = None  
metadata = None
historical_data = None
MODEL_LOADED = False

def load_model_components():
    """Load model, scaler, encoder, and metadata"""
    global model, scaler, encoder, metadata
    
    try:
        # File existence checks
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model not found at {MODEL_PATH}")
        if not os.path.exists(SCALER_PATH):
            raise FileNotFoundError(f"Scaler not found at {SCALER_PATH}")
        if not os.path.exists(ENCODER_PATH): 
            raise FileNotFoundError(f"Encoder not found at {ENCODER_PATH}")
        if not os.path.exists(METADATA_PATH):
            raise FileNotFoundError(f"Metadata not found at {METADATA_PATH}")
        
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        encoder = joblib.load(ENCODER_PATH)  
        
        with open(METADATA_PATH) as f:
            metadata = json.load(f)
        
        print("✓ Model components loaded successfully")
        print(f"  Features: {metadata.get('n_features', 'N/A')}")
        print(f"  Performance: MAE={metadata.get('avg_mae', 0):.2f} KES, R²={metadata.get('avg_r2', 0):.4f}")
        
    except Exception as e:
        print(f"ERROR: Could not load model components: {e}")
        raise

def load_historical_data():
    """Load historical price data"""
    global historical_data
    try:
        if not os.path.exists(RECENT_DATA_PATH):
            raise FileNotFoundError(f"Historical data not found at {RECENT_DATA_PATH}")
        
        data = pd.read_csv(RECENT_DATA_PATH)
        data['Date'] = pd.to_datetime(data['Date'])
        
        historical_data = data
        print(f"✓ Historical data loaded: {len(historical_data)} records")
        
    except Exception as e:
        print(f"ERROR: Could not load historical data: {e}")
        raise
 
try:
    load_model_components()
    load_historical_data()
    MODEL_LOADED = True
except Exception as e:
    print(f"CRITICAL ERROR: {e}")
    MODEL_LOADED = False
 

class PredictionRequest(BaseModel):
    commodity: str
    market: str
    county: str 
    days_ahead: int = 7 

class DayPrediction(BaseModel):
    date: str
    predicted_price: float
    change_percentage: float

class PredictionResponse(BaseModel):
    current_price: float
    predictions: List[DayPrediction]
    trend: str
    recommendation: str
    confidence: str
 

def get_recent_data(commodity: str, market: str, county: str):
    """Get recent historical data, sorted correctly for lag features"""
    mask = (
        (historical_data['Commodity'] == commodity) &
        (historical_data['Market'] == market) &
        (historical_data['County'] == county)
    )
   
    data = historical_data[mask].sort_values('Date', ascending=False).head(30)
    
    if len(data) < 14:  
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient historical data (need 14+ days) for {commodity} in {market}, {county}"
        )
    
    return data

def engineer_features(commodity: str, market: str, county: str, target_date: datetime, historical_data_df: pd.DataFrame):
    """
    Generate features matching the training pipeline, using the encoder.
    The historical_data_df must be sorted newest first (ascending=False).
    """
     
    prices = historical_data_df['Retail'].values 
    
    features = {}
     
    features['year'] = target_date.year
    features['month'] = target_date.month
    features['quarter'] = (target_date.month - 1) // 3 + 1
    features['week'] = target_date.isocalendar()[1]
    features['dayofweek'] = target_date.weekday()
    features['month_sin'] = np.sin(2 * np.pi * features['month'] / 12)
    features['month_cos'] = np.cos(2 * np.pi * features['month'] / 12)
    features['is_harvest'] = 1 if features['month'] in [7, 8, 1, 2] else 0
    features['is_rainy'] = 1 if features['month'] in [3, 4, 5, 10, 11] else 0
    
   
    cat_input = [[commodity, market, county]] 
    cat_encoded = encoder.transform(cat_input)[0] 
    
    features['Commodity'] = cat_encoded[0]
    features['Market'] = cat_encoded[1]
    features['County'] = cat_encoded[2]
     
    for lag in [1, 3, 7, 14]: 
        features[f'lag_{lag}'] = float(prices[lag-1]) if len(prices) >= lag else features.get(f'lag_{lag-1}', 0.0)
    
    
    for window in [7, 14]:
        window_data = prices[:window]  
        features[f'ma_{window}'] = float(np.mean(window_data))
        features[f'std_{window}'] = float(np.std(window_data))
         
    feature_df = pd.DataFrame([features])
    
    feature_df = feature_df.reindex(columns=metadata['features'], fill_value=0.0)
    
    return feature_df
 

@app.get("/")
def root():
    """Health check"""
    if not MODEL_LOADED:
        return {"status": "error", "message": "Model not loaded"}
    
    return {
        "status": "active",
        "message": "Kamis Price Prediction API",
        "model": metadata.get('model_type', 'N/A'),
        "features": metadata.get('n_features', 'N/A'),
        "performance": {
            "mae": round(metadata.get('avg_mae', 0), 2),
            "r2": round(metadata.get('avg_r2', 0), 4)
        }
    }

@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    """
    Make 7-day price prediction using the single-shot forecasting model.
    The days_ahead field must be 7 to match training.
    """
    if not MODEL_LOADED:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        if request.days_ahead != 7:
             raise HTTPException(status_code=400, detail="This model is only trained for 7-day forecasting. Set days_ahead=7.")
        
        recent_data = get_recent_data(request.commodity, request.market, request.county)
        
        current_price = recent_data['Retail'].iloc[0]
        current_date = recent_data['Date'].iloc[0]
        
       
        target_date = current_date + timedelta(days=7) 
        
        X = engineer_features(
            request.commodity,
            request.market,
            request.county,
            target_date, 
            recent_data
        ) 

        X_scaled = scaler.transform(X)
        predicted_price = float(model.predict(X_scaled)[0])
         
        change_pct = ((predicted_price - current_price) / current_price) * 100
        
        day_prediction = DayPrediction(
            date=target_date.strftime('%Y-%m-%d'),
            predicted_price=round(predicted_price, 2),
            change_percentage=round(change_pct, 2)
        )
        
        if abs(change_pct) > 5:
            trend = "rising" if change_pct > 0 else "falling"
            recommendation = f"Price is predicted to be {trend} by {abs(change_pct):.1f}%. Consider adjusting your supply strategy."
        else:
            trend = "stable"
            recommendation = f"Price is expected to remain stable around {current_price:.2f} KES over the next 7 days."
 
        confidence = "Medium" 

        return PredictionResponse(
            current_price=round(current_price, 2),
            predictions=[day_prediction],
            trend=trend,
            recommendation=recommendation,
            confidence=confidence
        )
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal prediction error: {str(e)}")



@app.get("/commodities")
def get_commodities():
    """Get available commodities"""
    if not MODEL_LOADED:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    commodities = historical_data['Commodity'].unique().tolist()
    return {"count": len(commodities), "commodities": sorted(commodities)}

@app.get("/markets")
def get_markets():
    """Get available markets"""
    if not MODEL_LOADED:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    markets = historical_data['Market'].unique().tolist()
    return {"count": len(markets), "markets": sorted(markets)}

@app.get("/counties")
def get_counties():
    """Get available counties"""
    if not MODEL_LOADED:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    counties = historical_data['County'].unique().tolist()
    return {"count": len(counties), "counties": sorted(counties)}

@app.get("/health")
def health_check():
    """Detailed health check"""
    return {
        "status": "healthy" if MODEL_LOADED else "error",
        "model_loaded": MODEL_LOADED,
        "timestamp": datetime.now().isoformat()
    }


@app.on_event("startup")
async def startup_event():
    if MODEL_LOADED:
        print("\n" + "="*60)
        print("Kamis Price Prediction API - READY")
        print("="*60)
        print(f"Model: {metadata.get('model_type', 'N/A')}")
        print(f"Features: {metadata.get('n_features', 'N/A')}")
        print(f"Performance: MAE={metadata.get('avg_mae', 0):.2f} KES")
        print("="*60 + "\n")
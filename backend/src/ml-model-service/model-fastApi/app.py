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
import time
 
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI(title="Kamis Price Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
  
print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚙️  Server process starting...")
APP_DIR = os.path.dirname(os.path.abspath(__file__)) 
PARENT_DIR = os.path.dirname(APP_DIR) 
MODELS_ROOT = os.path.join(PARENT_DIR, 'models') 

MODEL_PATH = os.path.join(MODELS_ROOT, 'kamis_model.pkl')
SCALER_PATH = os.path.join(MODELS_ROOT, 'kamis_scaler.pkl')
ENCODER_PATH = os.path.join(MODELS_ROOT, 'kamis_encoder.pkl')
METADATA_PATH = os.path.join(MODELS_ROOT, 'kamis_metadata.json')
RECENT_DATA_PATH = os.path.join(PARENT_DIR, 'data', 'processed', 'recent_prices.csv')

print(f"  - Data File Path: {RECENT_DATA_PATH}")
 
model = None
scaler = None
encoder = None
metadata = None
historical_data = None
MODEL_LOADED = False

def load_model_components():
    """Load model, scaler, encoder, and metadata"""
    global model, scaler, encoder, metadata
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 📦 Loading Model Components...")
    t0 = time.time()
    
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"❌ Model not found at {MODEL_PATH}")
    
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    encoder = joblib.load(ENCODER_PATH)
    
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Components loaded in {time.time() - t0:.2f}s")

def load_historical_data():
    """Load and INDEX historical price data"""
    global historical_data
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 📊 Loading Historical Data CSV...")
    t0 = time.time()
    
    if not os.path.exists(RECENT_DATA_PATH):
        raise FileNotFoundError(f"❌ Data not found at {RECENT_DATA_PATH}")
     
    try:
        data = pd.read_csv(RECENT_DATA_PATH)
        print(f"  - CSV Read: {len(data)} rows (took {time.time() - t0:.2f}s)")
    except Exception as e:
        print(f"❌ CRITICAL ERROR READING CSV: {e}")
        raise
    
    t1 = time.time()
    print("  - Cleaning data...")
    data = data.dropna(subset=['Commodity', 'Market', 'County'])
    data['Commodity'] = data['Commodity'].astype(str)
    data['Market'] = data['Market'].astype(str)
    data['County'] = data['County'].astype(str)
    data['Date'] = pd.to_datetime(data['Date'])
    
    print("  - Sorting data (this can be slow)...")
    data.sort_values(
        by=['Commodity', 'Market', 'County', 'Date'], 
        ascending=[True, True, True, False], 
        inplace=True
    )

    print("  - Indexing data...")
    data.set_index(['Commodity', 'Market', 'County'], inplace=True)
    
    historical_data = data
    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Data indexed in {time.time() - t1:.2f}s")

 
@app.on_event("startup")
async def startup_event():
    global MODEL_LOADED
    try:
        print("\n" + "="*60)
        print("🚀 STARTING INITIALIZATION SEQUENCE")
        print("="*60)
        
        load_model_components()
        load_historical_data()
        
        MODEL_LOADED = True
        print("="*60)
        print("✅ KAMIS API IS READY TO ACCEPT REQUESTS")
        print("="*60 + "\n")
        
    except Exception as e:
        print("\n" + "!"*60)
        print(f"❌ SERVER STARTUP FAILED: {e}")
        print("!"*60 + "\n")
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
    try: 
        data = historical_data.loc[(commodity, market, county)].head(30)
        if isinstance(data, pd.Series):
            data = data.to_frame().T

        if len(data) < 14:
             raise HTTPException(
                status_code=400,
                detail=f"Insufficient historical data (need 14+ days) for {commodity} in {market}, {county}"
            )
        return data
    except KeyError: 
        raise HTTPException(
            status_code=404,
            detail=f"No data found for {commodity} in {market}, {county}"
        )
    except Exception as e:
        print(f"Error looking up data: {e}")
        raise HTTPException(status_code=500, detail="Data lookup error")

def engineer_features(commodity: str, market: str, county: str, target_date: datetime, historical_data_df: pd.DataFrame):
    prices = historical_data_df['Retail'].values 
    features = {}
      
    features['year'] = target_date.year
    features['month'] = target_date.month
    features['quarter'] = (target_date.month - 1) // 3 + 1
    features['week'] = target_date.isocalendar()[1]
    features['dayofweek'] = target_date.weekday()
    features['month_sin'] = np.sin(2 * np.pi * features['month'] / 12)
    features['month_cos'] = np.cos(2 * np.pi * features['month'] / 12)
    features['is_harvest'] = 1 if features['month'] in [1, 2, 7, 8] else 0
    features['is_rainy'] = 1 if features['month'] in [3, 4, 5, 10, 11, 12] else 0
      
    cat_input = [[commodity, market, county]]
    cat_encoded = encoder.transform(cat_input)[0] 
    features['Commodity_enc'] = cat_encoded[0]
    features['Market_enc'] = cat_encoded[1]
    features['County_enc'] = cat_encoded[2]
      
    for lag in [1, 3, 7, 14, 21, 28, 30]:
        features[f'lag_{lag}'] = float(prices[lag-1]) if len(prices) >= lag else features.get(f'lag_{lag-1}', 0.0)
      
    for window in [7, 14, 30]:
        window_data = prices[:window]
        features[f'ma_{window}'] = float(np.mean(window_data))
        features[f'std_{window}'] = float(np.std(window_data))
        
    feature_df = pd.DataFrame([features])
    feature_df = feature_df.reindex(columns=metadata['features'], fill_value=0.0)
    
    return feature_df
 

@app.get("/")
def root():
    if not MODEL_LOADED:
        return {"status": "error", "message": "Model failed to load - check server logs"}
    
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
         
        X_scaled_array = scaler.transform(X)
         
        X_scaled_df = pd.DataFrame(X_scaled_array, columns=X.columns)
         
        predicted_price = float(model.predict(X_scaled_df)[0]) 
        
        change_pct = ((predicted_price - current_price) / current_price) * 100
        
        day_prediction = DayPrediction(
            date=target_date.strftime('%Y-%m-%d'),
            predicted_price=round(predicted_price, 2),
            change_percentage=round(change_pct, 2)
        )
        
        if abs(change_pct) > 5:
            trend = "rising" if change_pct > 0 else "falling"
            recommendation = f"Price is predicted to be {trend} by {abs(change_pct):.1f}%. Consider adjusting supply."
        else:
            trend = "stable"
            recommendation = f"Price expected to remain stable around {current_price:.2f} KES."

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
        print(f"PREDICTION ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")
 

@app.get("/commodities")
def get_commodities():
    if not MODEL_LOADED: raise HTTPException(status_code=503, detail="Model not loaded")
    items = historical_data.index.get_level_values('Commodity').unique().tolist()
    clean_items = sorted([str(x) for x in items if pd.notna(x)])
    return {"count": len(clean_items), "commodities": clean_items}

@app.get("/markets")
def get_markets():
    if not MODEL_LOADED: raise HTTPException(status_code=503, detail="Model not loaded")
    items = historical_data.index.get_level_values('Market').unique().tolist()
    clean_items = sorted([str(x) for x in items if pd.notna(x)])
    return {"count": len(clean_items), "markets": clean_items}

@app.get("/counties")
def get_counties():
    if not MODEL_LOADED: raise HTTPException(status_code=503, detail="Model not loaded")
    items = historical_data.index.get_level_values('County').unique().tolist()
    clean_items = sorted([str(x) for x in items if pd.notna(x)])
    return {"count": len(clean_items), "counties": clean_items}

@app.get("/health")
def health_check():
    return {
        "status": "healthy" if MODEL_LOADED else "error",
        "model_loaded": MODEL_LOADED,
        "timestamp": datetime.now().isoformat()
    }
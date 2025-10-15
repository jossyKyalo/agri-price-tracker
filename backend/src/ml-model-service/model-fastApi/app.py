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

# Enable CORS
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
METADATA_PATH = os.path.join(BASE_DIR, 'models', 'kamis_metadata.json')
RECENT_DATA_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'recent_prices.csv')

 

def load_model_components():
    """Load model, scaler, and metadata"""
    try:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model not found at {MODEL_PATH}")
        if not os.path.exists(SCALER_PATH):
            raise FileNotFoundError(f"Scaler not found at {SCALER_PATH}")
        if not os.path.exists(METADATA_PATH):
            raise FileNotFoundError(f"Metadata not found at {METADATA_PATH}")
        
        model = joblib.load(MODEL_PATH)
        scaler = joblib.load(SCALER_PATH)
        
        with open(METADATA_PATH) as f:
            metadata = json.load(f)
        
        print("✓ Model loaded successfully")
        print(f"  Features: {metadata['n_features']}")
        print(f"  Performance: MAE={metadata['avg_mae']:.2f} KES, R²={metadata['avg_r2']:.4f}")
        
        return model, scaler, metadata
    
    except Exception as e:
        print(f"ERROR: Could not load model components")
        print(f"  {e}")
        raise

def load_historical_data():
    """Load historical price data"""
    try:
        if not os.path.exists(RECENT_DATA_PATH):
            raise FileNotFoundError(f"Historical data not found at {RECENT_DATA_PATH}")
        
        data = pd.read_csv(RECENT_DATA_PATH)
        data['Date'] = pd.to_datetime(data['Date'])
        
        print(f"✓ Historical data loaded: {len(data)} records")
        return data
    
    except Exception as e:
        print(f"ERROR: Could not load historical data: {e}")
        raise

# Load on startup
try:
    model, scaler, metadata = load_model_components()
    historical_data = load_historical_data()
    MODEL_LOADED = True
except Exception as e:
    print(f"CRITICAL ERROR: {e}")
    MODEL_LOADED = False

 

class PredictionRequest(BaseModel):
    commodity: str
    market: str
    county: str
    days_ahead: int = 1

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
    """Get recent historical data"""
    mask = (
        (historical_data['Commodity'] == commodity) &
        (historical_data['Market'] == market) &
        (historical_data['County'] == county)
    )
    
    data = historical_data[mask].sort_values('Date', ascending=False).head(30)
    
    if len(data) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"No data for {commodity} in {market}, {county}"
        )
    
    return data

def engineer_features(commodity: str, market: str, county: str, target_date: datetime, historical_prices: pd.Series):
    """Generate features matching training pipeline"""
    features = {}
    
    # Temporal
    features['year'] = target_date.year
    features['month'] = target_date.month
    features['quarter'] = (target_date.month - 1) // 3 + 1
    features['week'] = target_date.isocalendar()[1]
    features['dayofweek'] = target_date.weekday()
    
    # Cyclical
    features['month_sin'] = np.sin(2 * np.pi * features['month'] / 12)
    features['month_cos'] = np.cos(2 * np.pi * features['month'] / 12)
    
    # Seasonal
    features['is_harvest'] = 1 if features['month'] in [7, 8, 1, 2] else 0
    features['is_rainy'] = 1 if features['month'] in [3, 4, 5, 10, 11] else 0
    
    # Lag features
    prices = historical_prices.values
    for lag in [1, 3, 7, 14]:
        if len(prices) >= lag:
            features[f'lag_{lag}'] = float(prices[lag-1])
        else:
            features[f'lag_{lag}'] = float(prices[-1]) if len(prices) > 0 else 0.0
    
    # Rolling features
    for window in [7, 14]:
        window_data = prices[:min(window, len(prices))]
        if len(window_data) > 0:
            features[f'ma_{window}'] = float(np.mean(window_data))
            features[f'std_{window}'] = float(np.std(window_data)) if len(window_data) > 1 else 0.0
        else:
            features[f'ma_{window}'] = 0.0
            features[f'std_{window}'] = 0.0
    
    # Categorical - one-hot encoding
    for feature_name in metadata['features']:
        if feature_name.startswith('Commodity_'):
            commodity_val = feature_name.replace('Commodity_', '').replace('_', ' ')
            features[feature_name] = 1 if commodity.strip() == commodity_val.strip() else 0
        elif feature_name.startswith('Market_'):
            market_val = feature_name.replace('Market_', '').replace('_', ' ')
            features[feature_name] = 1 if market.strip() == market_val.strip() else 0
        elif feature_name.startswith('County_'):
            county_val = feature_name.replace('County_', '').replace('_', ' ')
            features[feature_name] = 1 if county.strip() == county_val.strip() else 0
        elif feature_name not in features:
            features[feature_name] = 0.0
     
    feature_df = pd.DataFrame([features])[metadata['features']]
    feature_df = feature_df.fillna(0.0)
    
    return feature_df
 

@app.get("/")
def root():
    """Health check"""
    if not MODEL_LOADED:
        return {"status": "error", "message": "Model not loaded"}
    
    return {
        "status": "active",
        "message": "Kamis Price Prediction API",
        "model": metadata['model_type'],
        "features": metadata['n_features'],
        "performance": {
            "mae": round(metadata['avg_mae'], 2),
            "r2": round(metadata['avg_r2'], 4)
        }
    }

@app.post("/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest):
    """Make price prediction"""
    if not MODEL_LOADED:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        if request.days_ahead < 1 or request.days_ahead > 30:
            raise HTTPException(status_code=400, detail="days_ahead must be 1-30")
        
        # Get historical data
        recent_data = get_recent_data(request.commodity, request.market, request.county)
        current_price = recent_data['Retail'].iloc[0]
        current_date = recent_data['Date'].iloc[0]
        prices = recent_data['Retail'].sort_values(ascending=True)
        
        # Make predictions
        predictions = []
        predicted_prices = []
        
        for day in range(1, request.days_ahead + 1):
            target_date = current_date + timedelta(days=day)
            
            X = engineer_features(
                request.commodity,
                request.market,
                request.county,
                target_date,
                prices
            )
            
            X_scaled = scaler.transform(X)
            predicted_price = float(model.predict(X_scaled)[0])
            predicted_prices.append(predicted_price)
            
            if day == 1:
                prev_price = current_price
            else:
                prev_price = predicted_prices[-2]
            
            change_pct = ((predicted_price - prev_price) / prev_price) * 100
            
            predictions.append(DayPrediction(
                date=target_date.strftime('%Y-%m-%d'),
                predicted_price=round(predicted_price, 2),
                change_percentage=round(change_pct, 2)
            ))
        
        # Trend analysis
        avg_change = ((predicted_prices[-1] - current_price) / current_price) * 100
        
        if avg_change > 5:
            trend = "rising"
            recommendation = f"Price rising {abs(avg_change):.1f}%. May be better to wait."
        elif avg_change < -5:
            trend = "falling"
            recommendation = f"Price falling {abs(avg_change):.1f}%. Consider buying now."
        else:
            trend = "stable"
            recommendation = f"Price stable around {current_price:.2f} KES."
        
        # Confidence
        if request.days_ahead <= 3:
            confidence = "High"
        elif request.days_ahead <= 7:
            confidence = "Medium"
        else:
            confidence = "Low"
        
        return PredictionResponse(
            current_price=round(current_price, 2),
            predictions=predictions,
            trend=trend,
            recommendation=recommendation,
            confidence=confidence
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        print(f"Model: {metadata['model_type']}")
        print(f"Features: {metadata['n_features']}")
        print(f"Performance: MAE={metadata['avg_mae']:.2f} KES")
        print("="*60 + "\n")
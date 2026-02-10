from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
import os
import json
from datetime import datetime, timedelta
import uvicorn
import warnings
import re

warnings.filterwarnings('ignore')

app = FastAPI(title="Kamis Price Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PATH CONFIGURATION ---
# Assumes this script is in src/ml-model-service/model-fastApi/
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) 
SERVICE_ROOT = os.path.dirname(CURRENT_DIR) # src/ml-model-service/

MODELS_DIR = os.path.join(SERVICE_ROOT, 'models')
DATA_DIR = os.path.join(SERVICE_ROOT, 'data', 'processed')

artifacts = {
    "model": None,
    "scaler": None,
    "encoder": None,
    "metadata": None,
    "history_df": None
}

class PredictionRequest(BaseModel):
    commodity: str
    market: str
    county: str
    days_ahead: int = 7

def extract_unit_api(commodity_name):
    """Fallback unit logic if not found in history"""
    name = commodity_name.lower()
    if 'cow' in name or 'goat' in name or 'sheep' in name: return 'head'
    if 'bag' in name: return 'bag'
    return 'kg' 

@app.on_event("startup")
async def load_artifacts():
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 📦 Loading artifacts from {MODELS_DIR}...")
        
        if not os.path.exists(os.path.join(MODELS_DIR, "kamis_model.pkl")):
             print("❌ Model files not found! Please run train_model.py first.")
             return

        artifacts["model"] = joblib.load(os.path.join(MODELS_DIR, "kamis_model.pkl"))
        artifacts["scaler"] = joblib.load(os.path.join(MODELS_DIR, "kamis_scaler.pkl"))
        artifacts["encoder"] = joblib.load(os.path.join(MODELS_DIR, "kamis_encoder.pkl"))
        with open(os.path.join(MODELS_DIR, "kamis_metadata.json"), 'r') as f:
            artifacts["metadata"] = json.load(f)
            
        csv_path = os.path.join(DATA_DIR, "recent_prices.csv")
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            df['Date'] = pd.to_datetime(df['Date'])
            artifacts["history_df"] = df
            print(f"   📊 Loaded history: {len(df)} records")
        else:
            print(f"   ⚠️ Warning: recent_prices.csv not found at {csv_path}")
        print("✅ ML API Ready.")
    except Exception as e:
        print(f"❌ Startup Failed: {e}")

def get_features(commodity, market, county):
    target_date = datetime.now() + timedelta(days=7)
    
    # 1. Base Temporal
    features = {
        'year': target_date.year,
        'month': target_date.month,
        'quarter': (target_date.month - 1) // 3 + 1,
        'week': target_date.isocalendar()[1],
        'dayofweek': target_date.weekday(),
        'month_sin': np.sin(2 * np.pi * target_date.month / 12),
        'month_cos': np.cos(2 * np.pi * target_date.month / 12),
        'is_harvest': 1 if target_date.month in [1, 2, 7, 8] else 0,
        'is_rainy': 1 if target_date.month in [3, 4, 5, 10, 11, 12] else 0
    }
    
    prices = []
    unit = 'kg' 
    
    # 2. Extract History
    if artifacts["history_df"] is not None:
        subset = artifacts["history_df"][
            (artifacts["history_df"]['Commodity'] == commodity) & 
            (artifacts["history_df"]['Market'] == market) & 
            (artifacts["history_df"]['County'] == county)
        ].sort_values('Date')
        
        if not subset.empty:
            prices = subset['Retail'].values[-40:] # Get last 40 for lags
            if 'Unit' in subset.columns:
                unit = subset['Unit'].iloc[-1]
    
    if not prices:
        unit = extract_unit_api(commodity)

    # 3. Lags
    lags = [1, 3, 7, 14, 21, 28, 30]
    for lag in lags:
        idx = -lag
        if len(prices) >= lag:
            features[f'lag_{lag}'] = float(prices[idx])
        else:
            # Fallback for new items: use last known price
            features[f'lag_{lag}'] = float(prices[-1]) if len(prices) > 0 else 0.0

    # 4. Rolling Stats
    windows = [7, 14, 30]
    for w in windows:
        if len(prices) > 0:
            slice_data = prices[-w:]
            features[f'ma_{w}'] = float(np.mean(slice_data))
            features[f'std_{w}'] = float(np.std(slice_data)) if len(slice_data) > 1 else 0.0
        else:
            features[f'ma_{w}'] = 0.0
            features[f'std_{w}'] = 0.0

    # 5. Encode Categoricals
    try:
        cat_df = pd.DataFrame([[commodity, market, county, unit]], 
                              columns=['Commodity', 'Market', 'County', 'Unit'])
        encoded = artifacts["encoder"].transform(cat_df)[0]
        features['Commodity_enc'] = encoded[0]
        features['Market_enc'] = encoded[1]
        features['County_enc'] = encoded[2]
        features['Unit_enc'] = encoded[3]
    except:
        features['Commodity_enc'] = -1.0
        features['Market_enc'] = -1.0
        features['County_enc'] = -1.0
        features['Unit_enc'] = -1.0
        
    return features, prices, unit

# --- ENDPOINTS ---

@app.get("/")
def root():
    """Root endpoint to check API status and performance stats"""
    meta = artifacts.get("metadata") or {}
    
    return {
        "status": "online",
        "message": "Kamis Price Prediction API is running",
        "model_loaded": artifacts["model"] is not None,
        "timestamp": datetime.now().isoformat(),
        # FIX: Include performance object so Frontend can read r2 accuracy
        "performance": {
            "r2": meta.get("avg_r2", 0.0),
            "training_samples": meta.get("training_samples", 0),
            "last_trained": meta.get("trained_date", None)
        }
    }

@app.post("/predict")
def predict_price(req: PredictionRequest):
    if not artifacts["model"]:
        raise HTTPException(status_code=503, detail="Model unavailable")

    try:
        feat_dict, history, unit = get_features(req.commodity, req.market, req.county)
        current_price = history[-1] if len(history) > 0 else 0
        
        feature_order = artifacts["metadata"]['features']
        
        # DataFrame conversion
        X_df = pd.DataFrame([feat_dict])
        
        # Align columns with training data
        for col in feature_order:
            if col not in X_df.columns:
                X_df[col] = 0
        X_df = X_df[feature_order]
        
        X_scaled = artifacts["scaler"].transform(X_df)
        X_final = pd.DataFrame(X_scaled, columns=feature_order)
        
        # Predict
        pred_val = artifacts["model"].predict(X_final)[0]
        pred_val = max(0, float(pred_val))
        
        change = 0
        if current_price > 0:
            change = ((pred_val - current_price) / current_price) * 100
            
        trend = "stable"
        if change > 2: trend = "rising"
        if change < -2: trend = "falling"
        
        # Calculate Confidence based on history depth
        confidence = 0.5
        if len(history) >= 14: confidence = 0.85
        if len(history) >= 30: confidence = 0.95
        
        return {
            "current_price": round(current_price, 2),
            "unit": unit,
            "predictions": [{
                "date": (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
                "predicted_price": round(pred_val, 2),
                "change_percentage": round(change, 2)
            }],
            "trend": trend,
            "recommendation": f"Price expected to be {trend}",
            "confidence": confidence
        }

    except Exception as e:
        print(f"Prediction Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok", "loaded": artifacts["model"] is not None}

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
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
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__)) 
SERVICE_ROOT = os.path.dirname(CURRENT_DIR) 
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
    current_price: float = None # Added for safety

@app.on_event("startup")
async def load_artifacts():
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 📦 Loading artifacts...")
        
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
            print(f"   Loaded history: {len(df)} records")
        else:
            print(f"   Warning: recent_prices.csv not found at {csv_path}")
        print("✅ ML API Ready.")
    except Exception as e:
        print(f"❌ Startup Failed: {e}")

def get_features_and_price(commodity, market, county, provided_price=None):
    target_date = datetime.now() + timedelta(days=7)
    
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
    
    # 2. Extract History with Fuzzy Matching
    if artifacts["history_df"] is not None:
        df = artifacts["history_df"]
        
        # Try Exact Match
        mask = (df['Commodity'] == commodity) & (df['Market'] == market) & (df['County'] == county)
        subset = df[mask]

        # If empty, try matching without "Market" suffix in name (e.g. Nakuru vs Nakuru Market)
        if subset.empty:
             market_simple = market.replace(' Market', '').strip()
             mask = (df['Commodity'] == commodity) & (df['Market'].str.contains(market_simple, case=False))
             subset = df[mask]

        # If still empty, try broader Region match (County avg)
        if subset.empty:
             mask = (df['Commodity'] == commodity) & (df['County'] == county)
             subset = df[mask]
        
        if not subset.empty:
            subset = subset.sort_values('Date')
            prices = subset['Retail'].values[-40:]
            if 'Unit' in subset.columns:
                unit = subset['Unit'].iloc[-1]
    
    # 3. SAFETY NET: If no history, use provided_price to backfill
    if len(prices) == 0 and provided_price and provided_price > 0:
        print(f"   ⚠️ No history for {commodity} in {market}. Using provided current price: {provided_price}")
        prices = [provided_price] * 10 # Assume flat history
    
    # 4. Lags
    lags = [1, 3, 7, 14, 21, 28, 30]
    for lag in lags:
        idx = -lag
        if len(prices) >= lag:
            features[f'lag_{lag}'] = float(prices[idx])
        else:
            features[f'lag_{lag}'] = float(prices[-1]) if len(prices) > 0 else 0.0

    # 5. Rolling Stats
    windows = [7, 14, 30]
    for w in windows:
        if len(prices) > 0:
            slice_data = prices[-w:]
            features[f'ma_{w}'] = float(np.mean(slice_data))
            features[f'std_{w}'] = float(np.std(slice_data)) if len(slice_data) > 1 else 0.0
        else:
            features[f'ma_{w}'] = 0.0
            features[f'std_{w}'] = 0.0

    # 6. Encode
    try:
        cat_df = pd.DataFrame([[commodity, market, county, unit]], columns=['Commodity', 'Market', 'County', 'Unit'])
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

# --- ADDED ROOT ENDPOINT HERE ---
@app.get("/")
def root():
    """Root endpoint to check API status and performance stats"""
    meta = artifacts.get("metadata") or {}
    return {
        "status": "online",
        "message": "Kamis Price Prediction API is running",
        "model_loaded": artifacts["model"] is not None,
        "timestamp": datetime.now().isoformat(),
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
        feat_dict, history, unit = get_features_and_price(
            req.commodity, req.market, req.county, req.current_price
        )
        
        current_price = history[-1] if len(history) > 0 else (req.current_price or 0)
        
        feature_order = artifacts["metadata"]['features']
        X_df = pd.DataFrame([feat_dict]).reindex(columns=feature_order, fill_value=0)
        X_scaled = artifacts["scaler"].transform(X_df)
        X_final = pd.DataFrame(X_scaled, columns=feature_order)
        
        pred_val = artifacts["model"].predict(X_final)[0]
        pred_val = max(0, float(pred_val))
        
        # --- SANITY CLAMP ---
        # If prediction deviates wildly (>50%) from current price, check data quality
        if current_price > 0:
            change_ratio = (pred_val - current_price) / current_price
            if abs(change_ratio) > 0.5:
                 # If extreme deviation, trust the Moving Average or Current Price
                 ma_val = feat_dict.get('ma_7', 0)
                 if ma_val > 0 and abs((ma_val - current_price)/current_price) < 0.3:
                     pred_val = ma_val
                 else:
                     pred_val = current_price
        
        change = 0
        if current_price > 0:
            change = ((pred_val - current_price) / current_price) * 100
            
        trend = "stable"
        if change > 2: trend = "rising"
        if change < -2: trend = "falling"
        
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

@app.post("/reload")
async def reload_model_data():
    """Force reload of model and csv data after training"""
    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔄 Reload signal received. Refreshing artifacts...")
        await load_artifacts()
        return {"status": "success", "message": "Model and Data reloaded successfully"}
    except Exception as e:
        print(f"Reload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import StandardScaler, OrdinalEncoder
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import json
from datetime import datetime
import os
import warnings
import sys
import re

 
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

warnings.filterwarnings('ignore')

 
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 
DATA_RAW_DIR = os.path.join(BASE_DIR, 'data', 'raw')
DATA_PROCESSED_DIR = os.path.join(BASE_DIR, 'data', 'processed')
MODELS_DIR = os.path.join(BASE_DIR, 'models')

HISTORICAL_DATA_FILE = os.path.join(DATA_RAW_DIR, 'kamis_data.csv')
LATEST_DATA_FILE = os.path.join(DATA_RAW_DIR, 'kamis_latest.csv')

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_PROCESSED_DIR, exist_ok=True)

def extract_unit(price_str):
    if not isinstance(price_str, str): return 'kg'
    price_str = price_str.lower()
    if 'head' in price_str: return 'head'
    if 'bag' in price_str: return 'bag'
    return 'kg'

def clean_price(col):
    if col.dtype == 'object':
        col = col.astype(str)
        col = col.str.replace(r'/[a-zA-Z0-9\s]+$', '', regex=True)
        col = col.str.replace(',', '', regex=False)
        col = col.str.replace('-', '')
        col = pd.to_numeric(col, errors='coerce')
    return col

def load_and_merge_data():
    print("\n--- 1. Loading and Merging Data ---")
    df_history = pd.DataFrame()
    df_latest = pd.DataFrame()

    if os.path.exists(HISTORICAL_DATA_FILE):
        print(f"   Loading history: {HISTORICAL_DATA_FILE}")
        df_history = pd.read_csv(HISTORICAL_DATA_FILE)

    if os.path.exists(LATEST_DATA_FILE):
        print(f"   Loading latest: {LATEST_DATA_FILE}")
        df_latest = pd.read_csv(LATEST_DATA_FILE)

    if df_history.empty and df_latest.empty:
        raise ValueError("No data found to train on!")

    df = pd.concat([df_history, df_latest], ignore_index=True)
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    df = df.dropna(subset=['Date'])
    
    print("   Deduplicating records...")
    df = df.drop_duplicates(subset=['Date', 'Commodity', 'Market', 'County'], keep='last')
    df = df.sort_values(by='Date').reset_index(drop=True)
    
    print(f"   Saving merged dataset ({len(df):,} rows) back to history...")
    df_save = df.copy()
    df_save['Date'] = df_save['Date'].dt.strftime('%Y-%m-%d')
    df_save.to_csv(HISTORICAL_DATA_FILE, index=False)
    
     
    print("   Exporting recent_prices.csv for API (Unfiltered)...")
    
    
    df_api = df.copy()
    df_api['Unit'] = df_api['Retail'].apply(extract_unit)
    df_api['Retail'] = clean_price(df_api['Retail'])
    df_api['Wholesale'] = clean_price(df_api['Wholesale'])
    df_api = df_api.dropna(subset=['Retail'])
    
    recent_data = df_api.groupby(['Commodity', 'Market', 'County']).tail(60).copy()
    recent_data['Date'] = recent_data['Date'].dt.strftime('%Y-%m-%d')
    output_cols = ['Date', 'Commodity', 'Market', 'County', 'Retail', 'Unit']
    if 'Wholesale' in recent_data.columns: output_cols.append('Wholesale')
    
   
    cols_to_save = [c for c in output_cols if c in recent_data.columns]
    recent_data[cols_to_save].to_csv(os.path.join(DATA_PROCESSED_DIR, 'recent_prices.csv'), index=False)
    
    return df

def preprocess_data(df):
    print("\n--- 2. Preprocessing & Cleaning for Training ---")
    df['Unit'] = df['Retail'].apply(extract_unit)
    df['Retail'] = clean_price(df['Retail'])
    df['Wholesale'] = clean_price(df['Wholesale'])
    df['Supply Volume'] = pd.to_numeric(df['Supply Volume'], errors='coerce').fillna(0)
    
    df = df.dropna(subset=['Retail'])
    
    
    initial_count = len(df)
    df = df[(df['Retail'] > 5) & (df['Retail'] < 2000)] 
    
    print(f"   Cleaned Rows for Training: {len(df):,} (Dropped {initial_count - len(df):,} outliers/high-value)")
    return df

def feature_engineering(df):
    print("\n--- 3. Feature Engineering ---")
    df = df.sort_values(['Commodity', 'Market', 'County', 'Date']).reset_index(drop=True)
    
    df['year'] = df['Date'].dt.year
    df['month'] = df['Date'].dt.month
    df['quarter'] = df['Date'].dt.quarter
    df['week'] = df['Date'].dt.isocalendar().week.astype(int)
    df['dayofweek'] = df['Date'].dt.dayofweek
    
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
    df['is_harvest'] = df['month'].isin([1, 2, 7, 8]).astype(int)
    df['is_rainy'] = df['month'].isin([3, 4, 5, 10, 11, 12]).astype(int)
    
    lags = [1, 3, 7, 14, 21, 28, 30] 
    for lag in lags:
        df[f'lag_{lag}'] = df.groupby(['Commodity', 'Market', 'County'])['Retail'].shift(lag)
    
    windows = [7, 14, 30]
    for w in windows:
        grouped = df.groupby(['Commodity', 'Market', 'County'])['Retail']
        df[f'ma_{w}'] = grouped.transform(lambda x: x.rolling(window=w, min_periods=1).mean())
        df[f'std_{w}'] = grouped.transform(lambda x: x.rolling(window=w, min_periods=1).std())
        
    df['target_retail'] = df.groupby(['Commodity', 'Market', 'County'])['Retail'].shift(-7)
    
    return df

def train_model(df):
    print("\n--- 4. Training Model ---")
    
    cat_cols = ['Commodity', 'Market', 'County', 'Unit']
    enc_cols = [f"{c}_enc" for c in cat_cols]
    
    encoder = OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1)
    df[enc_cols] = encoder.fit_transform(df[cat_cols])
    
    lags = [1, 3, 7, 14, 21, 28, 30]
    windows = [7, 14, 30]
    
    features = [
        'year', 'month', 'quarter', 'week', 'dayofweek',
        'month_sin', 'month_cos', 'is_harvest', 'is_rainy'
    ] + [f'lag_{i}' for i in lags] + \
      [f'ma_{w}' for w in windows] + \
      [f'std_{w}' for w in windows] + \
      enc_cols
     
    cols_to_check = features + ['target_retail']
    train_df = df.dropna(subset=cols_to_check).copy()
    
    train_df = train_df.sort_values(by='Date')
    
    X = train_df[features]
    y = train_df['target_retail']
    
    print(f"   Training Data Shape: {X.shape}")
    
    scaler = StandardScaler()
    X_scaled_array = scaler.fit_transform(X)
    X_scaled_df = pd.DataFrame(X_scaled_array, columns=features, index=X.index)
    
    model = HistGradientBoostingRegressor(
        learning_rate=0.1,        
        max_iter=200,             
        max_depth=15,             
        l2_regularization=0.1,    
        random_state=42,
        verbose=0
    )
    
    print("   Running Validation...")
    tscv = TimeSeriesSplit(n_splits=5)
    scores = []
    
    for train_idx, test_idx in tscv.split(X_scaled_df):
        X_train, y_train = X_scaled_df.iloc[train_idx], y.iloc[train_idx]
        X_test, y_test = X_scaled_df.iloc[test_idx], y.iloc[test_idx]
        
        model.fit(X_train, y_train)
        score = model.score(X_test, y_test)
        scores.append(score)
        
    avg_r2 = np.mean(scores)
    print(f"   Average Validation R²: {avg_r2:.4f}")
    
    print("   Training final model on full dataset...")
    model.fit(X_scaled_df, y)
    
    return model, scaler, encoder, features, avg_r2

def save_artifacts(model, scaler, encoder, feature_list, score):
    print("\n--- 5. Saving Artifacts ---")
    print(f"   Saving to: {MODELS_DIR}")
    
    joblib.dump(model, os.path.join(MODELS_DIR, 'kamis_model.pkl'))
    joblib.dump(scaler, os.path.join(MODELS_DIR, 'kamis_scaler.pkl'))
    joblib.dump(encoder, os.path.join(MODELS_DIR, 'kamis_encoder.pkl'))
    
    metadata = {
        'features': feature_list, 
        'model_type': 'HistGradientBoostingRegressor_Fixed', 
        'avg_r2': float(score),
        'trained_date': datetime.now().isoformat()
    }
    
    with open(os.path.join(MODELS_DIR, 'kamis_metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print("Pipeline Complete.")

if __name__ == "__main__":
    try:
        df_merged = load_and_merge_data()
        df_clean = preprocess_data(df_merged)
        df_features = feature_engineering(df_clean)
        model, scaler, encoder, features, score = train_model(df_features)
        save_artifacts(model, scaler, encoder, features, score)
    except Exception as e:
        print(f"\nPipeline Failed: {e}")
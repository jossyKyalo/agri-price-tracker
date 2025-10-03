from fastapi import FastAPI
import joblib
import pandas as pd
 
app = FastAPI()
 
model = joblib.load("../models/price_model.pkl")
scaler = joblib.load("../models/scaler.pkl")

@app.post("/predict")
def predict(data: dict):
     
    df = pd.DataFrame([data])

     
    X_scaled = scaler.transform(df)
 
    pred = model.predict(X_scaled)[0]
    return {"prediction": float(pred)}

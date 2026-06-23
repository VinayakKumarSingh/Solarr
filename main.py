import os
import joblib
import pandas as pd
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import httpx

class SimulationRequest(BaseModel):
    ambient_temp: float
    cloud_cover: float = 0.0
    direct_radiation: float = 1000.0

MODEL_NORMAL_FILE = "model_normal.pkl"
MODEL_COOLED_FILE = "model_cooled.pkl"
BASELINE_MAX_VOLTAGE = 8.5
BASELINE_MAX_CURRENT = 300.0

# Global variables to hold the loaded models
ml_model_normal = None
ml_model_cooled = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model_normal, ml_model_cooled
    if os.path.exists(MODEL_NORMAL_FILE):
        print("Loading normal ML model...")
        ml_model_normal = joblib.load(MODEL_NORMAL_FILE)
        print("Normal model loaded successfully.")
    else:
        print("WARNING: model_normal.pkl not found! Forecast endpoint will fail.")
        
    if os.path.exists(MODEL_COOLED_FILE):
        print("Loading cooled ML model...")
        ml_model_cooled = joblib.load(MODEL_COOLED_FILE)
        print("Cooled model loaded successfully.")
    else:
        print("WARNING: model_cooled.pkl not found! Forecast endpoint will fail.")
    yield
    print("Shutting down...")

app = FastAPI(title="Solar Digital Twin API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Solar Digital Twin API is running. Check /api/live or /api/forecast."}

@app.get("/api/live")
async def get_live_data():
    """
    Pings Open-Meteo current weather API.
    Calculates simulated live metrics for both Normal and Fin-Cooled panels.
    Returns JSON object.
    """
    url = "https://api.open-meteo.com/v1/forecast?latitude=12.97&longitude=77.59&current=temperature_2m,cloud_cover,direct_radiation"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=10.0)
            if response.status_code != 200:
                return {"error": f"Failed to fetch data from Open-Meteo. Status: {response.status_code}"}
                
            data = response.json()
            current_weather = data.get("current", {})
            ambient = current_weather.get("temperature_2m", 25.0)
            cloud = current_weather.get("cloud_cover", 0.0)
            rad = current_weather.get("direct_radiation", 0.0)
            
            # Normal Panel Calculations
            panel_temp = ambient + (rad * 0.03)
            temp_diff = max(0.0, panel_temp - 25.0)
            voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * temp_diff)
            current = BASELINE_MAX_CURRENT * (rad / 1000.0)
            power = voltage * current
            
            # Fin-Cooled Panel Calculations
            cooled_panel_temp = ambient + (rad * 0.012)
            cooled_temp_diff = max(0.0, cooled_panel_temp - 25.0)
            cooled_voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * cooled_temp_diff)
            cooled_power = cooled_voltage * current
            
            # LDR approximation
            ldr = int((rad / 1000.0) * 1023.0)
            ldr = max(0, min(1023, ldr))
            
            return {
                "ambient_temp": ambient,
                "cloud_cover": cloud,
                "direct_radiation": rad,
                "ldr": ldr,
                # Normal Panel
                "panel_temp": panel_temp,
                "voltage": voltage,
                "current": current,
                "power": power,
                # Cooled Panel (Fins)
                "cooled_panel_temp": cooled_panel_temp,
                "cooled_voltage": cooled_voltage,
                "cooled_current": current,
                "cooled_power": cooled_power
            }
        except Exception as e:
            return {"error": str(e)}

@app.post("/api/simulate")
async def simulate_data(req: SimulationRequest):
    """
    Simulates physics calculations for Normal and Cooled panels.
    """
    # Normal Panel
    panel_temp = req.ambient_temp + (req.direct_radiation * 0.03)
    temp_diff = max(0.0, panel_temp - 25.0)
    voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * temp_diff)
    current = BASELINE_MAX_CURRENT * (req.direct_radiation / 1000.0)
    power = voltage * current
    
    # Fin-Cooled Panel
    cooled_panel_temp = req.ambient_temp + (req.direct_radiation * 0.012)
    cooled_temp_diff = max(0.0, cooled_panel_temp - 25.0)
    cooled_voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * cooled_temp_diff)
    cooled_power = cooled_voltage * current
    
    # LDR approximation
    ldr = int((req.direct_radiation / 1000.0) * 1023.0)
    ldr = max(0, min(1023, ldr))
    
    return {
        "ambient_temp": req.ambient_temp,
        "cloud_cover": req.cloud_cover,
        "direct_radiation": req.direct_radiation,
        "ldr": ldr,
        # Normal Panel
        "panel_temp": panel_temp,
        "voltage": voltage,
        "current": current,
        "power": power,
        # Cooled Panel
        "cooled_panel_temp": cooled_panel_temp,
        "cooled_voltage": cooled_voltage,
        "cooled_current": current,
        "cooled_power": cooled_power
    }

@app.get("/api/forecast")
async def get_forecast_data():
    """
    Pings Open-Meteo hourly forecast API for next 24 hours.
    Uses both ML models to predict power outputs.
    """
    if ml_model_normal is None or ml_model_cooled is None:
        return {"error": "ML models not loaded."}
        
    url = "https://api.open-meteo.com/v1/forecast?latitude=12.97&longitude=77.59&hourly=temperature_2m,cloud_cover,direct_radiation&forecast_days=2"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, timeout=10.0)
            if response.status_code != 200:
                return {"error": f"Failed to fetch data from Open-Meteo. Status: {response.status_code}"}
                
            data = response.json()
            hourly_data = data.get("hourly", {})
            times = hourly_data.get("time", [])
            temps = hourly_data.get("temperature_2m", [])
            clouds = hourly_data.get("cloud_cover", [])
            radiations = hourly_data.get("direct_radiation", [])
            
            if not times:
                return {"error": "No hourly data found in response."}
                
            # Get next 24 hours starting from current UTC time
            current_time = datetime.utcnow()
            
            start_idx = 0
            for i, t in enumerate(times):
                dt_obj = datetime.strptime(t, "%Y-%m-%dT%H:%M")
                if dt_obj >= current_time:
                    start_idx = i
                    break
                    
            end_idx = min(start_idx + 24, len(times))
            forecast_results = []
            
            for i in range(start_idx, end_idx):
                t = times[i]
                ambient = temps[i] if temps[i] is not None else 25.0
                cloud = clouds[i] if clouds[i] is not None else 0.0
                rad = radiations[i] if radiations[i] is not None else 0.0
                
                # Respective Panel Temperatures
                panel_temp = ambient + (rad * 0.03)
                cooled_panel_temp = ambient + (rad * 0.012)
                
                # 1. Predict Normal Power
                df_features_n = pd.DataFrame(
                    [[ambient, panel_temp, cloud]], 
                    columns=['ambient_temp', 'panel_temp', 'cloud_cover']
                )
                predicted_power = ml_model_normal.predict(df_features_n)[0]
                
                # 2. Predict Cooled Power (Fins)
                df_features_c = pd.DataFrame(
                    [[ambient, cooled_panel_temp, cloud]], 
                    columns=['ambient_temp', 'cooled_panel_temp', 'cloud_cover']
                )
                predicted_cooled_power = ml_model_cooled.predict(df_features_c)[0]
                
                forecast_results.append({
                    "time": t + "Z",  # Append Z for UTC timezone parsing in browser
                    "predicted_power": float(predicted_power),
                    "predicted_cooled_power": float(predicted_cooled_power),
                    "ambient_temp": ambient,
                    "panel_temp": panel_temp,
                    "cooled_panel_temp": cooled_panel_temp,
                    "cloud_cover": cloud
                })
                
            return forecast_results
        except Exception as e:
            return {"error": str(e)}

@app.get("/api/model-status")
def get_model_status():
    """
    Returns metrics and training info from model_metadata.json
    """
    if os.path.exists("model_metadata.json"):
        try:
            with open("model_metadata.json", "r") as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to read metadata: {str(e)}"}
    return {"error": "Model metadata not found. Train the model first."}

@app.post("/api/train")
def train_model_endpoint():
    """
    Triggers retraining of both models and reloads them.
    """
    from train_model import train as train_models
    try:
        train_models()
        
        # Reload models in memory
        global ml_model_normal, ml_model_cooled
        if os.path.exists(MODEL_NORMAL_FILE):
            ml_model_normal = joblib.load(MODEL_NORMAL_FILE)
        if os.path.exists(MODEL_COOLED_FILE):
            ml_model_cooled = joblib.load(MODEL_COOLED_FILE)
            
        if os.path.exists("model_metadata.json"):
            with open("model_metadata.json", "r") as f:
                return {"status": "success", "metrics": json.load(f)}
        return {"status": "success", "message": "Models trained successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/feature-importance")
def get_feature_importance():
    """
    Exposes feature_importances_ from both loaded ML models, normalized to percentages.
    """
    global ml_model_normal, ml_model_cooled
    if ml_model_normal is None or ml_model_cooled is None:
        return {"error": "ML models are not loaded. Train the models first."}
        
    try:
        importances_normal = ml_model_normal.feature_importances_
        importances_cooled = ml_model_cooled.feature_importances_
        
        features = ["Ambient Temp", "Panel Temp", "Cloud Cover"]
        
        results = [
            {
                "feature": features[0],
                "normalValue": round(float(importances_normal[0]) * 100.0, 2),
                "cooledValue": round(float(importances_cooled[0]) * 100.0, 2)
            },
            {
                "feature": features[1],
                "normalValue": round(float(importances_normal[1]) * 100.0, 2),
                "cooledValue": round(float(importances_cooled[1]) * 100.0, 2)
            },
            {
                "feature": features[2],
                "normalValue": round(float(importances_normal[2]) * 100.0, 2),
                "cooledValue": round(float(importances_cooled[2]) * 100.0, 2)
            }
        ]
        return results
    except Exception as e:
        return {"error": f"Failed to extract feature importance: {str(e)}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

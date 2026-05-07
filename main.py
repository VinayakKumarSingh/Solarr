import os
import joblib
import pandas as pd
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

MODEL_FILE = "model.pkl"
BASELINE_MAX_VOLTAGE = 8.5
BASELINE_MAX_CURRENT = 300.0

# Global variable to hold the loaded model
ml_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_model
    if os.path.exists(MODEL_FILE):
        print("Loading ML model...")
        ml_model = joblib.load(MODEL_FILE)
        print("Model loaded successfully.")
    else:
        print("WARNING: model.pkl not found! Forecast endpoint will fail.")
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
    Calculates simulated live metrics.
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
            
            # Exact logic from historical generator
            panel_temp = ambient + (rad * 0.03)
            temp_diff = max(0.0, panel_temp - 25.0)
            voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * temp_diff)
            current = BASELINE_MAX_CURRENT * (rad / 1000.0)
            power = voltage * current
            cooled_power = BASELINE_MAX_VOLTAGE * current
            
            return {
                "ambient_temp": ambient,
                "panel_temp": panel_temp,
                "voltage": voltage,
                "current": current,
                "power": power,
                "cooled_power": cooled_power,
                "cloud_cover": cloud
            }
        except Exception as e:
            return {"error": str(e)}
@app.post("/api/simulate")
async def simulate_data(req: SimulationRequest):
    panel_temp = req.ambient_temp + (req.direct_radiation * 0.03)
    temp_diff = max(0.0, panel_temp - 25.0)
    voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * temp_diff)
    current = BASELINE_MAX_CURRENT * (req.direct_radiation / 1000.0)
    power = voltage * current
    cooled_power = BASELINE_MAX_VOLTAGE * current
    
    return {
        "ambient_temp": req.ambient_temp,
        "panel_temp": panel_temp,
        "voltage": voltage,
        "current": current,
        "power": power,
        "cooled_power": cooled_power,
        "cloud_cover": req.cloud_cover
    }

@app.get("/api/forecast")
async def get_forecast_data():
    """
    Pings Open-Meteo hourly forecast API for next 24 hours.
    Uses ML model to predict power.
    Calculates theoretical cooled power.
    """
    if ml_model is None:
        return {"error": "ML model not loaded."}
        
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
                
                dt_obj = datetime.strptime(t, "%Y-%m-%dT%H:%M")
                hour = dt_obj.hour
                
                # Predict Power using the ML model
                # Model expects ['hour', 'ambient_temp', 'cloud_cover']
                df_features = pd.DataFrame([[hour, ambient, cloud]], columns=['hour', 'ambient_temp', 'cloud_cover'])
                predicted_power = ml_model.predict(df_features)[0]
                
                # Theoretical Cooled Power
                # Assuming panel_temp stays at 25C (no 0.4% penalty)
                current = BASELINE_MAX_CURRENT * (rad / 1000.0)
                cooled_power = BASELINE_MAX_VOLTAGE * current
                
                forecast_results.append({
                    "time": t,
                    "predicted_power": float(predicted_power),
                    "cooled_power": float(cooled_power),
                    "ambient_temp": ambient,
                    "cloud_cover": cloud
                })
                
            return forecast_results
        except Exception as e:
            return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

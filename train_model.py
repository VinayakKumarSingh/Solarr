import sqlite3
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import json
from datetime import datetime
import sklearn

DB_FILE = "solar_simulation.db"
MODEL_NORMAL_FILE = "model_normal.pkl"
MODEL_COOLED_FILE = "model_cooled.pkl"
METADATA_FILE = "model_metadata.json"

def train():
    print("Loading data from database...")
    # 1. Database Connection
    conn = sqlite3.connect(DB_FILE)
    query = """
        SELECT timestamp, ambient_temp, cloud_cover, panel_temp, power, 
               cooled_panel_temp, cooled_power 
        FROM historical_telemetry
    """
    df = pd.read_sql_query(query, conn)
    conn.close()

    # 2. Feature Engineering
    print("Engineering features...")
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # Drop rows with NaN if any exist
    df = df.dropna()

    # 3. Model 1: Normal Panel
    print("Training normal model...")
    X_normal = df[['ambient_temp', 'panel_temp', 'cloud_cover']]
    y_normal = df['power']
    
    X_train_n, X_test_n, y_train_n, y_test_n = train_test_split(
        X_normal, y_normal, test_size=0.2, random_state=42
    )
    
    model_normal = RandomForestRegressor(n_estimators=100, random_state=42)
    model_normal.fit(X_train_n, y_train_n)
    
    y_pred_n = model_normal.predict(X_test_n)
    mae_n = mean_absolute_error(y_test_n, y_pred_n)
    r2_n = r2_score(y_test_n, y_pred_n)

    # 4. Model 2: Cooled Panel (Fins)
    print("Training cooled model...")
    X_cooled = df[['ambient_temp', 'cooled_panel_temp', 'cloud_cover']]
    y_cooled = df['cooled_power']
    
    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(
        X_cooled, y_cooled, test_size=0.2, random_state=42
    )
    
    model_cooled = RandomForestRegressor(n_estimators=100, random_state=42)
    model_cooled.fit(X_train_c, y_train_c)
    
    y_pred_c = model_cooled.predict(X_test_c)
    mae_c = mean_absolute_error(y_test_c, y_pred_c)
    r2_c = r2_score(y_test_c, y_pred_c)

    # 5. Evaluation
    print("-" * 30)
    print("Model Training Complete!")
    print(f"Normal Model - MAE: {mae_n:.4f}, R²: {r2_n:.4f}")
    print(f"Cooled Model - MAE: {mae_c:.4f}, R²: {r2_c:.4f}")
    print("-" * 30)

    # 6. Serialization
    print("Saving models...")
    joblib.dump(model_normal, MODEL_NORMAL_FILE)
    joblib.dump(model_cooled, MODEL_COOLED_FILE)
    
    metadata = {
        "normal_mae": float(mae_n),
        "normal_r2": float(r2_n),
        "cooled_mae": float(mae_c),
        "cooled_r2": float(r2_c),
        "trained_at": datetime.now().isoformat(),
        "sklearn_version": sklearn.__version__
    }
    
    with open(METADATA_FILE, 'w') as f:
        json.dump(metadata, f, indent=4)
        
    print(f"Metadata saved to {METADATA_FILE}.")

if __name__ == '__main__':
    train()

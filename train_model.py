import sqlite3
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

DB_FILE = "solar_simulation.db"
MODEL_FILE = "model.pkl"

def train():
    print("Loading data from database...")
    # 1. Database Connection
    conn = sqlite3.connect(DB_FILE)
    query = "SELECT timestamp, ambient_temp, cloud_cover, power FROM historical_telemetry"
    df = pd.read_sql_query(query, conn)
    conn.close()

    # 2. Feature Engineering
    print("Engineering features...")
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df['hour'] = df['timestamp'].dt.hour
    
    # Drop rows with NaN if any exist
    df = df.dropna()

    # 3. Features and Target Definition
    X = df[['hour', 'ambient_temp', 'cloud_cover']]
    y = df['power']

    # 4. Splitting Data and Training
    print("Splitting data and training model...")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Initialize Random Forest Regressor
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # 5. Evaluation
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    
    print("-" * 30)
    print("Model Training Complete!")
    print(f"Mean Absolute Error (MAE): {mae:.4f}")
    print(f"R-squared (R²) Score: {r2:.4f}")
    print("-" * 30)

    # 6. Serialization
    print(f"Saving model to {MODEL_FILE}...")
    joblib.dump(model, MODEL_FILE)
    print("Model saved successfully.")

if __name__ == '__main__':
    train()

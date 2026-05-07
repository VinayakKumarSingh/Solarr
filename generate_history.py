import sqlite3
import httpx
import asyncio
from datetime import datetime, timedelta

DB_FILE = "solar_simulation.db"
BASELINE_MAX_VOLTAGE = 8.5
BASELINE_MAX_CURRENT = 300.0  # Assuming ~300mA maximum current for scaling

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS historical_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME,
            ambient_temp REAL,
            cloud_cover REAL,
            panel_temp REAL,
            ldr INTEGER,
            voltage REAL,
            current REAL,
            power REAL
        )
    """)
    conn.commit()
    return conn

async def generate_history():
    conn = init_db()
    cursor = conn.cursor()
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=180)  # ~6 months
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    print(f"Fetching historical weather data from {start_str} to {end_str}...")
    
    # Open-Meteo Archive API endpoint
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude=12.97&longitude=77.59&"
        f"start_date={start_str}&end_date={end_str}&"
        f"hourly=temperature_2m,cloud_cover,direct_radiation"
    )
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=60.0)
        if response.status_code != 200:
            print(f"Failed to fetch data from Open-Meteo. Status Code: {response.status_code}")
            return
            
        data = response.json()
        
    hourly_data = data.get("hourly", {})
    times = hourly_data.get("time", [])
    temps = hourly_data.get("temperature_2m", [])
    clouds = hourly_data.get("cloud_cover", [])
    radiations = hourly_data.get("direct_radiation", [])
    
    if not times:
        print("No hourly data found in the API response.")
        return
        
    records = []
    
    print("Synthesizing solar telemetry data...")
    for t, ambient, cloud, rad in zip(times, temps, clouds, radiations):
        # Handle potential nulls
        ambient = ambient if ambient is not None else 25.0
        cloud = cloud if cloud is not None else 0.0
        rad = rad if rad is not None else 0.0
        
        # 1. Map direct radiation to an LDR scale (0-1023)
        # Direct radiation typically maxes out ~1000 W/m²
        ldr = int((rad / 1000.0) * 1023.0)
        ldr = max(0, min(1023, ldr))
        
        # 2. Panel Heat Spikes
        # Adding a radiation factor: 1000 W/m² radiation -> +30°C to panel temp
        panel_temp = ambient + (rad * 0.03)
        
        # 3. Voltage Drop
        # Subtract 0.4% from max voltage for every degree over 25°C
        temp_diff = max(0.0, panel_temp - 25.0)
        voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * temp_diff)
        
        # 4. Current
        # Scale current based directly on the LDR/radiation proxy
        current = BASELINE_MAX_CURRENT * (rad / 1000.0)
        
        # 5. Power
        power = voltage * current
        
        # Format timestamp for SQLite
        sqlite_timestamp = t.replace("T", " ") + ":00"
        
        records.append((
            sqlite_timestamp,
            ambient,
            cloud,
            panel_temp,
            ldr,
            voltage,
            current,
            power
        ))
        
    print(f"Bulk inserting {len(records)} rows into the database...")
    
    # We use executemany for raw sqlite3 bulk insertion
    cursor.executemany("""
        INSERT INTO historical_telemetry 
        (timestamp, ambient_temp, cloud_cover, panel_temp, ldr, voltage, current, power)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, records)
    
    conn.commit()
    conn.close()
    
    print(f"Success! {len(records)} rows of synthesized historical data have been successfully added to {DB_FILE}.")

if __name__ == "__main__":
    asyncio.run(generate_history())

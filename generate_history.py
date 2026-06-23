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
    # Drop existing table to ensure schema updates
    cursor.execute("DROP TABLE IF EXISTS historical_telemetry")
    cursor.execute("""
        CREATE TABLE historical_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME,
            ambient_temp REAL,
            cloud_cover REAL,
            ldr INTEGER,
            panel_temp REAL,
            voltage REAL,
            current REAL,
            power REAL,
            cooled_panel_temp REAL,
            cooled_voltage REAL,
            cooled_current REAL,
            cooled_power REAL
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
    
    print("Synthesizing normal and fin-cooled solar telemetry data...")
    for t, ambient, cloud, rad in zip(times, temps, clouds, radiations):
        # Handle potential nulls
        ambient = ambient if ambient is not None else 25.0
        cloud = cloud if cloud is not None else 0.0
        rad = rad if rad is not None else 0.0
        
        # 1. Map direct radiation to an LDR scale (0-1023)
        ldr = int((rad / 1000.0) * 1023.0)
        ldr = max(0, min(1023, ldr))
        
        # 2. Normal Panel Telemetry
        panel_temp = ambient + (rad * 0.03)  # +30°C spike at 1000 W/m²
        temp_diff = max(0.0, panel_temp - 25.0)
        voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * temp_diff)
        current = BASELINE_MAX_CURRENT * (rad / 1000.0)
        power = voltage * current
        
        # 3. Cooled Panel Telemetry (Fins)
        # Cooling fins dissipate heat, reducing heat rise above ambient by 60%
        cooled_panel_temp = ambient + (rad * 0.012)  # +12°C spike at 1000 W/m²
        cooled_temp_diff = max(0.0, cooled_panel_temp - 25.0)
        cooled_voltage = BASELINE_MAX_VOLTAGE * (1.0 - 0.004 * cooled_temp_diff)
        cooled_current = current  # Irradiance/current is the same
        cooled_power = cooled_voltage * cooled_current
        
        # Format timestamp for SQLite
        sqlite_timestamp = t.replace("T", " ") + ":00"
        
        records.append((
            sqlite_timestamp,
            ambient,
            cloud,
            ldr,
            panel_temp,
            voltage,
            current,
            power,
            cooled_panel_temp,
            cooled_voltage,
            cooled_current,
            cooled_power
        ))
        
    print(f"Bulk inserting {len(records)} rows into the database...")
    
    cursor.executemany("""
        INSERT INTO historical_telemetry 
        (timestamp, ambient_temp, cloud_cover, ldr, panel_temp, voltage, current, power,
         cooled_panel_temp, cooled_voltage, cooled_current, cooled_power)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, records)
    
    conn.commit()
    conn.close()
    
    print(f"Success! {len(records)} rows of synthesized data have been successfully added to {DB_FILE}.")

if __name__ == "__main__":
    asyncio.run(generate_history())

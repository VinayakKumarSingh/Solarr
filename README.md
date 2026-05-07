# Solar Panel Digital Twin: IoT Monitoring and Predictive Power Analytics

## Project Overview
This project is a high-performance Digital Twin and Simulation Dashboard designed to analyze solar panel efficiency under varying thermal and irradiance conditions. It aims to quantify the energy recovery potential for a passive cooling system by simulating heat-induced power loss in real-time.

### Hardware & Data Collection
The baseline data powering the machine learning model was collected through an extensive 3-week IoT deployment at RVCE. The hardware stack includes:
- **Saurally Mono Crystalline Solar Panel** (Rated at 10W, 12V)
- **DS18B20 Waterproof Temperature Probe** (For measuring actual panel heat spikes up to 65°C)
- **INA219 Sensor** (For precise voltage and current monitoring)
- **LDR Sensor** (To measure light intensity and approximate irradiance)
- **BO Motor (3V-9V)** (Acting as the active physical load for the panel)

## System Architecture

### 1. Machine Learning & Predictive Analytics
- A **Scikit-learn Random Forest Regressor** is trained on the historical baseline telemetry synthesized from the physical hardware limits.
- **Features Used:** Hour of the day, Ambient Temperature, and Cloud Cover.
- **Target:** Accurately predict actual power output when the panel is subjected to heat stress (using an established thermal penalty of 0.4% voltage drop per degree above 25°C) versus its theoretical optimal performance if a passive cooling system kept it at 25°C.

### 2. Backend (FastAPI)
- Uses **Python and FastAPI** to serve a highly responsive API.
- Integrates with the **Open-Meteo API** (Archive and Forecast) to fetch real-time and 24-hour predictive weather data.
- Handles stateless physics simulation endpoints and serves the serialized `.pkl` machine learning model.

### 3. Frontend Dashboard (React + Vite)
- Built with **React, Vite, and Tailwind CSS v4**.
- Features a premium "Industrial Bento Grid" layout with full Light/Dark mode toggling.
- **Live 3D Digital Twin:** Utilizes **React Three Fiber (Three.js)** to render a dynamic 3D representation of the solar panel that changes color (Deep Blue to Bright Red) based on live thermal stress.
- **Predictive Analytics:** Uses **Recharts** to plot a 24-hour predictive line chart comparing the predicted stressed output vs. theoretical cooled output, automatically shading non-operational nighttime hours.

---

## How to Run the Project

### Prerequisites
- Node.js (v18+ recommended)
- Python (3.9+ recommended)

### 1. Backend Setup
1. Open a terminal and navigate to the project root directory (`d:\Solar_idp`).
2. Create and activate a Python virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install backend dependencies:
   ```bash
   pip install fastapi uvicorn httpx pandas scikit-learn joblib
   ```
4. Start the FastAPI server:
   ```bash
   python main.py
   ```
   *The backend will run at `http://localhost:8000`.*

### 2. Frontend Setup
1. Open a **new, separate terminal** and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the necessary Node packages (including React Three Fiber and Tailwind):
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the URL provided by Vite (usually `http://localhost:5173/`).

---

### Advanced: Re-training the ML Model
The project comes with a pre-trained `model.pkl`. However, if you wish to re-train the machine learning model from scratch:
1. Ensure your backend virtual environment is active.
2. Run data generation to fetch 6 months of archive weather data and calculate physics-based telemetry (creates an SQLite database):
   ```bash
   python generate_history.py
   ```
3. Train the Random Forest Regressor and output the new `model.pkl` file:
   ```bash
   python train_model.py
   ```

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Thermometer, Zap, Activity, BatteryCharging, Sliders, AlertTriangle, Info } from 'lucide-react';
import SolarPanel3D from './components/SolarPanel3D';

const API_BASE_URL = 'http://localhost:8000/api';

function App() {
  const [liveData, setLiveData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  
  // Simulation Controls
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualTemp, setManualTemp] = useState(25);
  const isManualModeRef = useRef(isManualMode);

  useEffect(() => {
    isManualModeRef.current = isManualMode;
  }, [isManualMode]);

  useEffect(() => {
    // Fetch forecast on load
    const fetchForecast = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/forecast`);
        if (res.data && Array.isArray(res.data)) {
          const formatted = res.data.map(d => {
            // "2026-05-08T00:00" without 'Z' will be parsed as local time zone
            const dateObj = new Date(d.time);
            const hour = dateObj.getHours();
            
            // Nighttime predictive logic fix
            // Mark as night if it's 7PM to 5:59AM, or if radiation/cooled_power is 0
            const isNight = hour >= 19 || hour < 6 || d.cooled_power <= 0;
            
            return {
              ...d,
              predicted_power: isNight ? 0 : d.predicted_power,
              cooled_power: isNight ? 0 : d.cooled_power,
              is_night: isNight,
              timeLabel: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
          });
          setForecastData(formatted);
        } else if (res.data && res.data.error) {
          setError(res.data.error);
        }
      } catch (err) {
        console.error("Forecast fetch error", err);
        setError("Failed to fetch forecast data from backend.");
      }
    };
    fetchForecast();

    // Fetch live data every 3 seconds (Only if NOT in manual mode)
    const fetchLive = async () => {
      if (isManualModeRef.current) return;
      try {
        const res = await axios.get(`${API_BASE_URL}/live`);
        if (res.data && !res.data.error) {
          setLiveData(res.data);
        }
      } catch (err) {
        console.error("Live data fetch error", err);
      }
    };
    
    fetchLive();
    const interval = setInterval(fetchLive, 3000);

    return () => clearInterval(interval);
  }, []);

  // Effect for Manual Mode Simulation
  useEffect(() => {
    if (isManualMode) {
      const runSimulation = async () => {
        try {
          const res = await axios.post(`${API_BASE_URL}/simulate`, {
            ambient_temp: manualTemp,
            cloud_cover: 0,
            direct_radiation: 1000.0
          });
          setLiveData(res.data);
        } catch (err) {
          console.error("Simulation error", err);
        }
      };
      // Add slight debounce for slider feeling smoother
      const timeoutId = setTimeout(runSimulation, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isManualMode, manualTemp]);

  // Efficiency Loss Calculation
  let efficiencyLoss = 0;
  let lossColor = "text-emerald-400";
  let lossBorder = "border-slate-800";
  if (liveData && liveData.cooled_power > 0) {
    efficiencyLoss = (1 - (liveData.power / liveData.cooled_power)) * 100;
    if (efficiencyLoss > 25) {
      lossColor = "text-red-500";
      lossBorder = "border-red-500/50";
    } else if (efficiencyLoss > 15) {
      lossColor = "text-orange-500";
      lossBorder = "border-orange-500/50";
    }
  }

  // Calculate Night Periods for Chart Shading
  const nightPeriods = [];
  let currentNightStart = null;
  forecastData.forEach((d, i) => {
    if (d.is_night && !currentNightStart) {
      currentNightStart = d.timeLabel;
    } else if (!d.is_night && currentNightStart) {
      nightPeriods.push({ start: currentNightStart, end: forecastData[i - 1].timeLabel });
      currentNightStart = null;
    }
  });
  if (currentNightStart && forecastData.length > 0) {
    nightPeriods.push({ start: currentNightStart, end: forecastData[forecastData.length - 1].timeLabel });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans selection:bg-cyan-500/30 relative">
      {/* Project Overview Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowInfo(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 rounded-md p-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">Information & Methodology</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">Data Source</h3>
                <p className="text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-inner">
                  5,000+ data points collected over a 3-week IoT deployment at RVCE.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-purple-400 mb-2">Methodology</h3>
                <p className="text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-inner">
                  IoT hardware (ESP32/INA219) established the baseline. A Random Forest Regressor was trained to predict thermal efficiency loss based on historical Open-Meteo weather patterns.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-emerald-400 mb-2">Project Goal</h3>
                <p className="text-slate-300 leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-inner">
                  To quantify energy recovery potential for a passive cooling system.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="mb-8 border-b border-slate-800 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.6)]"></div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Solar Panel Digital Twin
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-2 ml-6 tracking-wide uppercase">Real-time Telemetry & Predictive Analytics</p>
        </div>
        
        <button 
          onClick={() => setShowInfo(true)}
          className="text-slate-300 hover:text-white px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-2 text-sm font-semibold shadow-md"
        >
          <Info size={18} />
          Project Overview
        </button>
      </header>

      {error && (
        <div className="bg-red-950/40 border border-red-900 text-red-300 p-4 rounded-lg mb-8 flex items-center gap-3 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          {error}
        </div>
      )}

      {/* Simulation Control Center */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between shadow-lg">
        <div className="flex items-center gap-4 mb-4 sm:mb-0">
          <Sliders className="text-purple-400" size={24} />
          <div>
            <h2 className="text-lg font-bold text-slate-200">Simulation Control</h2>
            <p className="text-xs text-slate-400">Override live weather data</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button 
              onClick={() => setIsManualMode(false)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${!isManualMode ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Automatic (API)
            </button>
            <button 
              onClick={() => setIsManualMode(true)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${isManualMode ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Manual (Simulation)
            </button>
          </div>
          
          {isManualMode && (
            <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-lg border border-slate-800 w-full sm:w-auto animate-in fade-in slide-in-from-right-4">
              <span className="text-sm text-slate-300 whitespace-nowrap">Ambient Temp:</span>
              <input 
                type="range" 
                min="15" 
                max="50" 
                step="0.5"
                value={manualTemp} 
                onChange={(e) => setManualTemp(parseFloat(e.target.value))}
                className="w-32 accent-purple-500 cursor-ew-resize"
              />
              <span className="text-sm font-bold text-purple-400 w-12 text-right">{manualTemp.toFixed(1)}°C</span>
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
        <TelemetryCard 
          title="Panel Temp" 
          value={liveData ? `${liveData.panel_temp.toFixed(1)} °C` : '--'} 
          icon={<Thermometer className="text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]" size={26} strokeWidth={2.5} />} 
          trend="Ambient + Radiation"
        />
        <TelemetryCard 
          title="Voltage" 
          value={liveData ? `${liveData.voltage.toFixed(2)} V` : '--'} 
          icon={<Zap className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]" size={26} strokeWidth={2.5} />} 
          trend="Heat Stress Applied"
        />
        <TelemetryCard 
          title="Current" 
          value={liveData ? `${liveData.current.toFixed(2)} mA` : '--'} 
          icon={<Activity className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" size={26} strokeWidth={2.5} />} 
          trend="Irradiance Scaled"
        />
        <TelemetryCard 
          title="Actual Power" 
          value={liveData ? `${(liveData.power / 1000).toFixed(2)} W` : '--'} 
          icon={<BatteryCharging className="text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]" size={26} strokeWidth={2.5} />} 
          trend="V × I"
        />
        <TelemetryCard 
          title="Thermal Efficiency Loss" 
          value={liveData ? `${efficiencyLoss.toFixed(1)}%` : '--'} 
          icon={<AlertTriangle className={`${lossColor} drop-shadow-[0_0_8px_currentColor]`} size={26} strokeWidth={2.5} />} 
          trend="vs Cooled Potential"
          valueColor={lossColor}
          customBorder={lossBorder}
        />
      </div>

      {/* Main Content Areas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
        {/* 3D Visualisation (Left Side, 5 columns) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col relative overflow-hidden shadow-xl shadow-black/40 group transition-all duration-300 hover:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-200 tracking-wide">Live 3D Digital Twin</h2>
            <div className="px-2 py-1 bg-slate-800 text-xs font-mono text-slate-400 rounded border border-slate-700">R3F / Three.js</div>
          </div>
          
          <div className="flex-1 rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950/50 relative min-h-[350px]">
            
            {/* Comparison Overlay Card */}
            {liveData && (
              <div className="absolute top-3 left-3 z-20 bg-slate-950/80 backdrop-blur-md border border-slate-700 p-3 rounded-lg shadow-lg pointer-events-none">
                <p className="text-[10px] text-slate-400 mb-1.5 uppercase tracking-wider font-semibold">Live Power Comparison</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center gap-6">
                    <span className="text-xs text-slate-300">Actual (Stressed):</span>
                    <span className="text-sm font-bold text-red-400">{(liveData.power / 1000).toFixed(2)} W</span>
                  </div>
                  <div className="flex justify-between items-center gap-6">
                    <span className="text-xs text-slate-300">Potential (25°C):</span>
                    <span className="text-sm font-bold text-blue-400">{(liveData.cooled_power / 1000).toFixed(2)} W</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Thermal Context Indicator */}
            <div className="absolute bottom-3 left-3 right-3 z-20 bg-slate-900/90 border border-slate-700 p-2 rounded shadow-lg pointer-events-none text-center backdrop-blur-sm">
              <p className="text-xs text-slate-400 leading-tight">
                <span className="text-cyan-400 font-semibold">Thermal Context:</span> Model trained on real-world thermal spikes (up to 65°C) observed during local field tests.
              </p>
            </div>
            
            <div className="absolute inset-0 z-10">
              <SolarPanel3D 
                temp={liveData?.panel_temp || 25} 
                cloudCover={liveData?.cloud_cover || 0} 
              />
            </div>
          </div>
        </div>

        {/* Forecast Chart (Right Side, 7 columns) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col shadow-xl shadow-black/40">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-200 tracking-wide">24-Hour Predictive Power Analytics</h2>
            <div className="flex gap-2">
              <span className="flex items-center text-xs text-slate-400 font-mono"><span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>Heat Stressed</span>
              <span className="flex items-center text-xs text-slate-400 font-mono"><span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>Theoretical</span>
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-[350px] bg-slate-950/30 rounded-lg border border-slate-800 p-2 flex flex-col">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                
                {nightPeriods.map((period, i) => (
                  <ReferenceArea 
                    key={`night-${i}`} 
                    x1={period.start} 
                    x2={period.end} 
                    fill="#020617" 
                    fillOpacity={0.6} 
                  />
                ))}

                <XAxis 
                  dataKey="timeLabel" 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickMargin={12} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#334155', 
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                  }}
                  itemStyle={{ fontSize: '13px', fontWeight: '500' }}
                  labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '12px' }}
                  formatter={(value, name) => [`${parseFloat(value).toFixed(1)} mW`, name]}
                />
                
                <Line 
                  type="monotone" 
                  dataKey="predicted_power" 
                  name="Predicted Output (Actual)" 
                  stroke="#ef4444" 
                  strokeWidth={3} 
                  dot={false}
                  activeDot={{ r: 6, fill: '#ef4444', stroke: '#7f1d1d', strokeWidth: 2 }} 
                  animationDuration={1500}
                />
                <Line 
                  type="monotone" 
                  dataKey="cooled_power" 
                  name="Theoretical Optimal (25°C)" 
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  strokeDasharray="5 5"
                  dot={false} 
                  activeDot={{ r: 6, fill: '#3b82f6', stroke: '#1e3a8a', strokeWidth: 2 }} 
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-center mt-3 mb-1">
               <span className="flex items-center text-[10px] text-slate-500 font-mono"><span className="w-2.5 h-2.5 rounded-sm bg-[#020617] border border-slate-700 mr-2"></span>Non-Operational Hours (Night / Zero Radiation)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelemetryCard({ title, value, icon, trend, valueColor = "text-slate-50", customBorder = "border-slate-800" }) {
  return (
    <div className={`bg-slate-900 border ${customBorder} rounded-xl p-5 relative overflow-hidden group shadow-lg shadow-black/20 hover:bg-slate-800 transition-colors duration-300`}>
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-slate-800 rounded-full blur-2xl group-hover:bg-slate-700 transition-colors duration-500"></div>
      
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-sm font-semibold text-slate-400 mb-1 tracking-wide">{title}</p>
          <h3 className={`text-3xl font-extrabold tracking-tight font-mono mt-2 transition-colors ${valueColor}`}>{value}</h3>
          {trend && <p className="text-xs text-slate-500 mt-3 font-mono">{trend}</p>}
        </div>
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 shadow-inner group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default App;

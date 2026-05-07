import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Thermometer, Zap, Activity, BatteryCharging, Sliders, AlertTriangle, Info, Moon, Sun, CheckCircle2 } from 'lucide-react';
import SolarPanel3D from './components/SolarPanel3D';

const API_BASE_URL = 'http://localhost:8000/api';

function App() {
  const [liveData, setLiveData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [theme, setTheme] = useState('dark');
  
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
            const dateObj = new Date(d.time);
            const hour = dateObj.getHours();
            
            // Nighttime predictive logic fix
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
      const timeoutId = setTimeout(runSimulation, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isManualMode, manualTemp]);

  // Efficiency Loss Calculation
  let efficiencyLoss = 0;
  let lossColor = "text-emerald-500 dark:text-emerald-400";
  if (liveData && liveData.cooled_power > 0) {
    efficiencyLoss = (1 - (liveData.power / liveData.cooled_power)) * 100;
    if (efficiencyLoss > 25) {
      lossColor = "text-red-600 dark:text-red-500";
    } else if (efficiencyLoss > 15) {
      lossColor = "text-orange-500 dark:text-orange-400";
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
    <div className={theme}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 md:p-8 font-sans transition-colors duration-300">
        
        {/* Project Overview Modal */}
        {showInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative">
              <button 
                onClick={() => setShowInfo(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-lg p-1.5 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Information & Methodology</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-bold text-cyan-600 dark:text-cyan-400 mb-2">Data Source</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                    5,000+ data points collected over a 3-week IoT deployment at RVCE.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 mb-2">Methodology</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                    IoT hardware (ESP32/INA219) established the baseline. A Random Forest Regressor was trained to predict thermal efficiency loss based on historical Open-Meteo weather patterns.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 mb-2">Project Goal</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                    To quantify energy recovery potential for a passive cooling system.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Minimalist Header */}
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]"></div>
              Solar Digital Twin
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 uppercase tracking-wider font-semibold">IoT Telemetry & Analytics</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold shadow-sm">
              <CheckCircle2 size={14} />
              System Online
            </div>
            
            <button 
              onClick={() => setShowInfo(true)} 
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700"
              title="Project Overview"
            >
              <Info size={18} />
            </button>

            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {error && (
          <div className="max-w-7xl mx-auto bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 p-4 rounded-xl mb-8 flex items-center gap-3 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            {error}
          </div>
        )}

        <main className="max-w-7xl mx-auto">
          {/* Bento Grid Top Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            
            {/* Left Column (60%): 3D Twin */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4 z-10">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Live 3D Visualization</h2>
                <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 uppercase tracking-wider">R3F Engine</span>
              </div>
              
              <div className="flex-1 w-full min-h-[400px] rounded-xl overflow-hidden relative border border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/30">
                {/* Overlay Power Card */}
                {liveData && (
                  <div className="absolute top-4 left-4 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl shadow-lg pointer-events-none">
                    <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider font-bold">Performance Gap</p>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center gap-8">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Actual:</span>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400 font-mono">{(liveData.power / 1000).toFixed(2)} W</span>
                      </div>
                      <div className="flex justify-between items-center gap-8">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Potential:</span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">{(liveData.cooled_power / 1000).toFixed(2)} W</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing">
                  <SolarPanel3D 
                    temp={liveData?.panel_temp || 25} 
                    cloudCover={liveData?.cloud_cover || 0} 
                  />
                </div>

                {/* Thermal Context Badge */}
                <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center pointer-events-none">
                  <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full shadow-md">
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold mr-1">Context:</span> 
                      Model trained on real-world thermal spikes (up to 65°C) from field tests.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (40%): Telemetry & Controls */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Simulation Controls Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                    <Sliders className="text-indigo-600 dark:text-indigo-400" size={18} />
                  </div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Simulation Control</h2>
                </div>
                
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 mb-5">
                  <button 
                    onClick={() => setIsManualMode(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${!isManualMode ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Automatic
                  </button>
                  <button 
                    onClick={() => setIsManualMode(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${isManualMode ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-500/30' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Override
                  </button>
                </div>
                
                <div className={`transition-opacity duration-300 ${isManualMode ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <div className="flex justify-between items-end mb-3">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ambient Temp</span>
                    <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 font-mono leading-none">{manualTemp.toFixed(1)}°C</span>
                  </div>
                  <input 
                    type="range" 
                    min="15" 
                    max="50" 
                    step="0.5"
                    value={manualTemp} 
                    onChange={(e) => setManualTemp(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-ew-resize accent-indigo-500"
                  />
                </div>
              </div>

              {/* Telemetry Grid (2x2) */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                <BentoCard 
                  title="Panel Temp" 
                  value={liveData ? `${liveData.panel_temp.toFixed(1)} °C` : '--'} 
                  icon={<Thermometer className="text-orange-600 dark:text-orange-500" size={20} />} 
                  iconBg="bg-orange-50 dark:bg-orange-500/10"
                />
                <BentoCard 
                  title="Voltage" 
                  value={liveData ? `${liveData.voltage.toFixed(2)} V` : '--'} 
                  icon={<Zap className="text-yellow-600 dark:text-yellow-500" size={20} />} 
                  iconBg="bg-yellow-50 dark:bg-yellow-500/10"
                />
                <BentoCard 
                  title="Current" 
                  value={liveData ? `${liveData.current.toFixed(2)} mA` : '--'} 
                  icon={<Activity className="text-cyan-600 dark:text-cyan-400" size={20} />} 
                  iconBg="bg-cyan-50 dark:bg-cyan-500/10"
                />
                <BentoCard 
                  title="Efficiency Loss" 
                  value={liveData ? `${efficiencyLoss.toFixed(1)}%` : '--'} 
                  icon={<AlertTriangle className={lossColor} size={20} />} 
                  valueColor={lossColor}
                  iconBg={efficiencyLoss > 25 ? "bg-red-50 dark:bg-red-500/10" : "bg-slate-50 dark:bg-slate-800"}
                />
              </div>
              
            </div>
          </div>

          {/* Bottom Row: Wide Chart Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">24-Hour Predictive Analytics</h2>
              <div className="flex gap-4">
                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-md bg-red-500 mr-2"></span>Heat Stressed</span>
                <span className="flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><span className="w-2.5 h-2.5 rounded-md bg-blue-500 mr-2"></span>Optimal (25°C)</span>
              </div>
            </div>
            
            <div className="w-full h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} vertical={false} />
                  
                  {nightPeriods.map((period, i) => (
                    <ReferenceArea 
                      key={`night-${i}`} 
                      x1={period.start} 
                      x2={period.end} 
                      fill={theme === 'dark' ? '#0f172a' : '#f1f5f9'} 
                      fillOpacity={0.8} 
                    />
                  ))}

                  <XAxis 
                    dataKey="timeLabel" 
                    stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} 
                    fontSize={11} 
                    tickMargin={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke={theme === 'dark' ? '#64748b' : '#94a3b8'} 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', 
                      borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', 
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    itemStyle={{ fontSize: '13px', fontWeight: '600' }}
                    labelStyle={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', marginBottom: '8px', fontSize: '12px' }}
                    formatter={(value, name) => [`${parseFloat(value).toFixed(1)} mW`, name]}
                  />
                  
                  <Line 
                    type="monotone" 
                    dataKey="predicted_power" 
                    name="Predicted Output" 
                    stroke="#ef4444" 
                    strokeWidth={3} 
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0 }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cooled_power" 
                    name="Optimal Potential" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    strokeDasharray="6 6"
                    dot={false} 
                    activeDot={{ r: 6, strokeWidth: 0 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-center mt-4">
                 <span className="flex items-center text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
                   <span className={`w-3 h-3 rounded-sm ${theme === 'dark' ? 'bg-[#0f172a]' : 'bg-[#f1f5f9]'} border border-slate-200 dark:border-slate-800 mr-2`}></span>
                   Non-Operational Hours
                 </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function BentoCard({ title, value, icon, valueColor = "text-slate-800 dark:text-slate-50", iconBg = "bg-slate-50 dark:bg-slate-800" }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group relative overflow-hidden">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className={`p-2.5 rounded-xl ${iconBg} group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase mb-1">{title}</p>
        <h3 className={`text-2xl font-black tracking-tight font-mono ${valueColor}`}>{value}</h3>
      </div>
    </div>
  );
}

export default App;

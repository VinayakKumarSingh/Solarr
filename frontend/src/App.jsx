import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ReferenceArea 
} from 'recharts';
import { 
  Thermometer, Zap, Activity, Sliders, AlertTriangle, Info, 
  Moon, Sun, CheckCircle2, RotateCw, Lightbulb, TrendingUp, Cpu 
} from 'lucide-react';
import SolarPanel3D from './components/SolarPanel3D';

const API_BASE_URL = 'http://localhost:8000/api';
const BASELINE_MAX_VOLTAGE = 8.5;

function App() {
  const [liveData, setLiveData] = useState(null);
  const [forecastData, setForecastData] = useState([]);
  const [modelStatus, setModelStatus] = useState(null);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [theme, setTheme] = useState('dark');
  
  // Simulation Controls
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualTemp, setManualTemp] = useState(25);
  const [manualRad, setManualRad] = useState(1000);
  const [manualCloud, setManualCloud] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [sunAngle, setSunAngle] = useState(90);

  const isManualModeRef = useRef(isManualMode);

  useEffect(() => {
    isManualModeRef.current = isManualMode;
  }, [isManualMode]);

  // Fetch forecast data and model status on load
  const fetchForecastAndStatus = async () => {
    try {
      const forecastRes = await axios.get(`${API_BASE_URL}/forecast`);
      if (forecastRes.data && Array.isArray(forecastRes.data)) {
        const formatted = forecastRes.data.map(d => {
          const dateObj = new Date(d.time);
          
          // Format timezone to Asia/Kolkata
          const hourFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            hour: 'numeric',
            hour12: false
          });
          const hour = parseInt(hourFormatter.format(dateObj));
          
          const timeLabel = dateObj.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Kolkata'
          });
          
          // Nighttime logic check based on prediction or local hour
          const isNight = hour >= 19 || hour < 6 || d.predicted_cooled_power <= 1.0;
          
          return {
            ...d,
            predicted_power: isNight ? 0 : d.predicted_power,
            predicted_cooled_power: isNight ? 0 : d.predicted_cooled_power,
            is_night: isNight,
            timeLabel: timeLabel
          };
        });
        setForecastData(formatted);
        setError(null);
      } else if (forecastRes.data && forecastRes.data.error) {
        setError(forecastRes.data.error);
      }
    } catch (err) {
      console.error("Forecast fetch error", err);
      setError("Failed to fetch forecast data from backend.");
    }

    try {
      const statusRes = await axios.get(`${API_BASE_URL}/model-status`);
      if (statusRes.data && !statusRes.data.error) {
        setModelStatus(statusRes.data);
      }
    } catch (err) {
      console.error("Model status fetch error", err);
    }
  };

  useEffect(() => {
    fetchForecastAndStatus();

    // Fetch live data every 3 seconds (Only if NOT in manual override)
    const fetchLive = async () => {
      if (isManualModeRef.current) return;
      try {
        const res = await axios.get(`${API_BASE_URL}/live`);
        if (res.data && !res.data.error) {
          setLiveData(res.data);
          setError(null);
        } else if (res.data && res.data.error) {
          setError(res.data.error);
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
            cloud_cover: manualCloud,
            direct_radiation: manualRad
          });
          if (res.data && !res.data.error) {
            setLiveData(res.data);
            setError(null);
          }
        } catch (err) {
          console.error("Simulation error", err);
        }
      };
      const timeoutId = setTimeout(runSimulation, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isManualMode, manualTemp, manualRad, manualCloud]);

  // Handle Model Retraining
  const handleRetrain = async () => {
    setIsTraining(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/train`);
      if (res.data && res.data.status === 'success') {
        await fetchForecastAndStatus();
      } else {
        alert("Training failed: " + (res.data?.message || "Unknown error"));
      }
    } catch (err) {
      console.error("Retrain error", err);
      alert("Error triggering retraining.");
    } finally {
      setIsTraining(false);
    }
  };

  // Safe checks for data availability
  const hasData = liveData && !liveData.error && liveData.panel_temp !== undefined;

  // Efficiency & Power Calculations
  let efficiencyLoss = 0;
  let powerSaved = 0;
  let efficiencyGain = 0;
  let lossColor = "text-emerald-500 dark:text-emerald-400";

  if (hasData) {
    const pNormal = liveData.power;
    const pCooled = liveData.cooled_power;
    
    // Normal panel loss from ideal 25C potential
    const idealPotential = BASELINE_MAX_VOLTAGE * liveData.current;
    if (idealPotential > 0) {
      efficiencyLoss = (1 - (pNormal / idealPotential)) * 100;
      if (efficiencyLoss > 25) {
        lossColor = "text-red-600 dark:text-red-500";
      } else if (efficiencyLoss > 15) {
        lossColor = "text-orange-500 dark:text-orange-400";
      }
    }

    // Savings from fins cooling
    if (pCooled > pNormal) {
      powerSaved = pCooled - pNormal; // in mW
      efficiencyGain = (powerSaved / pNormal) * 100;
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
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Thermal Fin Cooling Digital Twin</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-bold text-cyan-600 dark:text-cyan-400 mb-2">Experimental Setup</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                    This simulation runs a high-performance Digital Twin of two 10W solar panels side-by-side in Bangalore, India. One runs uncooled (normal), while the other features aluminum passive cooling fins attached to its backside, dissipating heat spikes by 60%.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 mb-2">Predictive Analytics</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                    Two separate Scikit-learn Random Forest models predict power outputs based on Ambient Temp, Panel Temp, and Cloud Cover. We use the historical database of 4,000+ points to train the regressions.
                  </p>
                </div>
                
                <div>
                  <h3 className="text-sm uppercase tracking-wider font-bold text-emerald-600 dark:text-emerald-400 mb-2">Timezone Sync</h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-inner">
                    Weather forecasts and analytics are normalized to Bangalore's local time timezone (IST, UTC+5:30) to ensure accurate alignment of peak daytime irradiance relative to local time.
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
              Solar Panel Digital Twin
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 uppercase tracking-wider font-semibold">Dual Panel Performance Comparison</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold shadow-sm">
              <CheckCircle2 size={14} />
              System Online
            </div>
            
            <button 
              onClick={() => setShowInfo(true)} 
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 cursor-pointer"
              title="Project Overview"
            >
              <Info size={18} />
            </button>

            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-slate-700 cursor-pointer"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        {error && (
          <div className="max-w-7xl mx-auto bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 p-4 rounded-xl mb-8 flex items-center gap-3 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            <span className="font-semibold text-sm">Error: {error}</span>
          </div>
        )}

        <main className="max-w-7xl mx-auto">
          {/* Bento Grid Top Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            
            {/* Left Column (60%): 3D Twin */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4 z-10">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Live Dual 3D Digital Twin</h2>
                <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 uppercase tracking-wider">R3F Physical Engine</span>
              </div>
              
              <div className="flex-1 w-full min-h-[420px] rounded-xl overflow-hidden relative border border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/30">
                {/* Overlay Power Card */}
                {hasData && (
                  <div className="absolute top-4 left-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-xl pointer-events-none w-56">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider font-bold">Real-time Generation</p>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium text-slate-600 dark:text-slate-400">Normal Panel:</span>
                          <span className="font-bold text-red-500 font-mono">{(liveData.power / 1000).toFixed(2)} W</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div className="bg-red-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (liveData.power / 2550) * 100)}%` }}></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">Cooled (Fins):</span>
                          <span className="font-bold text-cyan-500 font-mono">{(liveData.cooled_power / 1000).toFixed(2)} W</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div className="bg-cyan-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (liveData.cooled_power / 2550) * 100)}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="absolute inset-0 z-10">
                  <SolarPanel3D 
                    temp={hasData ? liveData.panel_temp : 25} 
                    cooledTemp={hasData ? liveData.cooled_panel_temp : 25} 
                    cloudCover={hasData ? liveData.cloud_cover : 0} 
                    sunAngle={sunAngle}
                  />
                </div>

                {/* Thermal Context Badge */}
                <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center pointer-events-none">
                  <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full shadow-md text-center max-w-md">
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                      <span className="text-cyan-500 font-bold mr-1">Fins Effect:</span> 
                      Increases voltage by mitigating panel heat spikes (up to 60% cooler).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (40%): Telemetry & Controls */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Simulation Controls Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10">
                      <Sliders className="text-indigo-600 dark:text-indigo-400" size={18} />
                    </div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Simulation Control</h2>
                  </div>
                  {isManualMode && (
                    <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 uppercase animate-pulse">Override Active</span>
                  )}
                </div>

                {/* Sun Angle Slider (Always interactive) */}
                <div className="mb-5 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Sun size={12} className="text-yellow-500" /> Sun Orbit Angle
                    </span>
                    <span className="text-xs font-bold text-yellow-500 font-mono leading-none">{sunAngle}°</span>
                  </div>
                  <input 
                    type="range" 
                    min="15" 
                    max="165" 
                    step="1"
                    value={sunAngle} 
                    onChange={(e) => setSunAngle(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-850 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
                  <div className="flex justify-between text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1.5">
                    <span>Sunrise</span>
                    <span>Noon</span>
                    <span>Sunset</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 mb-5">
                  <button 
                    onClick={() => setIsManualMode(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${!isManualMode ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Automatic
                  </button>
                  <button 
                    onClick={() => setIsManualMode(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${isManualMode ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-500/30' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Manual Override
                  </button>
                </div>
                
                <div className={`space-y-4 transition-opacity duration-300 ${isManualMode ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                  {/* Slider 1: Ambient Temp */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1"><Thermometer size={10} /> Ambient Temp</span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 font-mono leading-none">{manualTemp.toFixed(1)}°C</span>
                    </div>
                    <input 
                      type="range" 
                      min="15" 
                      max="50" 
                      step="0.5"
                      value={manualTemp} 
                      onChange={(e) => setManualTemp(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  {/* Slider 2: Direct Radiation */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1"><Lightbulb size={10} /> Irradiance (Rad)</span>
                      <span className="text-sm font-bold text-yellow-500 dark:text-yellow-400 font-mono leading-none">{manualRad} W/m²</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1200" 
                      step="50"
                      value={manualRad} 
                      onChange={(e) => setManualRad(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                  </div>

                  {/* Slider 3: Cloud Cover */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1"><Moon size={10} /> Cloud Cover</span>
                      <span className="text-sm font-bold text-cyan-500 dark:text-cyan-400 font-mono leading-none">{manualCloud}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="5"
                      value={manualCloud} 
                      onChange={(e) => setManualCloud(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Telemetry Grid (2x2) */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                <BentoCardDouble 
                  title="Panel Temperature"
                  normalVal={hasData ? `${liveData.panel_temp.toFixed(1)} °C` : '--'}
                  cooledVal={hasData ? `${liveData.cooled_panel_temp.toFixed(1)} °C` : '--'}
                  icon={<Thermometer className="text-orange-600 dark:text-orange-500" size={20} />} 
                  iconBg="bg-orange-50 dark:bg-orange-500/10"
                />
                
                <BentoCardDouble 
                  title="Voltage"
                  normalVal={hasData ? `${liveData.voltage.toFixed(2)} V` : '--'}
                  cooledVal={hasData ? `${liveData.cooled_voltage.toFixed(2)} V` : '--'}
                  icon={<Zap className="text-yellow-600 dark:text-yellow-500" size={20} />} 
                  iconBg="bg-yellow-50 dark:bg-yellow-500/10"
                />

                <BentoCardDouble 
                  title="Telemetry Specs"
                  normalVal={hasData ? `I: ${liveData.current.toFixed(0)} mA` : 'I: --'}
                  cooledVal={hasData ? `LDR: ${liveData.ldr}` : 'LDR: --'}
                  icon={<Activity className="text-cyan-600 dark:text-cyan-400" size={20} />} 
                  iconBg="bg-cyan-50 dark:bg-cyan-500/10"
                />

                <BentoCard 
                  title="Energy Recovery" 
                  value={hasData && powerSaved > 0 ? `+${(powerSaved / 1000).toFixed(2)} W` : '0.0 W'} 
                  subtext={hasData && efficiencyGain > 0 ? `${efficiencyGain.toFixed(1)}% recovery` : '0% gain'}
                  icon={<TrendingUp className="text-emerald-500 dark:text-emerald-400" size={20} />} 
                  valueColor="text-emerald-600 dark:text-emerald-400"
                  iconBg="bg-emerald-50 dark:bg-emerald-500/10"
                />
              </div>
              
            </div>
          </div>

          {/* Model Status & Retraining Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
            {/* Left side (35%): Model status info */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="text-indigo-500" size={18} />
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">ML Model Status</h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">v{modelStatus?.sklearn_version || "1.8.0"}</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Normal Panel Regressor</p>
                    <div className="flex justify-between text-xs font-mono font-bold mt-0.5">
                      <span className="text-slate-500">MAE:</span>
                      <span className="text-slate-800 dark:text-slate-200">{modelStatus ? `${modelStatus.normal_mae.toFixed(2)} mW` : '7.61 mW'}</span>
                      <span className="text-slate-500">R²:</span>
                      <span className="text-slate-800 dark:text-slate-200">{modelStatus ? modelStatus.normal_r2.toFixed(4) : '0.9993'}</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-100 dark:border-slate-800/80 my-2"></div>
                  
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cooled Panel Regressor</p>
                    <div className="flex justify-between text-xs font-mono font-bold mt-0.5">
                      <span className="text-slate-500">MAE:</span>
                      <span className="text-slate-800 dark:text-slate-200">{modelStatus ? `${modelStatus.cooled_mae.toFixed(2)} mW` : '14.78 mW'}</span>
                      <span className="text-slate-500">R²:</span>
                      <span className="text-slate-800 dark:text-slate-200">{modelStatus ? modelStatus.cooled_r2.toFixed(4) : '0.9976'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <span className="text-[9px] font-semibold text-slate-400">
                  Last sync: {modelStatus?.trained_at ? new Date(modelStatus.trained_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                </span>
                <button 
                  onClick={handleRetrain}
                  disabled={isTraining}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <RotateCw size={12} className={isTraining ? "animate-spin" : ""} />
                  {isTraining ? "Retraining..." : "Retrain Models"}
                </button>
              </div>
            </div>

            {/* Right side (65%): Wide Chart Card */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">24-Hour Predictive Analytics (IST Timeline)</h2>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">Comparing ML predicted draws under ambient weather forecast</p>
                </div>
                <div className="flex gap-4">
                  <span className="flex items-center text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-sm bg-red-500 mr-1.5"></span>Normal Panel
                  </span>
                  <span className="flex items-center text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-sm bg-cyan-500 mr-1.5"></span>Cooled (Fins)
                  </span>
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
                        fillOpacity={0.85} 
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
                      name="Normal Power" 
                      stroke="#ef4444" 
                      strokeWidth={3} 
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="predicted_cooled_power" 
                      name="Cooled Power" 
                      stroke="#06b6d4" 
                      strokeWidth={3} 
                      strokeDasharray="6 4"
                      dot={false} 
                      activeDot={{ r: 5, strokeWidth: 0 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
                
                <div className="flex justify-center mt-3">
                   <span className="flex items-center text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
                     <span className={`w-3 h-3 rounded-sm ${theme === 'dark' ? 'bg-[#0f172a]' : 'bg-[#f1f5f9]'} border border-slate-200 dark:border-slate-800 mr-2`}></span>
                     Nighttime / Non-Operational Hours
                   </span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Single-value Bento Card
function BentoCard({ title, value, subtext = "", icon, valueColor = "text-slate-800 dark:text-slate-50", iconBg = "bg-slate-50 dark:bg-slate-800" }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group relative overflow-hidden">
      <div className="flex justify-between items-start mb-3 relative z-10">
        <div className={`p-2.5 rounded-xl ${iconBg} group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase mb-1">{title}</p>
        <h3 className={`text-2xl font-black tracking-tight font-mono ${valueColor}`}>{value}</h3>
        {subtext && <p className="text-[10px] font-semibold text-slate-400 mt-1">{subtext}</p>}
      </div>
    </div>
  );
}

// Side-by-side comparative Bento Card
function BentoCardDouble({ title, normalVal, cooledVal, icon, iconBg = "bg-slate-50 dark:bg-slate-800" }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group relative overflow-hidden">
      <div className="flex justify-between items-start mb-3 relative z-10">
        <div className={`p-2.5 rounded-xl ${iconBg} group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
      </div>
      <div className="relative z-10 space-y-1">
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase mb-1">{title}</p>
        <div className="flex items-center justify-between text-xs font-mono font-bold">
          <span className="text-slate-400">Normal:</span>
          <span className="text-red-500">{normalVal}</span>
        </div>
        <div className="flex items-center justify-between text-xs font-mono font-bold">
          <span className="text-slate-400">Cooled:</span>
          <span className="text-cyan-500">{cooledVal}</span>
        </div>
      </div>
    </div>
  );
}

export default App;

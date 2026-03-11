import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Bell, 
  Activity, 
  Layers, 
  Search, 
  TrendingUp, 
  Clock, 
  ChevronRight,
  ExternalLink,
  Settings,
  LayoutDashboard,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TradingAlert, AssetCategory, ChartLayout } from './types';

// TradingView Widget Component
const TradingViewChart = ({ symbol, chartLayouts, interval }: { symbol: string, chartLayouts?: ChartLayout[], interval?: string | null }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    
    // Clean up previous widget
    container.current.innerHTML = '';
    
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      const tv = (window as any).TradingView;
      if (tv) {
        const config: any = {
          autosize: true,
          symbol: symbol,
          interval: interval || 'D', // Default interval, overridden by layout if not provided by alert
          timezone: 'Etc/UTC',
          theme: 'light',
          style: '1',
          locale: 'en',
          toolbar_bg: '#f1f3f6',
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: 'tradingview_widget',
          hide_side_toolbar: false,
        };
        
        // Find matching layout for the current symbol
        let matchedLayoutId = '';
        let matchedInterval = '';
        if (chartLayouts && chartLayouts.length > 0) {
          // First try to find an exact match or partial match in symbols list
          const match = chartLayouts.find(layout => {
            if (!layout.symbols || !layout.id) return false;
            const symbolsList = layout.symbols.split(',')
              .map(s => s.trim().toUpperCase())
              .filter(s => s.length > 0 && s !== '*'); // Ignore empty strings and wildcards in this pass
            
            // Check if symbol is in the list, or if the list contains a partial match
            return symbolsList.includes(symbol.toUpperCase()) || symbolsList.some(s => symbol.toUpperCase().includes(s));
          });
          
          if (match) {
            matchedLayoutId = match.id;
            if (match.interval) matchedInterval = match.interval;
          } else {
            // Fallback to a default layout (one with '*' or just the first one if it has no specific symbols)
            const defaultLayout = chartLayouts.find(l => l.symbols.includes('*') || !l.symbols.trim());
            if (defaultLayout) {
              matchedLayoutId = defaultLayout.id;
              if (defaultLayout.interval) matchedInterval = defaultLayout.interval;
            }
          }
        }

        if (matchedLayoutId) {
          config.saved_chart = matchedLayoutId;
        }
        
        // If alert provided an interval, use it. Otherwise use the layout's mapped interval.
        if (interval) {
          config.interval = interval;
        } else if (matchedInterval) {
          config.interval = matchedInterval;
        }

        new tv.widget(config);
      }
    };
    document.head.appendChild(script);
  }, [symbol, chartLayouts, interval]);

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
      <div id="tradingview_widget" ref={container} className="w-full h-full" />
    </div>
  );
};

export default function App() {
  const [alerts, setAlerts] = useState<TradingAlert[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NASDAQ:AAPL');
  const [selectedInterval, setSelectedInterval] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'ALL'>('ALL');
  const [trafficLogs, setTrafficLogs] = useState<any[]>([]);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [chartLayouts, setChartLayouts] = useState<ChartLayout[]>(() => {
    const saved = localStorage.getItem('tv_chart_layouts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    // Migrate old single layout ID if it exists
    const oldId = localStorage.getItem('tv_chart_id');
    if (oldId) {
      return [{ id: oldId, name: 'Default Layout', symbols: '*' }];
    }
    return [{ id: '', name: 'Default Layout', symbols: '*' }];
  });
  const [lastTrafficTime, setLastTrafficTime] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [serverId, setServerId] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<'DEV' | 'SHARED' | null>(null);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  useEffect(() => {
    // Initial fetch
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setServerId(data.serverId);
        setAppMode(window.location.origin.includes('ais-pre') ? 'SHARED' : 'DEV');
      });

    fetch('/api/alerts')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlerts(data);
        } else {
          console.error('Expected array for alerts, got:', data);
          setAlerts([]);
        }
      })
      .catch(err => {
        console.error('Failed to fetch alerts:', err);
        setAlerts([]);
      });

    fetch('/api/traffic')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setTrafficLogs(data);
        } else {
          setTrafficLogs([]);
        }
      })
      .catch(() => setTrafficLogs([]));
    
    fetch('/api/debug')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDebugLogs(data);
        } else {
          setDebugLogs([]);
        }
      })
      .catch(() => setDebugLogs([]));

    // Socket connection
    const socket = io();
    
    socket.on('connect', () => {
      console.log('>>> Socket connected!');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('>>> Socket disconnected!');
      setIsConnected(false);
    });

    socket.on('new_alert', (alert: TradingAlert) => {
      console.log('>>> Socket: New alert received!', alert);
      setAlerts(prev => [alert, ...prev].slice(0, 100));
      // Auto-select the latest alert's symbol and interval
      setSelectedSymbol(alert.symbol);
      if (alert.interval) {
        setSelectedInterval(alert.interval);
      }
    });

    socket.on('webhook_traffic', (data: any) => {
      console.log('>>> Socket: Webhook traffic detected!', data);
      setTrafficLogs(prev => [data, ...prev].slice(0, 10));
      setLastTrafficTime(Date.now());
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const categories = Object.values(AssetCategory);
  
  const filteredAlerts = Array.isArray(alerts) 
    ? (activeCategory === 'ALL' 
        ? alerts 
        : alerts.filter(a => a.category === activeCategory))
    : [];

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex h-screen bg-[#f8f9fa] text-gray-900 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-16 border-r border-gray-200 flex flex-col items-center py-6 gap-8 bg-white shadow-sm z-10">
        <div className="p-2 bg-emerald-50 rounded-lg">
          <Activity className="w-6 h-6 text-emerald-600" />
        </div>
        <nav className="flex flex-col gap-6">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-emerald-600">
            <LayoutDashboard className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            <Layers className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
            <Search className="w-5 h-5" />
          </button>
        </nav>
        <div className="mt-auto">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center gap-4">
          <button 
            onClick={() => setShowTraffic(!showTraffic)}
            className={`p-2 rounded-lg transition-all relative ${showTraffic ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:bg-gray-100'}`}
            title="Live Traffic Monitor"
          >
            <Activity className="w-5 h-5" />
            {lastTrafficTime && (Date.now() - lastTrafficTime < 5000) && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            )}
          </button>
          <button 
            onClick={async () => {
              try {
                await fetch('/api/webhook', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    symbol: 'TEST',
                    category: 'DEBUG',
                    message: 'This is a test alert from the dashboard',
                    price: 123.45
                  })
                });
              } catch (err) {
                console.error('Test webhook failed:', err);
              }
            }}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 transition-all"
            title="Send Test Webhook"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shadow-sm z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">Alert Monitor</h1>
            <div className="h-4 w-[1px] bg-gray-200" />
            <div className="flex gap-2">
              <button 
                onClick={() => setActiveCategory('ALL')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${activeCategory === 'ALL' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
              >
                All
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${activeCategory === cat ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {appMode && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${appMode === 'SHARED' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                MODE: {appMode}
              </span>
            )}
            {serverId && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-mono">
                SRV: {serverId}
              </span>
            )}
            <span className="flex items-center gap-1.5 font-medium">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {isConnected ? 'Live Connection' : 'Disconnected'}
            </span>
            <Clock className="w-4 h-4" />
            <span className="font-medium">{new Date().toLocaleDateString()}</span>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-1 flex min-h-0">
          {/* Alerts List */}
          <div className="w-[450px] border-r border-gray-200 flex flex-col bg-white">
            <div className="col-header flex justify-between items-center bg-gray-50/80 px-4 py-2 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Recent Activity</span>
                <button 
                  onClick={() => {
                    fetch('/api/alerts')
                      .then(res => res.json())
                      .then(data => setAlerts(data));
                  }}
                  className="text-[9px] text-emerald-600 hover:text-emerald-700 font-bold uppercase"
                >
                  Refresh
                </button>
              </div>
              <span className="text-[10px] font-bold text-gray-400">{filteredAlerts.length} Alerts</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <AnimatePresence initial={false}>
                {filteredAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8 text-center">
                    <Bell className="w-12 h-12 opacity-20" />
                    <p className="text-sm">No alerts received yet.<br/>Configure your TradingView Webhook to start monitoring.</p>
                  </div>
                ) : (
                  filteredAlerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => {
                        setSelectedSymbol(alert.symbol);
                        if (alert.interval) {
                          setSelectedInterval(alert.interval);
                        } else {
                          setSelectedInterval(null);
                        }
                      }}
                      className={`data-row group border-b border-gray-100 ${selectedSymbol === alert.symbol ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tracking-tight text-gray-900 group-hover:text-emerald-600 transition-colors">
                            {alert.symbol}
                          </span>
                          {alert.interval && (
                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-[9px] font-bold">
                              {alert.interval}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                          {alert.category}
                        </span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <p className="text-xs text-gray-600 line-clamp-1">
                          {alert.message}
                        </p>
                      </div>
                      <div className="flex flex-col items-end justify-center">
                        <span className="data-value text-xs font-bold text-emerald-600">
                          {alert.price.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[10px] text-gray-400 font-mono">
                          {formatTime(alert.timestamp)}
                        </span>
                        <ChevronRight className={`w-4 h-4 transition-transform ${selectedSymbol === alert.symbol ? 'text-emerald-600 translate-x-1' : 'text-gray-300'}`} />
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Chart View */}
          <div className="flex-1 flex flex-col p-6 gap-6 bg-[#f8f9fa]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-gray-900">{selectedSymbol}</h2>
                  <p className="text-xs text-gray-500 font-medium">Live Chart Analysis</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/webhook', {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: `${selectedSymbol}|RESEARCH|Manual Test Alert|${(Math.random() * 1000).toFixed(2)}|15`
                      });
                      if (res.ok) {
                        console.log('Test alert sent');
                      }
                    } catch (err) {
                      console.error('Failed to send test alert', err);
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-semibold transition-all text-white shadow-sm"
                >
                  <Bell className="w-4 h-4" />
                  Send Test Alert
                </button>
                <button 
                  onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${selectedSymbol}`, '_blank')}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 rounded-lg text-xs font-semibold transition-all border border-gray-200 shadow-sm text-gray-700"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in TradingView
                </button>
              </div>
            </div>
            
            <div className="flex-1 min-h-0">
              <TradingViewChart symbol={selectedSymbol} chartLayouts={chartLayouts} interval={selectedInterval} />
            </div>

            {/* Strategy Notes / Alert Details */}
            <div className="h-48 grid grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Latest Signal</span>
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-sm text-gray-700 italic leading-relaxed">
                    "{alerts.find(a => a.symbol === selectedSymbol)?.message || 'No specific signal data available for this asset.'}"
                  </p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Asset Category</span>
                <div className="flex-1 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-100">
                    <Layers className="w-5 h-5 text-gray-400" />
                  </div>
                  <span className="text-sm font-bold text-gray-800">
                    {alerts.find(a => a.symbol === selectedSymbol)?.category || 'UNCLASSIFIED'}
                  </span>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-5 flex flex-col gap-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-600/70 font-bold">Webhook Configuration</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/webhook', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ symbol: 'PING', category: 'DEBUG', message: 'Manual Ping Test' })
                          });
                          alert(`Ping Status: ${res.status}`);
                        } catch (e) {
                          alert('Ping Failed');
                        }
                      }}
                      className="text-[10px] bg-gray-900 text-white px-2 py-0.5 rounded hover:bg-black font-bold"
                    >
                      Ping Webhook
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-3">
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-[10px] text-emerald-700 font-bold uppercase flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        TRADINGVIEW WEBHOOK URL:
                      </p>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`https://ais-pre-s3hboo4fopfq6mulcof6mp-543651764845.europe-west2.run.app/api/webhook`);
                          alert('Shared URL Copied!');
                        }}
                        className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1"
                      >
                        Copy URL
                      </button>
                    </div>
                    <code className="text-[11px] block bg-emerald-50 text-emerald-900 p-3 rounded border border-emerald-100 break-all font-mono mb-2">
                      https://ais-pre-s3hboo4fopfq6mulcof6mp-543651764845.europe-west2.run.app/api/webhook
                    </code>
                    <div className="flex flex-col gap-1">
                      <p className="text-[9px] text-emerald-600 font-medium">
                        ✓ MUST use the "ais-pre" (Shared) URL above.
                      </p>
                      <p className="text-[9px] text-emerald-600 font-medium">
                        ✓ JSON: Add <strong>"interval": "{`{{interval}}`}"</strong> to auto-load the correct timeframe.
                      </p>
                      <p className="text-[9px] text-emerald-600 font-medium">
                        ✓ Plain Text: Use <strong>{`{{ticker}}|SIGNAL|{{strategy.order.action}}|{{close}}|{{interval}}`}</strong>
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <a 
                      href="https://ais-pre-s3hboo4fopfq6mulcof6mp-543651764845.europe-west2.run.app" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open Shared App
                    </a>
                    <button 
                      onClick={() => setShowTraffic(true)}
                      className="py-2 bg-gray-900 text-white rounded-lg text-[10px] font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <Activity className="w-3 h-3" />
                      Open Debug Monitor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Traffic Monitor Panel */}
        <AnimatePresence>
          {showTraffic && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: '350px' }}
              exit={{ height: 0 }}
              className="bg-gray-900 text-gray-300 overflow-hidden border-t border-gray-800 flex flex-col"
            >
              <div className="px-4 py-2 bg-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">System Debug Monitor</span>
                  <button 
                    onClick={() => {
                      fetch('/api/traffic')
                        .then(res => res.json())
                        .then(data => setTrafficLogs(data));
                      fetch('/api/debug')
                        .then(res => res.json())
                        .then(data => setDebugLogs(data));
                    }}
                    className="text-[9px] text-gray-500 hover:text-white uppercase font-bold"
                  >
                    Refresh All Logs
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm('Clear all logs?')) {
                        fetch('/api/debug/clear')
                          .then(() => {
                            setTrafficLogs([]);
                            setDebugLogs([]);
                          });
                      }
                    }}
                    className="text-[9px] text-red-500 hover:text-red-400 uppercase font-bold"
                  >
                    Clear Logs
                  </button>
                </div>
                <button onClick={() => setShowTraffic(false)} className="text-gray-500 hover:text-white">×</button>
              </div>
              
              <div className="flex-1 flex min-h-0">
                {/* Global Request Debug */}
                <div className="flex-1 border-r border-gray-800 flex flex-col">
                  <div className="px-4 py-1 bg-gray-900/50 border-b border-gray-800">
                    <span className="text-[9px] font-bold text-gray-500 uppercase">Global Request Log (Any Path)</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
                    {debugLogs.length === 0 ? (
                      <p className="text-gray-600 italic">No global requests captured.</p>
                    ) : (
                      debugLogs.map((log: any) => (
                        <div key={log.id} className="border-b border-gray-800 pb-2">
                          <div className="flex justify-between text-gray-500 mb-1">
                            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span>{log.event}</span>
                          </div>
                          <div className="text-gray-400 break-all">{log.data}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Webhook Specific Traffic */}
                <div className="flex-1 flex flex-col">
                  <div className="px-4 py-1 bg-gray-900/50 border-b border-gray-800">
                    <span className="text-[9px] font-bold text-emerald-500/50 uppercase">Webhook Payloads (/api/webhook)</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
                    {trafficLogs.length === 0 ? (
                      <p className="text-gray-600 italic">No webhook payloads detected.</p>
                    ) : (
                      trafficLogs.map((log, i) => (
                        <div key={i} className="border-b border-gray-800 pb-2">
                          <div className="flex justify-between text-emerald-500/70 mb-1">
                            <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                            <span>{log.method} {log.path}</span>
                          </div>
                          <div className="bg-black/30 p-2 rounded text-gray-400 break-all">
                            {typeof log.body === 'string' ? log.body : JSON.stringify(log.body)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
              onClick={() => setShowSettings(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-gray-100 max-h-[90vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-emerald-600" />
                    Chart Layouts
                  </h2>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="space-y-6">
                  <p className="text-sm text-gray-600">
                    Map your TradingView Chart Layout IDs to specific symbols. When an alert arrives, the app will automatically load the correct layout. Use <strong>*</strong> as a wildcard for a default layout.
                  </p>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
                    <p className="font-semibold mb-1">Important: TradingView Layout Sharing</p>
                    <p>For your drawings to appear here, you must enable <strong>Sharing</strong> on your chart layout in TradingView. Click the dropdown arrow next to your layout name in TradingView and turn on "Sharing".</p>
                  </div>

                  <div className="space-y-4">
                    {chartLayouts.map((layout, index) => (
                      <div key={index} className="p-4 border border-gray-200 rounded-xl bg-gray-50 flex flex-col gap-3 relative">
                        <button 
                          onClick={() => {
                            const newLayouts = chartLayouts.filter((_, i) => i !== index);
                            setChartLayouts(newLayouts);
                            localStorage.setItem('tv_chart_layouts', JSON.stringify(newLayouts));
                          }}
                          className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        
                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-12 sm:col-span-5">
                            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Layout Name</label>
                            <input 
                              type="text" 
                              value={layout.name}
                              onChange={(e) => {
                                const newLayouts = [...chartLayouts];
                                newLayouts[index].name = e.target.value;
                                setChartLayouts(newLayouts);
                                localStorage.setItem('tv_chart_layouts', JSON.stringify(newLayouts));
                              }}
                              placeholder="e.g., Crypto Layout"
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                            />
                          </div>
                          <div className="col-span-8 sm:col-span-5">
                            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Layout ID</label>
                            <input 
                              type="text" 
                              value={layout.id}
                              onChange={(e) => {
                                const newLayouts = [...chartLayouts];
                                newLayouts[index].id = e.target.value;
                                setChartLayouts(newLayouts);
                                localStorage.setItem('tv_chart_layouts', JSON.stringify(newLayouts));
                              }}
                              placeholder="e.g., abcdefgh"
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono text-sm"
                            />
                          </div>
                          <div className="col-span-4 sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Interval</label>
                            <input 
                              type="text" 
                              value={layout.interval || ''}
                              onChange={(e) => {
                                const newLayouts = [...chartLayouts];
                                newLayouts[index].interval = e.target.value;
                                setChartLayouts(newLayouts);
                                localStorage.setItem('tv_chart_layouts', JSON.stringify(newLayouts));
                              }}
                              placeholder="e.g., 1, 60, D"
                              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Symbols (comma separated)</label>
                          <input 
                            type="text" 
                            value={layout.symbols}
                            onChange={(e) => {
                              const newLayouts = [...chartLayouts];
                              newLayouts[index].symbols = e.target.value;
                              setChartLayouts(newLayouts);
                              localStorage.setItem('tv_chart_layouts', JSON.stringify(newLayouts));
                            }}
                            placeholder="e.g., BTCUSD, ETHUSD, SOLUSD"
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => {
                      const newLayouts = [...chartLayouts, { id: '', name: 'New Layout', symbols: '' }];
                      setChartLayouts(newLayouts);
                      localStorage.setItem('tv_chart_layouts', JSON.stringify(newLayouts));
                    }}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-500 font-medium hover:border-emerald-500 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Layout Mapping
                  </button>
                </div>

                <div className="mt-8 flex justify-end">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors shadow-sm"
                  >
                    Save & Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Styles for Custom Scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f9fafb;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  );
}

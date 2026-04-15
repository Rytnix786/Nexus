import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Shield, Key, SlidersHorizontal, Database, AlertCircle } from 'lucide-react';

function StatusBadge({ status, label }) {
  const isHealthy = status === 'healthy';
  return (
    <div className={`px-4 py-2 ${isHealthy ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-error/10 text-error border-error/30'} border rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2`}>
      <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-error'}`}></div>
      {label}
    </div>
  );
}

export default function SettingsPanel() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const authToken = localStorage.getItem('nexus.authToken') || '';
        const res = await fetch('/api/health/ratelimit', {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setHealthData(data);
        } else {
          setError(`Health check failed: ${res.status}`);
        }
      } catch (err) {
        setError(`Error fetching health: ${String(err.message || err)}`);
      } finally {
        setLoading(false);
      }
    };
    fetchHealth();
  }, []);
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-headline font-bold text-on-surface">System Settings</h1>
        <p className="text-on-surface-variant font-label text-sm mt-1">Configure orchestrator core parameters and API keys.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        
        {error && (
          <div className="glass-panel p-4 rounded-2xl border border-error/30 bg-error/5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
        
        {/* API Configuration */}
        <section className="glass-panel p-8 rounded-3xl border border-outline-variant/20">
          <div className="flex items-center gap-3 mb-6">
            <Key className="text-primary w-5 h-5" />
            <h2 className="text-xl font-headline font-bold">API Configuration</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-on-surface-variant mb-2 block font-label">Tavily Search API Key</label>
              <input type="password" value={process.env.REACT_APP_TAVILY_KEY ? '***-***-***' : 'Not configured'} readOnly className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:outline-none text-sm" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-on-surface-variant mb-2 block font-label">Ollama Base URL</label>
              <input type="text" value={process.env.REACT_APP_OLLAMA_URL || 'http://localhost:11434'} readOnly className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:outline-none text-sm" />
            </div>
          </div>
        </section>

        {/* Global Constraints */}
        <section className="glass-panel p-8 rounded-3xl border border-outline-variant/20">
          <div className="flex items-center gap-3 mb-6">
            <SlidersHorizontal className="text-primary w-5 h-5" />
            <h2 className="text-xl font-headline font-bold">Global Constraints</h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-xs uppercase tracking-widest text-on-surface-variant mb-2 block font-label">Max Iterations Per Run</label>
              <input type="number" value="6" readOnly className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:outline-none" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-on-surface-variant mb-2 block font-label">Daily Token Quota</label>
              <input type="number" value="200000" readOnly className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:outline-none" />
            </div>
          </div>
        </section>

        {/* Backend Connectivity */}
        <section className="glass-panel p-8 rounded-3xl border border-outline-variant/20">
          <div className="flex items-center gap-3 mb-6">
            <Database className="text-primary w-5 h-5" />
            <h2 className="text-xl font-headline font-bold">Data Sources</h2>
          </div>
          <p className="text-sm text-on-surface-variant mb-4">PostgreSQL and Redis health status:</p>
          <div className="flex flex-wrap gap-4">
             {loading ? (
               <div className="text-xs text-on-surface-variant">Loading...</div>
             ) : healthData ? (
               <>
                 <StatusBadge status={healthData.postgres_available ? 'healthy' : 'unhealthy'} label="PostgreSQL Connected" />
                 <StatusBadge status={healthData.redis_available ? 'healthy' : 'unhealthy'} label="Redis Active" />
               </>
             ) : (
               <div className="text-xs text-on-surface-variant">Unable to fetch health status</div>
             )}
          </div>
        </section>
      </motion.div>
    </div>
  );
}

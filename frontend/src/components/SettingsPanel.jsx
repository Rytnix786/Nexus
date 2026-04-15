import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Shield, Key, SlidersHorizontal, Database } from 'lucide-react';

export default function SettingsPanel() {
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-headline font-bold text-on-surface">System Settings</h1>
        <p className="text-on-surface-variant font-label text-sm mt-1">Configure orchestrator core parameters and API keys.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        
        {/* API Configuration */}
        <section className="glass-panel p-8 rounded-3xl border border-outline-variant/20">
          <div className="flex items-center gap-3 mb-6">
            <Key className="text-primary w-5 h-5" />
            <h2 className="text-xl font-headline font-bold">API Configuration</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-on-surface-variant mb-2 block font-label">OpenAI Provider Key</label>
              <input type="password" value="sk-********************************" readOnly className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:outline-none" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-on-surface-variant mb-2 block font-label">Tavily Search API Key</label>
              <input type="password" value="tvly-********************************" readOnly className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 text-on-surface focus:outline-none" />
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
          <p className="text-sm text-on-surface-variant mb-4">PostgreSQL and Redis connections are managed via Docker environment variables. Both are currently healthy.</p>
          <div className="flex gap-4">
             <div className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400"></div> PostgreSQL Connected</div>
             <div className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400"></div> Redis Active</div>
          </div>
        </section>
      </motion.div>
    </div>
  );
}

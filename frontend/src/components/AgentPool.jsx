import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, CheckCircle2, ShieldAlert, Activity } from 'lucide-react';
import clsx from 'clsx';

const mockAgents = [
  { id: '1', name: 'Planner Agent', status: 'idle', role: 'Architect', efficiency: '98%' },
  { id: '2', name: 'Researcher Crawler', status: 'active', role: 'Data Mining', efficiency: '92%' },
  { id: '3', name: 'Logic Analyst', status: 'idle', role: 'Synthesizer', efficiency: '99%' },
  { id: '4', name: 'Writer Output', status: 'offline', role: 'Presenter', efficiency: '-' },
  { id: '5', name: 'Critic Reviewer', status: 'idle', role: 'Validator', efficiency: '95%' },
];

export default function AgentPool() {
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
         <div>
           <h1 className="text-3xl font-headline font-bold text-on-surface">Agent Pool</h1>
           <p className="text-on-surface-variant font-label text-sm mt-1">Manage and configure orchestrator AI nodes.</p>
         </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockAgents.map((agent, i) => (
           <motion.div 
             key={agent.id}
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: i * 0.1 }}
             className="glass-panel rounded-3xl p-6 border border-outline-variant/20 lift-glow-hover flex flex-col justify-between h-48"
           >
             <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "w-10 h-10 rounded-2xl flex items-center justify-center border",
                    agent.status === 'active' ? 'bg-primary/20 text-primary border-primary/50 pulse-primary' :
                    agent.status === 'idle' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                    'bg-on-surface-variant/10 text-on-surface-variant border-outline-variant/30'
                  )}>
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-on-surface">{agent.name}</h3>
                    <p className="text-xs text-on-surface-variant uppercase tracking-widest">{agent.role}</p>
                  </div>
                </div>
                {agent.status === 'active' && <Activity className="w-4 h-4 text-primary animate-pulse" />}
                {agent.status === 'idle' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {agent.status === 'offline' && <ShieldAlert className="w-4 h-4 text-error" />}
             </div>
             
             <div className="mt-6 flex items-center justify-between border-t border-outline-variant/10 pt-4">
                <div className="text-xs font-label">
                  <span className="text-on-surface-variant">Status: </span>
                  <span className={clsx("uppercase tracking-wider font-bold", 
                    agent.status === 'active' ? 'text-primary' :
                    agent.status === 'idle' ? 'text-emerald-400' : 'text-error'
                  )}>{agent.status}</span>
                </div>
                <div className="text-xs font-label">
                  <span className="text-on-surface-variant">Efficiency: </span>
                  <span className="text-on-surface font-bold">{agent.efficiency}</span>
                </div>
             </div>
           </motion.div>
        ))}
      </div>
    </div>
  );
}

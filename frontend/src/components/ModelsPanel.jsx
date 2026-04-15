import React from 'react';
import { motion } from 'framer-motion';
import { Box, Check, Info } from 'lucide-react';
import clsx from 'clsx';

const MODELS = [
  { provider: 'Ollama (Local)', name: 'llama3.2:1b', status: 'connected', primary: true, context: 'Running locally via Docker. No external API calls.' },
];

export default function ModelsPanel() {
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
         <div>
           <h1 className="text-3xl font-headline font-bold text-on-surface">Language Models</h1>
           <p className="text-on-surface-variant font-label text-sm mt-1">This system uses Ollama for local inference. No external LLM API integration.</p>
         </div>
      </div>
      <div className="space-y-6 max-w-2xl">
        {/* Info Banner */}
        <div className="glass-panel rounded-2xl p-4 border border-secondary/30 flex items-start gap-3 bg-secondary/5">
          <Info className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-on-surface-variant">
            <p>To change the language model, modify the <code className="bg-surface-container-lowest px-1.5 py-0.5 rounded text-xs">OLLAMA_MODEL</code> environment variable in <code className="bg-surface-container-lowest px-1.5 py-0.5 rounded text-xs">docker-compose.yml</code> and restart the backend.</p>
          </div>
        </div>

        {/* Models Grid */}
        <div className="grid grid-cols-1 gap-6">
        {MODELS.map((model, i) => (
           <motion.div 
             key={i}
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: i * 0.05 }}
             className="glass-panel rounded-[2rem] p-6 border border-primary/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]"
           >
             <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center border border-outline-variant/30 text-primary">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-on-surface">{model.name}</h3>
                    <p className="text-xs text-on-surface-variant font-label">{model.provider}</p>
                  </div>
                </div>
                <span className="bg-primary/20 text-primary border border-primary/40 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><Check className="w-3 h-3" /> Active</span>
             </div>
             
             <p className="text-sm text-on-surface-variant mb-4">{model.context}</p>
             
             <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Status: Connected</span>
             </div>
           </motion.div>
        ))}
        </div>
      </div>
    </div>
  );
}

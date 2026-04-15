import React from 'react';
import { motion } from 'framer-motion';
import { Box, Check, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

const mockModels = [
  { provider: 'OpenAI', name: 'gpt-4o', status: 'connected', primary: true },
  { provider: 'OpenAI', name: 'gpt-4-turbo', status: 'connected', primary: false },
  { provider: 'Anthropic', name: 'claude-3-opus-20240229', status: 'available', primary: false },
  { provider: 'Anthropic', name: 'claude-3-sonnet-20240229', status: 'available', primary: false },
  { provider: 'Ollama', name: 'llama3.2:1b', status: 'local', primary: false },
];

export default function ModelsPanel() {
  return (
    <div className="p-8 h-full overflow-y-auto custom-scrollbar relative z-10 w-full max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
         <div>
           <h1 className="text-3xl font-headline font-bold text-on-surface">Language Models</h1>
           <p className="text-on-surface-variant font-label text-sm mt-1">Configure routing and backend LLM endpoints.</p>
         </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {mockModels.map((model, i) => (
           <motion.div 
             key={i}
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: i * 0.05 }}
             className={clsx(
               "glass-panel rounded-[2rem] p-6 border",
               model.primary ? "border-primary/50 shadow-[0_0_15px_rgba(0,229,255,0.15)]" : "border-outline-variant/20"
             )}
           >
             <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center border border-outline-variant/30 text-on-surface-variant">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-on-surface">{model.name}</h3>
                    <p className="text-xs text-on-surface-variant font-label">{model.provider}</p>
                  </div>
                </div>
                {model.primary && <span className="bg-primary/20 text-primary border border-primary/40 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"><Check className="w-3 h-3" /> Default</span>}
             </div>
             
             <div className="mt-4 flex items-center justify-between">
                <span className={clsx(
                  "text-xs font-bold uppercase tracking-wider",
                  model.status === 'connected' ? 'text-emerald-400' :
                  model.status === 'local' ? 'text-secondary' : 'text-on-surface-variant'
                )}>Status: {model.status}</span>
                
                <button className="text-xs flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
                  Configure <ExternalLink className="w-3 h-3" />
                </button>
             </div>
           </motion.div>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import { Download, Share2, Printer, CheckCircle2, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function RunArtifact({ runStream = {} }) {
  const runId = String(runStream.runId || '');
  const output = String(runStream.output || '');
  const runDetails = runStream.runDetails || null;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 animate-slide-in">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
               <CheckCircle2 className="w-6 h-6 text-emerald-400" />
             </div>
             <div>
               <h1 className="text-3xl font-headline font-bold text-on-surface">Mission Complete</h1>
               <p className="text-on-surface-variant font-label text-sm uppercase tracking-widest mt-1">Run: {runId}</p>
             </div>
           </div>
           
           <div className="flex gap-3">
             <button className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors">
                <Copy className="w-5 h-5" />
             </button>
             <button className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors">
                <Printer className="w-5 h-5" />
             </button>
             <button className="p-3 bg-surface-container-low border border-outline-variant/30 rounded-xl hover:text-primary hover:border-primary/50 transition-colors">
                <Share2 className="w-5 h-5" />
             </button>
             <button className="flex items-center gap-2 px-6 py-3 bg-primary text-[#005762] rounded-xl font-bold font-headline hover:shadow-[0_0_15px_rgba(0,229,255,0.4)] transition-all">
                <Download className="w-5 h-5" />
                Export PDF
             </button>
           </div>
        </div>

        <div className="glass-panel border border-outline-variant/20 rounded-[2.5rem] p-12 relative overflow-hidden bg-surface-container-low shadow-2xl">
           <div className="absolute top-0 right-0 p-6 flex gap-2">
             <div className="px-3 py-1 bg-surface-container rounded-full text-xs font-label text-on-surface-variant border border-outline-variant/10">v1.2</div>
             <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-label border border-emerald-500/30">Final Verified</div>
           </div>
           
           <div className="prose prose-invert prose-p:text-on-surface prose-headings:text-primary prose-a:text-secondary max-w-none font-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                 {output || runDetails?.output || runDetails?.final_output || "No output generated."}
              </ReactMarkdown>
           </div>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { Rocket, Plus, BrainCircuit, ScanSearch, TerminalSquare } from 'lucide-react';
import clsx from 'clsx';
import { uploadSources } from '../lib/api';

function estimateTokenBurn({ objective, highImpact, uploadedContextChars }) {
  const text = String(objective || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const complexityBonus = /(deep|comprehensive|multi-step|benchmark|architecture|audit|compare|analysis)/i.test(text) ? 1800 : 0;
  const contextCost = Math.ceil((uploadedContextChars || 0) / 7);
  const base = 1400;
  const objectiveCost = words * 42;
  const impactCost = highImpact ? 3600 : 1900;
  return Math.max(1200, base + objectiveCost + impactCost + contextCost + complexityBonus);
}

export default function MissionControl({ runStream = {}, authState = null, isDeveloperMode = false }) {
  const [objective, setObjective] = useState('');
  const [tokenBudget, setTokenBudget] = useState(isDeveloperMode ? 60000 : 9000);
  const [highImpact, setHighImpact] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedContext, setUploadedContext] = useState('');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploading, setUploading] = useState(false);

  const estimatedBurn = useMemo(() => {
    return estimateTokenBurn({
      objective,
      highImpact,
      uploadedContextChars: uploadedContext.length,
    });
  }, [highImpact, objective, uploadedContext.length]);
  const recommendedBudget = isDeveloperMode ? Math.max(estimatedBurn + 20000, 60000) : estimatedBurn;
  const budgetTooLow = Number(tokenBudget || 0) < recommendedBudget;

  const handleLaunch = () => {
    if (!objective.trim()) return;
    if (typeof runStream.startRun !== 'function') return;
    const effectiveBudget = isDeveloperMode ? Math.max(Number(tokenBudget || 0), recommendedBudget) : Number(tokenBudget || 0);
    runStream.startRun({
      objective,
      highImpact,
      tokenBudget: effectiveBudget,
      uploadedContext,
    });
  };

  const handleUploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    setUploadedFiles(files);
    if (files.length === 0) {
      setUploadedContext('');
      setUploadSummary('');
      return;
    }

    setUploading(true);
    try {
      const payload = await uploadSources(files);
      setUploadedContext(String(payload.combined_context || ''));
      const names = (payload.files || []).map((entry) => entry.filename).join(', ');
      setUploadSummary(`Uploaded: ${names} (${payload.combined_chars || 0} chars context${payload.truncated ? ', truncated' : ''})`);
    } catch (error) {
      setUploadedContext('');
      setUploadedFiles([]);
      setUploadSummary(String(error.message || error));
    } finally {
      setUploading(false);
    }
  };

  const suggestions = [
    "Analyze market trends",
    "Deep research on LLM architectures",
    "Technical audit of codebase"
  ];

  return (
    <div className="max-w-5xl mx-auto h-full flex flex-col justify-center items-center px-12 relative z-10">
      {/* Branding Header in Stage */}
      <div className="text-center mb-16 system-boot" style={{ animationDelay: '0.1s' }}>
        <h1 className="font-headline text-6xl font-bold tracking-tighter mb-4 text-on-surface">
          Nexus <span className="text-primary">Core</span>
        </h1>
        <p className="text-on-surface-variant font-body text-xl max-w-xl mx-auto">
          Initiate a multi-agent orchestration. The neural ether is ready for your commands.
        </p>
      </div>

      {/* Central Mission Control Area */}
      <div className="w-full glass-panel rounded-[2.5rem] p-12 border border-outline-variant/10 shadow-2xl relative overflow-hidden system-boot" style={{ animationDelay: '0.3s' }}>
        {/* Inner Glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5 pointer-events-none"></div>

        <div className="relative z-20">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-3 h-3 rounded-full bg-primary pulse-primary"></div>
            <span className="font-headline text-sm font-bold tracking-widest text-primary uppercase">Ready for input</span>
          </div>

          <div className="relative group lift-glow-hover rounded-[2rem] border border-transparent">
            <textarea 
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full bg-surface-container-lowest border-0 rounded-[2rem] p-8 text-2xl font-body text-on-surface placeholder-on-surface-variant/30 focus:ring-2 focus:ring-primary/40 transition-all resize-none overflow-hidden h-36 pr-56" 
              placeholder="What would you like Nexus to investigate?" 
            />
            
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-4">
              <button 
                onClick={handleLaunch}
                disabled={runStream.loading || !objective.trim()}
                className="bg-gradient-to-r from-primary to-primary-dim px-8 py-4 rounded-full font-headline font-bold text-[#005762] hover:shadow-[0_0_25px_rgba(129,236,255,0.4)] cubic-bezier-transition flex items-center gap-2 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {runStream.loading ? 'Booting...' : 'Launch Run'}
                <Rocket className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>

          {/* Configuration Row */}
          <div className="mt-4 flex gap-4 text-sm text-on-surface-variant flex-wrap items-center">
             <label className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest rounded-full border border-outline-variant/20 hover:border-outline-variant/50 cursor-pointer transition-colors">
               <input type="checkbox" checked={highImpact} onChange={(e) => setHighImpact(e.target.checked)} className="accent-primary" />
               High Impact Graph Mode
             </label>
             <label className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest rounded-full border border-outline-variant/20 hover:border-outline-variant/50 cursor-pointer transition-colors">
               <span>Token Budget:</span>
               <input type="number" min="1000" step="500" value={tokenBudget} onChange={(e) => setTokenBudget(Number(e.target.value))} className="bg-transparent border-none focus:ring-0 w-20 text-primary font-bold p-0" />
             </label>
             <span className="rounded-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-2">
               Est. burn: <span className="font-bold text-primary">~{estimatedBurn.toLocaleString()}</span>
             </span>
             {isDeveloperMode && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-300">Developer mode budget protection enabled</span>}
          </div>

          {budgetTooLow && (
            <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 flex items-center justify-between gap-4">
              <span>Current budget is lower than estimated task burn ({recommendedBudget.toLocaleString()} recommended).</span>
              <button
                type="button"
                onClick={() => setTokenBudget(recommendedBudget)}
                className="rounded-full border border-amber-300/50 px-3 py-1 text-xs font-bold uppercase tracking-widest hover:bg-amber-300/20"
              >
                Use Recommended
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-on-surface-variant">
            <label className="flex items-center gap-3 rounded-full border border-outline-variant/20 bg-surface-container-lowest px-4 py-2 cursor-pointer hover:border-outline-variant/50 transition-colors">
              <span>Upload sources</span>
              <input type="file" multiple onChange={(event) => void handleUploadFiles(event.target.files)} className="hidden" />
            </label>
            {uploading && <span className="text-primary">Extracting uploaded file context...</span>}
            {!uploading && uploadSummary && <span className="text-emerald-300">{uploadSummary}</span>}
            {!uploading && uploadedFiles.length > 0 && !uploadSummary && <span>{uploadedFiles.length} file(s) selected.</span>}
          </div>

          {authState?.message && (
            <p className={clsx('mt-3 text-xs', authState.status === 'ready' ? 'text-emerald-300' : authState.status === 'invalid' || authState.status === 'expired' ? 'text-rose-200' : 'text-on-surface-variant')}>
              {authState.message}
            </p>
          )}

          {/* Suggestions Chips */}
          <div className="mt-8 flex flex-wrap gap-3">
            {suggestions.map((suggestion, idx) => (
              <button 
                key={idx}
                onClick={() => setObjective(suggestion)}
                className="px-6 py-2 rounded-full border border-outline-variant/30 text-sm font-medium text-on-surface-variant chip-hover premium-hover bg-surface-container-low/50 backdrop-blur-md"
              >
                {suggestion}
              </button>
            ))}
            <button className="px-6 py-2 rounded-full border border-outline-variant/30 text-sm font-medium text-on-surface-variant chip-hover premium-hover bg-surface-container-low/50 backdrop-blur-md flex items-center gap-2">
              <Plus className="w-4 h-4" />
              More templates
            </button>
          </div>

          {runStream.error && <p className="mt-4 text-error">{runStream.error}</p>}
        </div>
      </div>

      {/* Agent Status Floating Cards (Bento style hint) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-12 system-boot" style={{ animationDelay: '0.5s' }}>
        <div className="glass-panel border border-outline-variant/10 p-6 rounded-3xl flex items-center gap-4 lift-glow-hover cursor-pointer group">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
            <BrainCircuit />
          </div>
          <div>
            <div className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-tighter">Analytic Agent</div>
            <div className="text-sm font-body text-on-surface">Standing by</div>
          </div>
        </div>
        <div className="glass-panel border border-outline-variant/10 p-6 rounded-3xl flex items-center gap-4 lift-glow-hover cursor-pointer group">
          <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary group-hover:bg-secondary/20 transition-colors">
             <ScanSearch />
          </div>
          <div>
            <div className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-tighter">Research Crawler</div>
            <div className="text-sm font-body text-on-surface">Index ready</div>
          </div>
        </div>
        <div className="glass-panel border border-outline-variant/10 p-6 rounded-3xl flex items-center gap-4 lift-glow-hover cursor-pointer group">
          <div className="w-12 h-12 rounded-2xl bg-tertiary/10 flex items-center justify-center text-tertiary group-hover:bg-tertiary/20 transition-colors">
             <TerminalSquare />
          </div>
          <div>
            <div className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-tighter">Synthesizer</div>
            <div className="text-sm font-body text-on-surface">Kernel idle</div>
          </div>
        </div>
      </div>
    </div>
  );
}
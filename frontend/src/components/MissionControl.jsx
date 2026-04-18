import React, { useMemo, useState } from 'react';
import { Rocket, Plus, BrainCircuit, ScanSearch, TerminalSquare, Zap, CheckCircle2, Clock } from 'lucide-react';
import clsx from 'clsx';
import { uploadSources } from '../lib/api';
import { useNexusApp } from '../state/NexusAppContext';

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
  const { runStream: contextRunStream } = useNexusApp();
  const effectiveRunStream = runStream || contextRunStream || {};
  const [objective, setObjective] = useState('');
  const [tokenBudget, setTokenBudget] = useState(isDeveloperMode ? 60000 : 9000);
  const [highImpact, setHighImpact] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadedContext, setUploadedContext] = useState('');
  const [uploadSummary, setUploadSummary] = useState('');
  const [uploading, setUploading] = useState(false);

  const currentNode = effectiveRunStream?.currentNode || '';
  const events = effectiveRunStream?.sortedEvents || [];

  // Derive agent card states from timeline events
  const agentCardStates = useMemo(() => {
    const completedNodes = new Set(events.map(evt => evt.node).filter(Boolean));
    return {
      analyst: {
        isActive: currentNode === 'analyst',
        isComplete: completedNodes.has('analyst'),
        label: 'Analytic Agent',
        icon: BrainCircuit,
      },
      researcher: {
        isActive: currentNode === 'researcher',
        isComplete: completedNodes.has('researcher'),
        label: 'Research Crawler',
        icon: ScanSearch,
      },
      writer: {
        isActive: currentNode === 'writer',
        isComplete: completedNodes.has('writer'),
        label: 'Synthesizer',
        icon: TerminalSquare,
      },
    };
  }, [currentNode, events]);

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
    if (typeof effectiveRunStream.startRun !== 'function') return;
    const effectiveBudget = isDeveloperMode ? Math.max(Number(tokenBudget || 0), recommendedBudget) : Number(tokenBudget || 0);
    effectiveRunStream.startRun({
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

  const templates = [
    { title: 'Market Analysis', description: 'Analyze competitive landscape and trends' },
    { title: 'Technical Audit', description: 'Deep code and architecture review' },
    { title: 'Research Report', description: 'Comprehensive research synthesis' },
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
                disabled={effectiveRunStream.loading || !objective.trim()}
                className="bg-gradient-to-r from-primary to-primary-dim px-8 py-4 rounded-full font-headline font-bold text-[#005762] hover:shadow-[0_0_25px_rgba(129,236,255,0.4)] cubic-bezier-transition flex items-center gap-2 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {effectiveRunStream.loading ? 'Booting...' : 'Launch Run'}
                <Rocket className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>

          {/* Configuration Row */}
          <div className="mt-4 flex gap-4 text-sm text-on-surface-variant flex-wrap items-center">
             <label className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest rounded-full border border-outline-variant/20 hover:border-outline-variant/50 cursor-pointer transition-colors">
               <input type="checkbox" checked={highImpact} onChange={(e) => setHighImpact(e.target.checked)} className="accent-primary" />
               Human Approval
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

          <p className="mt-2 text-xs text-on-surface-variant">
            {highImpact
              ? 'Human approval checkpoint is required before critique.'
              : 'Run proceeds without a human approval checkpoint.'}
          </p>

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
            <button 
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-6 py-2 rounded-full border border-outline-variant/30 text-sm font-medium text-on-surface-variant chip-hover premium-hover bg-surface-container-low/50 backdrop-blur-md flex items-center gap-2 relative"
            >
              <Plus className="w-4 h-4" />
              More templates
              {showTemplates && (
                <div className="absolute top-full mt-2 left-0 bg-surface-container rounded-2xl border border-outline-variant/30 shadow-lg p-3 space-y-2 min-w-max z-50">
                  {templates.map(t => (
                    <button
                      key={t.title}
                      onClick={(e) => {
                        e.preventDefault();
                        setObjective(t.title);
                        setShowTemplates(false);
                      }}
                      className="w-full px-4 py-2 rounded-lg text-left text-sm text-on-surface hover:bg-surface-container-highest transition-colors block"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-on-surface-variant">{t.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </button>
          </div>

          {effectiveRunStream.error && <p className="mt-4 text-error">{effectiveRunStream.error}</p>}
        </div>
      </div>

      {/* Agent Status Floating Cards (Bento style hint) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-12 system-boot" style={{ animationDelay: '0.5s' }}>
        {Object.entries(agentCardStates).map(([key, agent]) => {
          const Icon = agent.icon;
          return (
            <div key={key} className="glass-panel border border-outline-variant/10 p-6 rounded-3xl flex items-center gap-4 lift-glow-hover cursor-pointer group">
              <div className={clsx(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                agent.isActive ? 'bg-primary/20 text-primary animate-pulse' :
                agent.isComplete ? 'bg-emerald-500/10 text-emerald-400' :
                'bg-on-surface-variant/10 text-on-surface-variant'
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-tighter">{agent.label}</div>
                <div className="text-sm font-body text-on-surface flex items-center gap-1">
                  {agent.isActive && <Zap className="w-3.5 h-3.5 text-primary" />}
                  {agent.isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {!agent.isActive && !agent.isComplete && <Clock className="w-3.5 h-3.5 text-on-surface-variant/50" />}
                  {agent.isActive ? 'Running...' : agent.isComplete ? 'Complete' : 'Standby'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Pause, Square, FileText, Database, BookOpen, Globe, Terminal } from 'lucide-react';
import clsx from 'clsx';
import ApprovalStation from './ApprovalStation';
import RunArtifact from './RunArtifact';
import AgentGraph from './AgentGraph';

function getIconForEventType(type) {
  if (type === 'search') return <Globe className="w-4 h-4" />;
  if (type === 'read') return <BookOpen className="w-4 h-4" />;
  if (type === 'draft_written') return <FileText className="w-4 h-4" />;
  return <Database className="w-4 h-4" />;
}

export default function TraceTimeline({ runStream = {} }) {
  const scrollRef = useRef(null);
  const sortedEvents = Array.isArray(runStream.sortedEvents) ? runStream.sortedEvents : [];

  // Auto-scroll when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [sortedEvents]);

  // If status is completed, show the final report view entirely OR we could show both. Let's just show the report view.
  if (runStream.status === 'completed' && (runStream.output || runStream.runDetails?.output || runStream.runDetails?.final_output)) {
    return <RunArtifact runStream={runStream} />;
  }

  // If status is awaiting approval, show ApprovalStation
  if (runStream.status === 'awaiting_human') {
    return <ApprovalStation runStream={runStream} />;
  }

  const status = String(runStream.status || 'idle');
  const currentNode = String(runStream.currentNode || '-');
  const runId = String(runStream.runId || '');
  const isRunning = status === 'running' || status === 'created';

  // Group events by node if needed, or just display them linearly.
  // The design groups by "Step X: Node". Let's cluster consecutive events belonging to the same node.
  const clusteredNodes = [];
  let currentGroup = null;

  for (const evt of sortedEvents) {
    if (!currentGroup || currentGroup.node !== evt.node) {
      currentGroup = { node: evt.node, events: [], startTs: evt.ts };
      clusteredNodes.push(currentGroup);
    }
    currentGroup.events.push(evt);
    currentGroup.endTs = evt.ts;
  }

  return (
    <div className="flex gap-10 h-full overflow-hidden pb-10 px-8">
      {/* Visual Accents */}
      <div className="fixed top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary/10 blur-[120px] pointer-events-none -z-10"></div>
      <div className="fixed bottom-[-10%] left-[-5%] w-[30vw] h-[30vw] rounded-full bg-secondary/10 blur-[100px] pointer-events-none -z-10"></div>

      {/* Main Timeline Column */}
      <section className="flex-1 flex flex-col gap-6" style={{maxWidth: 'calc(100vw - 32rem)'}}>
        <div className="flex items-center justify-between animate-slide-in">
          <div>
            <h1 className="text-3xl font-bold font-headline tracking-tight text-on-surface">
              Active Run: <span className="text-primary">{runId || 'Initializing...'}</span>
            </h1>
            <p className="text-on-surface-variant font-label mt-1">Executing orchestrated sequence...</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-full border border-outline-variant/20">
            {isRunning ? (
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(0,229,255,1)]"></div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-error"></div>
            )}
            <span className={clsx("text-sm font-medium uppercase tracking-widest", isRunning ? "text-primary" : "text-error")}>
              {status}
            </span>
          </div>
        </div>

        {/* Scrollable Container */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-4 custom-scrollbar pb-32">
           {clusteredNodes.length === 0 && !runStream.loading && (
             <p className="mt-10 text-on-surface-variant italic">Waiting for events...</p>
          )}

          <div className="space-y-8 mt-4 pt-4">
            <AnimatePresence>
              {clusteredNodes.map((group, index) => {
                const isActive = isRunning && index === clusteredNodes.length - 1 && currentNode === group.node;
                
                return (
                  <motion.div 
                    key={`${index}-${group.node}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, scale: isActive ? 1.03 : 1 }}
                    transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
                    className={clsx(
                      "relative pl-12 pb-4 border-l-2", 
                      isActive ? "border-secondary/50" : "border-primary/20",
                      isActive ? "pb-12" : ""
                    )}
                  >
                    {/* Node Icon/Check */}
                    <div className={clsx(
                      "absolute -left-[13px] top-0 w-6 h-6 rounded-full flex items-center justify-center transition-all",
                      isActive 
                        ? "bg-surface-container-low border-2 border-secondary shadow-[0_0_15px_rgba(193,128,255,0.4)]" 
                        : "bg-surface-container-low border-2 border-primary"
                    )}>
                      {isActive ? (
                        <Loader2 className="w-4 h-4 text-secondary animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 text-primary font-bold" />
                      )}
                    </div>

                    <div className={clsx(
                      "p-6 rounded-[1.5rem] border premium-hover break-words transition-all duration-300",
                      isActive 
                        ? "glass-panel border-secondary/30 active-agent-glow" 
                        : "bg-surface-container-low border-outline-variant/10 shadow-sm"
                    )}>
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <h3 className={clsx("font-headline text-lg font-bold capitalize", isActive && "text-secondary text-xl")}>
                            Step {index + 1}: {group.node}
                          </h3>
                          {isActive && (
                            <span className="bg-secondary/10 text-secondary text-[10px] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Running</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 font-body">
                        {group.events.map((evt, i) => (
                           <motion.div 
                            key={evt.seq} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/10 group break-words overflow-auto"
                           >
                              <div className="flex justify-between items-start mb-1 gap-2">
                                <span className={clsx("text-xs font-label uppercase flex items-center gap-1", isActive ? "text-secondary" : "text-primary")}>
                                  {getIconForEventType(evt.event_type)} {evt.event_type}
                                </span>
                                {evt.data?.tokens_used > 0 && (
                                  <span className="text-[10px] text-on-surface-variant flex-shrink-0">
                                    -{evt.data.tokens_used} tkns
                                  </span>
                                )}
                              </div>
                              <p className={clsx("text-sm", isActive && i === group.events.length - 1 && "stream-text text-on-surface")}>
                                {evt.message}
                              </p>
                           </motion.div>
                        ))}
                      </div>
                      
                      {isActive && (
                        <div className="mt-6 flex gap-4">
                          <div className="w-full bg-surface-container-high h-1 rounded-full overflow-hidden">
                            <div className="bg-secondary h-full w-2/3 shadow-[0_0_10px_#c180ff] transition-all duration-500 ease-out animate-pulse"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={scrollRef}></div>
          </div>
        </div>
      </section>

      {/* Right Panel: Metrics & Graph Split */}
      <aside className="w-96 flex flex-col gap-6 h-full pb-6 animate-slide-in flex-shrink-0 relative z-20" style={{ animationDelay: '0.5s' }}>
        {/* Real-time Metrics */}
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-surface-container p-5 rounded-[1.5rem] border border-outline-variant/10 premium-hover">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-label text-on-surface-variant uppercase tracking-wider">Remaining Tokens</span>
            </div>
            <div className="text-2xl font-bold font-headline">
              {runStream.remainingTokens != null ? runStream.remainingTokens.toLocaleString() : '---'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container p-5 rounded-[1.5rem] border border-outline-variant/10 premium-hover">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-label text-on-surface-variant uppercase">Run Status</span>
              </div>
              <div className="text-sm font-bold font-headline capitalize truncate">{status}</div>
            </div>
            <div className="bg-surface-container p-5 rounded-[1.5rem] border border-outline-variant/10 premium-hover">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-label text-on-surface-variant uppercase">Current Node</span>
              </div>
              <div className="text-sm font-bold font-headline capitalize truncate">{currentNode}</div>
            </div>
          </div>
        </div>

        {/* Sync'd Graph Visualizer */}
        <div className="flex-1 bg-surface-container-low rounded-[1.5rem] border border-outline-variant/10 p-0 flex flex-col overflow-hidden premium-hover min-h-[300px]">
           {/* AgentGraph integrated here as secondary view */}
           <AgentGraph runStream={runStream} />
        </div>

        {/* Terminal-style Control */}
        <div className="bg-surface-container-lowest p-4 rounded-full border border-outline-variant/20 flex items-center justify-between premium-hover">
          <div className="flex items-center gap-3 ml-2">
            <Terminal className="text-on-surface-variant w-4 h-4" />
            <span className="text-xs font-label text-on-surface-variant font-mono truncate max-w-[150px]">
              {runId ? `watching ${runId.substring(0, 8)}...` : 'idle'}
            </span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => runStream.stopTargetRun(runId)}
              disabled={!runStream.canStopCurrentRun}
              className="w-10 h-10 flex items-center justify-center hover:bg-error/10 rounded-full transition-colors text-error disabled:opacity-30"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
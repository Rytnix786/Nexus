import { useMemo } from 'react';

import { formatElapsedSeconds, timelineEventStyles } from './shared';

function TraceTimeline({ events, runStartedAt, loading, inspectedEventSeq, onToggleInspectedEvent, hasMore, onLoadMore }) {
  const decoratedEvents = useMemo(() => {
    let cumulative = 0;
    return events.map((evt, index) => {
      const next = events[index + 1];
      const startMs = evt.ts ? Date.parse(evt.ts) : Number.NaN;
      const nextMs = next?.ts ? Date.parse(next.ts) : Number.NaN;
      const duration = !Number.isNaN(startMs) && !Number.isNaN(nextMs) ? Math.max(0, Math.round((nextMs - startMs) / 1000)) : 0;
      cumulative += duration;
      return { ...evt, _duration: duration, _cumulative: cumulative };
    });
  }, [events]);

  return (
    <div className="rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
      <h3 className="text-xl font-semibold text-white">Trace Timeline</h3>
      <p className="mt-1 text-sm text-white/65">Every decision, transition, and tool call in sequential order.</p>

      <div className="mt-4 max-h-[480px] space-y-3 overflow-auto pr-1">
        {decoratedEvents.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/55">
            {loading ? 'Waiting for timeline events...' : 'No timeline events yet. Start a mission to render real-time graph transitions.'}
          </div>
        )}

        {decoratedEvents.map((evt) => (
          <article key={`${evt.seq}-${evt.node}`} className={`timeline-card rounded-xl border border-white/15 border-l-2 bg-white/5 p-4 ${timelineEventStyles(evt.event_type).border}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-white/55">Step {evt.seq}</p>
                <span className="text-[11px] text-white/45">{formatElapsedSeconds(evt, runStartedAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] ${timelineEventStyles(evt.event_type).pill}`}>
                  {evt.event_type}
                </span>
                {evt.data && Object.prototype.hasOwnProperty.call(evt.data, 'tokens_used') && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/55">
                    -{evt.data.tokens_used} tokens
                  </span>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm font-medium text-cyan-100">{evt.node}</p>
            <p className="mt-2 text-sm leading-6 text-white/85">{evt.message}</p>
            <p className="mt-2 text-xs text-white/55">Node duration: {evt._duration || 0}s | Cumulative: {evt._cumulative || 0}s</p>
            <button onClick={() => onToggleInspectedEvent(evt.seq)} className="mt-2 rounded border border-white/20 px-2 py-1 text-xs text-white/70">
              {inspectedEventSeq === evt.seq ? 'Hide raw payload' : 'Show raw payload'}
            </button>
            {inspectedEventSeq === evt.seq && <pre className="mt-2 overflow-auto rounded-lg border border-white/15 bg-black/40 p-2 text-xs text-white/80">{JSON.stringify(evt.data || {}, null, 2)}</pre>}
          </article>
        ))}
        {hasMore && (
          <button onClick={onLoadMore} className="w-full rounded-lg border border-white/20 bg-white/5 py-2 text-sm text-white/80">
            Load older events
          </button>
        )}
      </div>
    </div>
  );
}

export default TraceTimeline;
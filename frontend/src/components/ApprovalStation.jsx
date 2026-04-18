import React, { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, ThumbsUp, ThumbsDown, CheckCircle, Loader2 } from 'lucide-react';

function parseEventTs(evt) {
  const candidates = [
    evt?.data?.created_at,
    evt?.data?.timestamp,
    evt?.created_at,
    evt?.timestamp,
    evt?.ts,
  ];
  for (const raw of candidates) {
    const ms = Date.parse(String(raw || ''));
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function ApprovalStation({ runStream = {} }) {
  const [notes, setNotes] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const handle = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  const pausedAtMs = useMemo(() => {
    const events = Array.isArray(runStream.sortedEvents) ? runStream.sortedEvents : [];
    for (let idx = events.length - 1; idx >= 0; idx -= 1) {
      const evt = events[idx];
      const type = String(evt?.event_type || evt?.event || '').toLowerCase();
      if (type === 'awaiting_human' || type === 'awaiting_approval') {
        const parsed = parseEventTs(evt);
        if (parsed != null) return parsed;
      }
    }
    return null;
  }, [runStream.sortedEvents]);

  const pausedElapsedMs = pausedAtMs != null ? Math.max(0, nowMs - pausedAtMs) : 0;
  const showEscalationWarning = pausedElapsedMs >= 10 * 60 * 1000;
  const latestDraftFromTimeline = useMemo(() => {
    const events = Array.isArray(runStream.sortedEvents) ? runStream.sortedEvents : [];
    for (let idx = events.length - 1; idx >= 0; idx -= 1) {
      const evt = events[idx];
      if (String(evt?.event_type || '') === 'draft_written') {
        const value = String(evt?.data?.draft || evt?.message || '').trim();
        if (value) return value;
      }
    }
    return '';
  }, [runStream.sortedEvents]);

  const draftText = useMemo(() => {
    return String(
      runStream.runDetails?.draft ||
      latestDraftFromTimeline ||
      runStream.runDetails?.output ||
      runStream.runDetails?.final_output ||
      runStream.output ||
      ''
    ).trim();
  }, [latestDraftFromTimeline, runStream.output, runStream.runDetails]);

  useEffect(() => {
    if (!runStream.runId) return;
    if (draftText) return;
    if (typeof runStream.loadRunDetails === 'function') {
      void runStream.loadRunDetails(runStream.runId);
    }
  }, [draftText, runStream]);

  const handleApprove = () => {
    const reviewerNotes = notes.trim() || 'Approved by operator.';
    runStream.submitDecision('approve', reviewerNotes, 'approved');
  };
  const handleReject = () => {
    if (!notes.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }
    const reason = notes.trim();
    runStream.submitDecision('reject', reason, reason);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full p-8 relative z-10">
      {/* Background Alerts */}
      <div className="fixed inset-0 bg-amber-500/5 pointer-events-none -z-10 animate-pulse"></div>

      <div className="max-w-2xl w-full glass-panel border border-[#f59e0b]/30 rounded-[2.5rem] p-12 amber-glow-breathe relative">
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#f59e0b]/20 flex items-center justify-center border border-[#f59e0b]/50">
           <ShieldAlert className="w-6 h-6 text-[#f59e0b]" />
        </div>

        <div className="text-center mb-10">
          <h2 className="text-3xl font-headline font-bold text-[#f59e0b] mb-2 tracking-tight">Human Approval Required</h2>
          <p className="text-on-surface-variant font-body">The orchestrator has paused execution. Review the output before proceeding.</p>
          <p className="mt-3 text-xs uppercase tracking-widest text-amber-200/90">Paused for {formatElapsed(pausedElapsedMs)}</p>
          {showEscalationWarning && (
            <p className="mt-2 rounded-lg border border-amber-300/45 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              Approval has been pending for more than 10 minutes. Escalate or provide a decision reason.
            </p>
          )}
        </div>

        <div className="mb-3 text-xs uppercase tracking-widest text-[#f59e0b] font-label">Draft Under Review</div>
        <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20 mb-5 max-h-64 overflow-y-auto custom-scrollbar font-body text-sm text-on-surface whitespace-pre-wrap">
            {draftText || "Loading draft for approval..."}
        </div>

        <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 mb-8 text-sm text-on-surface-variant">
          <p className="text-xs uppercase tracking-widest mb-2">What You Are Approving</p>
          <p>
            You are approving this draft to continue the workflow toward finalization.
            {runStream.runDetails?.critique ? ' Critique guidance: ' + String(runStream.runDetails.critique) : ''}
          </p>
        </div>

        <div className="mb-8">
           <label className="text-xs uppercase tracking-widest text-[#f59e0b] mb-2 block font-label">Reviewer Notes <span className="text-on-surface-variant">(Optional)</span></label>
           <textarea 
             value={notes}
             onChange={e => setNotes(e.target.value)}
             maxLength={500}
             className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-4 text-on-surface focus:ring-2 focus:ring-[#f59e0b]/50 focus:outline-none min-h-[100px] resize-none"
             placeholder="Looks good to me..."
           />
           <div className="text-xs text-on-surface-variant mt-2 text-right">{notes.length}/500</div>
        </div>

        <div className="grid grid-cols-2 gap-6">
           <button 
             onClick={handleReject}
             disabled={runStream.loading || !runStream.runId}
             className="flex items-center justify-center gap-3 py-4 rounded-full border border-error/50 text-error hover:bg-error/10 transition-colors font-headline font-bold text-lg disabled:opacity-50"
           >
             <ThumbsDown className="w-5 h-5" />
             Reject & Halt
           </button>
           <button 
             onClick={handleApprove}
             disabled={runStream.loading || !runStream.runId}
             className="flex items-center justify-center gap-3 py-4 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-black hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all font-headline font-bold text-lg disabled:opacity-50 approve-button-glow"
           >
             {runStream.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ThumbsUp className="w-5 h-5" />}
             Approve & Finalize
           </button>
        </div>

        {runStream.error && (
          <p className="mt-4 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {runStream.error}
          </p>
        )}

        {!runStream.runId && (
          <p className="mt-3 text-xs text-on-surface-variant">
            Waiting for active run context before approval actions can be submitted.
          </p>
        )}
      </div>
    </div>
  );
}
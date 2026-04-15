import { prettyDate } from './shared';

export default function ApprovalStation({
  status,
  runId,
  loading,
  reviewerNotes,
  onReviewerNotesChange,
  onApprove,
  onReject,
  runDetails,
  decisionAudit,
  sessionRole,
}) {
  const totalTokensUsed = Number(runDetails?.total_tokens_used || 0);
  const budgetBase = Number(runDetails?.initial_token_budget || 0);
  const riskFlags = [];
  if ((runDetails?.critique || '').toLowerCase().includes('revision needed')) riskFlags.push('Critique requests revision');
  if (budgetBase > 0 && totalTokensUsed > budgetBase * 0.9) riskFlags.push('Token burn above 90%');
  if (status === 'failed' || status === 'rejected') riskFlags.push(`Run status: ${status}`);

  const canReview = ['admin', 'reviewer'].includes(String(sessionRole).toLowerCase());

  return (
    <div className="rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
      <p className="text-xs uppercase tracking-[0.16em] text-white/60">Human gate</p>
      <h2 className="mt-1 text-2xl font-semibold text-white">Approval Workbench</h2>

      <div className="mt-5 space-y-3">
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white/85">
          <p>Current status: <span className="font-semibold capitalize">{String(status || 'idle').replaceAll('_', ' ')}</span></p>
          <p className="mt-1">Draft under review: <span className="text-white/95">{runDetails?.draft ? 'Yes' : 'No'}</span></p>
          <p className="mt-1">Latest checkpoint: seq {runDetails?.latest_checkpoint_seq ?? '-'} @ {prettyDate(runDetails?.latest_checkpoint_at)}</p>
          <p className="mt-1">Critique notes: <span className="text-white/95">{runDetails?.critique || 'N/A'}</span></p>
          <p className="mt-1">Key risk flags: {riskFlags.length ? riskFlags.join(' | ') : 'No immediate flags'}</p>
          <p className="mt-1">Run ID: <span className="text-white/95">{runId || '-'}</span></p>
        </div>
        <textarea value={reviewerNotes} onChange={(e) => onReviewerNotesChange(e.target.value)} placeholder="Reviewer note (required)" className="h-24 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white" />

        <button onClick={() => onApprove()} disabled={loading || status !== 'awaiting_human' || !reviewerNotes.trim() || !canReview} className="min-h-11 w-full rounded-xl bg-emerald-300/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          Approve And Resume
        </button>
        <button onClick={() => onReject()} disabled={loading || status !== 'awaiting_human' || !reviewerNotes.trim() || !canReview} className="min-h-11 w-full rounded-xl bg-rose-300/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          Reject Run
        </button>
      </div>
      <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-white/55">Approval Audit Timeline</p>
        <div className="mt-2 space-y-1 text-xs text-white/80">
          {decisionAudit.length === 0 && <p>No approval actions yet.</p>}
          {decisionAudit.map((item, idx) => <p key={`${item.ts}-${idx}`}>{prettyDate(item.ts)} - {item.decision} - {item.notes}</p>)}
        </div>
      </div>
    </div>
  );
}
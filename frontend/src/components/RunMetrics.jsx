import { TERMINAL_STATUSES, prettyStatus, statusClass } from './shared';

export default function RunMetrics({ status, events, tokenBudget, remainingTokens, reconnectCount = 0, decisionAudit = [], runDetails = null }) {
  if (!TERMINAL_STATUSES.includes(status)) return null;

  const totalSteps = events.length;
  const totalTokensUsed = Math.max(0, Number(tokenBudget || 0) - Number(remainingTokens || 0));
  const nodesVisited = [...new Set(events.map((evt) => evt.node))];
  const criticEvents = events.filter((evt) => evt.node === 'critic').length;
  const criticRevisionCycles = criticEvents > 0 ? criticEvents - 1 : 0;
  const tokenUsage = tokenBudget ? (totalTokensUsed / Number(tokenBudget || 1)) * 100 : null;

  return (
    <>
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Total Steps</p><p className="mt-2 text-3xl font-semibold text-white">{totalSteps}</p></article>
        <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Total Tokens Used</p><p className="mt-2 text-3xl font-semibold text-white">{totalTokensUsed}</p></article>
        <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Critic Revision Cycles</p><p className="mt-2 text-3xl font-semibold text-white">{criticRevisionCycles}</p></article>
        <article className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Run Outcome</p><div className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset capitalize ${statusClass(status)}`}>{prettyStatus(status)}</div><p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-white/50">Nodes Visited</p><div className="mt-2 flex flex-wrap gap-2">{nodesVisited.map((node) => <span key={node} className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">{node}</span>)}</div></article>
      </section>
      <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-5">
        <h3 className="text-xl font-semibold text-white">Post-run Scorecard</h3>
        <div className="mt-3 grid gap-3 text-sm text-white/85 md:grid-cols-3">
          <p>Completion reason: {status}</p>
          <p>Retries: {reconnectCount}</p>
          <p>Approvals: {decisionAudit.filter((x) => x.decision === 'approve').length}</p>
          <p>Estimated cost: {totalTokensUsed} tokens ({tokenUsage == null ? '--' : `${tokenUsage.toFixed(1)}%`})</p>
          <p>Revision cycles: {criticEvents}</p>
          <p>Checkpoint: {runDetails?.latest_checkpoint_seq ?? '-'}</p>
        </div>
      </section>
    </>
  );
}
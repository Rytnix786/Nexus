import { formatDollars } from './shared';

function SystemMetricsPanel({ metrics, loading, open, onToggle }) {
  return (
    <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white">System Metrics</h3>
          <p className="mt-1 text-sm text-white/65">Operational overview across all orchestrator runs.</p>
        </div>
        <button onClick={onToggle} className="min-h-10 rounded-xl border border-white/30 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/15">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/15 bg-black/20 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Total Runs</p><p className="mt-2 text-3xl font-semibold text-white">{metrics.total_runs}</p></article>
          <article className="rounded-2xl border border-white/15 bg-black/20 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Runs Last 24h</p><p className="mt-2 text-3xl font-semibold text-white">{metrics.runs_last_24h}</p></article>
          <article className="rounded-2xl border border-white/15 bg-black/20 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Avg Token Usage / Run</p><p className="mt-2 text-3xl font-semibold text-white">{Math.round(metrics.avg_token_usage_per_run)}</p></article>
          <article className="rounded-2xl border border-white/15 bg-black/20 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Avg Steps / Run</p><p className="mt-2 text-3xl font-semibold text-white">{Number(metrics.avg_steps_per_run || 0).toFixed(1)}</p></article>
          <article className="rounded-2xl border border-white/15 bg-black/20 p-4"><p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Total Spend</p><p className="mt-2 text-3xl font-semibold text-white">{formatDollars(metrics.total_cost_usd)}</p></article>
          <article className="rounded-2xl border border-white/15 bg-black/20 p-4 md:col-span-2 xl:col-span-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">Runs By Status</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(metrics.runs_by_status || {}).length === 0 && <span className="text-sm text-white/55">No status data yet.</span>}
              {Object.entries(metrics.runs_by_status || {}).map(([key, value]) => <span key={key} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">{key.replaceAll('_', ' ')}: {value}</span>)}
            </div>
          </article>
          {loading && <p className="md:col-span-4 text-xs text-white/55">Refreshing metrics...</p>}
        </div>
      )}
    </section>
  );
}

export default SystemMetricsPanel;
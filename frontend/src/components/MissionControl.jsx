function MissionControl({
  objective,
  onObjectiveChange,
  authToken,
  onAuthTokenChange,
  highImpact,
  onHighImpactChange,
  tokenBudget,
  onTokenBudgetChange,
  uploadedFiles,
  uploadSummary,
  uploading,
  error,
  sessionRole,
  canStart,
  onUploadFiles,
  onStartMission,
  onSyncTimeline,
  runId,
  loading,
  expectedNodePath,
  estimatedTokenCost,
  currentRunTokenUsage,
  budgetWarning,
}) {
  return (
    <div className="rounded-[28px] border border-white/15 bg-black/30 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
      <div className="grid gap-4">
        <label className="text-xs uppercase tracking-[0.16em] text-white/65">Operator bearer token (optional)</label>
        <input
          value={authToken}
          onChange={(event) => onAuthTokenChange(event.target.value)}
          className="h-12 rounded-xl border border-white/20 bg-white/5 px-4 text-sm text-white placeholder:text-white/40 focus:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/30"
          placeholder="Paste bearer token when auth is enabled"
        />

        <label className="text-xs uppercase tracking-[0.16em] text-white/65">Mission objective</label>
        <textarea
          value={objective}
          onChange={(event) => onObjectiveChange(event.target.value)}
          className="h-36 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-sm leading-6 text-white placeholder:text-white/40 focus:border-orange-300/60 focus:outline-none focus:ring-2 focus:ring-orange-300/30"
        />

        <label className="text-xs uppercase tracking-[0.16em] text-white/65">Upload source files (pdf, docx, txt, csv, md)</label>
        <input
          type="file"
          multiple
          onChange={(event) => onUploadFiles(event.target.files)}
          className="h-12 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-300/20 file:px-3 file:py-1 file:text-xs file:font-medium file:text-cyan-100"
        />
        {uploading && <p className="text-xs text-cyan-100">Extracting uploaded file context...</p>}
        {!uploading && uploadSummary && <p className="text-xs text-emerald-100">{uploadSummary}</p>}
        {!uploading && uploadedFiles.length > 0 && !uploadSummary && <p className="text-xs text-white/60">{uploadedFiles.length} file(s) selected.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white/90">
            <input
              type="checkbox"
              checked={highImpact}
              onChange={(event) => onHighImpactChange(event.target.checked)}
              className="h-4 w-4 accent-rose-300"
            />
            High impact workflow
          </label>
          <label className="flex min-h-11 items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white/90">
            <span>Token budget</span>
            <input
              type="number"
              value={tokenBudget}
              min={1000}
              step={500}
              onChange={(event) => onTokenBudgetChange(Number(event.target.value))}
              className="w-28 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-right text-sm text-white focus:border-cyan-300/60 focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white/75">
          <p>Expected node path: <span className="text-white/90">{expectedNodePath}</span></p>
          <p className="mt-1">Estimated token cost: <span className="text-white/90">{estimatedTokenCost}</span></p>
          <p className="mt-1">Current run token usage: <span className="text-white/90">{currentRunTokenUsage}</span></p>
          {budgetWarning && <p className="mt-1 text-amber-200">Budget guard warning: estimated cost exceeds configured budget.</p>}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onStartMission}
            disabled={!canStart || !['admin', 'operator'].includes(String(sessionRole).toLowerCase())}
            className="min-h-11 min-w-[150px] rounded-xl bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? 'Executing...' : 'Start Mission'}
          </button>
          <button
            onClick={onSyncTimeline}
            disabled={!runId}
            className="min-h-11 rounded-xl border border-white/30 bg-white/5 px-5 py-2 text-sm font-medium text-white/90 transition hover:bg-white/15"
          >
            Sync Timeline
          </button>
        </div>
        {error && <p className="rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">{error}</p>}
      </div>
    </div>
  );
}

export default MissionControl;
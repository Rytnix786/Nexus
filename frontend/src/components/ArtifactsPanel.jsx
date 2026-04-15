function textDiff(a, b) {
  const left = String(a || '').split('\n');
  const right = String(b || '').split('\n');
  const length = Math.max(left.length, right.length);
  const out = [];
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? '';
    const r = right[i] ?? '';
    if (l === r) out.push(`  ${r}`);
    else { if (l) out.push(`- ${l}`); if (r) out.push(`+ ${r}`); }
  }
  return out.join('\n');
}

export default function ArtifactsPanel({ artifactTab, onArtifactTabChange, runDetails, output, previousDraft, latestDraft, hasDraftHistory }) {
  const tabs = [
    ['plan', 'Plan'],
    ['research_notes', 'Research Notes'],
    ['analysis', 'Analysis'],
    ['draft', 'Draft'],
    ['critique', 'Critique'],
    ['final_output', 'Final Output'],
  ];

  return (
    <div className="rounded-[28px] border border-white/15 bg-black/30 p-6">
      <h3 className="text-xl font-semibold text-white">Approval-safe Artifacts</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => onArtifactTabChange(key)} className={`rounded-lg px-3 py-1.5 text-sm ${artifactTab === key ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/5 text-white/70'}`}>{label}</button>
        ))}
      </div>
      <pre className="mt-4 min-h-[220px] whitespace-pre-wrap rounded-xl border border-white/15 bg-black/40 p-4 text-sm text-white/85">{artifactTab === 'research_notes' ? (runDetails?.research_notes || []).join('\n\n') : String(runDetails?.[artifactTab] || output || 'No artifact yet.')}</pre>
      <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-white/55">Changed Since Last Writer Pass</p>
        <p className="mt-1 text-xs text-white/80">{hasDraftHistory ? 'Draft has revisions since previous writer pass.' : 'No draft revision history yet.'}</p>
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-white/55">Simple Draft Diff</p>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/15 bg-black/40 p-2 text-xs text-white/80">{textDiff(previousDraft, latestDraft) || 'No diff yet.'}</pre>
      </div>
    </div>
  );
}
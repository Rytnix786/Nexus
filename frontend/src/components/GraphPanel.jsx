import { GRAPH_EDGES, PIPELINE_NODES, sentenceCase } from './shared';

export default function GraphPanel({ currentNode, status, selectedNode, onSelectNode, nodeMetrics }) {
  return (
    <section className="mt-6 rounded-[28px] border border-white/15 bg-black/30 p-6">
      <h3 className="text-xl font-semibold text-white">Realtime Graph</h3>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {PIPELINE_NODES.map((node) => {
          const idx = PIPELINE_NODES.indexOf(node);
          const currentIdx = PIPELINE_NODES.indexOf(currentNode);
          const state = node === currentNode ? 'active' : idx < currentIdx || status === 'completed' ? 'completed' : status === 'failed' && node === currentNode ? 'failed' : 'pending';
          const tone = state === 'active' ? 'border-cyan-300/60 bg-cyan-300/10 animate-pulse' : state === 'completed' ? 'border-emerald-300/50 bg-emerald-400/10' : state === 'failed' ? 'border-rose-300/50 bg-rose-400/10' : status === 'awaiting_human' && node === 'human_approval' ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/15 bg-white/5';
          return (
            <button key={node} onClick={() => onSelectNode(node)} className={`rounded-xl border p-4 text-left ${tone}`}>
              <p className="text-sm font-semibold text-white">{sentenceCase(node)}</p>
              <p className="mt-1 text-xs text-white/70">State: {state}</p>
              <p className="mt-1 text-xs text-white/60">Token burn: {nodeMetrics[node]?.burn || 0}</p>
              {selectedNode === node && <p className="mt-1 text-[11px] text-cyan-100">Selected</p>}
            </button>
          );
        })}
      </div>
      <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white/75">
        <p>Edges: {GRAPH_EDGES.map(([a, b]) => `${a}->${b}`).join(' | ')}</p>
        <p className="mt-1">Active edge animation target: {currentNode}</p>
      </div>
    </section>
  );
}
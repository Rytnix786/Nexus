import { PIPELINE_NODES, sentenceCase } from './shared';

export default function AgentPipeline({ currentNode, status }) {
  const currentIndex = PIPELINE_NODES.indexOf(currentNode);

  return (
    <div className="mb-6 rounded-[24px] border border-white/15 bg-black/20 px-4 py-4 backdrop-blur-xl sm:px-5">
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {PIPELINE_NODES.map((node, index) => {
          const isActive = node === currentNode;
          const isCompleted = status === 'completed' || (currentIndex !== -1 && index < currentIndex);
          const isTerminalError = (status === 'failed' || status === 'rejected') && isActive;
          let pillClass = 'bg-white/5 border border-white/15 text-white/40';
          if (status === 'completed' || isCompleted) pillClass = 'bg-emerald-400/15 border border-emerald-300/30 text-emerald-200';
          else if (isTerminalError) pillClass = 'bg-rose-400/20 border border-rose-300/50 text-rose-200';
          else if (isActive) pillClass = 'bg-cyan-400/20 border border-cyan-300/50 text-cyan-100 animate-pulse';

          return (
            <div key={node} className="flex min-w-max items-center gap-3">
              <span className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] ${pillClass}`}>{sentenceCase(node)}</span>
              {index < PIPELINE_NODES.length - 1 && <hr className="h-px w-8 border-white/10" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
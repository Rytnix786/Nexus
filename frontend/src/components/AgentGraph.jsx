import React, { useMemo } from 'react';
import { ReactFlow, MiniMap, Controls, Background, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import { Network } from 'lucide-react';

const NODE_META = [
  { id: 'planner', label: 'Planner', x: 110, y: 40 },
  { id: 'researcher', label: 'Researcher', x: 110, y: 120 },
  { id: 'analyst', label: 'Analyst', x: 110, y: 200 },
  { id: 'writer', label: 'Writer', x: 110, y: 280 },
  { id: 'critic', label: 'Critic', x: 260, y: 360 },
  { id: 'human_approval', label: 'Human Approval', x: -40, y: 360 },
  { id: 'refusal', label: 'Refusal Gate', x: 110, y: 360 },
  { id: 'finalize', label: 'Finalize', x: 110, y: 460 },
];

const initialNodes = NODE_META.map((item) => ({
  id: item.id,
  position: { x: item.x, y: item.y },
  data: { label: item.label },
}));

const initialEdges = [
  { id: 'e-p-r', source: 'planner', target: 'researcher' },
  { id: 'e-r-a', source: 'researcher', target: 'analyst' },
  { id: 'e-a-ref', source: 'analyst', target: 'refusal' },
  { id: 'e-a-w', source: 'analyst', target: 'writer' },
  { id: 'e-ref-f', source: 'refusal', target: 'finalize' },
  { id: 'e-w-ha', source: 'writer', target: 'human_approval' },
  { id: 'e-w-c', source: 'writer', target: 'critic' },
  { id: 'e-ha-f', source: 'human_approval', target: 'finalize' },
  { id: 'e-c-f', source: 'critic', target: 'finalize' },
  { id: 'e-c-w', source: 'critic', target: 'writer', type: 'step', style: { strokeDasharray: '5,5' } },
];

export default function AgentGraph({ runStream = {} }) {
  const rawCurrentNode = String(runStream.currentNode || '').trim();
  const currentNode = rawCurrentNode === 'idle' ? '' : rawCurrentNode;
  const status = String(runStream.status || 'idle');
  const sortedEvents = Array.isArray(runStream.sortedEvents) ? runStream.sortedEvents : [];
  const seenNodes = new Set(sortedEvents.map((evt) => String(evt?.node || '').trim()).filter(Boolean));

  const nodes = useMemo(() => {
    const completedNodeIds = new Set(seenNodes);

    return initialNodes.map(node => {
      const isActive = node.id === currentNode;
      const isDone = completedNodeIds.has(node.id) && !isActive;
      const isError = (status === 'failed' || status === 'stopped' || status === 'rejected') && isActive;
      
      let borderCol = '#46484e'; // outline-variant (waiting)
      let bgCol = '#171a20'; // surface-container
      let textCol = '#aaabb2'; // text-on-surface-variant
      
      if (isActive) {
        borderCol = '#c180ff'; // secondary (running)
        bgCol = '#0c0e13';
        textCol = '#c180ff';
      } else if (isDone) {
        borderCol = '#00E5FF'; // primary (done)
        textCol = '#00E5FF';
      } else if (isError) {
        borderCol = '#ff716c';
        textCol = '#ff716c';
      }
      
      return {
        ...node,
        style: {
          background: bgCol,
          color: textCol,
          border: `1px solid ${borderCol}`,
          borderRadius: '8px',
          padding: '10px 15px',
          fontSize: '12px',
          fontWeight: isActive ? 700 : 500,
          boxShadow: isActive ? '0 0 15px rgba(193, 128, 255, 0.4)' : (isDone ? '0 0 8px rgba(0, 229, 255, 0.1)' : 'none'),
          opacity: isActive || isDone ? 1 : 0.5,
          transition: 'all 0.3s ease'
        }
      };
    });
  }, [currentNode, status, seenNodes]);

  const edges = useMemo(() => {
    const completedNodeIds = new Set(seenNodes);

    return initialEdges.map(edge => {
      const isActive = edge.source === currentNode || edge.target === currentNode;
      const isDone = completedNodeIds.has(edge.source) && completedNodeIds.has(edge.target);
      
      const edgeColor = isActive ? '#c180ff' : (isDone ? '#00E5FF' : '#46484e');
      
      return {
        ...edge,
        animated: isActive || edge.source === currentNode,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: edgeColor,
        },
        style: {
          stroke: edgeColor,
          strokeWidth: isActive || isDone ? 2 : 1,
          opacity: isActive || isDone ? 1 : 0.3,
          transition: 'all 0.3s ease',
          ...(edge.style || {})
        }
      };
    });
  }, [currentNode, seenNodes]);

  const teamOrder = ['planner', 'researcher', 'analyst', 'writer', 'critic'];
  const teamProgress = teamOrder.map((nodeId) => {
    if (currentNode === nodeId) return { id: nodeId, state: 'running' };
    if (seenNodes.has(nodeId)) return { id: nodeId, state: 'done' };
    return { id: nodeId, state: 'queued' };
  });

  return (
    <div className="w-full h-full relative group">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 text-xs font-label uppercase tracking-widest text-on-surface-variant">
        <Network className="w-4 h-4" />
        Agent Graph
      </div>
      <div className="absolute top-4 right-4 z-10 flex flex-wrap justify-end gap-1 max-w-[60%]">
        {teamProgress.map((item) => (
          <span
            key={item.id}
            className={clsx(
              'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest',
              item.state === 'running' && 'border-secondary/60 bg-secondary/15 text-secondary',
              item.state === 'done' && 'border-primary/60 bg-primary/15 text-primary',
              item.state === 'queued' && 'border-white/20 bg-white/5 text-white/50'
            )}
          >
            {item.id}
          </span>
        ))}
      </div>
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#ffffff" gap={16} size={1} opacity={0.05} />
      </ReactFlow>
      {status === 'idle' && (
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-white/70">
          Launch a run to activate planner - researcher - analyst - writer - critic flow.
        </div>
      )}
    </div>
  );
}

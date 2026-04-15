import React, { useMemo } from 'react';
import { ReactFlow, MiniMap, Controls, Background, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import { Network } from 'lucide-react';

const initialNodes = [
  { id: 'planner', position: { x: 100, y: 50 }, data: { label: 'Planner' } },
  { id: 'researcher', position: { x: 100, y: 150 }, data: { label: 'Researcher' } },
  { id: 'analyst', position: { x: 100, y: 250 }, data: { label: 'Analyst' } },
  { id: 'writer', position: { x: 100, y: 350 }, data: { label: 'Writer' } },
  { id: 'human_approval', position: { x: -50, y: 450 }, data: { label: 'Human Approval' } },
  { id: 'critic', position: { x: 250, y: 450 }, data: { label: 'Critic' } },
  { id: 'finalize', position: { x: 100, y: 550 }, data: { label: 'Finalize' } },
];

const initialEdges = [
  { id: 'e-p-r', source: 'planner', target: 'researcher' },
  { id: 'e-r-a', source: 'researcher', target: 'analyst' },
  { id: 'e-a-w', source: 'analyst', target: 'writer' },
  { id: 'e-w-ha', source: 'writer', target: 'human_approval' },
  { id: 'e-w-c', source: 'writer', target: 'critic' },
  { id: 'e-ha-f', source: 'human_approval', target: 'finalize' },
  { id: 'e-c-f', source: 'critic', target: 'finalize' },
  { id: 'e-c-w', source: 'critic', target: 'writer', type: 'step', style: { strokeDasharray: '5,5' } },
];

export default function AgentGraph({ runStream = {} }) {
  const currentNode = String(runStream.currentNode || '');
  const status = String(runStream.status || 'idle');
  const sortedEvents = Array.isArray(runStream.sortedEvents) ? runStream.sortedEvents : [];

  const nodes = useMemo(() => {
    const completedNodeIds = new Set(sortedEvents?.map(e => e.node));

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
  }, [currentNode, status, sortedEvents]);

  const edges = useMemo(() => {
    const completedNodeIds = new Set(sortedEvents?.map(e => e.node));

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
  }, [currentNode, sortedEvents]);

  return (
    <div className="w-full h-full relative group">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 text-xs font-label uppercase tracking-widest text-on-surface-variant">
        <Network className="w-4 h-4" />
        Agent Graph
      </div>
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        panOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#ffffff" gap={16} size={1} opacity={0.05} />
      </ReactFlow>
    </div>
  );
}

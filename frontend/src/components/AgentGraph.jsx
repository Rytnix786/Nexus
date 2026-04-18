import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../styles/AgentGraph.css';
import clsx from 'clsx';
import { useWorkflowLayout } from '../hooks/useWorkflowLayout';
import { WorkflowNode } from './WorkflowNode';
import {
  deriveEdgeStatus,
  deriveNodeStatuses,
  deriveNodeTokenTotals,
  getEdgeStyle,
  getNodeStyle,
} from '../utils/workflowGraph';

function useContainerSize(ref) {
  const [size, setSize] = useState({ width: 900, height: 680 });
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const { clientWidth, clientHeight } = ref.current;
      const nextWidth = Math.max(360, clientWidth || 900);
      const nextHeight = Math.max(520, clientHeight || 680);

      setSize({
        width: nextWidth,
        height: nextHeight,
      });

      if (clientWidth > 0 && clientHeight > 0) {
        setMeasured(true);
      }
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      if (ref.current) observer.observe(ref.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [ref]);

  return { size, measured };
}

function GraphViewportSync({ isMeasured, fitViewOptions }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!isMeasured) return;
    fitView(fitViewOptions);
  }, [fitView, fitViewOptions, isMeasured]);

  return null;
}

export default function AgentGraph({ runStream = {} }) {
  const containerRef = useRef(null);
  const { size, measured } = useContainerSize(containerRef);
  const sortedEvents = Array.isArray(runStream.sortedEvents) ? runStream.sortedEvents : [];
  const currentNode = String(runStream.currentNode || '').trim();
  const status = String(runStream.status || '').trim().toLowerCase();
  const fitViewOptions = useMemo(() => ({ padding: 0.18, minZoom: 0.76, maxZoom: 1.25 }), []);

  const { nodes: layoutNodes, edges: layoutEdges } = useWorkflowLayout(size);

  const nodeTokenTotals = useMemo(() => deriveNodeTokenTotals(sortedEvents), [sortedEvents]);
  const nodeStatuses = useMemo(() => {
    const derived = deriveNodeStatuses(sortedEvents, status);
    if (currentNode) {
      derived[currentNode] = new Set(['failed', 'error', 'timeout', 'stopped', 'rejected']).has(status)
        ? 'failed'
        : 'running';
    }
    return derived;
  }, [sortedEvents, status, currentNode]);

  const nodes = useMemo(
    () =>
      layoutNodes.map((node) => {
        const nodeStatus = nodeStatuses[node.id] || 'pending';
        return {
          ...node,
          data: {
            ...node.data,
            label: node.data?.label || node.id,
            status: nodeStatus,
            tokenCount: Number(nodeTokenTotals[node.id] || 0),
          },
          className: clsx('workflow-node-wrapper', `workflow-node-wrapper-${nodeStatus}`),
          style: {
            ...node.style,
            ...getNodeStyle(nodeStatus),
          },
        };
      }),
    [layoutNodes, nodeStatuses, nodeTokenTotals]
  );

  const edges = useMemo(
    () =>
      layoutEdges.map((edge) => {
        const edgeStatus = deriveEdgeStatus(edge, nodeStatuses);
        return {
          ...edge,
          animated: edgeStatus === 'running',
          className: clsx('workflow-edge', `workflow-edge-${edgeStatus}`, {
            'workflow-edge-loopback': edge.loopback,
          }),
          style: getEdgeStyle(edgeStatus, edge.loopback),
        };
      }),
    [layoutEdges, nodeStatuses]
  );

  return (
    <div ref={containerRef} className="agent-graph-shell w-full h-full relative overflow-hidden">
      <div className="agent-graph-canvas absolute inset-0">
        <ReactFlow
          nodes={nodes}
          nodeTypes={{ workflow: WorkflowNode }}
          nodeOrigin={[0, 0]}
          edges={edges}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.76, maxZoom: 1.25 }}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          panOnDrag={false}
          panOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          <GraphViewportSync isMeasured={measured} fitViewOptions={fitViewOptions} />
          <Background color="rgba(137,145,161,0.55)" gap={16} size={1} opacity={0.14} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </div>
    </div>
  );
}

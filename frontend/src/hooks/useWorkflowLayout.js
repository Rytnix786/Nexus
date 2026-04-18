import { useMemo } from 'react';
import { WORKFLOW_EDGES, WORKFLOW_NODES } from '../utils/workflowGraph';

const NODE_WIDTH = 172;
const NODE_HEIGHT = 48;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function useWorkflowLayout({ width = 900, height = 680 } = {}) {
  return useMemo(() => {
    const centerX = width / 2;
    const topY = Math.max(42, Math.round(height * 0.08));
    const verticalGap = clamp(Math.round(height * 0.13), 78, 112);
    const branchGap = clamp(Math.round(width * 0.22), 136, 212);
    const branchY = topY + verticalGap * 4.4;
    const finalY = branchY + verticalGap * 1.35;

    const placements = {
      planner: { x: centerX, y: topY },
      researcher: { x: centerX, y: topY + verticalGap },
      analyst: { x: centerX, y: topY + verticalGap * 2 },
      writer: { x: centerX, y: topY + verticalGap * 3 },
      human_approval: { x: centerX - branchGap, y: branchY },
      refusal: { x: centerX, y: branchY },
      critic: { x: centerX + branchGap, y: branchY },
      finalize: { x: centerX, y: finalY },
    };

    const nodes = WORKFLOW_NODES.map((node) => ({
      id: node.id,
      data: { label: node.label, status: 'pending', tokenCount: 0 },
      position: {
        x: Math.round(placements[node.id].x - NODE_WIDTH / 2),
        y: Math.round(placements[node.id].y - NODE_HEIGHT / 2),
      },
      sourcePosition: 'bottom',
      targetPosition: 'top',
      draggable: false,
      selectable: false,
      style: {
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
      },
    }));

    const edges = WORKFLOW_EDGES.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.loopback ? 'step' : 'smoothstep',
      loopback: Boolean(edge.loopback),
      markerEnd: {
        type: 'arrowclosed',
        width: 16,
        height: 16,
      },
    }));

    return { nodes, edges };
  }, [width, height]);
}

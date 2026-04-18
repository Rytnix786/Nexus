import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export function WorkflowNode({ data, selected, isConnectable }) {
  const status = data?.status || 'pending';
  const label = data?.label || 'Node';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: selected ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className={clsx('workflow-node', `workflow-node-${status}`, { selected })}
    >
      <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="workflow-handle" />
      <div className="workflow-node-inner">
        <span className="workflow-node-label">{label}</span>
        <span className="workflow-node-glow" aria-hidden="true" />
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="workflow-handle" />
    </motion.div>
  );
}

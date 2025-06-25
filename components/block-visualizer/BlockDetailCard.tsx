import React from 'react';
import type { Block } from '@/lib/db';
import { getConnectedGroup } from '@/hooks/use-block-connections';

interface BlockDetailCardProps {
  block: Block | null;
  onClose: () => void;
  blocks?: Block[]; // For future group/linked info
  onViewGroup?: (groupBlocks: Block[]) => void;
}

export const BlockDetailCard: React.FC<BlockDetailCardProps> = ({ block, onClose, blocks, onViewGroup }) => {
  if (!block) return null;
  const canViewGroup = !!blocks && !!onViewGroup;
  return (
    <div
      style={{
        position: 'fixed',
        top: 200,
        right: 24,
        zIndex: 100,
        minWidth: 300,
        maxWidth: 400,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
        padding: 20,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="font-bold mb-1">Block Details</div>
      <div className="mb-1 text-xs text-gray-500">Type: <b>{block.type}</b></div>
      <div className="mb-1 text-xs text-gray-500">ID: <span className="font-mono">{block.id}</span></div>
      <div className="mb-2 text-sm"><b>Content:</b> <span className="break-words">{block.content || <i>Empty</i>}</span></div>
      {block.linkedBlockIds && block.linkedBlockIds.length > 0 && (
        <div className="mb-1 text-xs text-gray-500">
          <b>Links:</b> {block.linkedBlockIds.join(', ')}
        </div>
      )}
      {canViewGroup && (
        <button
          className="mt-2 mr-2 px-3 py-1 rounded bg-gray-200 text-xs hover:bg-gray-300"
          onClick={() => {
            if (blocks && onViewGroup) {
              const groupBlocks = getConnectedGroup(block, blocks);
              onViewGroup(groupBlocks);
            }
          }}
        >View Group Details</button>
      )}
      <button
        className="mt-2 px-3 py-1 rounded bg-blue-500 text-white text-xs hover:bg-blue-600"
        onClick={onClose}
      >Close</button>
    </div>
  );
}; 
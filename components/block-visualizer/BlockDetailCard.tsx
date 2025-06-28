import React, { useState } from 'react';
import type { Block } from '@/lib/db';
import { getConnectedGroup } from '@/hooks/use-block-connections';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BlockDetailCardProps {
  block: Block | null;
  onClose: () => void;
  blocks?: Block[]; // For future group/linked info
  onViewGroup?: (groupBlocks: Block[]) => void;
  defaultMinimized?: boolean;
}

export const BlockDetailCard: React.FC<BlockDetailCardProps> = ({ block, onClose, blocks, onViewGroup, defaultMinimized = true }) => {
  const [minimized, setMinimized] = useState(defaultMinimized);
  if (!block) return null;
  const canViewGroup = !!blocks && !!onViewGroup;

  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 200,
          right: 24,
          zIndex: 100,
          minWidth: 180,
          maxWidth: 220,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setMinimized(false)}
      >
        <span className="font-bold mr-2">{block.type.toUpperCase()}</span>
        <span className="text-xs text-gray-500 truncate flex-1">{block.content ? block.content.slice(0, 24) : 'Empty'}</span>
        <ChevronUp className="ml-2 w-4 h-4 text-gray-400" />
      </div>
    );
  }

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
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold">Block Details</div>
        <button
          className="p-1 rounded hover:bg-gray-100"
          style={{ lineHeight: 0 }}
          onClick={() => setMinimized(true)}
          title="Minimize"
        >
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </div>
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
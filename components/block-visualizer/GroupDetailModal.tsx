import React from 'react';
import type { Block } from '@/lib/db';

interface GroupDetailModalProps {
  groupBlocks: Block[];
  onClose: () => void;
  onSelectBlock: (block: Block) => void;
}

export const GroupDetailModal: React.FC<GroupDetailModalProps> = ({ groupBlocks, onClose, onSelectBlock }) => {
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
      <div className="font-bold text-lg mb-2">Linked Group Information</div>
      <div className="mb-4 text-sm text-gray-600">This group contains {groupBlocks.length} blocks:</div>
      <ul className="mb-4">
        {groupBlocks.map(b => (
          <li key={b.id} className="mb-1 text-xs cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5" onClick={() => onSelectBlock(b)}>
            <b>{b.type.toUpperCase()}</b>: <span className="font-mono">{b.id}</span> — <span className="text-gray-700">{b.content?.slice(0, 40) || 'Empty'}</span>
          </li>
        ))}
      </ul>
      <button
        className="mt-2 px-4 py-1 rounded bg-blue-500 text-white text-xs hover:bg-blue-600"
        onClick={onClose}
      >Close</button>
    </div>
  );
}; 
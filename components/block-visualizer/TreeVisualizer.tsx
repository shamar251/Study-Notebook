import React, { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Block } from '@/lib/db';
import { BLOCK_TYPE_COLORS, BLOCK_TYPE_LABELS } from '@/lib/block-types';
import { BlockDetailCard } from './BlockDetailCard';
import { useDrag, useDrop } from 'react-dnd';

const NODE_COLORS: Record<Block['type'], string> = {
  who: '#3b82f6',
  what: '#10b981',
  note: '#8b5cf6',
  image: '#f59e0b',
  video: '#ef4444',
  code: '#6b7280',
  where: '#14b8a6',
  how: '#f97316',
  'where-ref': '#14b8a6',
};

// Dynamically import react-d3-tree to avoid SSR issues
const Tree = dynamic(() => import('react-d3-tree').then(mod => mod.Tree), { ssr: false });

const DND_ITEM_TYPE = 'BLOCK';

interface TreeVisualizerProps {
  blocks: Block[];
  onReorder?: (newOrder: string[]) => void;
}

// Convert blocks to react-d3-tree format
function blocksToTreeData(blocks: Block[]): any {
  if (!blocks.length) return [];
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  const linked = new Set<string>();
  blocks.forEach(b => b.linkedBlockIds?.forEach(id => linked.add(id)));
  const roots = blocks.filter(b => !linked.has(b.id) && b.type !== 'where-ref');
  function buildNode(block: Block): any {
    if (block.type === 'where-ref' && block.whereBlockId) {
      // Do not create a node for where-ref, just use the referenced where block
      const referenced = blockMap.get(block.whereBlockId);
      if (referenced) return buildNode(referenced);
      return null;
    }
    return {
      name: BLOCK_TYPE_LABELS[block.type],
      attributes: { id: block.id, content: block.content },
      children: (block.linkedBlockIds || [])
        .map(id => {
          const child = blockMap.get(id);
          if (child?.type === 'where-ref' && child.whereBlockId) {
            const referenced = blockMap.get(child.whereBlockId);
            return referenced ? buildNode(referenced) : null;
          }
          return child ? buildNode(child) : null;
        })
        .filter(Boolean),
      _block: block,
    };
  }
  // Wrap all roots in a virtual root node if more than one
  if (roots.length > 1) {
    return [{
      name: 'All Blocks',
      _virtualRoot: true,
      children: roots.map(buildNode).filter(Boolean),
    }];
  } else if (roots.length === 1) {
    return [buildNode(roots[0])];
  } else {
    return [];
  }
}

export const TreeVisualizer: React.FC<TreeVisualizerProps> = ({ blocks, onReorder }) => {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [treeBlocks, setTreeBlocks] = useState<Block[]>(blocks);

  // Tree data for react-d3-tree
  const treeData = useMemo(() => blocksToTreeData(treeBlocks), [treeBlocks]);

  // Palette: blocks not in the tree (not linked to or from any other block)
  const allLinked = new Set<string>();
  treeBlocks.forEach(b => {
    b.linkedBlockIds?.forEach(id => allLinked.add(id));
  });
  treeBlocks.forEach(b => {
    if (allLinked.has(b.id)) allLinked.add(b.id);
  });
  const paletteBlocks = treeBlocks.filter(b => !allLinked.has(b.id));

  // Find block by id
  const getBlockById = (id: string) => treeBlocks.find(b => b.id === id) || null;
  const selectedBlock = selectedBlockId ? getBlockById(selectedBlockId) : null;

  // Drag source for palette blocks
  const PaletteBlock: React.FC<{ block: Block }> = ({ block }) => {
    const [{ isDragging }, drag] = useDrag(() => ({
      type: DND_ITEM_TYPE,
      item: { id: block.id },
      collect: (monitor) => ({ isDragging: monitor.isDragging() })
    }), [block]);
    const setDragRef = (node: HTMLDivElement | null) => {
      if (node) drag(node);
    };
    return (
      <div
        ref={setDragRef}
        className={`p-2 rounded shadow-sm cursor-pointer flex items-center gap-2 ${selectedBlockId === block.id ? 'bg-blue-100' : 'hover:bg-gray-100'} ${isDragging ? 'opacity-50' : ''}`}
        onClick={() => setSelectedBlockId(block.id)}
        style={{ opacity: isDragging ? 0.5 : 1 }}
      >
        <span className={`w-2 h-2 rounded-full inline-block mr-2`} style={{ background: NODE_COLORS[block.type as Block['type']] || '#e5e7eb' }} />
        <span className="truncate text-xs font-mono">{block.content ? block.content.slice(0, 24) : 'Empty'}</span>
        <span className="text-xs text-gray-400 ml-auto">{BLOCK_TYPE_LABELS[block.type as Block['type']]}</span>
      </div>
    );
  };

  // Drop target for tree nodes
  const TreeNodeDrop: React.FC<{ nodeDatum: any; children: React.ReactNode }> = ({ nodeDatum, children }) => {
    const [{ isOver, canDrop }, drop] = useDrop(() => ({
      accept: DND_ITEM_TYPE,
      drop: (item: { id: string }) => {
        // Add the dropped block as a child of this node
        if (nodeDatum._virtualRoot) return; // Don't add to virtual root
        const parentId = nodeDatum._block.id;
        setTreeBlocks(prev => {
          const newBlocks = prev.map(b => {
            if (b.id === parentId) {
              // Add child if not already present
              if (!b.linkedBlockIds?.includes(item.id)) {
                return { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), item.id] };
              }
            }
            // Remove from other parents
            if (b.linkedBlockIds?.includes(item.id) && b.id !== parentId) {
              return { ...b, linkedBlockIds: b.linkedBlockIds.filter((id: string) => id !== item.id) };
            }
            return b;
          });
          if (onReorder) onReorder(newBlocks.map(b => b.id));
          return newBlocks;
        });
      },
      canDrop: (item: { id: string }) => !nodeDatum._virtualRoot && nodeDatum._block && nodeDatum._block.id !== item.id && !(nodeDatum._block.linkedBlockIds || []).includes(item.id),
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      })
    }), [nodeDatum]);
    const setDropRef = (node: SVGGElement | null) => {
      if (node) drop(node);
    };
    return (
      <g ref={setDropRef} style={{ outline: isOver && canDrop ? '2px solid #22c55e' : undefined }}>{children}</g>
    );
  };

  // Drop target for root (empty space)
  const [, rootDrop] = useDrop(() => ({
    accept: DND_ITEM_TYPE,
    drop: (item: { id: string }) => {
      // Make the dropped block a root (remove from all parents)
      setTreeBlocks(prev => {
        const newBlocks = prev.map(b => ({
          ...b,
          linkedBlockIds: (b.linkedBlockIds || []).filter((id: string) => id !== item.id)
        }));
        if (onReorder) onReorder(newBlocks.map(b => b.id));
        return newBlocks;
      });
    },
    collect: (monitor) => ({ isOver: monitor.isOver() })
  }), []);

  // Custom node rendering for react-d3-tree
  const renderCustomNode = useCallback(({ nodeDatum }: any) => {
    if (nodeDatum._virtualRoot) {
      // Virtual root node
      return (
        <g>
          <rect x={-70} y={-24} width={140} height={48} rx={16} fill="#e5e7eb" stroke="#cbd5e1" strokeWidth={2} />
          <text x={0} y={0} textAnchor="middle" alignmentBaseline="middle" fontWeight="bold" fontSize={20} fill="#334155">
            All Blocks
          </text>
        </g>
      );
    }
    return (
      <TreeNodeDrop nodeDatum={nodeDatum}>
        <g onClick={() => setSelectedBlockId(nodeDatum._block.id)} style={{ cursor: 'pointer' }}>
          <rect
            x={-70}
            y={-28}
            width={140}
            height={56}
            rx={14}
            fill={selectedBlockId === nodeDatum._block.id ? '#2563eb' : NODE_COLORS[nodeDatum._block.type as Block['type']] || '#e5e7eb'}
            stroke={selectedBlockId === nodeDatum._block.id ? '#1d4ed8' : '#fff'}
            strokeWidth={selectedBlockId === nodeDatum._block.id ? 4 : 2}
          />
          <text
            x={0}
            y={-4}
            textAnchor="middle"
            alignmentBaseline="middle"
            fontWeight="bold"
            fontSize={18}
            fill="#fff"
            style={{ textShadow: '0 1px 4px #0008' }}
          >
            {nodeDatum._block.content ? nodeDatum._block.content.slice(0, 24) : 'Empty'}
          </text>
          <text
            x={0}
            y={18}
            textAnchor="middle"
            fontSize={13}
            fontWeight="bold"
            fill="#fff"
            style={{ textShadow: '0 1px 4px #0008', letterSpacing: 1 }}
            opacity={0.95}
          >
            {BLOCK_TYPE_LABELS[nodeDatum._block.type as Block['type']]}
          </text>
        </g>
      </TreeNodeDrop>
    );
  }, [selectedBlockId]);

  return (
    <div className="w-full h-full flex">
      {/* Block Palette */}
      <div className="w-64 border-r bg-gray-50 p-4 overflow-auto">
        <h4 className="font-semibold mb-2">Block Palette</h4>
        <div className="space-y-2">
          {paletteBlocks.length === 0 && <div className="text-xs text-gray-400">No unlinked blocks</div>}
          {paletteBlocks.map(block => (
            <PaletteBlock key={block.id} block={block} />
          ))}
        </div>
      </div>
      {/* Tree Visualization */}
      <div className="flex-1 relative" ref={node => { if (node) rootDrop(node); }} style={{ minHeight: 500 }}>
        {treeData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">No tree to display</div>
        ) : (
          <div style={{ width: '100%', height: '100%', minHeight: 500 }}>
            <Tree
              data={treeData}
              orientation="vertical"
              translate={{ x: 400, y: 100 }}
              renderCustomNodeElement={renderCustomNode}
              zoomable
              collapsible={false}
              separation={{ siblings: 1.5, nonSiblings: 2 }}
              pathFunc="elbow"
            />
          </div>
        )}
        {/* Block detail card */}
        {selectedBlock && (
          <div className="absolute top-8 right-8 w-80 z-10">
            <BlockDetailCard
              block={selectedBlock}
              onClose={() => setSelectedBlockId(null)}
              blocks={treeBlocks}
            />
          </div>
        )}
      </div>
    </div>
  );
}; 
import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from 'react-flow-renderer';
import type { Block } from '@/lib/db';
import { BLOCK_TYPE_LABELS } from '@/lib/block-types';
import { BlockDetailCard } from './BlockDetailCard';
import { GroupDetailModal } from './GroupDetailModal';
import { getConnectedGroup } from '@/hooks/use-block-connections';
import { BlockNavigationCard } from './BlockNavigationCard';

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
  why: '#6366f1',
  when: '#ec4899',
  check: '#059669',
};

interface ReactFlowTreeVisualizerProps {
  blocks: Block[];
}

function blocksToFlow(blocks: Block[]): { nodes: Node[]; edges: Edge[] } {
  if (!blocks.length) return { nodes: [], edges: [] };
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  const linked = new Set<string>();
  blocks.forEach(b => b.linkedBlockIds?.forEach(id => linked.add(id)));
  const roots = blocks.filter(b => !linked.has(b.id) && b.type !== 'where-ref');
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 0;
  function addNode(block: Block, parentId?: string, depth = 0, siblingIdx = 0, visited = new Set<string>()) {
    if (visited.has(block.id)) return;
    visited.add(block.id);
    const nodeId = block.id;
    let label = block.content ? block.content.slice(0, 24) : 'Empty';
    let nodeStyle = {
      background: NODE_COLORS[block.type],
      color: '#fff',
      borderRadius: 12,
      fontWeight: 'bold',
      fontSize: 16,
      minWidth: 160,
      minHeight: 60,
      boxShadow: '0 2px 8px #0002',
      border: '2px solid #fff',
    };
    if (block.type === 'check') {
      label = (block.isChecked ? '✓ ' : '☐ ') + label;
      if (block.isChecked) {
        nodeStyle = {
          ...nodeStyle,
          color: '#d1d5db',
        };
      }
    }
    nodes.push({
      id: nodeId,
      data: {
        label,
        type: block.type,
      },
      position: { x: depth * 250, y: y * 100 + siblingIdx * 10 },
      style: nodeStyle,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      type: 'default',
    });
    if (parentId) {
      const parentBlock = blockMap.get(parentId);
      if (parentBlock) {
        edges.push({ id: `${parentId}->${nodeId}`, source: parentId, target: nodeId, animated: false });
      }
    }
    let childIdx = 0;
    (block.linkedBlockIds || []).forEach(childId => {
      const child = blockMap.get(childId);
      if (child) {
        addNode(child, nodeId, depth + 1, childIdx++, new Set(visited));
      }
    });
    y++;
  }
  if (roots.length > 1) {
    const rootId = 'virtual-root';
    nodes.push({
      id: rootId,
      data: { label: 'All Blocks', type: 'virtual' },
      position: { x: 0, y: 0 },
      style: {
        background: '#e5e7eb',
        color: '#334155',
        borderRadius: 12,
        fontWeight: 'bold',
        fontSize: 18,
        minWidth: 160,
        minHeight: 60,
        border: '2px solid #cbd5e1',
      },
      type: 'default',
      draggable: false,
    });
    roots.forEach((root, idx) => {
      addNode(root, rootId, 1, idx, new Set());
    });
  } else if (roots.length === 1) {
    addNode(roots[0], undefined, 0, 0, new Set());
  }
  const uniqueEdges = Array.from(
    new Map(edges.map(e => [e.id, e])).values()
  );
  return { nodes, edges: uniqueEdges };
}

// Inner component that uses useReactFlow
const ReactFlowTreeVisualizerInner: React.FC<ReactFlowTreeVisualizerProps> = ({ blocks }) => {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => blocksToFlow(blocks), [blocks]);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [groupModal, setGroupModal] = useState<Block[] | null>(null);
  const reactFlowInstance = useReactFlow();

  const onConnect = useCallback((params: any) => addEdge(params, edges), [edges]);

  // Find block by id
  const getBlockById = (id: string) => blocks.find(b => b.id === id) || null;
  const selectedBlock = selectedBlockId ? getBlockById(selectedBlockId) : null;

  // Node click handler
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.id === 'virtual-root') return;
    setSelectedBlockId(node.id);
  }, []);

  // Handle group navigation
  const handleNavigateToGroup = useCallback((groupBlocks: Block[]) => {
    // Open the group detail modal AND center the view on the first block
    setGroupModal(groupBlocks);

    // Also center the view on the first block in the group
    const firstBlock = groupBlocks[0];
    if (firstBlock) {
      setSelectedBlockId(firstBlock.id);
      // Center the view on the node
      const node = reactFlowInstance.getNode(firstBlock.id);
      if (node && node.position) {
        reactFlowInstance.setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 500 });
      }
    }
  }, [reactFlowInstance]);

  // Render overlays
  const renderOverlays = () => {
    if (groupModal) {
      return (
        <GroupDetailModal
          groupBlocks={groupModal}
          onClose={() => setGroupModal(null)}
          onSelectBlock={b => {
            setSelectedBlockId(b.id);
            setGroupModal(null);
            // Center the view on the selected block
            const node = reactFlowInstance.getNode(b.id);
            if (node && node.position) {
              reactFlowInstance.setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 500 });
            }
          }}
        />
      );
    }
    return (
      <BlockDetailCard
        block={selectedBlock}
        onClose={() => setSelectedBlockId(null)}
        blocks={blocks}
        onViewGroup={groupBlocks => setGroupModal(groupBlocks)}
        defaultMinimized={false}
      />
    );
  };

  return (
    <div style={{ width: '100%', height: '98%', background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #0001', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          panOnDrag
          zoomOnScroll
          attributionPosition="bottom-right"
          onNodeClick={onNodeClick}
        >
          <MiniMap nodeColor={n => n.style?.background as string || '#888'} />
          <Controls />
          <Background gap={16} color="#eee" />
        </ReactFlow>
        {(selectedBlock || groupModal) && renderOverlays()}
      </div>
      <BlockNavigationCard
        blocks={blocks}
        onNavigateToBlock={block => {
          setSelectedBlockId(block.id);
          // Center the view on the node
          const node = reactFlowInstance.getNode(block.id);
          if (node && node.position) {
            reactFlowInstance.setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 500 });
          }
        }}
        onNavigateToGroup={handleNavigateToGroup}
      />
    </div>
  );
};

export const ReactFlowTreeVisualizer: React.FC<ReactFlowTreeVisualizerProps> = ({ blocks }) => {
  return (
    <ReactFlowProvider>
      <ReactFlowTreeVisualizerInner blocks={blocks} />
    </ReactFlowProvider>
  );
}; 
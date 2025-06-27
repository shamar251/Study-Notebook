import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Block } from '@/lib/db';
import { getConnectedGroup } from '@/hooks/use-block-connections';
import { BLOCK_TYPE_COLORS } from '@/lib/block-types';
import { BlockDetailCard } from './BlockDetailCard';
import { GroupDetailModal } from './GroupDetailModal';

interface D3BlockVisualizerProps {
  blocks: Block[];
  width?: number;
  height?: number;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: Block['type'];
  content: string;
  group: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
}

export const D3BlockVisualizer: React.FC<D3BlockVisualizerProps> = ({
  blocks,
  width = 800,
  height = 600
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [cardPos, setCardPos] = useState<{ x: number; y: number } | null>(null);
  const [groupModal, setGroupModal] = useState<{ groupBlocks: Block[] } | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    if (!blocks.length || !svgRef.current) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    // Prepare data for D3
    const groups = getBlockGroups(blocks);
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Only create nodes for non-'where-ref' blocks
    groups.forEach((group, groupIndex) => {
      group.forEach(block => {
        if (block.type === 'where-ref') return; // skip where-ref nodes
        const node: GraphNode = {
          id: block.id,
          type: block.type,
          content: block.content || '',
          group: groupIndex
        };
        nodes.push(node);
        nodeMap.set(block.id, node);
      });
    });

    // Create links
    blocks.forEach(block => {
      if (block.linkedBlockIds) {
        block.linkedBlockIds.forEach(targetId => {
          const targetBlock = blocks.find(b => b.id === targetId);
          if (targetBlock?.type === 'where-ref' && targetBlock.whereBlockId) {
            // Link to the referenced 'where' block instead
            if (nodeMap.has(targetBlock.whereBlockId)) {
              links.push({
                source: block.id,
                target: targetBlock.whereBlockId
              });
            }
          } else if (targetBlock && nodeMap.has(targetId)) {
            links.push({
              source: block.id,
              target: targetId
            });
          }
        });
      }
    });

    // After nodes and links are created
    const validNodeIds = new Set(nodes.map(n => n.id));
    const filteredLinks = links.filter(
      link => validNodeIds.has(link.source as string) && validNodeIds.has(link.target as string)
    );

    // Set up D3 visualization
    const svg = d3.select(svgRef.current);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create container for the graph
    const container = svg.append('g');

    // Create force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(filteredLinks).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Create links
    const link = container.append('g')
      .selectAll('line')
      .data(filteredLinks)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Create nodes
    const node = container.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(drag(simulation) as any)
      .on('click', function (event, d) {
        setSelectedNode(d);
        setCardPos({ x: d.x ?? 0, y: d.y ?? 0 });
        event.stopPropagation();
      });

    // --- Dynamic node rendering ---
    // For each node, render a rounded rect sized to the text
    node.each(function (d) {
      const g = d3.select(this);
      const text = previewText(d.content);
      // Use a temporary SVG text element to measure width
      const tempText = container.append('text').text(text).attr('font-size', 12).attr('font-weight', 'bold').attr('visibility', 'hidden');
      const textWidth = tempText.node()?.getBBox().width || 40;
      tempText.remove();
      const paddingX = 16;
      const paddingY = 10;
      const rectWidth = textWidth + paddingX * 2;
      const rectHeight = 28;
      // Draw rect
      g.append('rect')
        .attr('x', -rectWidth / 2)
        .attr('y', -rectHeight / 2)
        .attr('rx', rectHeight / 2)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('fill', getNodeColor(d.type))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);
      // Draw text
      g.append('text')
        .text(text)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', '#fff');
    });

    // Add tooltips
    node.append('title')
      .text((d) => `${previewText(d.content)}\n${d.type.toUpperCase()}`);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag behavior
    function drag(simulation: d3.Simulation<GraphNode, GraphLink>) {
      function dragstarted(event: any, d: GraphNode) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event: any, d: GraphNode) {
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event: any, d: GraphNode) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      return d3.drag<SVGGElement, GraphNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended);
    }

    // Deselect node on background click
    svg.on('click', () => {
      setSelectedNode(null);
      setCardPos(null);
    });

    nodesRef.current = nodes;

    // Cleanup function
    return () => {
      simulation.stop();
    };
  }, [blocks, width, height]);

  // Helper function to get node color based on block type
  const getNodeColor = (type: Block['type']): string => {
    const colorMap: Record<Block['type'], string> = {
      who: '#3b82f6',    // blue
      what: '#10b981',   // green
      note: '#8b5cf6',   // purple
      image: '#f59e0b',  // amber
      video: '#ef4444',  // red
      code: '#6b7280',   // gray
      where: '#14b8a6',  // teal
      how: '#f97316',    // orange
      'where-ref': '#14b8a6', // teal (same as where)
    };
    return colorMap[type] || '#6b7280';
  };

  // Helper to group blocks by their connected group
  function getBlockGroups(blocks: Block[]): Block[][] {
    const groups: Block[][] = [];
    const visited = new Set<string>();
    for (const block of blocks) {
      if (visited.has(block.id)) continue;
      const group = getConnectedGroup(block, blocks);
      if (group.length > 0) {
        groups.push(group);
        group.forEach(b => visited.add(b.id));
      }
    }
    return groups;
  }

  // Helper: preview text
  function previewText(content: string) {
    if (!content) return 'Empty';
    return content.length > 30 ? content.slice(0, 30) + '…' : content;
  }

  // Helper: get block details by id
  function getBlockById(id: string): Block | undefined {
    return blocks.find(b => b.id === id);
  }

  // Card rendering
  const renderCard = () => {
    if (groupModal) {
      return (
        <GroupDetailModal
          groupBlocks={groupModal.groupBlocks}
          onClose={() => setGroupModal(null)}
          onSelectBlock={b => {
            setSelectedNode(nodesRef.current.find(n => n.id === b.id) || null);
            setGroupModal(null);
          }}
        />
      );
    }
    const block = selectedNode ? getBlockById(selectedNode.id) || null : null;
    return <BlockDetailCard block={block} onClose={() => { setSelectedNode(null); setCardPos(null); }} blocks={blocks} onViewGroup={groupBlocks => setGroupModal({ groupBlocks })} />;
  };

  return (
    <div className="w-full" style={{ position: 'relative' }}>
      <div className="mb-4 ml-4">
        <h3 className="text-lg font-semibold mb-2 ">Block Connections Visualization</h3>
        <p className="text-sm text-gray-600 mb-4">
          Drag nodes to rearrange, scroll to zoom, and click a node for details
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {(['who', 'what', 'note', 'image', 'video', 'code', 'where', 'how'] as const).map(type => (
            <div key={type} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getNodeColor(type) }}
              />
              <span className="text-xs font-medium">{type.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-full overflow-hidden bg-white" style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="w-full"
        />
        {renderCard()}
      </div>
    </div>
  );
}; 
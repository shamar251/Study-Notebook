import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Block } from '@/lib/db';
import { getConnectedGroup } from '@/hooks/use-block-connections';
import { BlockDetailCard } from './BlockDetailCard';
import { GroupDetailModal } from './GroupDetailModal';
import { BlockNavigationCard } from './BlockNavigationCard';

interface ClusteredForceGraphProps {
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

function previewText(content: string) {
  if (!content) return 'Empty';
  return content.length > 30 ? content.slice(0, 30) + '…' : content;
}

export const ClusteredForceGraph: React.FC<ClusteredForceGraphProps> = ({ blocks, width = 900, height = 600 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [groupModal, setGroupModal] = useState<{ groupBlocks: Block[] } | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const zoomRef = useRef<any>(null);

  useEffect(() => {
    if (!blocks.length || !svgRef.current) return;
    d3.select(svgRef.current).selectAll("*").remove();

    // Group blocks by connected group
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
    nodesRef.current = nodes;

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

    const svg = d3.select(svgRef.current);
    const container = svg.append('g');

    // Add zoom and pan support
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // Draw convex hulls for each group
    function drawHulls() {
      container.selectAll('.hull').remove();
      groups.forEach((group, groupIndex) => {
        const groupNodes = nodes.filter(n => n.group === groupIndex && n.x !== undefined && n.y !== undefined);
        if (groupNodes.length < 3) return; // Need at least 3 points for a hull
        const points = groupNodes.map(n => [n.x!, n.y!] as [number, number]);
        const hull = d3.polygonHull(points);
        if (hull) {
          container.append('path')
            .attr('class', 'hull')
            .attr('d', 'M' + hull.map(p => p.join(",")).join('L') + 'Z')
            .attr('fill', d3.color(NODE_COLORS[group[0].type])?.brighter(2).formatHex() || '#e0e7ff')
            .attr('stroke', d3.color(NODE_COLORS[group[0].type])?.darker(0.5).formatHex() || '#a5b4fc')
            .attr('stroke-width', 2)
            .attr('opacity', 0.18);
        }
      });
    }

    // After nodes and links are created
    const validNodeIds = new Set(nodes.map(n => n.id));
    const filteredLinks = links.filter(
      link => validNodeIds.has(link.source as string) && validNodeIds.has(link.target as string)
    );

    // D3 force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(filteredLinks).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(36));

    // Draw links
    const link = container.append('g')
      .selectAll('line')
      .data(filteredLinks)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);

    // Draw nodes
    const node = container.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(drag(simulation) as any)
      .on('click', function (event, d) {
        setSelectedNode(d);
        event.stopPropagation();
      });

    // Dynamic node rendering (rounded rects)
    node.each(function (d) {
      const g = d3.select(this);
      const text = previewText(d.content);
      const tempText = container.append('text').text(text).attr('font-size', 12).attr('font-weight', 'bold').attr('visibility', 'hidden');
      const textWidth = tempText.node()?.getBBox().width || 40;
      tempText.remove();
      const paddingX = 16;
      const rectWidth = textWidth + paddingX * 2;
      const rectHeight = 28;
      g.append('rect')
        .attr('x', -rectWidth / 2)
        .attr('y', -rectHeight / 2)
        .attr('rx', rectHeight / 2)
        .attr('width', rectWidth)
        .attr('height', rectHeight)
        .attr('fill', NODE_COLORS[d.type])
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);
      g.append('text')
        .text(text)
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 12)
        .attr('font-weight', 'bold')
        .attr('fill', '#fff');
    });

    node.append('title')
      .text((d) => `${previewText(d.content)}\n${d.type.toUpperCase()}`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
      drawHulls();
    });

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
    svg.on('click', () => setSelectedNode(null));

    return () => {
      simulation.stop();
    };
  }, [blocks, width, height]);

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

  // Helper: get block details by id
  function getBlockById(id: string): Block | undefined {
    return blocks.find(b => b.id === id);
  }

  // Card rendering (top right)
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
    return <BlockDetailCard block={block} onClose={() => setSelectedNode(null)} blocks={blocks} onViewGroup={groupBlocks => setGroupModal({ groupBlocks })} defaultMinimized={false} />;
  };

  return (
    <div className="w-full" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '98%' }}>
      <div className="mb-4 ml-4" style={{ flex: '0 0 auto' }}>
        <h3 className="text-lg font-semibold mb-2 ">Clustered Force-Directed Graph</h3>
        <p className="text-sm text-gray-600 mb-4">
          Nodes are grouped by connected clusters. Drag nodes to rearrange, scroll to zoom, and click a node for details.
        </p>
      </div>
      <div className="h-full overflow-hidden bg-white" style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="w-full"
        />
        {renderCard()}
      </div>
      <BlockNavigationCard
        blocks={blocks}
        onNavigateToBlock={block => {
          const node = nodesRef.current.find(n => n.id === block.id);
          if (node) {
            setSelectedNode(node);
            // Center the SVG view on the node
            if (svgRef.current && node.x !== undefined && node.y !== undefined && zoomRef.current) {
              const svg = d3.select(svgRef.current);
              const svgWidth = svgRef.current.clientWidth;
              const svgHeight = svgRef.current.clientHeight;
              const scale = 1.2;
              const tx = svgWidth / 2 - node.x * scale;
              const ty = svgHeight / 2 - node.y * scale;
              svg.transition().duration(500).call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
            }
          }
        }}
      />
    </div>
  );
}; 
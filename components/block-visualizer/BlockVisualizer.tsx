import React, { useRef, useState } from "react"
import type { Block } from "@/lib/db"
import { getConnectedGroup } from "@/hooks/use-block-connections"
import { BlockNavigationCard } from './BlockNavigationCard';
import { GroupDetailModal } from './GroupDetailModal';
import { BLOCK_TYPE_LABELS, BLOCK_TYPE_COLORS } from "@/lib/block-types";

interface BlockVisualizerProps {
  blocks: Block[]
}

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

export const BlockVisualizer: React.FC<BlockVisualizerProps> = ({ blocks }) => {
  const groups = getBlockGroups(blocks);
  const blockRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [groupModal, setGroupModal] = useState<Block[] | null>(null);

  const handleNavigateToGroup = (groupBlocks: Block[]) => {
    // Open the group detail modal AND scroll to the first block
    setGroupModal(groupBlocks);

    // Also scroll to the first block in the group
    const firstBlock = groupBlocks[0];
    if (firstBlock) {
      const el = blockRefs.current[firstBlock.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleSelectBlockFromGroup = (block: Block) => {
    // Close the modal and scroll to the selected block
    setGroupModal(null);
    const el = blockRefs.current[block.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="p-4" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '98%' }}>
      <h2 className="text-lg font-bold mb-2">Block Entities Visualization</h2>
      <div className="space-y-6" style={{ flex: 1, minHeight: 0 }}>
        {groups.map((group, i) => (
          <div
            key={group[0]?.id || i}
            className="border rounded-lg p-3 bg-gray-50"
            ref={el => { groupRefs.current[`group-${i}`] = el; }}
          >
            <div className="font-semibold mb-2">Group {i + 1}</div>
            <ul className="space-y-1">
              {group.map(block => (
                <li
                  key={block.id}
                  className="text-sm flex items-center"
                  ref={el => { blockRefs.current[block.id] = el; }}
                >
                  <span className={`font-mono px-2 py-1 rounded mr-2 ${BLOCK_TYPE_COLORS[block.type]}`}>
                    {BLOCK_TYPE_LABELS[block.type]}
                  </span>
                  <span className="text-gray-500 mr-2">{block.id}</span>
                  <span className="text-xs text-gray-700 italic mr-2">
                    {block.content ? block.content.slice(0, 30) + (block.content.length > 30 ? "..." : "") : "Empty block"}
                  </span>
                  {block.type === 'when' && block.linkedBlockIds && block.linkedBlockIds.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">→ {block.linkedBlockIds.join(", ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Group Detail Modal */}
      {groupModal && (
        <GroupDetailModal
          groupBlocks={groupModal}
          onClose={() => setGroupModal(null)}
          onSelectBlock={handleSelectBlockFromGroup}
        />
      )}

      <BlockNavigationCard
        blocks={blocks}
        onNavigateToBlock={block => {
          const el = blockRefs.current[block.id];
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        onNavigateToGroup={handleNavigateToGroup}
      />
    </div>
  )
} 
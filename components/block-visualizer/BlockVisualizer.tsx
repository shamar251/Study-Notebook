import React from "react"
import type { Block } from "@/lib/db"
import { getConnectedGroup } from "@/hooks/use-block-connections"

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
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-2">Block Entities Visualization</h2>
      <div className="space-y-6">
        {groups.map((group, i) => (
          <div key={group[0]?.id || i} className="border rounded-lg p-3 bg-gray-50">
            <div className="font-semibold mb-2">Group {i + 1}</div>
            <ul className="space-y-1">
              {group.map(block => (
                <li key={block.id} className="text-sm flex items-center">
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded mr-2">{block.type}</span>
                  <span className="text-gray-500 mr-2">{block.id}</span>
                  <span className="text-xs text-gray-700 italic mr-2">
                    {block.content ? block.content.slice(0, 30) + (block.content.length > 30 ? "..." : "") : "Empty block"}
                  </span>
                  {block.linkedBlockIds && block.linkedBlockIds.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">→ {block.linkedBlockIds.join(", ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
} 
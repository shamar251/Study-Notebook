import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Filter, ChevronRight, Users, FileText } from 'lucide-react';
import type { Block } from '@/lib/db';
import { BLOCK_TYPE_LABELS, BLOCK_TYPE_ICONS, BLOCK_TYPE_COLORS } from '@/lib/block-types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getConnectedGroup } from '@/hooks/use-block-connections';

interface BlockNavigationCardProps {
  blocks: Block[];
  onNavigateToBlock: (block: Block) => void;
  onNavigateToGroup?: (groupBlocks: Block[]) => void;
  className?: string;
}

type ViewMode = 'blocks' | 'groups';

export const BlockNavigationCard: React.FC<BlockNavigationCardProps> = ({
  blocks,
  onNavigateToBlock,
  onNavigateToGroup,
  className = ''
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlockType, setSelectedBlockType] = useState<Block['type'] | 'all'>('all');
  const [activeFilters, setActiveFilters] = useState<Set<Block['type']>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('blocks');

  // Get unique block types from available blocks
  const availableBlockTypes = useMemo(() => {
    const types = new Set<Block['type']>();
    blocks.forEach(block => types.add(block.type));
    return Array.from(types).sort();
  }, [blocks]);

  // Create groups from blocks
  const groups = useMemo(() => {
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
  }, [blocks]);

  // Filter blocks based on search query, selected type, and active filters
  const filteredBlocks = useMemo(() => {
    return blocks.filter(block => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        block.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        block.type.toLowerCase().includes(searchQuery.toLowerCase());

      // Type filter
      const matchesType = selectedBlockType === 'all' || block.type === selectedBlockType;

      // Active filters
      const matchesFilters = activeFilters.size === 0 || activeFilters.has(block.type);

      return matchesSearch && matchesType && matchesFilters;
    });
  }, [blocks, searchQuery, selectedBlockType, activeFilters]);

  // Filter groups based on search query and active filters
  const filteredGroups = useMemo(() => {
    return groups.filter(group => {
      // Search filter - check if any block in the group matches
      const matchesSearch = searchQuery === '' ||
        group.some(block =>
          block.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          block.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          block.type.toLowerCase().includes(searchQuery.toLowerCase())
        );

      // Type filter - check if any block in the group matches
      const matchesType = selectedBlockType === 'all' ||
        group.some(block => block.type === selectedBlockType);

      // Active filters - check if any block in the group matches
      const matchesFilters = activeFilters.size === 0 ||
        group.some(block => activeFilters.has(block.type));

      return matchesSearch && matchesType && matchesFilters;
    });
  }, [groups, searchQuery, selectedBlockType, activeFilters]);

  // Toggle filter for a block type
  const toggleFilter = (blockType: Block['type']) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(blockType)) {
      newFilters.delete(blockType);
    } else {
      newFilters.add(blockType);
    }
    setActiveFilters(newFilters);
  };

  // Clear all filters
  const clearFilters = () => {
    setActiveFilters(new Set());
    setSelectedBlockType('all');
    setSearchQuery('');
  };

  // Get block count by type
  const blockCountByType = useMemo(() => {
    const counts: Record<Block['type'], number> = {} as Record<Block['type'], number>;
    blocks.forEach(block => {
      counts[block.type] = (counts[block.type] || 0) + 1;
    });
    return counts;
  }, [blocks]);

  const blockListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = blockListRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Get group summary info
  const getGroupSummary = (group: Block[]) => {
    const typeCounts: Record<Block['type'], number> = {} as Record<Block['type'], number>;
    group.forEach(block => {
      typeCounts[block.type] = (typeCounts[block.type] || 0) + 1;
    });

    const mainTypes = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type, count]) => `${BLOCK_TYPE_LABELS[type as Block['type']]}(${count})`)
      .join(', ');

    return mainTypes || 'Mixed';
  };

  return (
    <div
      className={`block-navigation-footer-bar ${className}`}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: '0.5rem 1.5rem',
        gap: '0.5rem',
        zIndex: 50,
        minHeight: 80,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header: Search + Filters + View Mode Toggle */}
      <div className="flex flex-wrap items-center gap-2 w-full mb-1">
        <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 160, maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9ca3af' }} />
          <Input
            placeholder={`Search ${viewMode}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-sm h-8"
            style={{ width: '100%', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6 }}
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === 'blocks' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('blocks')}
            className="h-6 px-2 text-xs"
          >
            <FileText className="h-3 w-3 mr-1" />
            Blocks ({blocks.length})
          </Button>
          {onNavigateToGroup && (
            <Button
              variant={viewMode === 'groups' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('groups')}
              className="h-6 px-2 text-xs"
            >
              <Users className="h-3 w-3 mr-1" />
              Groups ({groups.length})
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1 items-center">
          <Badge
            variant={selectedBlockType === 'all' ? 'default' : 'outline'}
            className="cursor-pointer px-2 py-1 text-xs"
            onClick={() => setSelectedBlockType('all')}
          >
            All ({viewMode === 'blocks' ? blocks.length : groups.length})
          </Badge>
          {availableBlockTypes.map(blockType => (
            <Badge
              key={blockType}
              variant="outline"
              className={`cursor-pointer px-2 py-1 text-xs border ${BLOCK_TYPE_COLORS[blockType]} ${selectedBlockType === blockType ? '' : 'bg-transparent'} ${selectedBlockType === blockType ? 'text-gray-900 font-bold' : 'text-gray-700'}`}
              onClick={() => setSelectedBlockType(blockType)}
            >
              {BLOCK_TYPE_LABELS[blockType]} ({blockCountByType[blockType] || 0})
            </Badge>
          ))}
          {activeFilters.size > 0 && (
            <>
              <Filter className="h-4 w-4 text-gray-400 ml-2" />
              <span className="text-xs font-medium text-gray-500">Active Filters:</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-6 px-2 text-xs"
              >
                Clear All
              </Button>
              {Array.from(activeFilters).map(blockType => (
                <Badge
                  key={blockType}
                  variant="outline"
                  className={`cursor-pointer px-2 py-1 text-xs border ${BLOCK_TYPE_COLORS[blockType]} text-gray-900 font-bold`}
                  onClick={() => toggleFilter(blockType)}
                >
                  {BLOCK_TYPE_LABELS[blockType]}
                </Badge>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Content: Blocks or Groups */}
      <div
        ref={blockListRef}
        className="block-nav-scroll flex-1"
        style={{ overflowX: 'auto', whiteSpace: 'nowrap', width: '100%', paddingBottom: 2 }}
      >
        {viewMode === 'blocks' ? (
          // Blocks view
          filteredBlocks.length === 0 ? (
            <span className="text-center text-gray-400 text-xs block py-2">No blocks found.</span>
          ) : (
            filteredBlocks.map(block => (
              <span
                key={block.id}
                className="inline-flex items-center gap-2 px-2 py-1 border border-gray-200 rounded bg-gray-50 hover:bg-gray-100 cursor-pointer text-xs mr-2 mb-1"
                style={{ minWidth: 120, maxWidth: 220, verticalAlign: 'top' }}
                onClick={() => onNavigateToBlock(block)}
              >
                <span className={`p-1 rounded ${BLOCK_TYPE_COLORS[block.type]}`} style={{ minWidth: 20, minHeight: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {BLOCK_TYPE_ICONS[block.type]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 mb-0.5">
                    <Badge variant="outline" className="text-xs">
                      {BLOCK_TYPE_LABELS[block.type]}
                    </Badge>
                    <span className="text-xs text-gray-400 font-mono">
                      {block.id.slice(0, 8)}...
                    </span>
                  </span>
                  <span className="block text-xs text-gray-900 truncate" style={{ maxWidth: 90 }}>
                    {block.content || <span className="text-gray-300 italic">Empty block</span>}
                  </span>
                </span>
                <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
              </span>
            ))
          )
        ) : (
          // Groups view
          filteredGroups.length === 0 ? (
            <span className="text-center text-gray-400 text-xs block py-2">No groups found.</span>
          ) : (
            filteredGroups.map((group, groupIndex) => (
              <span
                key={`group-${groupIndex}`}
                className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded bg-blue-50 hover:bg-blue-100 cursor-pointer text-xs mr-2 mb-1"
                style={{ minWidth: 160, maxWidth: 280, verticalAlign: 'top' }}
                onClick={() => onNavigateToGroup?.(group)}
              >
                <span className="p-1 rounded bg-blue-500 text-white" style={{ minWidth: 24, minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 mb-1">
                    <Badge variant="outline" className="text-xs bg-blue-100">
                      Group {groupIndex + 1}
                    </Badge>
                    <span className="text-xs text-gray-400">
                      {group.length} blocks
                    </span>
                  </span>
                  <span className="block text-xs text-gray-900 truncate" style={{ maxWidth: 120 }}>
                    {getGroupSummary(group)}
                  </span>
                  <span className="block text-xs text-gray-500 truncate" style={{ maxWidth: 120 }}>
                    {group[0]?.content?.slice(0, 25) || 'Empty group'}...
                  </span>
                </span>
                <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
              </span>
            ))
          )
        )}
      </div>

      {/* Footer info at far right */}
      <div className="text-xs text-gray-400 ml-auto" style={{ whiteSpace: 'nowrap' }}>
        Showing {viewMode === 'blocks' ? filteredBlocks.length : filteredGroups.length} of {viewMode === 'blocks' ? blocks.length : groups.length} {viewMode}
        {activeFilters.size > 0 && (
          <span> &middot; {activeFilters.size} filter(s) active</span>
        )}
      </div>

      <style jsx>{`
        .block-nav-scroll::-webkit-scrollbar {
          height: 6px;
          background: transparent;
        }
        .block-nav-scroll::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 3px;
          transition: background 0.2s;
        }
        .block-nav-scroll:hover::-webkit-scrollbar-thumb {
          background: #cbd5e1;
        }
        .block-nav-scroll {
          scrollbar-width: thin;
          scrollbar-color: #e5e7eb transparent;
        }
        .block-nav-scroll:hover {
          scrollbar-color: #cbd5e1 transparent;
        }
      `}</style>
    </div>
  );
}; 
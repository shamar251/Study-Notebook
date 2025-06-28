import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Filter, ChevronRight } from 'lucide-react';
import type { Block } from '@/lib/db';
import { BLOCK_TYPE_LABELS, BLOCK_TYPE_ICONS, BLOCK_TYPE_COLORS } from '@/lib/block-types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface BlockNavigationCardProps {
  blocks: Block[];
  onNavigateToBlock: (block: Block) => void;
  className?: string;
}

export const BlockNavigationCard: React.FC<BlockNavigationCardProps> = ({
  blocks,
  onNavigateToBlock,
  className = ''
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlockType, setSelectedBlockType] = useState<Block['type'] | 'all'>('all');
  const [activeFilters, setActiveFilters] = useState<Set<Block['type']>>(new Set());

  // Get unique block types from available blocks
  const availableBlockTypes = useMemo(() => {
    const types = new Set<Block['type']>();
    blocks.forEach(block => types.add(block.type));
    return Array.from(types).sort();
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
      {/* Header: Search + Filters */}
      <div className="flex flex-wrap items-center gap-2 w-full mb-1">
        <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 160, maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9ca3af' }} />
          <Input
            placeholder="Search blocks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-sm h-8"
            style={{ width: '100%', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6 }}
          />
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          <Badge
            variant={selectedBlockType === 'all' ? 'default' : 'outline'}
            className="cursor-pointer px-2 py-1 text-xs"
            onClick={() => setSelectedBlockType('all')}
          >
            All ({blocks.length})
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
      {/* Block List: single row, horizontal scroll, minimal scrollbar */}
      <div
        ref={blockListRef}
        className="block-nav-scroll flex-1"
        style={{ overflowX: 'auto', whiteSpace: 'nowrap', width: '100%', paddingBottom: 2 }}
      >
        {filteredBlocks.length === 0 ? (
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
        )}
      </div>
      {/* Footer info at far right */}
      <div className="text-xs text-gray-400 ml-auto" style={{ whiteSpace: 'nowrap' }}>
        Showing {filteredBlocks.length} of {blocks.length} blocks
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
"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { File, FolderIcon, ChevronDown, ChevronRight, ArrowBigRightDash } from "lucide-react"
import type { Folder, Note } from "@/components/note-app"

interface DraggableItemProps {
  id: string
  type: 'folder' | 'note'
  name: string
  depth: number
  isActive?: boolean
  noteCount?: number
  isExpanded?: boolean
  hasChildren?: boolean
  onClick?: () => void
  onToggle?: (e: React.MouseEvent) => void
  isOver?: boolean
  dragMode?: 'reorder' | 'move' | null
}

export function DraggableItem({
  id,
  type,
  name,
  depth,
  isActive,
  noteCount,
  isExpanded,
  hasChildren,
  onClick,
  onToggle,
  isOver,
  dragMode,
}: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Determine the visual style based on drag mode and state
  const getDragStyle = () => {
    if (!isOver) return '';
    if (type === 'folder') {
      // Strong highlight for drop target, ensure high z-index and relative
      return 'bg-muted border-2 border-primary shadow-lg z-30 relative';
    }
    return '';
  };

  // Generate indentation lines
  const renderIndentation = () => {
    if (depth === 0) return null;

    return (
      <div className="absolute left-0 top-0 bottom-0 flex">
        {Array.from({ length: depth }).map((_, index) => (
          <div
            key={index}
            className="w-3 h-full border-l border-border/50"
            style={{ marginLeft: `${index * 12}px` }}
          />
        ))}
      </div>
    );
  };

  // Calculate the base indentation
  const baseIndent = type === 'note' ? 24 : 0; // 24px extra indent for notes
  const totalIndent = (depth * 12) + baseIndent;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, marginLeft: `${totalIndent}px` }}
      className={`flex items-center py-1 px-2 rounded-sm cursor-pointer relative
        ${isActive ? "bg-accent/50" : "hover:bg-accent/20"}
        ${getDragStyle()}
      `}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {renderIndentation()}
      <div className="flex items-center flex-1 min-w-0">
        {type === 'folder' && (
          <div
            className="w-4 h-4 p-0 mr-1 text-muted-foreground cursor-pointer flex items-center justify-center"
            onClick={onToggle}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )
            ) : (
              <div className="w-3" />
            )}
          </div>
        )}
        {type === 'folder' ? (
          <FolderIcon className="w-4 h-4 mr-2 text-muted-foreground" />
        ) : (
          <File className="w-4 h-4 mr-2 text-muted-foreground" />
        )}
        <span className="text-sm truncate">{name}</span>
        {/* Tooltip overlay for move target */}
        {isOver && type === 'folder' && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-3 py-2 rounded bg-black text-white text-xs shadow-lg whitespace-nowrap z-50 pointer-events-none">
            <FolderIcon className="inline w-4 h-4 mr-1 -mt-0.5" />
            <span className="font-semibold">{name}</span>
            <span className="ml-1 text-muted-foreground">Move into “{name}”</span>
          </div>
        )}
      </div>
      {type === 'folder' && noteCount !== undefined && noteCount > 0 && (
        <span className="text-xs text-muted-foreground ml-1">{noteCount}</span>
      )}
    </div>
  )
} 
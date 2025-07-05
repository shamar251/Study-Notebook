import React from "react"
import { X, CheckSquare, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Block } from "@/lib/db"
import { MathInput } from "@/components/block-editor/math-input"
import { BLOCK_TYPE_PLACEHOLDERS } from "@/lib/block-types"

interface CheckBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, math?: boolean) => void
  onUpdateBlockImmediate: (id: string, math: boolean) => void
  onRemoveBlockImage: (blockId: string) => void
  onUpdateBlockLanguage: (blockId: string, language: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, blockId?: string) => void
  onToggleTruthState: (blockId: string) => void
  onToggleCheckState: (blockId: string) => void
}

export function CheckBlockEditor({
  block,
  onUpdateBlock,
  onRemoveBlockImage,
  onPaste,
  onToggleCheckState
}: CheckBlockEditorProps) {
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCheckState(block.id);
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-1">
        <button
          onClick={handleCheckboxClick}
          className="flex-none mt-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title={block.isChecked ? "Mark as incomplete" : "Mark as complete"}
        >
          {block.isChecked ? (
            <CheckSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Square className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          )}
        </button>
        <div className={`w-full min-w-[350px] md:min-w-[500px] ${block.isChecked ? "opacity-60" : ""}`}>
          <MathInput
            value={block.content || ''}
            onChange={(value: string) => onUpdateBlock(block.id, value, block.math)}
            placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
            isMathMode={block.math}
            onPaste={(e: React.ClipboardEvent<HTMLTextAreaElement>) => onPaste(e, block.id)}
          />
        </div>
      </div>
      {block.image && (
        <div className="mt-2 relative group">
          <img
            src={block.image}
            alt="Block image"
            className="max-w-full h-auto rounded-md"
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
              onClick={() => onRemoveBlockImage(block.id)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
} 
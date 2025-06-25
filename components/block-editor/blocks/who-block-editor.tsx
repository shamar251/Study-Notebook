import React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Block } from "@/lib/db"
import { MathInput } from "@/components/block-editor/math-input"
import { BLOCK_TYPE_PLACEHOLDERS } from "@/lib/block-types"

interface WhoBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, math?: boolean) => void
  onUpdateBlockImmediate: (id: string, math: boolean) => void
  onRemoveBlockImage: (blockId: string) => void
  onUpdateBlockLanguage: (blockId: string, language: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, blockId?: string) => void
}

export function WhoBlockEditor({
  block,
  onUpdateBlock,
  onRemoveBlockImage,
  onPaste
}: WhoBlockEditorProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-full min-w-[350px] md:min-w-[500px]">
          <MathInput
            value={block.content}
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
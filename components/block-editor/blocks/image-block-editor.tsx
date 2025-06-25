import React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Block } from "@/lib/db"
import { BLOCK_TYPE_PLACEHOLDERS } from "@/lib/block-types"

interface ImageBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, math?: boolean) => void
  onUpdateBlockImmediate: (id: string, math: boolean) => void
  onRemoveBlockImage: (blockId: string) => void
  onUpdateBlockLanguage: (blockId: string, language: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, blockId?: string) => void
}

export function ImageBlockEditor({
  block,
  onUpdateBlock,
  onPaste
}: ImageBlockEditorProps) {
  return (
    <div className="space-y-2">
      {!block.content && (
        <Input
          type="text"
          value={block.content}
          onChange={(e) => onUpdateBlock(block.id, e.target.value)}
          onPaste={(e) => onPaste(e, block.id)}
          placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
        />
      )}
      {block.content && (
        <div className="mt-2 relative group">
          <img
            src={block.content}
            alt="Note image"
            className="max-w-full h-auto rounded-md"
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
              onClick={() => onUpdateBlock(block.id, "")}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
} 
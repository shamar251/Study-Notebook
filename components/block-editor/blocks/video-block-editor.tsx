import React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Block } from "@/lib/db"
import { BLOCK_TYPE_PLACEHOLDERS } from "@/lib/block-types"

interface VideoBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, math?: boolean) => void
  onUpdateBlockImmediate: (id: string, math: boolean) => void
  onRemoveBlockImage: (blockId: string) => void
  onUpdateBlockLanguage: (blockId: string, language: string) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, blockId?: string) => void
}

export function VideoBlockEditor({
  block,
  onUpdateBlock,
  onPaste
}: VideoBlockEditorProps) {
  return (
    <div className="space-y-2">
      <Input
        type="text"
        value={block.content}
        onChange={(e) => onUpdateBlock(block.id, e.target.value)}
        onPaste={(e) => onPaste(e, block.id)}
        placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
      />
    </div>
  )
} 
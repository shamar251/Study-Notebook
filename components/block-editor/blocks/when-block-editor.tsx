import React from "react"
import type { Block } from "@/lib/db"
import { Input } from "@/components/ui/input"

interface WhenBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, data?: any) => void
}

export function WhenBlockEditor({ block, onUpdateBlock }: WhenBlockEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          type="text"
          value={block.content}
          onChange={(e) => onUpdateBlock(block.id, e.target.value, block.data)}
          placeholder="Enter a time reference (e.g., 'Morning', '2024-01-15', 'Last week')"
        />
      </div>
    </div>
  )
} 
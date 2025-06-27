import React, { useState } from "react"
import type { Block } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Map as MapIcon } from "lucide-react"

interface WhereBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, data?: any) => void
  getExistingWhereBlocks: () => Block[]
  onSelectExistingWhereBlock: (targetBlockId: string, referenceBlock: Block) => void
  referencedWhereBlock?: Block
}

export function WhereBlockEditor({ block, onUpdateBlock, getExistingWhereBlocks, onSelectExistingWhereBlock, referencedWhereBlock }: WhereBlockEditorProps) {
  const existingWhereBlocks = getExistingWhereBlocks().filter(b => b.id !== block.id)

  if (block.type === 'where-ref' && referencedWhereBlock) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Input
            type="text"
            value={referencedWhereBlock.content}
            readOnly
            placeholder="Referenced location..."
          />
        </div>
        <div className="text-xs text-gray-500">This is a reference to another location block.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          type="text"
          value={block.content}
          onChange={(e) => onUpdateBlock(block.id, e.target.value, block.data)}
          placeholder="Enter a location (e.g., 'Home', 'Office', 'Paris, France')"
        />
      </div>

      {existingWhereBlocks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Or select existing location:</h4>
          <div className="flex flex-wrap gap-2">
            {existingWhereBlocks.map((b, idx) => (
              <Button
                key={`${b.id}-${idx}`}
                variant="outline"
                size="sm"
                onClick={() => onSelectExistingWhereBlock(block.id, b)}
              >
                <MapIcon className="mr-2 h-4 w-4" />
                {b.content}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 
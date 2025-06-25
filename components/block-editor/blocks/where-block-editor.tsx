import React, { useState } from "react"
import type { Block } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Map as MapIcon } from "lucide-react"

interface WhereBlockEditorProps {
  block: Block
  onUpdateBlock: (id: string, content: string, data?: any) => void
  getExistingWhereBlocks: () => Block[]
}

export function WhereBlockEditor({ block, onUpdateBlock, getExistingWhereBlocks }: WhereBlockEditorProps) {
  const existingWhereBlocks = getExistingWhereBlocks()

  const handleExistingLocationSelect = (selectedBlock: Block) => {
    onUpdateBlock(block.id, selectedBlock.content, selectedBlock.data)
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
            {existingWhereBlocks.map((b) => (
              <Button
                key={b.id}
                variant="outline"
                size="sm"
                onClick={() => handleExistingLocationSelect(b)}
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
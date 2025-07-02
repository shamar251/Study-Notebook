import { useCallback } from "react"
import type { Block } from "@/lib/db"

export function useWhenBlock(blocks: Block[]) {
  const getExistingWhenBlocks = useCallback(() => {
    return blocks.filter(b => b.type === "when" && b.content && b.content.trim() !== "")
  }, [blocks])

  return {
    getExistingWhenBlocks
  }
} 
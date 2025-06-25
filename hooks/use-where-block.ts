import { useCallback } from "react"
import type { Block } from "@/lib/db"

export function useWhereBlock(blocks: Block[]) {
  const getExistingWhereBlocks = useCallback(() => {
    return blocks.filter((block) => block.type === "where")
  }, [blocks])

  return {
    getExistingWhereBlocks
  }
} 
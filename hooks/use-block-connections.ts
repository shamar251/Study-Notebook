import { useCallback } from "react"
import type { Block } from "@/lib/db"
import { BlockConnectionManager } from "@/lib/block-connections"

/**
 * Hook for managing block connections using the centralized BlockConnectionManager
 */
export function useBlockConnections() {
  const isWhoBlockConnected = useCallback((block: Block, allBlocks: Block[]): boolean => {
    return BlockConnectionManager.isWhoBlockConnected(block, allBlocks)
  }, [])

  const countConnectedWhatBlocks = useCallback((block: Block, allBlocks: Block[]): number => {
    return BlockConnectionManager.countConnectedWhatBlocks(block, allBlocks)
  }, [])

  const getAllLinkedWhatBlocks = useCallback((whoBlock: Block, allBlocks: Block[]): Block[] => {
    return BlockConnectionManager.getAllLinkedWhatBlocks(whoBlock, allBlocks)
  }, [])

  const findWhatBlock = useCallback((whoBlock: Block, allBlocks: Block[]): Block | undefined => {
    return BlockConnectionManager.findWhatBlock(whoBlock, allBlocks)
  }, [])

  const isSequenceBlock = useCallback((block: Block, allBlocks: Block[]): boolean => {
    return BlockConnectionManager.isSequenceBlock(block, allBlocks)
  }, [])

  const isTrueFalseBlock = useCallback((block: Block, allBlocks: Block[]): boolean => {
    return BlockConnectionManager.isTrueFalseBlock(block, allBlocks)
  }, [])

  const isMultipleChoiceBlock = useCallback((block: Block, allBlocks: Block[]): boolean => {
    return BlockConnectionManager.isMultipleChoiceBlock(block, allBlocks)
  }, [])

  const getConnectionState = useCallback((block: Block, index: number, allBlocks: Block[]) => {
    return BlockConnectionManager.getConnectionState(block, index, allBlocks)
  }, [])

  const getBlockClasses = useCallback((block: Block, connectionState: ReturnType<typeof BlockConnectionManager.getConnectionState>): string => {
    return BlockConnectionManager.getBlockClasses(block, connectionState)
  }, [])

  const getUnlinkedWhoBlocks = useCallback((allBlocks: Block[]): Block[] => {
    return BlockConnectionManager.getUnlinkedWhoBlocks(allBlocks)
  }, [])

  const validateConnections = useCallback((allBlocks: Block[]) => {
    return BlockConnectionManager.validateConnections(allBlocks)
  }, [])

  const migrateOldConnections = useCallback((allBlocks: Block[]): Block[] => {
    return BlockConnectionManager.migrateOldConnections(allBlocks)
  }, [])

  const getAvailableOptionBlocks = useCallback((allBlocks: Block[], blockType: "who" | "what", excludeBlockId?: string): Block[] => {
    return BlockConnectionManager.getAvailableOptionBlocks(allBlocks, blockType, excludeBlockId)
  }, [])

  return {
    isWhoBlockConnected,
    countConnectedWhatBlocks,
    getAllLinkedWhatBlocks,
    findWhatBlock,
    isSequenceBlock,
    isTrueFalseBlock,
    isMultipleChoiceBlock,
    getConnectionState,
    getBlockClasses,
    getUnlinkedWhoBlocks,
    validateConnections,
    migrateOldConnections,
    getAvailableOptionBlocks,
  }
}

/**
 * Returns a map of blockId to entityId (main WHO id) for all blocks
 */
export function getEntityMap(allBlocks: Block[]): Record<string, string> {
  const entityMap: Record<string, string> = {};
  const visited = new Set<string>();
  for (const who of allBlocks.filter(b => b.type === "who")) {
    const entityId = who.id;
    function traverse(b: Block) {
      if (!b || visited.has(b.id)) return;
      visited.add(b.id);
      entityMap[b.id] = entityId;
      (b.linkedBlockIds || []).forEach(id => {
        const next = allBlocks.find(x => x.id === id);
        if (next) traverse(next);
      });
    }
    traverse(who);
  }
  return entityMap;
}

/**
 * Returns all blocks connected (directly or indirectly) to the given block via linkedBlockIds
 */
export function getConnectedGroup(block: Block, allBlocks: Block[]): Block[] {
  const visited = new Set<string>();
  function traverse(b: Block) {
    if (!b || visited.has(b.id)) return;
    visited.add(b.id);
    // Forward
    (b.linkedBlockIds || []).forEach(id => {
      const next = allBlocks.find(x => x.id === id);
      if (next) traverse(next);
    });
    // Backward
    allBlocks.forEach(x => {
      if (x.linkedBlockIds?.includes(b.id)) traverse(x);
    });
  }
  traverse(block);
  return allBlocks.filter(b => visited.has(b.id));
} 
import { useState, useCallback } from "react"
import type { Block, Note } from "@/lib/db"
import { BlockConnectionManager } from "@/lib/block-connections"
import { getConnectedGroup } from "@/hooks/use-block-connections"

interface UseBlockManagerProps {
  blocks: Block[]
  setBlocks: (blocks: Block[]) => void
  updateNote: (note: Note) => void
  note: Note
  title: string
  tags: string[]
}

export function useBlockManager({ blocks, setBlocks, updateNote, note, title, tags }: UseBlockManagerProps) {

  // Add a new block
  const addBlock = useCallback((type: Block["type"]) => {
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      type,
      content: "",
      math: false,
      createdAt: new Date(),
      lastModified: new Date(),
      sortOrder: blocks.length,
    }

    setBlocks([...blocks, newBlock])
    return newBlock
  }, [blocks, setBlocks])

  // Update block content
  const updateBlock = useCallback(
    (
      id: string,
      content: string,
      math?: boolean,
      location?: Block["location"]
    ) => {
      const updatedBlocks = blocks.map((block: Block) => {
        if (block.id === id) {
          const updatedBlock: Partial<Block> = { content }
          if (math !== undefined) updatedBlock.math = math
          if (location !== undefined) updatedBlock.location = location
          return { ...block, ...updatedBlock }
        }
        return block
      })
      setBlocks(updatedBlocks)
    },
    [blocks, setBlocks]
  )

  // Update block immediately (for toggles)
  const updateBlockImmediate = useCallback((id: string, math: boolean) => {
    const newBlocks = blocks.map((block: Block) =>
      block.id === id ? { ...block, math } : block
    )
    setBlocks(newBlocks)
    updateNote({
      ...note,
      title,
      blocks: newBlocks,
      tags,
    })
  }, [blocks, setBlocks, updateNote, note, title, tags])

  // Delete a block
  const deleteBlock = useCallback((id: string) => {
    const blockToDelete = blocks.find((block) => block.id === id)
    if (!blockToDelete) return

    if (blockToDelete.type === "who" && blockToDelete.linkedBlockIds?.length) {
      setBlocks(blocks.filter((block) =>
        block.id !== id && !blockToDelete.linkedBlockIds?.includes(block.id)
      ))
    } else if (blockToDelete.type === "what") {
      const linkedWhoBlocks = blocks.filter((block) =>
        block.linkedBlockIds?.includes(blockToDelete.id)
      )
      if (linkedWhoBlocks.length > 0) {
        setBlocks(
          blocks
            .map((block) => {
              if (block.linkedBlockIds?.includes(blockToDelete.id)) {
                return {
                  ...block,
                  linkedBlockIds: block.linkedBlockIds.filter((linkedId) => linkedId !== blockToDelete.id)
                }
              }
              return block
            })
            .filter((block) => block.id !== blockToDelete.id)
        )
      } else {
        setBlocks(blocks.filter((block) => block.id !== id))
      }
    } else {
      setBlocks(blocks.filter((block) => block.id !== id))
    }
  }, [blocks, setBlocks])

  // Add a WHAT block linked to a WHO block
  const addWhatBlock = useCallback((whoBlockId: string) => {
    const whatBlock: Block = {
      id: `block-${Date.now()}`,
      type: "what",
      content: "",
      math: false,
      createdAt: new Date(),
      lastModified: new Date(),
      sortOrder: blocks.length,
    }

    // Update the who block to link to this what block
    const updatedBlocks = blocks.map((block) =>
      block.id === whoBlockId ? {
        ...block,
        linkedBlockIds: [...(block.linkedBlockIds || []), whatBlock.id]
      } : block
    )

    // Add the what block after the who block
    const whoIndex = updatedBlocks.findIndex((block) => block.id === whoBlockId)
    updatedBlocks.splice(whoIndex + 1, 0, whatBlock)

    setBlocks(updatedBlocks)

    // Force save after adding a new block
    updateNote({
      ...note,
      title,
      blocks: updatedBlocks,
      tags,
    })

    return whatBlock
  }, [blocks, setBlocks, updateNote, note, title, tags])

  // Link multiple WHAT blocks
  const linkWhatBlocks = useCallback((sourceBlockId: string, targetBlockId: string) => {
    setBlocks(blocks.map(block => {
      if (block.id === sourceBlockId) {
        return {
          ...block,
          linkedBlockIds: [...(block.linkedBlockIds || []), targetBlockId]
        }
      }
      return block
    }))
  }, [blocks, setBlocks])

  // Toggle truth state for WHAT blocks
  const toggleTruthState = useCallback((blockId: string) => {
    const updatedBlocks = blocks.map((b: Block) => {
      if (b.id !== blockId) return b
      // Cycle: undefined → true → false → undefined (restore original content)
      if (!b.truthState) {
        // Save original content and set to True
        return { ...b, truthState: "true" as const, originalContent: b.content, content: "True" }
      } else if (b.truthState === "true") {
        // Set to False
        return { ...b, truthState: "false" as const, originalContent: b.originalContent ?? b.content, content: "False" }
      } else {
        // Restore original content and clear truthState
        const { truthState, originalContent, ...rest } = b
        return { ...rest, content: b.originalContent ?? b.content }
      }
    })
    setBlocks(updatedBlocks)
  }, [blocks, setBlocks])

  // Remove image from block
  const removeBlockImage = useCallback((blockId: string) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, image: undefined } : b))
  }, [blocks, setBlocks])

  // Update block language (for code blocks)
  const updateBlockLanguage = useCallback((blockId: string, language: string) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, language } : b))
  }, [blocks, setBlocks])

  // Use centralized connection logic
  const isWhoBlockConnected = useCallback((block: Block, allBlocks: Block[]): boolean => {
    return BlockConnectionManager.isWhoBlockConnected(block, allBlocks)
  }, [])

  const countConnectedWhatBlocks = useCallback((block: Block, allBlocks: Block[]): number => {
    return BlockConnectionManager.countConnectedWhatBlocks(block, allBlocks)
  }, [])

  // Count HOW blocks directly linked to a block
  const countConnectedHowBlocks = useCallback((block: Block, allBlocks: Block[]): number => {
    if (!block.linkedBlockIds) return 0;
    return block.linkedBlockIds
      .map(id => allBlocks.find(b => b.id === id))
      .filter(b => b && b.type === "how").length;
  }, []);

  // Count all blocks directly linked to a block
  const countConnectedBlocks = useCallback((block: Block, allBlocks: Block[]): number => {
    if (!block.linkedBlockIds) return 0;
    return block.linkedBlockIds
      .map(id => allBlocks.find(b => b.id === id))
      .filter(Boolean).length;
  }, []);

  // Count all blocks in the linked group (traverse entire group)
  const countAllLinkedBlocksInGroup = useCallback((block: Block, allBlocks: Block[]): number => {
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
    // Exclude the root block itself
    return Math.max(visited.size - 1, 0);
  }, []);

  // Flexible connection methods
  const addBlockAndConnect = useCallback((type: Block["type"], parentBlockId?: string) => {
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      type,
      content: "",
      math: false,
      createdAt: new Date(),
      lastModified: new Date(),
      sortOrder: blocks.length,
    }

    let updatedBlocks = [...blocks, newBlock]

    // If parent block is specified, connect the new block to it
    if (parentBlockId) {
      updatedBlocks = updatedBlocks.map(block =>
        block.id === parentBlockId
          ? { ...block, linkedBlockIds: [...(block.linkedBlockIds || []), newBlock.id] }
          : block
      )
    }

    setBlocks(updatedBlocks)

    // Save to database
    updateNote({
      ...note,
      title,
      blocks: updatedBlocks,
      tags,
    })

    return newBlock
  }, [blocks, setBlocks, updateNote, note, title, tags])

  const connectBlocks = useCallback((sourceBlockId: string, targetBlockId: string) => {
    const updatedBlocks = blocks.map(block =>
      block.id === sourceBlockId
        ? { ...block, linkedBlockIds: [...(block.linkedBlockIds || []), targetBlockId] }
        : block
    )
    setBlocks(updatedBlocks)

    // Save to database
    updateNote({
      ...note,
      title,
      blocks: updatedBlocks,
      tags,
    })
  }, [blocks, setBlocks, updateNote, note, title, tags])

  const disconnectBlocks = useCallback((sourceBlockId: string, targetBlockId: string) => {
    const updatedBlocks = blocks.map(block =>
      block.id === sourceBlockId
        ? { ...block, linkedBlockIds: block.linkedBlockIds?.filter(id => id !== targetBlockId) || [] }
        : block
    )
    setBlocks(updatedBlocks)

    // Save to database
    updateNote({
      ...note,
      title,
      blocks: updatedBlocks,
      tags,
    })
  }, [blocks, setBlocks, updateNote, note, title, tags])

  // Add a block of a given type after a specific block (by id) and link it into the group
  const addBlockAfter = useCallback((type: Block["type"], afterBlockId?: string) => {
    let newBlock: Block;
    let updatedBlocks = [...blocks];

    if (type === "how") {
      // If afterBlockId is provided, use its group
      if (afterBlockId) {
        const afterBlock = blocks.find(b => b.id === afterBlockId);
        if (!afterBlock) return;
        const group = getConnectedGroup(afterBlock, blocks);
        // Find all HOW blocks in this group
        const groupHowBlocks = group.filter(b => b.type === "how");
        if (groupHowBlocks.length > 0) {
          // Insert after the last HOW block in this group
          const lastHowBlock = groupHowBlocks[groupHowBlocks.length - 1];
          const idx = blocks.findIndex(b => b.id === lastHowBlock.id);
          if (idx === -1) return;
          newBlock = {
            id: `block-${Date.now()}`,
            type,
            content: "",
            math: false,
            createdAt: new Date(),
            lastModified: new Date(),
            sortOrder: blocks.length,
          };
          updatedBlocks = [
            ...blocks.slice(0, idx + 1),
            newBlock,
            ...blocks.slice(idx + 1)
          ];
          // Link the new HOW block to the last HOW block in the group
          updatedBlocks = updatedBlocks.map(b =>
            b.id === lastHowBlock.id
              ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newBlock.id] }
              : b
          );
          setBlocks(updatedBlocks);
          return newBlock;
        } else {
          // No HOW block in group, insert after afterBlockId in main array
          const idx = blocks.findIndex(b => b.id === afterBlockId);
          if (idx === -1) return;
          newBlock = {
            id: `block-${Date.now()}`,
            type,
            content: "",
            math: false,
            createdAt: new Date(),
            lastModified: new Date(),
            sortOrder: blocks.length,
          };
          updatedBlocks = [
            ...blocks.slice(0, idx + 1),
            newBlock,
            ...blocks.slice(idx + 1)
          ];
          // Link the new HOW block to the selected block
          updatedBlocks = updatedBlocks.map(b =>
            b.id === afterBlockId
              ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newBlock.id] }
              : b
          );
          setBlocks(updatedBlocks);
          return newBlock;
        }
      } else {
        // No afterBlockId, fallback to global last HOW block
        const howBlocks = blocks.filter(b => b.type === "how");
        if (howBlocks.length > 0) {
          const lastHowBlock = howBlocks[howBlocks.length - 1];
          const idx = blocks.findIndex(b => b.id === lastHowBlock.id);
          if (idx === -1) return;
          newBlock = {
            id: `block-${Date.now()}`,
            type,
            content: "",
            math: false,
            createdAt: new Date(),
            lastModified: new Date(),
            sortOrder: blocks.length,
          };
          updatedBlocks = [
            ...blocks.slice(0, idx + 1),
            newBlock,
            ...blocks.slice(idx + 1)
          ];
          updatedBlocks = updatedBlocks.map(b =>
            b.id === lastHowBlock.id
              ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newBlock.id] }
              : b
          );
          setBlocks(updatedBlocks);
          return newBlock;
        }
        // If no HOW blocks exist, fallback to end
      }
    }

    if (afterBlockId) {
      const afterBlock = blocks.find(b => b.id === afterBlockId);
      if (!afterBlock) return;
      const group = getConnectedGroup(afterBlock, blocks);
      const groupIds = group.map(b => b.id);
      const idxInGroup = groupIds.indexOf(afterBlockId);
      const idxInBlocks = blocks.findIndex(b => b.id === afterBlockId);
      if (idxInGroup === -1 || idxInBlocks === -1) return;

      // If afterBlock is a HOW block and is part of a HOW chain, insert at end of group
      if (afterBlock.type === "how") {
        const isHowChain = !!afterBlock.linkedBlockIds?.some(id => {
          const next = blocks.find(b => b.id === id);
          return next && next.type === "how";
        });
        if (isHowChain) {
          const lastBlockInGroup = group[group.length - 1];
          const idxLastInBlocks = blocks.findIndex(b => b.id === lastBlockInGroup.id);
          newBlock = {
            id: `block-${Date.now()}`,
            type,
            content: "",
            math: false,
            createdAt: new Date(),
            lastModified: new Date(),
            sortOrder: blocks.length,
          };
          updatedBlocks = [
            ...blocks.slice(0, idxLastInBlocks + 1),
            newBlock,
            ...blocks.slice(idxLastInBlocks + 1)
          ];
          updatedBlocks = updatedBlocks.map(b =>
            b.id === lastBlockInGroup.id
              ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newBlock.id] }
              : b
          );
          setBlocks(updatedBlocks);
          return newBlock;
        }
      }

      newBlock = {
        id: `block-${Date.now()}`,
        type,
        content: "",
        math: false,
        createdAt: new Date(),
        lastModified: new Date(),
        sortOrder: blocks.length,
      };
      updatedBlocks = [
        ...blocks.slice(0, idxInBlocks + 1),
        newBlock,
        ...blocks.slice(idxInBlocks + 1)
      ];
      updatedBlocks = updatedBlocks.map(b =>
        b.id === afterBlockId
          ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newBlock.id] }
          : b
      );
      setBlocks(updatedBlocks);
    } else {
      newBlock = {
        id: `block-${Date.now()}`,
        type,
        content: "",
        math: false,
        createdAt: new Date(),
        lastModified: new Date(),
        sortOrder: blocks.length,
      };
      setBlocks([...blocks, newBlock]);
    }
    return newBlock;
  }, [blocks, setBlocks]);

  return {
    addBlock,
    updateBlock,
    updateBlockImmediate,
    deleteBlock,
    addWhatBlock,
    linkWhatBlocks,
    toggleTruthState,
    removeBlockImage,
    updateBlockLanguage,
    isWhoBlockConnected,
    countConnectedWhatBlocks,
    countConnectedHowBlocks,
    countConnectedBlocks,
    countAllLinkedBlocksInGroup,
    addBlockAndConnect,
    connectBlocks,
    disconnectBlocks,
    addBlockAfter,
  }
} 
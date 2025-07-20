"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { X, Save, Tag, AlertCircle, ImageIcon, Video, Code, FileText, FunctionSquare, Plus, Link as LinkIcon, MapPin, ArrowRight, HelpCircle, Clock, CheckSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Block, Note } from "@/lib/db"
import 'katex/dist/katex.min.css'
import { InlineMath, BlockMath } from 'react-katex'
import { BlockEditor } from "./block-editor/block-editor"
import { BlockPreview } from "./block-editor/block-preview"
import { useBlockManager } from "@/hooks/use-block-manager"
import { useWhereBlock } from "@/hooks/use-where-block"
import { useWhenBlock } from "@/hooks/use-when-block"
import { BLOCK_TYPE_ICONS, BLOCK_TYPE_LABELS } from "@/lib/block-types"
import { BlockConnectionManager } from "@/lib/block-connections"
import { getConnectedGroup } from "@/hooks/use-block-connections"
import { GroupDetailModal } from "@/components/block-visualizer/GroupDetailModal"
import { BlockDetailCard } from "@/components/block-visualizer/BlockDetailCard"
import { Virtuoso } from 'react-virtuoso'
import type { VirtuosoHandle } from 'react-virtuoso'

interface EditorProps {
  note: Note
  updateNote: (note: Note) => void
}

// Memoized BlockEditor component to prevent unnecessary re-renders
const MemoizedBlockEditor = React.memo(BlockEditor)
const MemoizedBlockPreview = React.memo(BlockPreview)

export default function Editor({ note, updateNote }: EditorProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [blocks, setBlocks] = useState<Block[]>(note.blocks)
  const [tags, setTags] = useState<string[]>(note.tags || [])
  const [newTag, setNewTag] = useState("")
  const [previewMode, setPreviewMode] = useState<"edit" | "preview">("edit")
  const [showWhatPrompt, setShowWhatPrompt] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [groupModal, setGroupModal] = useState<{ groupBlocks: Block[], selectedBlock: Block } | null>(null);
  const [blockDetailCardBlock, setBlockDetailCardBlock] = useState<Block | null>(null);
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [dirtyBlockIds, setDirtyBlockIds] = useState<Set<string>>(new Set());

  // Connection highlighting state
  const [highlightedBlockId, setHighlightedBlockId] = useState<string | null>(null)
  const [highlightedConnectedBlockIds, setHighlightedConnectedBlockIds] = useState<Set<string>>(new Set())

  // Use the block manager hook
  const blockManager = useBlockManager({
    blocks,
    setBlocks,
    updateNote,
    note,
    title,
    tags,
  })

  const { getExistingWhereBlocks } = useWhereBlock(blocks)
  const { getExistingWhenBlocks } = useWhenBlock(blocks)

  // Optimized initial load - only run migrations if absolutely necessary
  useEffect(() => {
    setTitle(note.title)
    setTags(note.tags || [])

    // Only run auto-fix if the note hasn't been processed before AND has blocks
    if (!note.autoFixedLegacyLinks && note.blocks.length > 0) {
      // Set blocks immediately for fast initial render
      setBlocks(note.blocks)

      // Run migration in background with lower priority
      const runMigration = () => {
        const fixedBlocks = BlockConnectionManager.autoFixLegacyWhoWhatLinks(note.blocks)
        if (JSON.stringify(fixedBlocks) !== JSON.stringify(note.blocks)) {
          setBlocks(fixedBlocks)
          updateNote({
            ...note,
            autoFixedLegacyLinks: true,
            blocks: fixedBlocks
          })
        } else {
          // No changes needed, just mark as processed
          updateNote({
            ...note,
            autoFixedLegacyLinks: true
          })
        }
      }

      // Use requestIdleCallback with timeout for better performance
      if ('requestIdleCallback' in window) {
        requestIdleCallback(runMigration, { timeout: 2000 })
      } else {
        // Fallback: run after a short delay
        setTimeout(runMigration, 100)
      }
    } else {
      // Note already processed or no blocks, set blocks directly
      setBlocks(note.blocks)
    }
  }, [note.id, note.title, note.tags, note.autoFixedLegacyLinks, note.blocks.length])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [editingTitle])

  // Create a ref to store the timeout ID
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Wrap setBlocks to track dirty blocks
  const setBlocksAndDirty = useCallback((updater: ((prevBlocks: Block[]) => Block[]) | Block[]) => {
    setBlocks((prevBlocks: Block[]) => {
      const nextBlocks = typeof updater === 'function' ? (updater as (prevBlocks: Block[]) => Block[])(prevBlocks) : updater;
      // Find changed/added blocks
      const prevMap = new Map(prevBlocks.map((b: Block) => [b.id, b]));
      const nextMap = new Map(nextBlocks.map((b: Block) => [b.id, b]));
      const dirty = new Set(dirtyBlockIds);
      for (const block of nextBlocks) {
        const prev = prevMap.get(block.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(block)) {
          dirty.add(block.id);
        }
      }
      // Also add deleted blocks (if needed for deletion upsert)
      // for (const id of prevMap.keys()) {
      //   if (!nextMap.has(id)) dirty.add(id);
      // }
      setDirtyBlockIds(dirty);
      return nextBlocks;
    });
  }, [dirtyBlockIds]);

  // Function to save changes with debounce
  const debouncedSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      updateNote({
        ...note,
        title,
        blocks,
        tags,
      });
      // --- Embed and upsert to Qdrant ---
      if (blocks.length > 0 && dirtyBlockIds.size > 0) {
        try {
          const dirtyBlocks = blocks.filter(b => dirtyBlockIds.has(b.id));
          await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              blocks: dirtyBlocks,
              note_id: note.id,
              folder_id: note.folderId
            })
          });
          setDirtyBlockIds(new Set()); // Clear dirty after successful upsert
        } catch (err) {
          console.error('Failed to embed/upsert note:', err);
        }
      }
    }, 1000);
  }, [note, title, blocks, tags, updateNote, dirtyBlockIds]);

  // Auto-save when content changes
  useEffect(() => {
    debouncedSave();

    // Cleanup function to clear the timeout if component unmounts
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, blocks, tags, debouncedSave]);

  // Add paste handler
  const handlePaste = useCallback(async (e: ClipboardEvent | React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>, blockId?: string) => {
    if (!e.clipboardData) return
    const items = e.clipboardData.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()

        const file = item.getAsFile()
        if (!file) continue

        // Convert image to base64
        const reader = new FileReader()
        reader.onload = (e) => {
          const base64Data = e.target?.result as string
          if (!base64Data) return

          if (blockId) {
            setBlocksAndDirty((blocks: Block[]) => blocks.map((block: Block) => {
              if (block.id !== blockId) return block;
              if (block.type === "who" || block.type === "what" || block.type === "note" || block.type === "why") {
                return { ...block, image: base64Data };
              } else if (block.type === "image") {
                return { ...block, content: base64Data };
              }
              return block;
            }))
          } else {
            // Create new image block (for pasting into the editor background)
            const newBlock: Block = {
              id: `block-${Date.now()}`,
              type: "image",
              content: base64Data,
              createdAt: new Date(),
              lastModified: new Date(),
              sortOrder: blocks.length,
            }
            setBlocksAndDirty((blocks: Block[]) => [...blocks, newBlock])
          }
        }
        reader.readAsDataURL(file)
        break
      }
    }
  }, [blocks, setBlocksAndDirty])

  // Add paste event listener
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const handleNativePaste = (e: ClipboardEvent) => {
      if (e.clipboardData) {
        handlePaste(e)
      }
    }
    editor.addEventListener('paste', handleNativePaste)
    return () => editor.removeEventListener('paste', handleNativePaste)
  }, [handlePaste])

  const addTag = useCallback(() => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }, [newTag, tags])

  const removeTag = useCallback((tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }, [tags])

  const handleTitleSubmit = useCallback(() => {
    setEditingTitle(false)
    // No need to explicitly call saveChanges as it will be triggered by the useEffect
  }, [])

  // Helper to get all connected blocks in a sequence group (forward and backward)
  // Optimized with memoization and more efficient traversal
  const getSequenceGroupBlocks = useCallback((startBlock: Block, allBlocks: Block[]): Block[] => {
    // Create a map for O(1) lookups
    const blockMap = new Map(allBlocks.map(block => [block.id, block]));
    const visited = new Set<string>();
    const stack: Block[] = [startBlock];
    const result: Block[] = [];

    while (stack.length > 0) {
      const block = stack.pop()!;
      if (!block || visited.has(block.id)) continue;

      visited.add(block.id);
      result.push(block);

      // Add forward connections
      if (block.linkedBlockIds) {
        for (const id of block.linkedBlockIds) {
          const next = blockMap.get(id);
          if (next && !visited.has(next.id)) {
            stack.push(next);
          }
        }
      }

      // Add backward connections (only check blocks that might have this block as a link)
      for (const [id, otherBlock] of blockMap) {
        if (otherBlock.linkedBlockIds?.includes(block.id) && !visited.has(id)) {
          stack.push(otherBlock);
        }
      }
    }

    return result;
  }, []);

  // Toggle sequence mode for a block and all connected sequence blocks
  const handleToggleSequenceMode = useCallback((blockId: string) => {
    // This function is no longer needed as sequence mode is replaced by how blocks
    // Keeping for backward compatibility but it does nothing
  }, [])

  // Optimized group map computation - compute all groups in a single pass
  const groupMap = useMemo(() => {
    const groupMap: Record<string, string> = {};
    const visited = new Set<string>();

    // Helper function to traverse and mark all connected blocks
    const traverseAndMark = (startBlock: Block, groupId: string) => {
      // If this is a when block, only group with other when blocks
      if (startBlock.type === "when") {
        const stack: Block[] = [startBlock];
        while (stack.length > 0) {
          const block = stack.pop()!;
          if (visited.has(block.id)) continue;
          if (block.type !== "when") continue; // Only group with other when blocks
          visited.add(block.id);
          groupMap[block.id] = groupId;
          // Add forward connections to other when blocks
          (block.linkedBlockIds || []).forEach(id => {
            const next = blocks.find(x => x.id === id && x.type === "when");
            if (next && !visited.has(next.id)) {
              stack.push(next);
            }
          });
          // Add backward connections from other when blocks
          blocks.forEach(x => {
            if (x.type === "when" && x.linkedBlockIds?.includes(block.id) && !visited.has(x.id)) {
              stack.push(x);
            }
          });
        }
        return;
      }
      // For all other blocks, group as before, but never with when blocks
      const stack: Block[] = [startBlock];
      while (stack.length > 0) {
        const block = stack.pop()!;
        if (visited.has(block.id)) continue;
        if (block.type === "when") {
          groupMap[block.id] = block.id;
          visited.add(block.id);
          continue;
        }
        visited.add(block.id);
        groupMap[block.id] = groupId;
        // Add forward connections (skip when)
        (block.linkedBlockIds || []).forEach(id => {
          const next = blocks.find(x => x.id === id && x.type !== "when");
          if (next && !visited.has(next.id)) {
            stack.push(next);
          }
        });
        // Add backward connections (skip when)
        blocks.forEach(x => {
          if (x.type !== "when" && x.linkedBlockIds?.includes(block.id) && !visited.has(x.id)) {
            stack.push(x);
          }
        });
      }
    };

    // Process all blocks
    for (const block of blocks) {
      if (visited.has(block.id)) continue;
      traverseAndMark(block, block.id);
    }

    return groupMap;
  }, [blocks]);

  // Memoized grouped blocks - only recalculate when blocks or groupMap change
  const groupedBlocks = useMemo(() => {
    return Object.entries(
      blocks.reduce((acc, block) => {
        const groupId = groupMap[block.id];
        if (!acc[groupId]) acc[groupId] = [];
        acc[groupId].push(block);
        return acc;
      }, {} as Record<string, Block[]>)
    );
  }, [blocks, groupMap]);

  // Memoized unlinked who blocks count - only recalculate when blocks change
  const unlinkedWhoBlocksCount = useMemo(() => {
    // More efficient calculation - only check WHO blocks
    let count = 0;
    for (const block of blocks) {
      if (block.type === "who" && (!block.linkedBlockIds || block.linkedBlockIds.length === 0)) {
        count++;
      }
    }
    return count;
  }, [blocks]);

  // Handler for double-clicking a block
  const handleBlockDoubleClick = useCallback((block: Block) => {
    const groupId = groupMap[block.id];
    const groupBlocks = blocks.filter(b => groupMap[b.id] === groupId);
    setGroupModal({ groupBlocks, selectedBlock: block });
  }, [blocks, groupMap]);

  // Handler for selecting a block in the modal (open BlockDetailCard)
  const handleSelectBlockInModal = useCallback((block: Block) => {
    setGroupModal(null);
    setBlockDetailCardBlock(block);
  }, []);

  // Handler for closing BlockDetailCard
  const handleCloseBlockDetailCard = useCallback(() => {
    setBlockDetailCardBlock(null);
  }, []);

  // Handler to replace a where block with a reference to an existing where block
  const handleSelectExistingWhereBlock = useCallback((targetBlockId: string, referenceBlock: Block) => {
    setBlocksAndDirty((blocks: Block[]) => blocks.map((b: Block) =>
      b.id === targetBlockId
        ? {
          id: b.id,
          type: 'where-ref',
          whereBlockId: referenceBlock.id,
          createdAt: b.createdAt,
          lastModified: new Date(),
          sortOrder: b.sortOrder,
        }
        : b
    ));
  }, [setBlocksAndDirty]);

  // Debounced scroll handler to prevent excessive re-renders
  const handleScroll = useCallback(() => {
    setIsScrolling(true)

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false)
    }, 150) // Debounce scroll events
  }, [])

  // Handler to delete a block and scroll to the next block after deletion
  const handleDeleteBlockAndScroll = useCallback((blockId: string) => {
    const index = blocks.findIndex(b => b.id === blockId);
    blockManager.deleteBlock(blockId);
    setTimeout(() => {
      // Scroll to the same index (now the next block, or last if at end)
      const newIndex = Math.min(index, blocks.length - 2); // -2 because one block is deleted
      if (newIndex >= 0) {
        virtuosoRef.current?.scrollToIndex({ index: newIndex, align: 'start' });
      }
    }, 0);
  }, [blocks, blockManager]);

  // Get directly linked blocks for a given block
  const getDirectlyLinkedBlockIds = useCallback((blockId: string): Set<string> => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return new Set();

    const connectedIds = new Set<string>();

    // Add blocks that this block links to
    if (block.linkedBlockIds) {
      block.linkedBlockIds.forEach(id => connectedIds.add(id));
    }

    // Add blocks that link to this block
    blocks.forEach(b => {
      if (b.linkedBlockIds?.includes(blockId)) {
        connectedIds.add(b.id);
      }
    });

    return connectedIds;
  }, [blocks]);

  // Handle block click for connection highlighting
  const handleBlockClick = useCallback((blockId: string) => {
    if (highlightedBlockId === blockId) {
      // Clicking the same block again removes highlighting
      setHighlightedBlockId(null);
      setHighlightedConnectedBlockIds(new Set());
    } else {
      // Clicking a different block highlights its connections
      const connectedIds = getDirectlyLinkedBlockIds(blockId);
      setHighlightedBlockId(blockId);
      setHighlightedConnectedBlockIds(connectedIds);
    }
  }, [highlightedBlockId, getDirectlyLinkedBlockIds]);

  // Virtuoso item renderer
  const renderGroup = useCallback((index: number) => {
    const [groupId, groupBlocks] = groupedBlocks[index];
    const groupContainerClass = "mb-4 px-4";
    return (
      <div key={groupId} className={groupContainerClass}>
        {groupBlocks.map((block, blockIdx) => {
          const shouldStick = groupBlocks.length > 1;
          const isFirstWhoInGroup = block.type === "who" && block.id === groupId;
          // Add extra top margin to the very first block in the list
          const isFirstBlockOverall = index === 0 && blockIdx === 0;
          const extraClass = isFirstBlockOverall ? "mt-6" : (isFirstWhoInGroup ? "mt-8" : "");

          // Determine if this block should be highlighted (click takes precedence over hover)
          const isHighlighted = highlightedBlockId === block.id;
          const isConnectedHighlighted = highlightedConnectedBlockIds.has(block.id);

          return (
            <div
              key={`${block.id}-${block.type}-${blockIdx}`}
              className={`block-container ${shouldStick ? "mb-0" : "mb-2"} ${extraClass}`}
              style={{ contain: 'layout style' }}
            >
              {previewMode === "edit" ? (
                <MemoizedBlockEditor
                  block={block}
                  index={blocks.indexOf(block)}
                  blocks={blocks}
                  previewMode={previewMode}
                  onUpdateBlock={blockManager.updateBlock}
                  onUpdateBlockImmediate={blockManager.updateBlockImmediate}
                  onDeleteBlock={handleDeleteBlockAndScroll}
                  onAddWhatBlock={blockManager.addWhatBlock}
                  onToggleTruthState={blockManager.toggleTruthState}
                  onToggleCheckState={blockManager.toggleCheckState}
                  onRemoveBlockImage={blockManager.removeBlockImage}
                  onUpdateBlockLanguage={blockManager.updateBlockLanguage}
                  onPaste={handlePaste}
                  isWhoBlockConnected={blockManager.isWhoBlockConnected}
                  countConnectedWhatBlocks={blockManager.countConnectedWhatBlocks}
                  countConnectedBlocks={blockManager.countConnectedBlocks}
                  countAllLinkedBlocksInGroup={blockManager.countAllLinkedBlocksInGroup}
                  getExistingWhereBlocks={getExistingWhereBlocks}
                  onAddBlockAndConnect={blockManager.addBlockAfter}
                  onConnectBlocks={blockManager.connectBlocks}
                  onDisconnectBlocks={blockManager.disconnectBlocks}
                  entityId={groupId}
                  groupId={groupId}
                  onDoubleClick={handleBlockDoubleClick}
                  onSelectExistingWhereBlock={handleSelectExistingWhereBlock}
                  onBlockClick={handleBlockClick}
                  isHighlighted={isHighlighted}
                  isConnectedHighlighted={isConnectedHighlighted}
                />
              ) : (
                <MemoizedBlockPreview
                  block={block}
                  index={blocks.indexOf(block)}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }, [groupedBlocks, previewMode, blocks, blockManager, getExistingWhereBlocks, handlePaste, handleBlockDoubleClick, handleSelectExistingWhereBlock, handleDeleteBlockAndScroll, handleBlockClick, highlightedBlockId, highlightedConnectedBlockIds]);

  // Shared handler for adding a block after another block (with scroll)
  const handleAddBlockAfterWithScroll = useCallback((type: Block["type"], afterBlockId?: string) => {
    blockManager.addBlockAfter(type, afterBlockId);
    setTimeout(() => {
      virtuosoRef.current?.scrollToIndex({ index: groupedBlocks.length });
    }, 100);
  }, [blockManager, groupedBlocks.length]);

  // Use this handler for the footer buttons
  const handleAddBlockAfter = useCallback((type: Block["type"]) => {
    handleAddBlockAfterWithScroll(type);
  }, [handleAddBlockAfterWithScroll]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex-1">
          {editingTitle ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleTitleSubmit()
              }}
            >
              <Input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSubmit}
                className="text-xl font-bold"
              />
            </form>
          ) : (
            <h1 className="text-xl font-bold cursor-pointer" onClick={() => setEditingTitle(true)}>
              {title || "Untitled Note"}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Save button removed - auto-save enabled */}
        </div>
      </div>

      <div className="flex items-center gap-2 p-2 border-b">
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <Button variant="ghost" size="icon" className="w-3 h-3 p-0 ml-1" onClick={() => removeTag(tag)}>
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Tag className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addTag()
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Add tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="h-8"
              />
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 w-full" style={{ contain: 'layout style paint', height: '100%' }}>
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%' }}
            totalCount={groupedBlocks.length}
            itemContent={renderGroup}
            overscan={100}
            components={{
              Footer: () => <div style={{ height: 8 }} />
            }}
          />
          {/* Use centralized logic for unlinked WHO blocks */}
          {unlinkedWhoBlocksCount > 0 && previewMode === "edit" && (
            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 mt-6">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                You have {unlinkedWhoBlocksCount} WHO {unlinkedWhoBlocksCount === 1 ? "block" : "blocks"} without
                linked WHAT blocks. Add WHAT blocks to use them in study modes.
              </AlertDescription>
            </Alert>
          )}
        </div>
        {/* Footer: Always visible, not inside Virtuoso */}
        {previewMode === "edit" && (
          <div className="p-2 ml-2 border-b flex flex-wrap gap-2 bg-white dark:bg-gray-900 z-10">
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("who")}> <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-blue-100 dark:bg-blue-900 rounded">W</span> WHO Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("what")}> <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-green-100 dark:bg-green-900 rounded">?</span> WHAT Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("where")}> <MapPin className="w-4 h-4 mr-2 text-teal-500" /> Where Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("when")}> <Clock className="w-4 h-4 mr-2 text-pink-500" /> When Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("how")}> <ArrowRight className="w-4 h-4 mr-2 text-orange-500" /> HOW Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("why")}> <HelpCircle className="w-4 h-4 mr-2 text-indigo-500" /> WHY Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("note")}> <FileText className="w-4 h-4 mr-2 text-purple-500" /> NOTE Block </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("image")}> <ImageIcon className="w-4 h-4 mr-2 text-amber-500" /> Image </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("video")}> <Video className="w-4 h-4 mr-2 text-red-500" /> Video </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("code")}> <Code className="w-4 h-4 mr-2 text-gray-500" /> Code </Button>
            <Button size="sm" variant="outline" onClick={() => handleAddBlockAfter("check")}> <CheckSquare className="w-4 h-4 mr-2 text-emerald-500" /> Check Block </Button>
          </div>
        )}
      </div>
      {/* Render GroupDetailModal if open */}
      {groupModal && (
        <GroupDetailModal
          groupBlocks={groupModal.groupBlocks}
          onClose={() => setGroupModal(null)}
          onSelectBlock={handleSelectBlockInModal}
        />
      )}
      {/* Render BlockDetailCard if open */}
      {blockDetailCardBlock && (
        <BlockDetailCard
          block={blockDetailCardBlock}
          onClose={handleCloseBlockDetailCard}
          blocks={blocks}
          onViewGroup={groupBlocks => {
            setBlockDetailCardBlock(null);
            setTimeout(() => {
              setGroupModal({ groupBlocks, selectedBlock: groupBlocks[0] });
            }, 0);
          }}
        />
      )}
    </div>
  )
}

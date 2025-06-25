"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Save, Tag, AlertCircle, ImageIcon, Video, Code, FileText, FunctionSquare, Plus, Link as LinkIcon, MapPin, ArrowRight } from "lucide-react"
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
import { BLOCK_TYPE_ICONS, BLOCK_TYPE_LABELS } from "@/lib/block-types"
import { BlockConnectionManager } from "@/lib/block-connections"
import { getConnectedGroup } from "@/hooks/use-block-connections"

interface EditorProps {
  note: Note
  updateNote: (note: Note) => void
}

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

  useEffect(() => {
    setTitle(note.title)
    // Auto-fix legacy WHO/WHAT links before setting blocks
    setBlocks(BlockConnectionManager.autoFixLegacyWhoWhatLinks(note.blocks))
    setTags(note.tags || [])
  }, [note])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [editingTitle])

  // Create a ref to store the timeout ID
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to save changes with debounce
  const debouncedSave = useCallback(() => {
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set a new timeout with a longer delay
    saveTimeoutRef.current = setTimeout(() => {
      updateNote({
        ...note,
        title,
        blocks,
        tags,
      });
    }, 1000); // Increased to 1000ms (1 second) debounce
  }, [note, title, blocks, tags, updateNote]);

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
            setBlocks(blocks.map(block => {
              if (block.id !== blockId) return block;
              if (block.type === "who" || block.type === "what" || block.type === "note") {
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
            setBlocks([...blocks, newBlock])
          }
        }
        reader.readAsDataURL(file)
        break
      }
    }
  }, [blocks])

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

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag("")
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleTitleSubmit = () => {
    setEditingTitle(false)
    // No need to explicitly call saveChanges as it will be triggered by the useEffect
  }

  // Helper to get all connected blocks in a sequence group (forward and backward)
  function getSequenceGroupBlocks(startBlock: Block, allBlocks: Block[]): Block[] {
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
    traverse(startBlock);
    return allBlocks.filter(b => visited.has(b.id));
  }

  // Toggle sequence mode for a block and all connected sequence blocks
  const handleToggleSequenceMode = (blockId: string) => {
    // This function is no longer needed as sequence mode is replaced by how blocks
    // Keeping for backward compatibility but it does nothing
  }

  // On initial load, migrate what blocks with sequence mode to how blocks
  useEffect(() => {
    // Only run if this note hasn't been migrated yet
    if (note.migratedToHow) {
      console.log(`[Migration] Note ${note.id} already migrated, skipping`);
      return;
    }

    console.log(`[Migration] Starting migration for note ${note.id}`);

    // Only run on first load of blocks
    setBlocks((prevBlocks) => {
      const migrated = [...prevBlocks];
      let hasChanges = false;
      let migratedCount = 0;

      console.log(`[Migration] Starting migration check for ${migrated.length} blocks`);

      // Find all what blocks that are part of sequence groups and convert them to how blocks
      for (let i = 0; i < migrated.length; i++) {
        const block = migrated[i];
        // Only migrate if this is a "what" block that hasn't been migrated yet
        if (block.type === "what" && block.linkedBlockIds && block.linkedBlockIds.length > 0 && !block.migratedToHow) {
          // Check if this what block is part of a sequence group
          const group = getSequenceGroupBlocks(block, migrated);
          if (group.length > 1) {
            console.log(`[Migration] Converting block ${block.id} from "what" to "how" (group size: ${group.length})`);
            // Convert this what block to a how block
            migrated[i] = {
              ...block,
              type: "how" as const,
              migratedToHow: true, // Mark as migrated
              // Remove sequence mode properties as they're no longer needed
              sequenceMode: undefined,
              sequenceStart: undefined
            };
            hasChanges = true;
            migratedCount++;
          }
        }
      }

      // If we made changes, also clean up sequence mode from who blocks
      if (hasChanges) {
        console.log(`[Migration] Migrated ${migratedCount} blocks, cleaning up sequence mode from WHO blocks`);
        for (let i = 0; i < migrated.length; i++) {
          const block = migrated[i];
          if (block.type === "who") {
            migrated[i] = {
              ...block,
              sequenceMode: undefined,
              sequenceStart: undefined
            };
          }
        }

        // Force save the migrated blocks to database immediately
        setTimeout(() => {
          updateNote({
            ...note,
            title,
            blocks: migrated,
            tags,
            migratedToHow: true, // Mark the note as migrated
          });
        }, 0);
      } else {
        console.log(`[Migration] No blocks needed migration, marking note as migrated`);
        // Even if no blocks needed migration, mark the note as migrated
        setTimeout(() => {
          updateNote({
            ...note,
            migratedToHow: true,
          });
        }, 0);
      }

      return migrated;
    });
  }, [note.id, note.migratedToHow, updateNote, note, title, tags]);

  // Remove computeBlockEntities and entityMap
  // Add groupMap: blockId -> groupId (lowest id in group)
  function computeGroupMap(blocks: Block[]): Record<string, string> {
    const groupMap: Record<string, string> = {};
    const visited = new Set<string>();
    for (const block of blocks) {
      if (visited.has(block.id)) continue;
      const group = getConnectedGroup(block, blocks);
      if (group.length > 1) {
        const groupId = group.map(b => b.id).sort()[0];
        for (const b of group) {
          groupMap[b.id] = groupId;
          visited.add(b.id);
        }
      } else {
        groupMap[block.id] = block.id;
        visited.add(block.id);
      }
    }
    return groupMap;
  }

  const groupMap = computeGroupMap(blocks);

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

      {/* Fixed scrolling container */}
      <div className="flex-1 overflow-y-auto" ref={editorRef}>
        <div className="w-full px-4">
          <div>
            {Object.entries(
              blocks.reduce((acc, block) => {
                const groupId = groupMap[block.id];
                if (!acc[groupId]) acc[groupId] = [];
                acc[groupId].push(block);
                return acc;
              }, {} as Record<string, Block[]>)
            ).map(([groupId, groupBlocks]) => {
              // Remove background and border from group container, keep only spacing
              const groupContainerClass = "mb-4";
              return (
                <div key={groupId} className={groupContainerClass}>
                  {groupBlocks.map((block, index) => {
                    const connectionState = BlockConnectionManager.getConnectionState(block, blocks.indexOf(block), blocks);
                    const shouldStick = groupBlocks.length > 1;
                    const isFirstWhoInGroup = block.type === "who" && block.id === groupId;
                    const blockClass = BlockConnectionManager.getBlockClasses(block, connectionState, shouldStick);
                    const extraClass = isFirstWhoInGroup ? "mt-8" : "";
                    // Remove border radius from block
                    return (
                      <div key={block.id} className={`${blockClass} ${shouldStick ? "mb-0" : "mb-2"} ${extraClass}`}>
                        {previewMode === "edit" ? (
                          <BlockEditor
                            block={block}
                            index={blocks.indexOf(block)}
                            blocks={blocks}
                            previewMode={previewMode}
                            onUpdateBlock={blockManager.updateBlock}
                            onUpdateBlockImmediate={blockManager.updateBlockImmediate}
                            onDeleteBlock={blockManager.deleteBlock}
                            onAddWhatBlock={blockManager.addWhatBlock}
                            onToggleTruthState={blockManager.toggleTruthState}
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
                          />
                        ) : (
                          <BlockPreview
                            block={block}
                            index={blocks.indexOf(block)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Use centralized logic for unlinked WHO blocks */}
          {BlockConnectionManager.getUnlinkedWhoBlocks(blocks).length > 0 && previewMode === "edit" && (
            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 mt-6">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                You have {BlockConnectionManager.getUnlinkedWhoBlocks(blocks).length} WHO {BlockConnectionManager.getUnlinkedWhoBlocks(blocks).length === 1 ? "block" : "blocks"} without
                linked WHAT blocks. Add WHAT blocks to use them in study modes.
              </AlertDescription>
            </Alert>
          )}

          {previewMode === "edit" && (
            <div className="p-2 border-b flex flex-wrap gap-2 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("who")}>
                <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-blue-100 dark:bg-blue-900 rounded">
                  W
                </span>
                WHO Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("what")}>
                <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-green-100 dark:bg-green-900 rounded">
                  ?
                </span>
                WHAT Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("how")}>
                <ArrowRight className="w-4 h-4 mr-2 text-orange-500" />
                HOW Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("where")}>
                <MapPin className="w-4 h-4 mr-2 text-teal-500" />
                Where Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("note")}>
                <FileText className="w-4 h-4 mr-2 text-purple-500" />
                NOTE Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("image")}>
                <ImageIcon className="w-4 h-4 mr-2 text-amber-500" />
                Image
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("video")}>
                <Video className="w-4 h-4 mr-2 text-red-500" />
                Video
              </Button>
              <Button size="sm" variant="outline" onClick={() => blockManager.addBlockAfter("code")}>
                <Code className="w-4 h-4 mr-2 text-gray-500" />
                Code
              </Button>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

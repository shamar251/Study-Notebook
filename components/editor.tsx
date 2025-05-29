"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Save, Tag, AlertCircle, ImageIcon, Video, Code, FileText, FunctionSquare, Plus, Link as LinkIcon } from "lucide-react"
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

interface EditorProps {
  note: Note
  updateNote: (note: Note) => void
}

// Add MathInput component
function MathInput({ value, onChange, placeholder, isMathMode, onPaste, readOnly }: { value: string; onChange: (value: string) => void; placeholder: string; isMathMode?: boolean; onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void; readOnly?: boolean }) {
  const [isMathModeInternal, setIsMathModeInternal] = useState(isMathMode || false)
  const [mathError, setMathError] = useState<string | null>(null)

  useEffect(() => {
    setIsMathModeInternal(!!isMathMode)
  }, [isMathMode])

  const handleChange = (newValue: string) => {
    onChange(newValue)
    if (isMathModeInternal) {
      try {
        if (newValue) {
          setMathError(null)
        }
      } catch (error) {
        setMathError("Invalid math expression")
      }
    }
  }

  return (
    <div className="space-y-2">
      {/* Math toggle button removed; only display math preview if in math mode */}
      {isMathModeInternal ? (
        <div className="space-y-2">
          <Textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onPaste={onPaste}
            placeholder={placeholder}
            className={`min-h-[60px] resize-y font-mono ${readOnly ? 'focus-visible:ring-0 focus-visible:border-none border-gray-300' : ''}`}
            readOnly={readOnly}
          />
          {value && (
            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
              <InlineMath math={value.replace(/^\/\?\$/, '').replace(/\$$/, '')} />
            </div>
          )}
          {mathError && (
            <p className="text-sm text-red-500">{mathError}</p>
          )}
        </div>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onPaste={onPaste}
          placeholder={placeholder}
          className={`min-h-[60px] resize-y ${readOnly ? 'focus-visible:ring-0 focus-visible:border-none border-gray-300' : ''}`}
          readOnly={readOnly}
        />
      )}
    </div>
  )
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

  useEffect(() => {
    setTitle(note.title)
    setBlocks(note.blocks)
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

    // Set a new timeout
    saveTimeoutRef.current = setTimeout(() => {
      updateNote({
        ...note,
        title,
        blocks,
        tags,
      });
    }, 300); // 300ms debounce
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

  const addBlock = (type: Block["type"]) => {
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      type,
      content: "",
      math: false,
    }

    setBlocks([...blocks, newBlock])

    // If it's a "who" block, prompt for a "what" block
    if (type === "who") {
      setShowWhatPrompt(newBlock.id)
    }
  }

  // Add a new function to handle linking multiple what blocks
  const linkWhatBlocks = (sourceBlockId: string, targetBlockId: string) => {
    setBlocks(blocks.map(block => {
      if (block.id === sourceBlockId) {
        return {
          ...block,
          linkedBlockIds: [...(block.linkedBlockIds || []), targetBlockId]
        };
      }
      return block;
    }));
  };

  // Modify the addWhatBlock function to support multiple links
  const addWhatBlock = (whoBlockId: string) => {
    const whatBlock: Block = {
      id: `block-${Date.now()}`,
      type: "what",
      content: "",
      math: false,
    };

    // Update the who block to link to this what block
    const updatedBlocks = blocks.map((block) =>
      block.id === whoBlockId ? {
        ...block,
        linkedBlockIds: [...(block.linkedBlockIds || []), whatBlock.id]
      } : block
    );

    // Add the what block after the who block
    const whoIndex = updatedBlocks.findIndex((block) => block.id === whoBlockId);
    updatedBlocks.splice(whoIndex + 1, 0, whatBlock);

    setBlocks(updatedBlocks);
    setShowWhatPrompt(null);
    // Force save after adding a new block
    updateNote({
      ...note,
      title,
      blocks: updatedBlocks,
      tags,
    });
  };

  // For content changes (debounced save)
  const updateBlock = (id: string, content: string, math?: boolean) => {
    setBlocks(blocks =>
      blocks.map((block) =>
        block.id === id ? { ...block, content, ...(math !== undefined ? { math } : {}) } : block
      )
    );
  }

  // For toggles (immediate save)
  const updateBlockImmediate = (id: string, math: boolean) => {
    setBlocks(blocks => {
      const newBlocks = blocks.map((block) =>
        block.id === id ? { ...block, math } : block
      );
      updateNote({
        ...note,
        title,
        blocks: newBlocks,
        tags,
      });
      return newBlocks;
    });
  }

  const deleteBlock = (id: string) => {
    const blockToDelete = blocks.find((block) => block.id === id);
    if (!blockToDelete) return;

    if (blockToDelete.type === "who" && blockToDelete.linkedBlockIds?.length) {
      setBlocks(blocks.filter((block) =>
        block.id !== id && !blockToDelete.linkedBlockIds?.includes(block.id)
      ));
    } else if (blockToDelete.type === "what") {
      const linkedWhoBlocks = blocks.filter((block) =>
        block.linkedBlockIds?.includes(blockToDelete.id)
      );
      if (linkedWhoBlocks.length > 0) {
        setBlocks(
          blocks
            .map((block) => {
              if (block.linkedBlockIds?.includes(blockToDelete.id)) {
                return {
                  ...block,
                  linkedBlockIds: block.linkedBlockIds.filter((linkedId) => linkedId !== blockToDelete.id)
                };
              }
              return block;
            })
            .filter((block) => block.id !== blockToDelete.id)
        );
      } else {
        setBlocks(blocks.filter((block) => block.id !== id));
      }
    } else {
      setBlocks(blocks.filter((block) => block.id !== id));
    }
  }

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

  // Add the renderLinkedBlocks function
  const renderLinkedBlocks = (block: Block) => {
    if (block.type !== "who" || !block.linkedBlockIds?.length) return null;

    return (
      <div className="mt-2 space-y-2">
        {block.linkedBlockIds.map((linkedId: string) => {
          const linkedBlock = blocks.find(b => b.id === linkedId);
          if (!linkedBlock) return null;

          return (
            <div key={linkedId} className="ml-4 pl-4 border-l-2 border-green-500">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30">
                  <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">?</span>
                  <span>WHAT</span>
                </Badge>
                <MathInput
                  value={linkedBlock.content}
                  onChange={(value) => updateBlock(linkedId, value, linkedBlock.math)}
                  placeholder="Enter a definition or explanation..."
                  isMathMode={linkedBlock.math}
                  onPaste={(e) => handlePaste(e, linkedId)}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBlockEditor = (block: Block, index: number) => {
    const blockTypeColors: Record<Block["type"], string> = {
      who: "border-blue-500 bg-blue-50 dark:bg-blue-900/10",
      what: "border-green-500 bg-green-50 dark:bg-green-900/10",
      note: "border-purple-500 bg-purple-50 dark:bg-purple-900/10",
      image: "border-amber-500 bg-amber-50 dark:bg-amber-900/10",
      video: "border-red-500 bg-red-50 dark:bg-red-900/10",
      code: "border-gray-500 bg-gray-50 dark:bg-gray-700/30",
    }

    const blockTypeLabels: Record<Block["type"], string> = {
      who: "WHO",
      what: "WHAT",
      note: "NOTE",
      image: "IMAGE",
      video: "VIDEO",
      code: "CODE",
    }

    const blockTypeIcons: Record<Block["type"], React.ReactNode> = {
      who: <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">W</span>,
      what: <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">?</span>,
      note: <FileText className="w-4 h-4" />,
      image: <ImageIcon className="w-4 h-4" />,
      video: <Video className="w-4 h-4" />,
      code: <Code className="w-4 h-4" />,
    }

    const renderBlockContent = () => {
      switch (block.type) {
        case "who":
          return (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-full min-w-[350px] md:min-w-[500px]">
                  <MathInput
                    value={block.content}
                    onChange={(value) => updateBlock(block.id, value, block.math)}
                    placeholder="Enter a person, place, or term..."
                    isMathMode={block.math}
                    onPaste={(e) => handlePaste(e, block.id)}
                  />
                </div>
              </div>
              {block.image && (
                <div className="mt-2 relative group">
                  <img
                    src={block.image}
                    alt="Block image"
                    className="max-w-full h-auto rounded-md"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                      onClick={() => setBlocks(blocks.map(b => b.id === block.id ? { ...b, image: undefined } : b))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        case "what":
          return (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-full min-w-[350px] md:min-w-[500px]">
                  <MathInput
                    value={block.content}
                    onChange={(value) => updateBlock(block.id, value, block.math)}
                    placeholder="Enter a definition or explanation..."
                    isMathMode={block.math}
                    onPaste={(e) => handlePaste(e, block.id)}
                    readOnly={block.truthState === "true" || block.truthState === "false"}
                  />
                </div>
              </div>
              {block.image && (
                <div className="mt-2 relative group">
                  <img
                    src={block.image}
                    alt="Block image"
                    className="max-w-full h-auto rounded-md"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                      onClick={() => setBlocks(blocks.map(b => b.id === block.id ? { ...b, image: undefined } : b))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        case "note":
          return (
            <div>
              <MathInput
                value={block.content}
                onChange={(value) => updateBlock(block.id, value, block.math)}
                placeholder="Enter additional notes or information... (or paste an image)"
                isMathMode={block.math}
                onPaste={(e) => handlePaste(e, block.id)}
              />
              {block.image && (
                <div className="mt-2 relative group">
                  <img
                    src={block.image}
                    alt="Block image"
                    className="max-w-full h-auto rounded-md"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                      onClick={() => setBlocks(blocks.map(b => b.id === block.id ? { ...b, image: undefined } : b))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        case "image":
          return (
            <div className="space-y-2">
              {!block.content && (
                <Input
                  type="text"
                  value={block.content}
                  onChange={(e) => updateBlock(block.id, e.target.value)}
                  onPaste={(e) => handlePaste(e.nativeEvent, block.id)}
                  placeholder="Enter image URL or paste an image..."
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
                />
              )}
              {block.content && (
                <div className="mt-2 relative group">
                  <img
                    src={block.content}
                    alt="Note image"
                    className="max-w-full h-auto rounded-md"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                      onClick={() => updateBlock(block.id, "")}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        case "video":
          return (
            <div className="space-y-2">
              <Input
                type="text"
                value={block.content}
                onChange={(e) => updateBlock(block.id, e.target.value)}
                onPaste={(e) => handlePaste(e.nativeEvent, block.id)}
                placeholder="Enter video URL (YouTube, Vimeo, etc.)... (or paste an image)"
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
              />
              {block.content && !block.content.startsWith('data:image') && (
                <div className="mt-2">
                  <div className="aspect-video rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Video className="w-8 h-8 text-gray-400" />
                    <span className="ml-2 text-gray-500">Video Embed Placeholder</span>
                  </div>
                </div>
              )}
              {block.content && block.content.startsWith('data:image') && (
                <div className="mt-2 relative group">
                  <img
                    src={block.content}
                    alt="Note image"
                    className="max-w-full h-auto rounded-md"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                      onClick={() => updateBlock(block.id, "")}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        case "code":
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Input
                  type="text"
                  value={block.language || ""}
                  onChange={(e) => {
                    const updatedBlock = { ...block, language: e.target.value }
                    setBlocks(blocks.map((b) => (b.id === block.id ? updatedBlock : b)))
                  }}
                  placeholder="Language (python, javascript, etc.)"
                  className="w-40 h-7 text-xs"
                />
              </div>
              <Textarea
                value={block.content}
                onChange={(e) => updateBlock(block.id, e.target.value)}
                onPaste={(e) => handlePaste(e.nativeEvent, block.id)}
                className="min-h-[100px] resize-y font-mono text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
                placeholder="Enter code here... (or paste an image)"
              />
              {block.content && block.content.startsWith('data:image') && (
                <div className="mt-2 relative group">
                  <img
                    src={block.content}
                    alt="Note image"
                    className="max-w-full h-auto rounded-md"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
                      onClick={() => updateBlock(block.id, "")}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        default:
          return null
      }
    }

    let isConnected = false;
    let whoConnectedToPrev = false;
    let whoConnectedToNext = false;

    if (block.type === "what" && index > 0) {
      const prevBlock = blocks[index - 1];
      if ((prevBlock.type === "who" || prevBlock.type === "what") && prevBlock.linkedBlockIds?.includes(block.id)) {
        isConnected = true;
      }
    }
    if (block.type === "who" && index > 0) {
      const prevBlock = blocks[index - 1];
      if (prevBlock.type === "what" && prevBlock.linkedBlockIds?.includes(block.id)) {
        whoConnectedToPrev = true;
      }
    }
    if (block.type === "who" && index < blocks.length - 1) {
      const nextBlock = blocks[index + 1];
      if (nextBlock.type === "what" && block.linkedBlockIds?.includes(nextBlock.id)) {
        whoConnectedToNext = true;
      }
    }

    const blockClass = block.type === "who"
      ? (whoConnectedToPrev
        ? (whoConnectedToNext ? "mt-0 mb-0" : "mt-0 mb-4")
        : ("mt-4 mb-4"))
      : (isConnected ? "m-0 p-0" : "mt-4 mb-4");

    return (
      <div
        className={`group relative border-l-4 ${blockTypeColors[block.type]} pl-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50`}
      >
        <div className="flex items-start gap-2">
          <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {(block.type === "who") ? (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 cursor-pointer"
                  onClick={() => {
                    // Find the last WHAT block in the chain
                    let lastWhatId: string | null = null;
                    let current = block;
                    while (current && Array.isArray(current.linkedBlockIds) && current.linkedBlockIds.length > 0) {
                      // Find the last linked WHAT block
                      const next = blocks.find(b => b.id === current.linkedBlockIds![current.linkedBlockIds!.length - 1] && b.type === "what");
                      if (!next) break;
                      lastWhatId = next.id;
                      current = next;
                    }

                    // --- MIGRATION LOGIC FOR OLD STRUCTURE ---
                    let migratedBlocks = blocks;
                    if (!Array.isArray(block.linkedBlockIds) || block.linkedBlockIds.length === 0) {
                      // Check if the next block is a WHAT block (old structure)
                      const idx = blocks.findIndex(b => b.id === block.id);
                      if (idx !== -1 && idx < blocks.length - 1) {
                        const nextBlock = blocks[idx + 1];
                        if (nextBlock.type === "what") {
                          // Migrate: add the adjacent WHAT block to linkedBlockIds
                          migratedBlocks = blocks.map(b =>
                            b.id === block.id
                              ? { ...b, linkedBlockIds: [nextBlock.id] }
                              : b
                          );
                          lastWhatId = nextBlock.id;
                        }
                      }
                    }
                    // --- END MIGRATION LOGIC ---

                    const newWhatBlock: Block = {
                      id: `block-${Date.now()}`,
                      type: "what",
                      content: "",
                      math: false,
                    };
                    setBlocks(blocks => {
                      let updatedBlocks = migratedBlocks;
                      let idx;
                      if (lastWhatId) {
                        updatedBlocks = updatedBlocks.map(b =>
                          b.id === lastWhatId
                            ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newWhatBlock.id] }
                            : b
                        );
                        idx = updatedBlocks.findIndex(b => b.id === lastWhatId);
                        updatedBlocks.splice(idx + 1, 0, newWhatBlock);
                      } else {
                        updatedBlocks = updatedBlocks.map(b =>
                          b.id === block.id
                            ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newWhatBlock.id] }
                            : b
                        );
                        idx = updatedBlocks.findIndex(b => b.id === block.id);
                        updatedBlocks.splice(idx + 1, 0, newWhatBlock);
                      }
                      // Force save after adding a new block
                      updateNote({
                        ...note,
                        title,
                        blocks: updatedBlocks,
                        tags,
                      });
                      return updatedBlocks;
                    });
                  }}
                >
                  {blockTypeIcons[block.type]}
                  <span>{blockTypeLabels[block.type]}</span>
                </Badge>
              ) : (block.type === "what") ? (
                <Badge
                  variant="outline"
                  className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 cursor-pointer"
                  onClick={() => {
                    // Add a new WHAT block linked to this WHAT block
                    const newWhatBlock: Block = {
                      id: `block-${Date.now()}`,
                      type: "what",
                      content: "",
                      math: false,
                    };
                    setBlocks(blocks => {
                      const updatedBlocks = blocks.map(b =>
                        b.id === block.id
                          ? { ...b, linkedBlockIds: [...(b.linkedBlockIds || []), newWhatBlock.id] }
                          : b
                      );
                      // Insert the new WHAT block after the current one
                      const idx = updatedBlocks.findIndex(b => b.id === block.id);
                      updatedBlocks.splice(idx + 1, 0, newWhatBlock);
                      // Force save after adding a new block
                      updateNote({
                        ...note,
                        title,
                        blocks: updatedBlocks,
                        tags,
                      });
                      return updatedBlocks;
                    });
                  }}
                >
                  {blockTypeIcons[block.type]}
                  <span>{blockTypeLabels[block.type]}</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 ${block.type === "note"
                    ? "bg-purple-100 dark:bg-purple-900/30"
                    : block.type === "image"
                      ? "bg-amber-100 dark:bg-amber-900/30"
                      : block.type === "video"
                        ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-gray-100 dark:bg-gray-700"
                    }`}
                >
                  {blockTypeIcons[block.type]}
                  <span>{blockTypeLabels[block.type]}</span>
                </Badge>
              )}
              {(block.type === "who" || block.type === "what" || block.type === "note") && (
                <button
                  onClick={() => updateBlockImmediate(block.id, !block.math)}
                  title={block.math ? "Math mode enabled" : "Enable math mode"}
                  className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors
                    ${block.type === "who"
                      ? block.math
                        ? "bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
                        : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                      : block.type === "what"
                        ? block.math
                          ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                          : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                        : block.type === "note"
                          ? block.math
                            ? "bg-purple-100 border-purple-500 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200"
                            : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                          : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    }`}
                  style={{ verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center' }}
                >
                  <FunctionSquare className="w-4 h-4" />
                </button>
              )}
              {block.type === "who" && (
                <span className="flex items-center ml-auto">
                  {isWhoBlockConnected(block, blocks) ? (
                    <span className="flex items-center text-xs text-black dark:text-white px-1 py-0.5">
                      {Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0
                        ? countConnectedWhatBlocks(block, blocks)
                        : 1}
                      <LinkIcon className="w-3.5 h-3.5 ml-1 inline" />

                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400"><LinkIcon className="w-3.5 h-3.5 ml-1 inline " /></span>
                  )}
                </span>
              )}
              {block.type === "what" && (
                <button
                  onClick={() => {
                    setBlocks(blocks => {
                      return blocks.map(b => {
                        if (b.id !== block.id) return b;
                        // Cycle: undefined → true → false → undefined (restore original content)
                        if (!b.truthState) {
                          // Save original content and set to True
                          return { ...b, truthState: "true", originalContent: b.content, content: "True" };
                        } else if (b.truthState === "true") {
                          // Set to False
                          return { ...b, truthState: "false", originalContent: b.originalContent ?? b.content, content: "False" };
                        } else {
                          // Restore original content and clear truthState
                          const { truthState, originalContent, ...rest } = b;
                          return { ...rest, content: b.originalContent ?? b.content };
                        }
                      });
                    });
                  }}
                  title={
                    block.truthState === "true"
                      ? "True statement (click to set False)"
                      : block.truthState === "false"
                        ? "False statement (click to restore)"
                        : "Toggle to True/False statement"
                  }
                  className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold border transition-colors
                    ${block.truthState === "true"
                      ? "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                      : block.truthState === "false"
                        ? "bg-red-100 border-red-500 text-red-800 dark:bg-red-900/30 dark:text-red-200"
                        : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                    }`}
                  style={{ verticalAlign: 'middle', display: 'inline-flex', alignItems: 'center', minWidth: 28, justifyContent: 'center' }}
                >
                  {block.truthState === "true" ? 'T' : block.truthState === "false" ? 'F' : 'T/F'}
                </button>
              )}
            </div>
            {renderBlockContent()}
          </div>
          <div className="flex-none">
            {previewMode === "edit" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={() => deleteBlock(block.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {showWhatPrompt === block.id && (
          <div className="mt-3 ml-10 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Add a WHAT block to link with this WHO block?
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                WHO/WHAT pairs are used to create flashcards and quizzes
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowWhatPrompt(null)}>
                Skip
              </Button>
              <Button size="sm" onClick={() => addWhatBlock(block.id)}>
                Add WHAT Block
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderBlockPreview = (block: Block, index: number) => {
    switch (block.type) {
      case "who":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
            <div className="flex-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-1">WHO</h3>
              {block.content.includes('$') ? (
                <InlineMath math={block.content.replace(/^\$/, '').replace(/\$$/, '')} />
              ) : (
                <p>{block.content}</p>
              )}
            </div>
          </div>
        )
      case "what":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
            <div className="flex-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
              <h3 className="font-bold text-green-800 dark:text-green-300 mb-1">WHAT</h3>
              {block.content.includes('$') ? (
                <InlineMath math={block.content.replace(/^\$/, '').replace(/\$$/, '')} />
              ) : (
                <p>{block.content}</p>
              )}
            </div>
          </div>
        )
      case "note":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
            <div className="flex-1 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md">
              <h3 className="font-bold text-purple-800 dark:text-purple-300 mb-1">NOTE</h3>
              <p className="whitespace-pre-wrap">{block.content}</p>
            </div>
          </div>
        )
      case "image":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
            <div className="flex-1 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-1">IMAGE</h3>
              {block.content && (
                <div className="mt-2">
                  <img
                    src={block.content || "/placeholder.svg?height=200&width=400"}
                    alt="Note image"
                    className="max-w-full h-auto rounded-md"
                  />
                </div>
              )}
            </div>
          </div>
        )
      case "video":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
            <div className="flex-1 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
              <h3 className="font-bold text-red-800 dark:text-red-300 mb-1">VIDEO</h3>
              {block.content && (
                <div className="mt-2">
                  <div className="aspect-video rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <Video className="w-8 h-8 text-gray-400" />
                    <span className="ml-2 text-gray-500">Video Embed Placeholder</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      case "code":
        return (
          <div className="flex items-start gap-2">
            <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
            <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-gray-800 dark:text-gray-300">CODE</h3>
                {block.language && (
                  <Badge variant="outline" className="text-xs">
                    {block.language}
                  </Badge>
                )}
              </div>
              <pre className="p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto">
                <code className="text-sm font-mono">{block.content}</code>
              </pre>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  // Helper to check if a WHO block is connected (old or new structure)
  function isWhoBlockConnected(block: Block, blocks: Block[]): boolean {
    // New structure: linkedBlockIds
    if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) return true;
    // Old structure: next block is WHAT
    const idx = blocks.findIndex(b => b.id === block.id);
    if (idx !== -1 && idx < blocks.length - 1) {
      const nextBlock = blocks[idx + 1];
      if (nextBlock.type === "what") return true;
    }
    return false;
  }

  // Update the unlinkedWhoBlocks logic:
  const unlinkedWhoBlocks = blocks.filter((block) => block.type === "who" && !isWhoBlockConnected(block, blocks))

  // Replace the entire return statement with this fixed version that ensures proper scrolling
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

      {/* Fixed block addition buttons */}


      {/* Fixed scrolling container */}
      <div className="flex-1 overflow-y-auto" ref={editorRef}>
        <div className="w-full px-4 py-4">
          <div>
            {blocks.map((block, index) => {
              let isConnected = false;
              let whoConnectedToPrev = false;
              let whoConnectedToNext = false;

              if (block.type === "what" && index > 0) {
                const prevBlock = blocks[index - 1];
                if ((prevBlock.type === "who" || prevBlock.type === "what") && prevBlock.linkedBlockIds?.includes(block.id)) {
                  isConnected = true;
                }
              }
              if (block.type === "who" && index > 0) {
                const prevBlock = blocks[index - 1];
                if (prevBlock.type === "what" && prevBlock.linkedBlockIds?.includes(block.id)) {
                  whoConnectedToPrev = true;
                }
              }
              if (block.type === "who" && index < blocks.length - 1) {
                const nextBlock = blocks[index + 1];
                if (nextBlock.type === "what" && block.linkedBlockIds?.includes(nextBlock.id)) {
                  whoConnectedToNext = true;
                }
              }

              const blockClass = block.type === "who"
                ? (whoConnectedToPrev
                  ? (whoConnectedToNext ? "mt-0 mb-0" : "mt-0 mb-4")
                  : ("mt-4 mb-4"))
                : (isConnected ? "m-0 p-0" : "mt-4 mb-4");

              return (
                <div key={block.id} className={blockClass}>
                  {previewMode === "edit" ? renderBlockEditor(block, index) : renderBlockPreview(block, index)}
                </div>
              );
            })}
          </div>

          {unlinkedWhoBlocks.length > 0 && previewMode === "edit" && (
            <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 mt-6">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                You have {unlinkedWhoBlocks.length} WHO {unlinkedWhoBlocks.length === 1 ? "block" : "blocks"} without
                linked WHAT blocks. Add WHAT blocks to use them in study modes.
              </AlertDescription>
            </Alert>
          )}

          {previewMode === "edit" && (
            <div className="p-2 border-b flex flex-wrap gap-2 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <Button size="sm" variant="outline" onClick={() => addBlock("who")}>
                <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-blue-100 dark:bg-blue-900 rounded">
                  W
                </span>
                WHO Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => addBlock("what")}>
                <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-green-100 dark:bg-green-900 rounded">
                  ?
                </span>
                WHAT Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => addBlock("note")}>
                <FileText className="w-4 h-4 mr-2 text-purple-500" />
                NOTE Block
              </Button>
              <Button size="sm" variant="outline" onClick={() => addBlock("image")}>
                <ImageIcon className="w-4 h-4 mr-2 text-amber-500" />
                Image
              </Button>
              <Button size="sm" variant="outline" onClick={() => addBlock("video")}>
                <Video className="w-4 h-4 mr-2 text-red-500" />
                Video
              </Button>
              <Button size="sm" variant="outline" onClick={() => addBlock("code")}>
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

function countConnectedWhatBlocks(block: Block, allBlocks: Block[], visited = new Set<string>()): number {
  if (!block.linkedBlockIds || block.linkedBlockIds.length === 0) return 0;
  let count = 0;
  for (const id of block.linkedBlockIds) {
    if (visited.has(id)) continue;
    visited.add(id);
    const linked = allBlocks.find(b => b.id === id && b.type === "what");
    if (linked) {
      count += 1 + countConnectedWhatBlocks(linked, allBlocks, visited);
    }
  }
  return count;
}

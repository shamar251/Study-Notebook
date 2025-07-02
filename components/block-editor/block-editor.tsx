"use client"

import React, { useMemo, useCallback, useState, useEffect, useRef } from "react"
import { X, FunctionSquare, Link as LinkIcon, Shuffle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { InlineMath } from 'react-katex'
import type { Block } from "@/lib/db"
import { MathInput } from "@/components/block-editor/math-input"
import {
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_ICONS,
  BLOCK_TYPE_PLACEHOLDERS,
  BLOCK_TYPE_BADGE_CLASSES
} from "@/lib/block-types"
import { WhereBlockEditor } from "./blocks/where-block-editor"
import { WhyBlockEditor } from "./blocks/why-block-editor"
import { WhenBlockEditor } from "./blocks/when-block-editor"
import { BlockConnectionManager } from "@/lib/block-connections"
import { BlockConnectionManager as BlockConnectionManagerUI } from "@/components/block-connection-manager"
import { ConnectionOptions } from "@/components/connection-options"
import { getConnectedGroup } from "@/hooks/use-block-connections"

interface BlockEditorProps {
  block: Block
  index: number
  blocks: Block[]
  previewMode: "edit" | "preview"
  onUpdateBlock: (
    id: string,
    content: string,
    math?: boolean,
    location?: Block["location"]
  ) => void
  onUpdateBlockImmediate: (id: string, math: boolean) => void
  onDeleteBlock: (id: string) => void
  onAddWhatBlock: (whoBlockId: string) => void
  onToggleTruthState: (blockId: string) => void
  onRemoveBlockImage: (blockId: string) => void
  onUpdateBlockLanguage: (blockId: string, language: string) => void
  onPaste: (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    blockId?: string
  ) => void
  isWhoBlockConnected: (block: Block, blocks: Block[]) => boolean
  countConnectedWhatBlocks: (block: Block, blocks: Block[]) => number
  countConnectedBlocks: (block: Block, blocks: Block[]) => number
  getExistingWhereBlocks: () => Block[]
  onAddBlockAndConnect?: (type: Block["type"], parentBlockId?: string) => void
  onConnectBlocks?: (sourceBlockId: string, targetBlockId: string) => void
  onDisconnectBlocks?: (sourceBlockId: string, targetBlockId: string) => void
  entityId?: string
  groupId?: string
  countAllLinkedBlocksInGroup: (block: Block, blocks: Block[]) => number
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  onDoubleClick?: (block: Block) => void
  onSelectExistingWhereBlock?: (targetBlockId: string, referenceBlock: Block) => void
}

// Lazy loading hook for images
const useLazyImage = (src: string | undefined, threshold: number = 0.1) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number, height: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!src || !imgRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin: '200px 0px' // Start loading 200px before the image comes into view
      }
    );

    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [src, threshold]);

  useEffect(() => {
    if (!isInView || !src) return;

    const img = new Image();
    img.onload = () => {
      setIsLoaded(true);
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = src;

    return () => {
      img.onload = null;
    };
  }, [isInView, src]);

  return { imgRef, isLoaded, isInView, imageDimensions };
};

// Lazy image renderer component
const LazyImageRenderer = React.memo(({
  src,
  alt,
  onRemove
}: {
  src: string;
  alt: string;
  onRemove: () => void;
}) => {
  const { imgRef, isLoaded, isInView, imageDimensions } = useLazyImage(src);

  // Calculate placeholder height based on image dimensions or use default
  const placeholderHeight = imageDimensions
    ? Math.min(400, Math.max(200, (imageDimensions.height / imageDimensions.width) * 400))
    : 200;

  return (
    <div className="mt-2 relative group" style={{ minHeight: placeholderHeight }}>
      {!isInView && (
        <div
          ref={imgRef}
          className="max-w-full bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center"
          style={{ height: placeholderHeight }}
        >
          <span className="text-gray-500 text-sm">Loading image...</span>
        </div>
      )}
      {isInView && !isLoaded && (
        <div
          className="max-w-full bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center"
          style={{ height: placeholderHeight }}
        >
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
            <span className="text-gray-500 text-sm">Loading image...</span>
          </div>
        </div>
      )}
      {isLoaded && (
        <img
          src={src}
          alt={alt}
          className="max-w-full h-auto rounded-md"
          style={{
            contain: 'layout style',
            willChange: 'auto'
          }}
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800"
          onClick={onRemove}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
});

LazyImageRenderer.displayName = 'LazyImageRenderer';

// Helper to determine if this block is in a linked group (any type of connection)
function isBlockInLinkedGroup(block: Block, allBlocks: Block[]): boolean {
  // Check if this block has any connections or is connected to by others
  const hasOutgoingConnections = block.linkedBlockIds && block.linkedBlockIds.length > 0;
  const hasIncomingConnections = allBlocks.some(b => b.linkedBlockIds?.includes(block.id));

  if (!hasOutgoingConnections && !hasIncomingConnections) return false;

  // Traverse linkedBlockIds forward and backward to find all connected blocks
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
  return visited.size > 1; // More than one block in the linked group
}

export const BlockEditor = React.memo(function BlockEditor({
  block,
  index,
  blocks,
  previewMode,
  onUpdateBlock,
  onUpdateBlockImmediate,
  onDeleteBlock,
  onAddWhatBlock,
  onToggleTruthState,
  onRemoveBlockImage,
  onUpdateBlockLanguage,
  onPaste,
  isWhoBlockConnected,
  countConnectedWhatBlocks,
  countConnectedBlocks,
  getExistingWhereBlocks,
  onAddBlockAndConnect,
  onConnectBlocks,
  onDisconnectBlocks,
  entityId,
  groupId,
  countAllLinkedBlocksInGroup,
  isFirstInGroup,
  isLastInGroup,
  onDoubleClick,
  onSelectExistingWhereBlock
}: BlockEditorProps) {

  // Memoize expensive calculations
  const connectionState = useMemo(() =>
    BlockConnectionManager.getConnectionState(block, index, blocks),
    [block, index, blocks]
  );

  const blockClass = useMemo(() =>
    BlockConnectionManager.getBlockClasses(block, connectionState),
    [block, connectionState]
  );

  // Optimized group calculations - avoid calling getConnectedGroup for every block
  const groupData = useMemo(() => {
    // Use a more efficient approach for group calculations
    const visited = new Set<string>();
    const groupBlocks: Block[] = [];

    // Simple traversal without expensive getConnectedGroup call
    const traverse = (currentBlock: Block) => {
      if (visited.has(currentBlock.id)) return;
      visited.add(currentBlock.id);
      groupBlocks.push(currentBlock);

      // Forward connections
      (currentBlock.linkedBlockIds || []).forEach(id => {
        const next = blocks.find(x => x.id === id);
        if (next) traverse(next);
      });

      // Backward connections
      blocks.forEach(x => {
        if (x.linkedBlockIds?.includes(currentBlock.id) && !visited.has(x.id)) {
          traverse(x);
        }
      });
    };

    traverse(block);

    // Sort by original order
    groupBlocks.sort((a, b) => blocks.indexOf(a) - blocks.indexOf(b));
    const groupIndex = groupBlocks.findIndex(b => b.id === block.id);

    let borderRadiusClass = "";
    if (groupBlocks.length === 1) {
      borderRadiusClass = "rounded-lg";
    } else if (groupIndex === 0) {
      borderRadiusClass = "rounded-t-lg";
    } else if (groupIndex === groupBlocks.length - 1) {
      borderRadiusClass = "rounded-b-lg";
    }

    return { groupBlocks, groupIndex, borderRadiusClass };
  }, [block, blocks]);

  // Optimized linked group check - avoid expensive traversal
  const inLinkedGroup = useMemo(() => {
    // Quick check first
    const hasOutgoingConnections = block.linkedBlockIds && block.linkedBlockIds.length > 0;
    const hasIncomingConnections = blocks.some(b => b.linkedBlockIds?.includes(block.id));

    if (!hasOutgoingConnections && !hasIncomingConnections) return false;

    // Only do full traversal if we have connections
    const visited = new Set<string>();
    const stack: Block[] = [block];

    while (stack.length > 0) {
      const currentBlock = stack.pop()!;
      if (visited.has(currentBlock.id)) continue;

      visited.add(currentBlock.id);

      // Add forward connections
      (currentBlock.linkedBlockIds || []).forEach(id => {
        const next = blocks.find(x => x.id === id);
        if (next && !visited.has(next.id)) {
          stack.push(next);
        }
      });

      // Add backward connections
      blocks.forEach(x => {
        if (x.linkedBlockIds?.includes(currentBlock.id) && !visited.has(x.id)) {
          stack.push(x);
        }
      });
    }

    return visited.size > 1;
  }, [block, blocks]);

  const shouldStick = inLinkedGroup;

  // Memoize callback functions
  const handleUpdateBlock = useCallback((id: string, content: string, math?: boolean, location?: Block["location"]) => {
    onUpdateBlock(id, content, math, location);
  }, [onUpdateBlock]);

  const handleUpdateBlockImmediate = useCallback(() => {
    onUpdateBlockImmediate(block.id, !block.math);
  }, [onUpdateBlockImmediate, block.id, block.math]);

  const handleDeleteBlock = useCallback(() => {
    onDeleteBlock(block.id);
  }, [onDeleteBlock, block.id]);

  const handleToggleTruthState = useCallback(() => {
    onToggleTruthState(block.id);
  }, [onToggleTruthState, block.id]);

  const handleRemoveBlockImage = useCallback(() => {
    onRemoveBlockImage(block.id);
  }, [onRemoveBlockImage, block.id]);

  const handleUpdateBlockLanguage = useCallback((language: string) => {
    onUpdateBlockLanguage(block.id, language);
  }, [onUpdateBlockLanguage, block.id]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    onPaste(e, block.id);
  }, [onPaste, block.id]);

  const renderBlockContent = useCallback(() => {
    switch (block.type) {
      case "who":
        return (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-full min-w-[350px] md:min-w-[500px]">
                <MathInput
                  value={block.content || ''}
                  onChange={(value: string) => handleUpdateBlock(block.id, value, block.math)}
                  placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
                  isMathMode={block.math}
                  onPaste={handlePaste}
                />
              </div>
            </div>
            {block.image && (
              <LazyImageRenderer
                src={block.image}
                alt="Block image"
                onRemove={handleRemoveBlockImage}
              />
            )}
          </div>
        )
      case "what":
        return (
          <div>
            <div className="flex items-center gap-200 mb-1">
              <div className="w-full min-w-[350px] md:min-w-[500px]">
                <MathInput
                  value={block.content || ''}
                  onChange={(value: string) => handleUpdateBlock(block.id, value, block.math)}
                  placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
                  isMathMode={block.math}
                  onPaste={handlePaste}
                  readOnly={block.truthState === "true" || block.truthState === "false"}
                />
              </div>
            </div>
            {block.image && (
              <LazyImageRenderer
                src={block.image}
                alt="Block image"
                onRemove={handleRemoveBlockImage}
              />
            )}
          </div>
        )
      case "note":
        return (
          <div>
            <MathInput
              value={block.content || ''}
              onChange={(value: string) => handleUpdateBlock(block.id, value, block.math)}
              placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
              isMathMode={block.math}
              onPaste={handlePaste}
            />
            {block.image && (
              <LazyImageRenderer
                src={block.image}
                alt="Block image"
                onRemove={handleRemoveBlockImage}
              />
            )}
          </div>
        )
      case "image":
        return (
          <div className="space-y-2">
            {!block.content && (
              <Input
                type="text"
                value={block.content || ''}
                onChange={(e) => handleUpdateBlock(block.id, e.target.value)}
                onPaste={handlePaste}
                placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
              />
            )}
            {block.content && (
              <LazyImageRenderer
                src={block.content}
                alt="Note image"
                onRemove={() => handleUpdateBlock(block.id, "")}
              />
            )}
          </div>
        )
      case "video":
        return (
          <div className="space-y-2">
            <Input
              type="text"
              value={block.content || ''}
              onChange={(e) => handleUpdateBlock(block.id, e.target.value)}
              onPaste={handlePaste}
              placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
            />
            {block.content && !block.content.startsWith('data:image') && (
              <div className="mt-2">
                <div className="aspect-video rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <span className="text-gray-500">Video Embed Placeholder</span>
                </div>
              </div>
            )}
            {block.content && block.content.startsWith('data:image') && (
              <LazyImageRenderer
                src={block.content}
                alt="Note image"
                onRemove={() => handleUpdateBlock(block.id, "")}
              />
            )}
          </div>
        )
      case "code":
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Input
                type="text"
                value={block.language || ''}
                onChange={(e) => handleUpdateBlockLanguage(e.target.value)}
                placeholder="Language (python, javascript, etc.)"
                className="w-40 h-7 text-xs"
              />
            </div>
            <Textarea
              value={block.content || ''}
              onChange={(e) => handleUpdateBlock(block.id, e.target.value)}
              onPaste={handlePaste}
              className="min-h-[100px] resize-y font-mono text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none"
              placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
            />
            {block.content && block.content.startsWith('data:image') && (
              <LazyImageRenderer
                src={block.content}
                alt="Note image"
                onRemove={() => handleUpdateBlock(block.id, "")}
              />
            )}
          </div>
        )
      case "where": {
        const handleUpdate = useCallback((
          id: string,
          content: string,
          location?: Block["location"]
        ) => {
          handleUpdateBlock(id, content, undefined, location)
        }, [handleUpdateBlock]);

        return (
          <WhereBlockEditor
            block={block}
            onUpdateBlock={handleUpdate}
            getExistingWhereBlocks={getExistingWhereBlocks}
            onSelectExistingWhereBlock={onSelectExistingWhereBlock || (() => { })}
          />
        )
      }
      case "where-ref": {
        // Find the referenced where block
        const referencedWhereBlock = blocks.find(b => b.id === block.whereBlockId && b.type === "where");
        return (
          <WhereBlockEditor
            block={block}
            onUpdateBlock={() => { }}
            getExistingWhereBlocks={getExistingWhereBlocks}
            onSelectExistingWhereBlock={() => { }}
            referencedWhereBlock={referencedWhereBlock}
          />
        )
      }
      case "how":
        return (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-full min-w-[350px] md:min-w-[500px]">
                <MathInput
                  value={block.content || ''}
                  onChange={(value: string) => handleUpdateBlock(block.id, value, block.math)}
                  placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
                  isMathMode={block.math}
                  onPaste={handlePaste}
                />
              </div>
            </div>
            {block.image && (
              <LazyImageRenderer
                src={block.image}
                alt="Block image"
                onRemove={handleRemoveBlockImage}
              />
            )}
          </div>
        )
      case "why":
        return (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-full min-w-[350px] md:min-w-[500px]">
                <MathInput
                  value={block.content || ''}
                  onChange={(value: string) => handleUpdateBlock(block.id, value, block.math)}
                  placeholder={BLOCK_TYPE_PLACEHOLDERS[block.type]}
                  isMathMode={block.math}
                  onPaste={handlePaste}
                />
              </div>
            </div>
            {block.image && (
              <LazyImageRenderer
                src={block.image}
                alt="Block image"
                onRemove={handleRemoveBlockImage}
              />
            )}
          </div>
        )
      case "when": {
        const handleUpdate = useCallback((
          id: string,
          content: string,
          data?: any
        ) => {
          handleUpdateBlock(id, content, block.math)
        }, [handleUpdateBlock, block.math]);

        return (
          <WhenBlockEditor
            block={block}
            onUpdateBlock={handleUpdate}
          />
        )
      }
      default:
        return null
    }
  }, [block, handleUpdateBlock, handleUpdateBlockLanguage, handleRemoveBlockImage, handlePaste, getExistingWhereBlocks]);

  return (
    <div
      className={`group relative border-l-4 ${BLOCK_TYPE_COLORS[block.type]} pl-3 ${shouldStick ? "py-0.5 border-b-0" : "py-2"} hover:bg-gray-50 dark:hover:bg-gray-800/50 ${groupData.borderRadiusClass}`}
      onDoubleClick={() => onDoubleClick && onDoubleClick(block)}
    >
      <div className="flex items-start gap-2">
        <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">[{index + 1}]</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {onAddBlockAndConnect && onConnectBlocks && onDisconnectBlocks ? (
              <BlockConnectionManagerUI
                block={block}
                allBlocks={blocks}
                onAddBlock={onAddBlockAndConnect}
                onConnectBlocks={onConnectBlocks}
                onDisconnectBlocks={onDisconnectBlocks}
              >
                <Badge
                  variant="outline"
                  className={`flex items-center gap-1 ${BLOCK_TYPE_BADGE_CLASSES[block.type]} cursor-pointer`}
                >
                  {BLOCK_TYPE_ICONS[block.type]}
                  <span>{BLOCK_TYPE_LABELS[block.type]}</span>
                </Badge>
              </BlockConnectionManagerUI>
            ) : (
              <Badge
                variant="outline"
                className={`flex items-center gap-1 ${BLOCK_TYPE_BADGE_CLASSES[block.type]}`}
              >
                {BLOCK_TYPE_ICONS[block.type]}
                <span>{BLOCK_TYPE_LABELS[block.type]}</span>
              </Badge>
            )}
            {(block.type === "who" || block.type === "what" || block.type === "note" || block.type === "why") && (
              <button
                onClick={() => handleUpdateBlockImmediate()}
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
                        : block.type === "why"
                          ? block.math
                            ? "bg-indigo-100 border-indigo-500 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200"
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
                    {countAllLinkedBlocksInGroup(block, blocks)}
                    <LinkIcon className="w-3.5 h-3.5 ml-1 inline" />
                  </span>
                ) : (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    <LinkIcon className="w-3.5 h-3.5 ml-1 inline" />
                  </span>
                )}
              </span>
            )}
            {block.type === "what" && (
              <button
                onClick={() => handleToggleTruthState()}
                title={
                  block.truthState === "true"
                    ? "True statement (click to set False)"
                    : block.truthState === "false"
                      ? "False statement (click to restore)"
                      : "Toggle to True/False statement"
                }
                className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold border transition-colors
                  ${block.truthState === "true"
                    ? "bg-pr-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-200"
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
              onClick={() => handleDeleteBlock()}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}); 
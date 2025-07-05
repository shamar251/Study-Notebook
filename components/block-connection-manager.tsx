"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus,
  Link,
  Unlink,
  FileText,
  ImageIcon,
  Video,
  Code,
  MapPin,
  ChevronDown,
  User,
  HelpCircle,
  ArrowRight,
  Clock,
  CheckSquare
} from "lucide-react"
import type { Block } from "@/lib/db"
import { BLOCK_TYPE_ICONS, BLOCK_TYPE_LABELS, BLOCK_TYPE_COLORS } from "@/lib/block-types"

interface BlockConnectionManagerProps {
  block: Block
  allBlocks: Block[]
  onAddBlock: (type: Block["type"], afterBlockId?: string) => void
  onConnectBlocks: (sourceBlockId: string, targetBlockId: string) => void
  onDisconnectBlocks: (sourceBlockId: string, targetBlockId: string) => void
  children: React.ReactNode
}

export function BlockConnectionManager({
  block,
  allBlocks,
  onAddBlock,
  onConnectBlocks,
  onDisconnectBlocks,
  children
}: BlockConnectionManagerProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Get all blocks that can be connected to this block
  const getConnectableBlocks = () => {
    return allBlocks.filter(b => {
      if (b.id === block.id) return false
      if (block.linkedBlockIds?.includes(b.id)) return false
      if (b.linkedBlockIds?.includes(block.id)) return false
      return true
    })
  }

  // Get currently connected blocks
  const getConnectedBlocks = () => {
    if (!block.linkedBlockIds || block.linkedBlockIds.length === 0) return []
    return allBlocks.filter(b => block.linkedBlockIds!.includes(b.id))
  }

  const connectableBlocks = getConnectableBlocks()
  const connectedBlocks = getConnectedBlocks()

  const handleAddBlock = (type: Block["type"]) => {
    onAddBlock(type, block.id)
    setIsOpen(false)
  }

  const handleConnect = (targetBlockId: string) => {
    onConnectBlocks(block.id, targetBlockId)
    setIsOpen(false)
  }

  const handleDisconnect = (targetBlockId: string) => {
    onDisconnectBlocks(block.id, targetBlockId)
  }

  const blockTypeOptions: { type: Block["type"]; label: string; icon: React.ReactNode; color: string }[] = [
    { type: "who", label: "WHO Block", icon: <User className="w-4 h-4" />, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" },
    { type: "what", label: "WHAT Block", icon: <HelpCircle className="w-4 h-4" />, color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
    { type: "how", label: "HOW Block", icon: <ArrowRight className="w-4 h-4" />, color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200" },
    { type: "why", label: "WHY Block", icon: <HelpCircle className="w-4 h-4" />, color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200" },
    { type: "note", label: "Note Block", icon: <FileText className="w-4 h-4" />, color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200" },
    { type: "where", label: "Where Block", icon: <MapPin className="w-4 h-4" />, color: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200" },
    { type: "when", label: "When Block", icon: <Clock className="w-4 h-4" />, color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200" },
    { type: "check", label: "Check Block", icon: <CheckSquare className="w-4 h-4" />, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" },
    { type: "image", label: "Image Block", icon: <ImageIcon className="w-4 h-4" />, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" },
    { type: "video", label: "Video Block", icon: <Video className="w-4 h-4" />, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" },
    { type: "code", label: "Code Block", icon: <Code className="w-4 h-4" />, color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
  ]

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-1">
          {children}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => {
              e.stopPropagation()
              setIsOpen(true)
            }}
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            <span className="text-sm font-medium">Connection Options</span>
            <Badge variant="outline" className="ml-auto">
              {connectedBlocks.length} connected
            </Badge>
          </div>

          <Separator />

          {/* Add New Blocks */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Add New Block</h4>
            <div className="grid grid-cols-2 gap-2">
              {blockTypeOptions.map(option => (
                <Button
                  key={option.type}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddBlock(option.type)}
                  className="justify-start h-auto p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className={`p-1 rounded ${option.color}`}>
                      {option.icon}
                    </span>
                    <span className="text-xs">{option.label}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Connect to Existing Blocks */}
          {connectableBlocks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Connect to Existing Block</h4>
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {connectableBlocks.map(targetBlock => (
                    <Button
                      key={targetBlock.id}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleConnect(targetBlock.id)}
                      className="w-full justify-start h-auto p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`p-1 rounded ${BLOCK_TYPE_COLORS[targetBlock.type]}`}>
                          {BLOCK_TYPE_ICONS[targetBlock.type]}
                        </span>
                        <div className="flex-1 text-left">
                          <div className="text-xs font-medium">{BLOCK_TYPE_LABELS[targetBlock.type]}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {targetBlock.content || "Empty block"}
                          </div>
                        </div>
                        <Plus className="w-3 h-3" />
                      </div>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Connected Blocks */}
          {connectedBlocks.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Connected Blocks</h4>
                <ScrollArea className="h-32">
                  <div className="space-y-1">
                    {connectedBlocks.map(connectedBlock => (
                      <div
                        key={connectedBlock.id}
                        className="flex items-center gap-2 p-2 rounded-md border bg-muted/50"
                      >
                        <span className={`p-1 rounded ${BLOCK_TYPE_COLORS[connectedBlock.type]}`}>
                          {BLOCK_TYPE_ICONS[connectedBlock.type]}
                        </span>
                        <div className="flex-1 text-left">
                          <div className="text-xs font-medium">{BLOCK_TYPE_LABELS[connectedBlock.type]}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {connectedBlock.content || "Empty block"}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDisconnect(connectedBlock.id)}
                        >
                          <Unlink className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
} 
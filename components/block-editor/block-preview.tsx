"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InlineMath } from "react-katex"
import "katex/dist/katex.min.css"
import "leaflet/dist/leaflet.css"

import type { Block } from "@/lib/db"
import { BLOCK_TYPE_LABELS, BLOCK_TYPE_ICONS } from "@/lib/block-types"
import { MapContainer, TileLayer, Marker } from "react-leaflet"

interface BlockPreviewProps {
  block: Block
  index: number
}

export const BlockPreview = React.memo(function BlockPreview({ block, index }: BlockPreviewProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  const Icon = BLOCK_TYPE_ICONS[block.type]
  const Label = BLOCK_TYPE_LABELS[block.type]

  const renderContent = useMemo(() => {
    switch (block.type) {
      case "where":
        return (
          <div className="flex-1 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-md">
            <h3 className="font-bold text-teal-800 dark:text-teal-300 mb-1">
              {Label}
            </h3>
            <p>{block.content}</p>
          </div>
        )
      case "how":
        return (
          <div className="flex-1 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-md">
            <h3 className="font-bold text-orange-800 dark:text-orange-300 mb-1">
              {Label}
            </h3>
            {(block.content || "").includes("$") ? (
              <InlineMath
                math={(block.content || "").replace(/^\\$/, "").replace(/\\$$/, "")}
              />
            ) : (
              <p>{block.content || ""}</p>
            )}
          </div>
        )
      case "who":
        return (
          <div className="flex-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-1">
              {Label}
            </h3>
            {(block.content || "").includes("$") ? (
              <InlineMath
                math={(block.content || "").replace(/^\\$/, "").replace(/\\$$/, "")}
              />
            ) : (
              <p>{block.content || ""}</p>
            )}
          </div>
        )
      case "what":
        return (
          <div className="flex-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
            <h3 className="font-bold text-green-800 dark:text-green-300 mb-1">
              {Label}
            </h3>
            {(block.content || "").includes("$") ? (
              <InlineMath
                math={(block.content || "").replace(/^\\$/, "").replace(/\\$$/, "")}
              />
            ) : (
              <p>{block.content || ""}</p>
            )}
          </div>
        )
      case "note":
        return (
          <div className="flex-1 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-md">
            <h3 className="font-bold text-purple-800 dark:text-purple-300 mb-1">
              {Label}
            </h3>
            <p className="whitespace-pre-wrap">{block.content}</p>
          </div>
        )
      case "image":
        return (
          <div className="flex-1 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
            <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-1">
              {Label}
            </h3>
            {block.content && (
              <div className="mt-2">
                <img
                  src={block.content}
                  alt="Note image"
                  className="max-w-full h-auto rounded-md"
                  loading="lazy"
                  decoding="async"
                  style={{
                    contain: 'layout style',
                    willChange: 'auto'
                  }}
                />
              </div>
            )}
          </div>
        )
      case "video":
        return (
          <div className="flex-1 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
            <h3 className="font-bold text-red-800 dark:text-red-300 mb-1">
              {Label}
            </h3>
            {block.content && (
              <div className="mt-2">
                <div className="aspect-video rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Video className="w-8 h-8 text-gray-400" />
                  <span className="ml-2 text-gray-500">
                    Video Embed Placeholder
                  </span>
                </div>
              </div>
            )}
          </div>
        )
      case "code":
        return (
          <div className="flex-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-gray-800 dark:text-gray-300">
                {Label}
              </h3>
              {block.data?.language && (
                <Badge variant="outline" className="text-xs">
                  {block.data.language}
                </Badge>
              )}
            </div>
            <pre className="p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto">
              <code className="text-sm font-mono">{block.content}</code>
            </pre>
          </div>
        )
      default:
        return null
    }
  }, [block.type, block.content, block.data?.language, Label]);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-none w-8 text-right text-xs text-gray-500 mt-1 font-mono">
        [{index + 1}]
      </div>
      {renderContent}
    </div>
  )
}); 
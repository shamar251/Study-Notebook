import React from "react"
import { FileText, ImageIcon, Video, Code, MapPin, ArrowRight } from "lucide-react"
import type { Block } from "@/lib/db"

export const BLOCK_TYPES = ["who", "what", "note", "image", "video", "code", "where", "how"] as const
export type BlockType = (typeof BLOCK_TYPES)[number]

export const BLOCK_TYPE_COLORS: Record<Block["type"], string> = {
  who: "border-blue-500 bg-blue-50 dark:bg-blue-900/10",
  what: "border-green-500 bg-green-50 dark:bg-green-900/10",
  note: "border-purple-500 bg-purple-50 dark:bg-purple-900/10",
  image: "border-amber-500 bg-amber-50 dark:bg-amber-900/10",
  video: "border-red-500 bg-red-50 dark:bg-red-900/10",
  code: "border-gray-500 bg-gray-50 dark:bg-gray-700/30",
  where: "border-teal-500 bg-teal-50 dark:bg-teal-900/10",
  how: "border-orange-500 bg-orange-50 dark:bg-orange-900/10",
}

export const BLOCK_TYPE_LABELS: Record<Block["type"], string> = {
  who: "WHO",
  what: "WHAT",
  note: "NOTE",
  image: "IMAGE",
  video: "VIDEO",
  code: "CODE",
  where: "WHERE",
  how: "HOW",
}

export const BLOCK_TYPE_ICONS: Record<Block["type"], React.ReactNode> = {
  who: <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">W</span>,
  what: <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">?</span>,
  note: <FileText className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  code: <Code className="w-4 h-4" />,
  where: <MapPin className="w-4 h-4" />,
  how: <ArrowRight className="w-4 h-4" />,
}

export const BLOCK_TYPE_PLACEHOLDERS: Record<Block["type"], string> = {
  who: "Enter a person, place, or term...",
  what: "Enter a definition or explanation...",
  note: "Enter additional notes or information... (or paste an image)",
  image: "Enter image URL or paste an image...",
  video: "Enter video URL (YouTube, Vimeo, etc.)... (or paste an image)",
  code: "Enter code here... (or paste an image)",
  where: "Enter a location, address, or coordinates...",
  how: "Enter a step or process...",
}

export const BLOCK_TYPE_BADGE_CLASSES: Record<Block["type"], string> = {
  who: "bg-blue-100 dark:bg-blue-900/30",
  what: "bg-green-100 dark:bg-green-900/30",
  note: "bg-purple-100 dark:bg-purple-900/30",
  image: "bg-amber-100 dark:bg-amber-900/30",
  video: "bg-red-100 dark:bg-red-900/30",
  code: "bg-gray-100 dark:bg-gray-700",
  where: "bg-teal-100 dark:bg-teal-900/30",
  how: "bg-orange-100 dark:bg-orange-900/30",
} 
"use client"

import {
  PlusCircle,
  FileText,
  Code,
  ImageIcon,
  Video,
  MapPin,
  ArrowRight,
  CheckSquare
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface AddBlockButtonProps {
  onAddBlock: (
    type: "who" | "what" | "note" | "image" | "video" | "code" | "where" | "how" | "check"
  ) => void
  className?: string
}

export default function AddBlockButton({
  onAddBlock,
  className
}: AddBlockButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          <PlusCircle className="w-4 h-4 mr-2" /> Add Block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => onAddBlock("who")}>
          <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-blue-100 dark:bg-blue-900 rounded">
            W
          </span>
          <span>Who Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("what")}>
          <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold bg-green-100 dark:bg-green-900 rounded">
            ?
          </span>
          <span>What Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("how")}>
          <ArrowRight className="w-4 h-4 mr-2 text-orange-500" />
          <span>How Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("note")}>
          <FileText className="w-4 h-4 mr-2 text-purple-500" />
          <span>Note Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("image")}>
          <ImageIcon className="w-4 h-4 mr-2 text-amber-500" />
          <span>Image Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("video")}>
          <Video className="w-4 h-4 mr-2 text-red-500" />
          <span>Video Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("code")}>
          <Code className="w-4 h-4 mr-2 text-gray-500" />
          <span>Code Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("where")}>
          <MapPin className="w-4 h-4 mr-2 text-teal-500" />
          <span>Where Block</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddBlock("check")}>
          <CheckSquare className="w-4 h-4 mr-2 text-emerald-500" />
          <span>Check Block</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

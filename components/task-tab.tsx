"use client"

import React, { useState, useEffect } from "react"
import { List, Square, ExternalLink, Calendar, Folder, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"
import type { Block, Note, Folder as DBFolder } from "@/lib/db"
import { db } from "@/lib/db"

interface TaskItem {
  id: string
  content: string
  isChecked: boolean
  noteId: string
  noteTitle: string
  folderId: string
  folderName: string
  createdAt: Date
  lastModified: Date
  block: Block
}

interface TaskTabProps {
  notes: Note[]
  folders: DBFolder[]
  onNoteClick: (note: Note) => void
  onUpdateNote: (note: Note) => void
  onNavigateToBlock?: (blockId: string) => void
}

export default function TaskTab({ notes, folders, onNoteClick, onUpdateNote, onNavigateToBlock }: TaskTabProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [filteredTasks, setFilteredTasks] = useState<TaskItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all")
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const { toast } = useToast()

  // Load all check blocks from all notes
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const allNotes = await db.notes.toArray()
        const allFolders = await db.folders.toArray()

        const taskItems: TaskItem[] = []

        allNotes.forEach(note => {
          const folder = allFolders.find(f => f.id === note.folderId)
          const folderName = folder?.name || "Root"

          note.blocks.forEach(block => {
            if (block.type === "check") {
              taskItems.push({
                id: block.id,
                content: block.content || "",
                isChecked: block.isChecked || false,
                noteId: note.id,
                noteTitle: note.title,
                folderId: note.folderId,
                folderName,
                createdAt: block.createdAt,
                lastModified: block.lastModified,
                block
              })
            }
          })
        })

        // Sort by last modified (newest first)
        taskItems.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())

        setTasks(taskItems)
      } catch (error) {
        console.error("Error loading tasks:", error)
        toast({
          title: "Error",
          description: "Failed to load tasks",
          variant: "destructive"
        })
      }
    }

    loadTasks()
  }, [notes, folders, toast])

  // Filter tasks based on search, tab, and folder
  useEffect(() => {
    let filtered = tasks

    // Filter by tab (all/completed)
    if (activeTab === "completed") {
      filtered = filtered.filter(task => task.isChecked)
    }

    // Filter by folder
    if (folderFilter) {
      filtered = filtered.filter(task => task.folderId === folderFilter)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(task =>
        task.content.toLowerCase().includes(query) ||
        task.noteTitle.toLowerCase().includes(query) ||
        task.folderName.toLowerCase().includes(query)
      )
    }

    setFilteredTasks(filtered)
  }, [tasks, activeTab, folderFilter, searchQuery])

  const handleToggleTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      // Find the note containing this task
      const note = notes.find(n => n.id === task.noteId)
      if (!note) return

      // Update the block's isChecked property
      const updatedBlocks = note.blocks.map(block =>
        block.id === taskId
          ? { ...block, isChecked: !block.isChecked, lastModified: new Date() }
          : block
      )

      const updatedNote = {
        ...note,
        blocks: updatedBlocks,
        updatedAt: Date.now()
      }

      // Update in database
      await db.notes.put(updatedNote)

      // Update local state
      setTasks(prevTasks =>
        prevTasks.map(t =>
          t.id === taskId
            ? { ...t, isChecked: !t.isChecked, lastModified: new Date() }
            : t
        )
      )

      // Notify parent component
      onUpdateNote(updatedNote)

      toast({
        title: task.isChecked ? "Task marked as incomplete" : "Task completed",
        description: `"${task.content.substring(0, 50)}${task.content.length > 50 ? '...' : ''}"`
      })
    } catch (error) {
      console.error("Error toggling task:", error)
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive"
      })
    }
  }

  const handleOpenNote = (noteId: string) => {
    const note = notes.find(n => n.id === noteId)
    if (note) {
      onNoteClick(note)
    }
  }

  const handleNavigateToBlock = (blockId: string, noteId: string) => {
    const note = notes.find(n => n.id === noteId)
    if (note) {
      onNoteClick(note)
      // Navigate to the specific block after opening the note
      setTimeout(() => {
        onNavigateToBlock?.(blockId)
      }, 100)
    }
  }

  const getUniqueFolders = () => {
    const folderMap = new Map<string, string>()
    tasks.forEach(task => {
      folderMap.set(task.folderId, task.folderName)
    })
    return Array.from(folderMap.entries()).map(([id, name]) => ({ id, name }))
  }

  const getTaskStats = () => {
    const total = tasks.length
    const completed = tasks.filter(t => t.isChecked).length
    const pending = total - completed
    return { total, completed, pending }
  }

  const stats = getTaskStats()
  const uniqueFolders = getUniqueFolders()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <List className="w-6 h-6" />
              All Tasks
            </h2>
            <p className="text-muted-foreground text-sm">
              Manage all check blocks across all notes
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {stats.total} Total
            </Badge>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
              {stats.completed} Completed
            </Badge>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search tasks, notes, or folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <select
            value={folderFilter || ""}
            onChange={(e) => setFolderFilter(e.target.value || null)}
            className="px-3 py-2 border rounded-md bg-background text-sm"
          >
            <option value="">All Folders</option>
            {uniqueFolders.map(folder => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="all" className="flex items-center gap-2">
              All Tasks
              <Badge variant="secondary" className="ml-1">{stats.total}</Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              Completed
              <Badge variant="secondary" className="ml-1">{stats.completed}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 p-4">
            <ScrollArea className="h-[calc(100vh-250px)]">
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <List className="w-12 h-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">
                    {searchQuery || folderFilter ? "No tasks found" : "No tasks yet"}
                  </h3>
                  <p className="text-sm text-center max-w-md">
                    {searchQuery || folderFilter
                      ? "Try adjusting your search or filter criteria"
                      : "Create check blocks in your notes to see them here"
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTasks.map((task) => (
                    <Card
                      key={task.id}
                      className={`transition-all hover:shadow-md cursor-pointer ${task.isChecked ? "opacity-75" : ""
                        }`}
                      onClick={() => handleNavigateToBlock(task.id, task.noteId)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleTask(task.id)
                            }}
                            className="flex-none mt-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                            title={task.isChecked ? "Mark as incomplete" : "Mark as complete"}
                          >
                            {task.isChecked ? (
                              <Square className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="currentColor" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-relaxed ${task.isChecked ? "line-through text-muted-foreground" : ""
                              }`}>
                              {task.content || "Untitled task"}
                            </p>

                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                <span className="truncate max-w-[200px]">{task.noteTitle}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Folder className="w-3 h-3" />
                                <span className="truncate max-w-[150px]">{task.folderName}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {new Date(task.lastModified).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleNavigateToBlock(task.id, task.noteId)
                            }}
                            className="flex-none"
                            title="Navigate to task in editor"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

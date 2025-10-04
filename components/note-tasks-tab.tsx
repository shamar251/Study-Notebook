"use client"

import React, { useState, useEffect } from "react"
import { List, Square, Calendar, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/components/ui/use-toast"
import type { Block, Note } from "@/lib/db"
import { db } from "@/lib/db"

interface NoteTaskItem {
  id: string
  content: string
  isChecked: boolean
  createdAt: Date
  lastModified: Date
  block: Block
}

interface NoteTasksTabProps {
  note: Note | null
  onUpdateNote: (note: Note) => void
  onNavigateToBlock?: (blockId: string) => void
}

export default function NoteTasksTab({ note, onUpdateNote, onNavigateToBlock }: NoteTasksTabProps) {
  const [tasks, setTasks] = useState<NoteTaskItem[]>([])
  const [filteredTasks, setFilteredTasks] = useState<NoteTaskItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all")
  const { toast } = useToast()

  // Load check blocks from the current note
  useEffect(() => {
    if (!note) {
      setTasks([])
      return
    }

    const noteTasks: NoteTaskItem[] = note.blocks
      .filter(block => block.type === "check")
      .map(block => ({
        id: block.id,
        content: block.content || "",
        isChecked: block.isChecked || false,
        createdAt: block.createdAt,
        lastModified: block.lastModified,
        block
      }))
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())

    setTasks(noteTasks)
  }, [note])

  // Filter tasks based on search and tab
  useEffect(() => {
    let filtered = tasks

    // Filter by tab (all/completed)
    if (activeTab === "completed") {
      filtered = filtered.filter(task => task.isChecked)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(task =>
        task.content.toLowerCase().includes(query)
      )
    }

    setFilteredTasks(filtered)
  }, [tasks, activeTab, searchQuery])

  const handleToggleTask = async (taskId: string) => {
    if (!note) return

    try {
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

      const task = tasks.find(t => t.id === taskId)
      if (task) {
        toast({
          title: task.isChecked ? "Task marked as incomplete" : "Task completed",
          description: `"${task.content.substring(0, 50)}${task.content.length > 50 ? '...' : ''}"`
        })
      }
    } catch (error) {
      console.error("Error toggling task:", error)
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive"
      })
    }
  }

  const getTaskStats = () => {
    const total = tasks.length
    const completed = tasks.filter(t => t.isChecked).length
    const pending = total - completed
    return { total, completed, pending }
  }

  const stats = getTaskStats()

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <List className="w-12 h-12 mb-4 opacity-50" />
        <h3 className="text-lg font-semibold mb-2">No note selected</h3>
        <p className="text-sm text-center max-w-md">
          Select a note to view its tasks and check blocks
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <List className="w-5 h-5" />
              {note.title}
            </h2>
            {/* <p className="text-muted-foreground text-sm">
              Manage check blocks from this note
            </p> */}
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

        {/* Search */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search tasks in this note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
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
            <ScrollArea className="h-[calc(100vh-300px)]">
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <List className="w-12 h-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">
                    {searchQuery ? "No tasks found" : "No tasks in this note"}
                  </h3>
                  <p className="text-sm text-center max-w-md">
                    {searchQuery
                      ? "Try adjusting your search criteria"
                      : "Create check blocks in this note to see them here"
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
                      onClick={() => onNavigateToBlock?.(task.id)}
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
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {new Date(task.lastModified).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
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

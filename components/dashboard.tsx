"use client"

import { useState, useEffect } from "react"
import { BookOpen, Brain, Clock, Edit, Plus, Calendar, Tag, GraduationCap, Folder as FolderIcon, FileText, HomeIcon, Flame, Layers, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Note, Folder } from "@/components/note-app"
import TimeSince from "./TimeSince"
import { db } from "@/lib/db"
import { motion } from 'framer-motion'

interface DashboardProps {
  notes: Note[]
  folders: Folder[]
  onOpenNote: (note: Note) => void
  onStudyNote: (noteOrFolderId: Note | Note[] | string, mode: "flashcards" | "quiz") => void
  onCreateNote: () => void
  onCreateFolder: (name: string, parentId: string | null, description?: string) => void
}

export default function Dashboard({ notes, folders, onOpenNote, onStudyNote, onCreateNote, onCreateFolder }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("study")
  const [folderTestSessions, setFolderTestSessions] = useState<{ [folderId: string]: any }>({})
  const [noteTestSessions, setNoteTestSessions] = useState<{ [noteId: string]: any }>({})
  const [folderQuizSessions, setFolderQuizSessions] = useState<{ [folderId: string]: any }>({})
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [newFolderDescription, setNewFolderDescription] = useState("")

  useEffect(() => {
    async function fetchTestSessions() {
      const folderSessions: { [folderId: string]: any } = {}
      for (const folder of folders) {
        const testSessions = await db.testSessions.where("folderId").equals(folder.id).reverse().toArray()
        if (testSessions.length > 0) {
          folderSessions[folder.id] = testSessions[0]
        }
      }
      setFolderTestSessions(folderSessions)

      const noteSessions: { [noteId: string]: any } = {}
      for (const note of notes) {
        const testSessions = await db.testSessions.where("noteId").equals(note.id).reverse().toArray()
        if (testSessions.length > 0) {
          noteSessions[note.id] = testSessions[0]
        }
      }
      setNoteTestSessions(noteSessions)
    }
    fetchTestSessions()
  }, [folders, notes])

  useEffect(() => {
    async function fetchQuizSessions() {
      const quizSessions: { [folderId: string]: any } = {}
      for (const folder of folders) {
        const quizSession = await db.quizSessions.where("folderId").equals(folder.id).reverse().first()
        if (quizSession) quizSessions[folder.id] = quizSession
      }
      setFolderQuizSessions(quizSessions)
    }
    fetchQuizSessions()
  }, [folders])

  // Sort notes by last updated
  const recentNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)

  // Sort notes by last studied
  const studyNotes = [...notes]
    .filter((note) => note.lastStudied)
    .sort((a, b) => (b.lastStudied || 0) - (a.lastStudied || 0))
    .slice(0, 6)

  // Find notes that need review (have WHO blocks)
  const needsReviewNotes = notes
    .filter((note) => note.blocks.some((block) => block.type === "who" && block.linkedBlockIds && block.linkedBlockIds.length > 0))
    .slice(0, 6)

  // Get folder by ID
  const getFolder = (folderId: string): Folder | undefined => {
    return folders.find((f) => f.id === folderId)
  }

  // Get folder name by ID
  const getFolderName = (folderId: string): string => {
    const folder = getFolder(folderId)
    return folder ? folder.name : "Unknown Folder"
  }

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  // Calculate time since
  const getTimeSince = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)

    let interval = Math.floor(seconds / 31536000)
    if (interval >= 1) return `${interval} year${interval === 1 ? "" : "s"} ago`

    interval = Math.floor(seconds / 2592000)
    if (interval >= 1) return `${interval} month${interval === 1 ? "" : "s"} ago`

    interval = Math.floor(seconds / 86400)
    if (interval >= 1) return `${interval} day${interval === 1 ? "" : "s"} ago`

    interval = Math.floor(seconds / 3600)
    if (interval >= 1) return `${interval} hour${interval === 1 ? "" : "s"} ago`

    interval = Math.floor(seconds / 60)
    if (interval >= 1) return `${interval} minute${interval === 1 ? "" : "s"} ago`

    return `${Math.floor(seconds)} second${seconds === 1 ? "" : "s"} ago`
  }

  // Calculate study progress
  const getStudyProgress = (note: Note): number => {
    if (!note.studyStats) return 0

    const { quizAttempts = 0, quizCorrect = 0 } = note.studyStats
    if (quizAttempts === 0) return 0

    return Math.round((quizCorrect / quizAttempts) * 100)
  }

  // Count WHO/WHAT pairs
  const countStudyPairs = (note: Note): number => {
    let count = 0;
    const blocks = note.blocks;
    blocks.forEach((block, idx) => {
      if (block.type === "who") {
        // New structure: linkedBlockIds
        if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
          const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what");
          if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
            count++;
          }
        } else {
          // Old structure: adjacent WHAT block
          if (idx < blocks.length - 1) {
            const nextBlock = blocks[idx + 1];
            if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
              count++;
            }
          }
        }
      }
    });
    return count;
  }

  // Count all study pairs in a folder, including nested folders and notes
  const countStudyPairsInFolder = (folderId: string): number => {
    // Get all descendant folder IDs
    const getAllDescendantFolderIds = (id: string): string[] => {
      const directChildren = folders.filter(f => f.parentId === id).map(f => f.id)
      return directChildren.concat(directChildren.flatMap(getAllDescendantFolderIds))
    }
    const allFolderIds = [folderId, ...getAllDescendantFolderIds(folderId)]
    // Get all notes in these folders
    const notesInFolders = notes.filter(note => allFolderIds.includes(note.folderId))
    // Sum up all study pairs in these notes
    return notesInFolders.reduce((total, note) => total + countStudyPairs(note), 0)
  }

  // Combine notes and folders into a single array for recent items
  const recentItems = [
    ...notes.map(note => ({
      type: "note" as const,
      item: note,
      timestamp: note.updatedAt
    })),
    ...folders.map(folder => ({
      type: "folder" as const,
      item: folder,
      timestamp: folder.createdAt || 0
    }))
  ]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 6);

  // Handle folder creation
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), null, newFolderDescription.trim() || undefined)
      setNewFolderName("")
      setNewFolderDescription("")
      setShowCreateFolderDialog(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto hide-scrollbar">
      <div className="w-full p-5">
        <div className="flex items-center justify-between mb-6">

        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center"><Clock className="w-5 h-5 mr-2" />Recent</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateNote}
                className="flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateFolderDialog(true)}
                className="flex items-center gap-2"
              >
                <FolderIcon className="w-5 h-5" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentItems.map(({ type, item }) =>
              type === "note" ? (
                <Card key={item.id} className="flex flex-col h-full overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <span className="flex-shrink-0"><FileText className="w-5 h-5 text-black" /></span>
                          <span className="line-clamp-2 truncate break-words max-w-[180px]">{item.title}</span>
                        </CardTitle>
                        <CardDescription className="text-sm pt-2 pl-1">{getFolderName(item.folderId)}</CardDescription>
                      </div>
                      {/* <Badge variant="outline" className="flex items-center gap-1 text-xs px-2 py-1 rounded-full">
                        <Clock className="w-5 h-5" /> <TimeSince timestamp={item.updatedAt} />
                      </Badge> */}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pb-2">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.tags && item.tags.length > 0 ? (
                        item.tags.map((tag: any) => (
                          <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">No tags</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {(() => {
                        if (!item.blocks || item.blocks.length === 0) return "No content";
                        // Helper to get a numeric timestamp from various types
                        const getTime = (val: any) => {
                          if (!val) return 0;
                          if (typeof val === 'number') return val;
                          if (typeof val === 'string') return Date.parse(val);
                          if (val instanceof Date) return val.getTime();
                          return 0;
                        };
                        // Sort by lastModified or createdAt
                        const sorted = [...item.blocks].sort((a, b) => {
                          const aTime = getTime(a.lastModified) || getTime(a.createdAt);
                          const bTime = getTime(b.lastModified) || getTime(b.createdAt);
                          return bTime - aTime;
                        });
                        // If all timestamps are missing or equal, fallback to last block
                        const mostRecentBlock = (sorted[0] && (getTime(sorted[0].lastModified) || getTime(sorted[0].createdAt))) ? sorted[0] : item.blocks[item.blocks.length - 1];
                        return mostRecentBlock?.content || "No content";
                      })()}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <a href="#" className="text-xs text-blue-600 dark:text-blue-400 flex items-center hover:underline">
                        <span className="font-medium mr-1">{countStudyPairs(item)}</span> study items
                      </a>
                      {item.studyStats?.quizAttempts ? (
                        <div className="text-xs text-green-600 dark:text-green-400 flex items-center">
                          <span className="font-medium mr-1">{getStudyProgress(item)}%</span> quiz score
                        </div>
                      ) : null}
                      {noteTestSessions[item.id]?.score !== undefined && (
                        <div className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center">
                          <span className="font-medium mr-1">{noteTestSessions[item.id].score}%</span> test score
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-between">
                    <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={() => onOpenNote(item)}>
                      <Edit className="w-5 h-5 mr-1" /> Edit
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={() => onStudyNote(item, "flashcards")}>
                        <Layers className="w-5 h-5 mr-1" /> Cards
                      </Button>
                      <Button variant="ghost" size="sm" className="flex items-center gap-1" onClick={() => onStudyNote(item, "quiz")}>
                        <ListChecks className="w-5 h-5 mr-1" /> Quiz
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ) : (
                <Card key={item.id} className="flex flex-col h-full overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FolderIcon className="w-4 h-4 text-black" />
                          {item.name}
                        </CardTitle>
                        <CardDescription>
                          {notes.filter((note: any) => note.folderId === item.id).length} notes
                        </CardDescription>
                        {item.description && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {typeof item.createdAt === 'number' && item.createdAt > 0 ? <TimeSince timestamp={item.createdAt} /> : <span>Unknown</span>}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <a href="#" className="text-xs text-blue-600 dark:text-blue-400 flex items-center hover:underline">
                        <span className="font-medium mr-1">{countStudyPairsInFolder(item.id)}</span> study items
                      </a>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      onStudyNote(item.id, "quiz")
                    }} disabled={notes.filter((note: any) => note.folderId === item.id).length === 0}>
                      <GraduationCap className="w-3 h-3 mr-1" /> Study
                    </Button>
                  </CardFooter>
                </Card>
              )
            )}
            {recentItems.length === 0 && (
              <div className="col-span-3 text-center py-12">
                <p className="text-gray-500 mb-4">No recent notes or folders. Create your first note or folder to get started!</p>
                <Button onClick={onCreateNote}>
                  <Plus className="w-4 h-4 mr-2" /> Create Note
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Create Folder Dialog */}
        <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderIcon className="w-5 h-5" />
                Create New Folder
              </DialogTitle>
              <DialogDescription>
                Create a new folder to organize your notes
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="folderName" className="text-sm font-medium">
                  Folder Name
                </label>
                <Input
                  id="folderName"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateFolder()
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="folderDescription" className="text-sm font-medium">
                  Description (Optional)
                </label>
                <Textarea
                  id="folderDescription"
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  placeholder="Enter folder description"
                  className="min-h-[80px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCreateFolderDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create Folder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

// To hide the scrollbar, add the following CSS to your global stylesheet (e.g., styles/globals.css):
//
// .hide-scrollbar {
//   scrollbar-width: none; /* Firefox */
//   -ms-overflow-style: none;  /* IE and Edge */
// }
// .hide-scrollbar::-webkit-scrollbar {
//   display: none; /* Chrome, Safari, Opera */
// }

"use client"

import { useState, useEffect } from "react"
import { BookOpen, Brain, Clock, Edit, Plus, Calendar, Tag, GraduationCap, Folder as FolderIcon, FileText, HomeIcon, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
}

export default function Dashboard({ notes, folders, onOpenNote, onStudyNote, onCreateNote }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("study")
  const [folderTestSessions, setFolderTestSessions] = useState<{ [folderId: string]: any }>({})
  const [noteTestSessions, setNoteTestSessions] = useState<{ [noteId: string]: any }>({})

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

  return (
    <div className="flex-1 overflow-auto hide-scrollbar">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            {/* <HomeIcon className="w-7 h-7 mr-2 text-black" /> */}
            <h1 className="text-2xl font-semibold">Dashboard</h1>
          </div>
          {/* <Button onClick={onCreateNote}>
            <Plus className="w-4 h-4 mr-2" /> New Note
          </Button> */}
        </div>

        {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Study Folders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {folders.length}
              </div>
              <p className="text-sm text-gray-500 mt-1"> Study folders you've created</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Study Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {notes.reduce((total, note) => total + countStudyPairs(note), 0)}
              </div>
              <p className="text-sm text-gray-500 mt-1">WHO/WHAT pairs for studying</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Study Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold">
                  {(() => {
                    const notesWithQuizzes = notes.filter((n) => n.studyStats && n.studyStats.quizAttempts && n.studyStats.quizAttempts > 0)
                    if (notesWithQuizzes.length === 0) return "0%"

                    const totalProgress = notesWithQuizzes.reduce((total, note) => total + getStudyProgress(note), 0)
                    return `${Math.round(totalProgress / notesWithQuizzes.length)}%`
                  })()}
                </div>
                <Progress
                  value={(() => {
                    const notesWithQuizzes = notes.filter((n) => n.studyStats && n.studyStats.quizAttempts && n.studyStats.quizAttempts > 0)
                    if (notesWithQuizzes.length === 0) return 0

                    const totalProgress = notesWithQuizzes.reduce((total, note) => total + getStudyProgress(note), 0)
                    return Math.round(totalProgress / notesWithQuizzes.length)
                  })()}
                  className="h-2 flex-1"
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">Average quiz score</p>
            </CardContent>
          </Card>
        </div> */}

        {/* 3-Card Dashboard Section with Framer Motion */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 overflow-visible">
          {/* Card 1: Upcoming Reviews */}
          <motion.div
            whileHover={{ scale: 1.04, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ zIndex: 2, position: 'relative' }}
          >
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Upcoming Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="text-sm text-gray-700 dark:text-gray-300">
                  {notes
                    .filter((note) => note.blocks && note.blocks.length > 0)
                    .sort((a, b) => {
                      if (!a.lastStudied) return -1;
                      if (!b.lastStudied) return 1;
                      return a.lastStudied - b.lastStudied;
                    })
                    .slice(0, 2)
                    .map((note) => (
                      <li key={note.id} className="mb-2 flex items-center justify-between">
                        <span className="truncate max-w-[120px]">{note.title}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {note.lastStudied ? getTimeSince(note.lastStudied) : "Never"}
                        </span>
                      </li>
                    ))}
                  {notes.length === 0 && <li>No notes to review.</li>}
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          {/* Card 2: Study Streak */}
          <motion.div
            whileHover={{ scale: 1.04, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            style={{ zIndex: 2, position: 'relative' }}
          >
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flame className="w-5 h-5 text-black" />
                  Study Streak
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between h-full">
                <div className="flex justify-end">
                  <div className="text-right">
                    <div className="text-4xl font-extrabold text-black leading-none mr-1">{(() => {
                      // Calculate streak: count consecutive days with at least one note studied
                      const days = new Set(
                        notes
                          .filter((n) => n.lastStudied)
                          .map((n) => {
                            const d = new Date(n.lastStudied!);
                            d.setHours(0, 0, 0, 0);
                            return d.getTime();
                          })
                      );
                      let streak = 0;
                      if (days.size > 0) {
                        let today = new Date();
                        today.setHours(0, 0, 0, 0);
                        while (days.has(today.getTime())) {
                          streak++;
                          today.setDate(today.getDate() - 1);
                        }
                      }
                      return streak;
                    })()}</div>
                    <div className="text-sm text-gray-500 mt-1 ">days</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {(() => {
                    // Calculate streak again for the message
                    const days = new Set(
                      notes
                        .filter((n) => n.lastStudied)
                        .map((n) => {
                          const d = new Date(n.lastStudied!);
                          d.setHours(0, 0, 0, 0);
                          return d.getTime();
                        })
                    );
                    let streak = 0;
                    if (days.size > 0) {
                      let today = new Date();
                      today.setHours(0, 0, 0, 0);
                      while (days.has(today.getTime())) {
                        streak++;
                        today.setDate(today.getDate() - 1);
                      }
                    }
                    return streak > 0 ? `You've studied ${streak} days in a row!` : 'Start studying to build your streak!';
                  })()}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Card 3: Recent Test Scores */}
          <motion.div
            whileHover={{ scale: 1.04, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            style={{ zIndex: 2, position: 'relative' }}
          >
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Recent Test Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="text-sm text-gray-700 dark:text-gray-300">
                  {(() => {
                    // Combine folder and note test sessions
                    const allSessions = [
                      ...Object.values(folderTestSessions).map((s: any) => ({ ...s, _type: 'folder' })),
                      ...Object.values(noteTestSessions).map((s: any) => ({ ...s, _type: 'note' }))
                    ]
                      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                      .slice(0, 3);
                    if (allSessions.length === 0) return <li>No test scores yet.</li>;
                    return allSessions.map((session: any) => (
                      <li key={session.id} className="mb-2 flex items-center justify-between">
                        <span className="truncate max-w-[120px]">
                          {session._type === 'folder'
                            ? getFolderName(session.folderId)
                            : notes.find(n => n.id === session.noteId)?.title || 'Note'}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">{session.score}%</span>
                        <span className="text-xs text-gray-400 ml-2">{formatDate(session.startTime)}</span>
                      </li>
                    ));
                  })()}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="recent"><Clock className="w-4 h-4 mr-1" />Recent</TabsTrigger>
            <TabsTrigger value="study"><GraduationCap className="w-4 h-4 mr-1" />Study History</TabsTrigger>
            <TabsTrigger value="review"><Tag className="w-4 h-4 mr-1" />Needs Review</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="mt-0">
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4"></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recentItems.map(({ type, item }) =>
                  type === "note" ? (
                    <Card key={item.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <FileText className="w-4 h-4 text-black" />
                              {item.title}
                            </CardTitle>
                            <CardDescription>{getFolderName(item.folderId)}</CardDescription>
                          </div>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> <TimeSince timestamp={item.updatedAt} />
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-2">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.tags && item.tags.length > 0 ? (
                            item.tags.map((tag: any) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="secondary" className="text-xs">No tags</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-2">
                          {item.blocks.find((b: any) => b.type === "note")?.content ||
                            item.blocks.find((b: any) => b.type === "what")?.content ||
                            "No content"}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center">
                            <span className="font-medium mr-1">{countStudyPairs(item)}</span> study items
                          </div>
                          {item.studyStats?.quizAttempts ? (
                            <div className="text-xs text-green-600 dark:text-green-400 flex items-center">
                              <span className="font-medium mr-1">{getStudyProgress(item)}%</span> quiz score
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2 flex justify-between">
                        <Button variant="outline" size="sm" onClick={() => onOpenNote(item)}>
                          <Edit className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => onStudyNote(item, "flashcards")}>
                            <BookOpen className="w-3 h-3 mr-1" /> Cards
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onStudyNote(item, "quiz")}>
                            <Brain className="w-3 h-3 mr-1" /> Quiz
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  ) : (
                    <Card key={item.id} className="overflow-hidden">
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
                      <CardContent className="pb-2">
                        <div className="flex items-center gap-2 mb-2">
                          <a href="#" className="text-xs text-blue-600 dark:text-blue-400 flex items-center hover:underline">
                            <span className="font-medium mr-1">{notes.filter((note: any) => note.folderId === item.id).reduce((total: number, note: any) => total + countStudyPairs(note), 0)}</span> study items
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
          </TabsContent>

          <TabsContent value="study" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Show folder study history first */}
              {folders.map((folder) => {
                const session = folderTestSessions[folder.id]
                if (!session) return null
                const folderNotes = notes.filter(note => note.folderId === folder.id)
                return (
                  <Card key={folder.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FolderIcon className="w-4 h-4 text-black" />
                            {folder.name}
                          </CardTitle>
                          <CardDescription>Folder Study Session</CardDescription>
                        </div>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> <TimeSince timestamp={session.startTime} />
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                          <div className="text-xs text-gray-500 mb-1">Flashcards</div>
                          <div className="text-lg font-bold">-</div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
                          <div className="text-xs text-gray-500 mb-1">Quiz Score</div>
                          <div className="text-lg font-bold">-</div>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                          <div className="text-xs text-gray-500 mb-1">Test Score</div>
                          <div className="text-lg font-bold">{session.score}%</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={session.score} className="h-2 flex-1" />
                        <span className="text-xs text-gray-500">Test</span>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-2 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onStudyNote(folder.id, "quiz")}
                        disabled={folderNotes.length === 0}>
                        <GraduationCap className="w-3 h-3 mr-1" /> Study
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
              {/* Show note study history as before, but add Test Score */}
              {studyNotes.map((note) => (
                <Card key={note.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="w-4 h-4 text-black" />
                          {note.title}
                        </CardTitle>
                        <CardDescription>{getFolderName(note.folderId)}</CardDescription>
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> <TimeSince timestamp={note.lastStudied || 0} />
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                        <div className="text-xs text-gray-500 mb-1">Flashcards</div>
                        <div className="text-lg font-bold">{note.studyStats?.flashcardReviews || 0}</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
                        <div className="text-xs text-gray-500 mb-1">Quiz Score</div>
                        <div className="text-lg font-bold">{getStudyProgress(note)}%</div>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                        <div className="text-xs text-gray-500 mb-1">Test Score</div>
                        <div className="text-lg font-bold">{noteTestSessions[note.id]?.score !== undefined ? `${noteTestSessions[note.id].score}%` : '-'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={getStudyProgress(note)} className="h-2 flex-1" />
                      <span className="text-xs text-gray-500">
                        {note.studyStats?.quizCorrect || 0}/{note.studyStats?.quizAttempts || 0}
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-between">
                    <Button variant="outline" size="sm" onClick={() => onOpenNote(note)}>
                      <Edit className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onStudyNote(note, "flashcards")}>
                        <BookOpen className="w-3 h-3 mr-1" /> Cards
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onStudyNote(note, "quiz")}>
                        <Brain className="w-3 h-3 mr-1" /> Quiz
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
              {studyNotes.length === 0 && (
                <div className="col-span-3 text-center py-12">
                  <p className="text-gray-500 mb-4">No study history yet. Start studying your notes!</p>
                  {notes.length > 0 ? (
                    <Button onClick={() => onStudyNote(notes[0], "flashcards")}>
                      <BookOpen className="w-4 h-4 mr-2" /> Start Studying
                    </Button>
                  ) : (
                    <Button onClick={onCreateNote}>
                      <Plus className="w-4 h-4 mr-2" /> Create Note
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="review" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {needsReviewNotes.map((note) => (
                <Card key={note.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="w-4 h-4 text-black" />
                          {note.title}
                        </CardTitle>
                        <CardDescription>{getFolderName(note.folderId)}</CardDescription>
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Tag className="w-3 h-3" /> {note.tags && note.tags.length > 0 ? note.tags[0] : "No tags"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded flex-1 text-center">
                        <div className="text-xs text-gray-500 mb-1">Study Items</div>
                        <div className="text-lg font-bold">{countStudyPairs(note)}</div>
                      </div>
                      {note.lastStudied ? (
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded flex-1 text-center">
                          <div className="text-xs text-gray-500 mb-1">Last Studied</div>
                          <div className="text-sm font-medium"><TimeSince timestamp={note.lastStudied} /></div>
                        </div>
                      ) : (
                        <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded flex-1 text-center">
                          <div className="text-xs text-gray-500 mb-1">Status</div>
                          <div className="text-sm font-medium">Never studied</div>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {note.blocks.find((b) => b.type === "who")?.content || "No content"}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-2 flex justify-between">
                    <Button variant="outline" size="sm" onClick={() => onOpenNote(note)}>
                      <Edit className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => onStudyNote(note, "flashcards")}>
                        <BookOpen className="w-3 h-3 mr-1" /> Cards
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onStudyNote(note, "quiz")}>
                        <Brain className="w-3 h-3 mr-1" /> Quiz
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
              {needsReviewNotes.length === 0 && (
                <div className="col-span-3 text-center py-12">
                  <p className="text-gray-500 mb-4">No notes need review. Create notes with WHO/WHAT pairs to study!</p>
                  <Button onClick={onCreateNote}>
                    <Plus className="w-4 h-4 mr-2" /> Create Note
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
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

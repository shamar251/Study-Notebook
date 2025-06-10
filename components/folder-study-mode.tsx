import { useState, useEffect } from "react"
import { Folder as FolderIcon, FileText, Plus, Edit, Repeat, Layers, ListChecks, BarChart, Table, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { Note } from "@/components/note-app"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { db } from "@/lib/db"

interface Subfolder {
  id: string
  name: string
  description?: string
}

interface FolderStudyModeProps {
  folderName: string
  folderDescription?: string
  folderNotes: Note[]
  subfolders: Subfolder[]
  onOpenSubfolder: (subfolderId: string) => void
  onCreateNote: () => void
  onCreateSubfolder: () => void
  onEditDescription?: (description: string) => void
  onEditName?: (name: string) => void
  onSelectMode: (mode: "flashcards" | "quiz" | "test") => void
  onNoteClick: (note: Note) => void
}

export default function FolderStudyMode({
  folderName,
  folderDescription,
  folderNotes,
  subfolders = [],
  onOpenSubfolder,
  onCreateNote,
  onCreateSubfolder,
  onEditDescription,
  onEditName,
  onSelectMode,
  onNoteClick,
}: FolderStudyModeProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [newName, setNewName] = useState(folderName)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [newDescription, setNewDescription] = useState(folderDescription || "")
  const [noteTestSessions, setNoteTestSessions] = useState<{ [noteId: string]: any }>({})
  const [folderQuizSession, setFolderQuizSession] = useState<any>(null)

  // Update local state if folderName/folderDescription change from parent
  useEffect(() => { setNewName(folderName) }, [folderName])
  useEffect(() => { setNewDescription(folderDescription || "") }, [folderDescription])

  useEffect(() => {
    async function fetchTestSessions() {
      const noteSessions: { [noteId: string]: any } = {}
      for (const note of folderNotes) {
        const testSessions = await db.testSessions.where("noteId").equals(note.id).reverse().toArray()
        if (testSessions.length > 0) {
          noteSessions[note.id] = testSessions[0]
        }
      }
      setNoteTestSessions(noteSessions)
    }
    fetchTestSessions()
  }, [folderNotes])

  useEffect(() => {
    async function fetchQuizSession() {
      const fid = folderNotes[0]?.folderId;
      if (!fid) {
        setFolderQuizSession(null);
        return;
      }
      const session = await db.quizSessions.where("folderId").equals(fid).reverse().first();
      setFolderQuizSession(session);
    }
    fetchQuizSession();
  }, [folderNotes])

  const handleNameBlur = () => {
    setIsEditingName(false)
    if (onEditName && newName.trim() && newName !== folderName) {
      onEditName(newName.trim())
    }
  }

  const handleDescriptionBlur = () => {
    setIsEditingDescription(false)
    if (onEditDescription && newDescription !== folderDescription) {
      onEditDescription(newDescription)
    }
  }

  // Count WHO/WHAT pairs (study items)
  function countStudyPairs(notes: Note[]): number {
    let count = 0;
    notes.forEach(note => {
      note.blocks.forEach((block, idx) => {
        if (block.type === "who") {
          if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
            const whatBlock = note.blocks.find(b => b.id === block.linkedBlockIds![0] && b.type === "what");
            if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
              count++;
            }
          } else {
            if (idx < note.blocks.length - 1) {
              const nextBlock = note.blocks[idx + 1];
              if (nextBlock.type === "what" && nextBlock.content && nextBlock.content.trim() !== "") {
                count++;
              }
            }
          }
        }
      });
    });
    return count;
  }

  // Calculate study progress for a note
  const getStudyProgress = (note: Note): number => {
    if (!note.studyStats) return 0
    const { quizAttempts = 0, quizCorrect = 0 } = note.studyStats
    if (quizAttempts === 0) return 0
    return Math.round((quizCorrect / quizAttempts) * 100)
  }

  // Get average quiz score for all notes in folder
  const getAverageQuizScore = (notes: Note[]): number => {
    const notesWithQuizzes = notes.filter(note => note.studyStats && note.studyStats.quizAttempts > 0)
    if (notesWithQuizzes.length === 0) return 0
    const totalProgress = notesWithQuizzes.reduce((total, note) => total + getStudyProgress(note), 0)
    return Math.round(totalProgress / notesWithQuizzes.length)
  }

  // Get latest test score for all notes in folder
  const getLatestTestScore = (notes: Note[]): number => {
    const scores = notes
      .map(note => noteTestSessions[note.id]?.score)
      .filter(score => score !== undefined)
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  return (
    <div className="flex-1 overflow-auto w-full h-full border-t rounded-lg border-gray-200">
      <div className="w-full p-5" >
        <div className="flex flex-col items-start mb-2 ">
          <div className="flex items-center gap-2 mb-1 pt-2 pl-1">
            <FolderIcon className="w-7 h-7 text-black" />
            {isEditingName ? (
              <input
                className="text-2xl font-medium bg-transparent border-none outline-none focus:ring-0 focus:border-none shadow-none" value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => { if (e.key === "Enter") handleNameBlur() }}
                autoFocus
                style={{ minWidth: 80 }}
              />
            ) : (
              <h1
                className="text-2xl font-medium cursor-pointer"
                onClick={() => setIsEditingName(true)}
              >
                {folderName}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-4 mb-2 w-full mt-2 ml-1">
            {isEditingDescription ? (
              <textarea
                className="text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:ring-0 focus:border-none shadow-none w-full resize-none"
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                autoFocus
                rows={1}
                style={{ minHeight: 0, margin: 0, padding: 0, lineHeight: '1.5' }}
              />
            ) : (
              <p
                className="text-sm text-gray-700 dark:text-gray-300 mt-0 mb-0 mr-2 cursor-pointer"
                onClick={() => setIsEditingDescription(true)}
              >
                {folderDescription || <span className="text-gray-400">Add a description...</span>}
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-4 border-b border-gray-200 pb-1 w-full">
            <div className="flex gap-2 mb-4 items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2 w-32">
                    <Layers className="w-4 h-4 mr-2" /> Study
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onSelectMode("flashcards")}> <Layers className="w-4 h-4 mr-2" /> Flashcards</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSelectMode("quiz")}> <ListChecks className="w-4 h-4 mr-2" /> Quiz</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onSelectMode("test")}> <Timer className="w-4 h-4 mr-2" /> Test</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Study stats section */}
              <div className="flex gap-2 ml-2">
                {/* Flashcards */}
                <div className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 flex items-center justify-center rounded-md text-center w-32 transition-colors">
                  <Layers className="w-4 h-4 text-current mr-2" />
                  <div className="text-base font-bold">{countStudyPairs(folderNotes)}</div>
                </div>
                {/* Quiz Score */}
                <div className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 flex items-center justify-center rounded-md text-center w-32 transition-colors">
                  <ListChecks className="w-4 h-4 text-current mr-2" />
                  <div className="text-base font-bold">{folderQuizSession?.score !== undefined ? `${folderQuizSession.score}%` : '-'}</div>
                </div>
                {/* Test Score */}
                <div className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 flex items-center justify-center rounded-md text-center w-32 transition-colors">
                  <Timer className="w-4 h-4 text-current mr-2" />
                  <div className="text-base font-bold">{getLatestTestScore(folderNotes)}%</div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 ml-auto mr-2">
              <Button onClick={onCreateNote}>
                <Plus className="w-4 h-4 mr-2" /> Create
              </Button>
            </div>
          </div>

        </div>

        <div className="mt-1 rounded-lg bg-gray-50 dark:bg-gray-900 p-4 h-full">
          {/* Render subfolders and their notes */}
          {subfolders.map((sub) => (
            <div key={sub.id}>
              <div
                className="flex items-center gap-2 mb-2 cursor-pointer hover:bg-accent/30 rounded px-2 py-1"
                onClick={() => onOpenSubfolder(sub.id)}
              >
                <FolderIcon className="w-5 h-5 text-black" />
                <span className="text-base text-gray-700 dark:text-gray-100 font-medium">{sub.name}</span>
              </div>
              {/* Notes for this subfolder */}
              {folderNotes
                .filter(note => note.folderId === sub.id)
                .map(note => (
                  <div
                    key={note.id}
                    className="flex items-center justify-between p-2 hover:bg-accent/20 rounded-md cursor-pointer ml-6"
                    onClick={() => onNoteClick(note)}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{note.title}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex gap-2 min-w-[220px]">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex items-center w-[90px] justify-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectMode("flashcards")
                          }}
                        >
                          <Layers className="w-4 h-4 mr-2" /> Cards
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex items-center w-[110px] justify-start"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectMode("test")
                          }}
                        >
                          <Timer className="w-4 h-4 mr-2" />
                          <span className="inline-block min-w-[48px] text-left">
                            Test ({noteTestSessions[note.id]?.score !== undefined ? noteTestSessions[note.id].score + '%' : '-'})
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ))}

          {/* Notes not in any subfolder */}
          {folderNotes
            .filter(note => !subfolders.some(sub => sub.id === note.folderId))
            .map(note => (
              <div
                key={note.id}
                className="flex items-center justify-between p-2 hover:bg-accent/20 rounded-md cursor-pointer"
                onClick={() => onNoteClick(note)}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{note.title}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-2 min-w-[220px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center w-[90px] justify-start"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectMode("flashcards")
                      }}
                    >
                      <Layers className="w-4 h-4 mr-2" /> Cards
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center w-[110px] justify-start"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectMode("test")
                      }}
                    >
                      <Timer className="w-4 h-4 mr-2" />
                      <span className="inline-block min-w-[48px] text-left">
                        Test ({noteTestSessions[note.id]?.score !== undefined ? noteTestSessions[note.id].score + '%' : '-'})
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Edit Description Dialog */}
      <Dialog open={false} onOpenChange={() => { }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Folder Description</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="folderDescription" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="folderDescription"
                value={folderDescription || ""}
                onChange={(e) => { }}
                placeholder="Enter folder description"
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => { }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
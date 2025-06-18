import { useState, useEffect } from "react"
import { Folder as FolderIcon, FileText, Plus, Edit, Repeat, Layers, ListChecks, BarChart, Table, Timer, X, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { Note } from "@/components/note-app"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { db } from "@/lib/db"
import { getAllChildFolderIds } from "@/hooks/use-db"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Subfolder {
  id: string
  name: string
  description?: string
}

interface FolderTestScore {
  folderId: string
  folderName: string
  score: number
  lastTestTime?: number
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
  onSelectMode: (mode: "flashcards" | "quiz" | "test", note?: Note, subfolderId?: string) => void
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
  const [folderTestSession, setFolderTestSession] = useState<any>(null)
  const [showNestedTestScores, setShowNestedTestScores] = useState(false)
  const [nestedTestScores, setNestedTestScores] = useState<FolderTestScore[]>([])
  const [mostRecentTest, setMostRecentTest] = useState<FolderTestScore | null>(null)
  const [subfolderTestSessions, setSubfolderTestSessions] = useState<{ [subfolderId: string]: any }>({})
  const [expandedSubfolders, setExpandedSubfolders] = useState<{ [id: string]: boolean }>({})

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

  useEffect(() => {
    async function fetchFolderTestSession() {
      const fid = folderNotes[0]?.folderId;
      if (!fid) {
        setFolderTestSession(null);
        return;
      }
      const session = await db.testSessions.where("folderId").equals(fid).reverse().first();
      setFolderTestSession(session);
    }
    fetchFolderTestSession();
  }, [folderNotes])

  // Update most recent test score (for button display)
  useEffect(() => {
    async function fetchMostRecentTest() {
      const currentFolderId = folderNotes[0]?.folderId;
      if (!currentFolderId) {
        setMostRecentTest(null);
        return;
      }
      const childFolderIds = await getAllChildFolderIds(currentFolderId);
      const allFolderIds = [currentFolderId, ...childFolderIds];
      const allFolders = await db.folders.toArray();
      const folderMap = new Map(allFolders.map(f => [f.id, f.name]));
      let mostRecent: FolderTestScore | null = null;
      for (const folderId of allFolderIds) {
        const sessions = await db.testSessions.where("folderId").equals(folderId).reverse().toArray();
        if (sessions.length > 0) {
          const latestSession = sessions[0];
          if (!mostRecent || latestSession.startTime > (mostRecent.lastTestTime || 0)) {
            mostRecent = {
              folderId,
              folderName: folderMap.get(folderId) || "Unknown Folder",
              score: latestSession.score,
              lastTestTime: latestSession.startTime
            };
          }
        }
      }
      setMostRecentTest(mostRecent);
    }
    fetchMostRecentTest();
  }, [folderNotes]);

  // Fetch latest test session for each subfolder
  useEffect(() => {
    async function fetchSubfolderTestSessions() {
      const sessions: { [subfolderId: string]: any } = {};
      for (const sub of subfolders) {
        const testSessions = await db.testSessions.where("folderId").equals(sub.id).reverse().toArray();
        if (testSessions.length > 0) {
          sessions[sub.id] = testSessions[0];
        }
      }
      setSubfolderTestSessions(sessions);
    }
    fetchSubfolderTestSessions();
  }, [subfolders]);

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

  // Fetch nested folder test scores
  const fetchNestedTestScores = async () => {
    try {
      const currentFolderId = folderNotes[0]?.folderId;
      if (!currentFolderId) return;

      // Get all child folder IDs
      const childFolderIds = await getAllChildFolderIds(currentFolderId);
      const allFolderIds = [currentFolderId, ...childFolderIds];

      // Get all folders to map IDs to names
      const allFolders = await db.folders.toArray();
      const folderMap = new Map(allFolders.map(f => [f.id, f.name]));

      // Get test sessions for all folders
      const testScores: FolderTestScore[] = [];

      for (const folderId of allFolderIds) {
        const sessions = await db.testSessions.where("folderId").equals(folderId).reverse().toArray();
        if (sessions.length > 0) {
          const latestSession = sessions[0];
          testScores.push({
            folderId,
            folderName: folderMap.get(folderId) || "Unknown Folder",
            score: latestSession.score,
            lastTestTime: latestSession.startTime
          });
        }
      }

      setNestedTestScores(testScores);
      setShowNestedTestScores(true);
    } catch (error) {
      console.error('Error fetching nested test scores:', error);
    }
  };

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

  // Get folder quiz score
  const getAverageQuizScore = (notes: Note[]): number => {
    if (!folderQuizSession?.score) return 0;
    return Math.round(folderQuizSession.score);
  }

  // Get latest test score for the folder
  const getLatestTestScore = (notes: Note[]): number => {
    if (!folderTestSession?.score) return 0;
    return Math.round(folderTestSession.score);
  }

  // Format date for test scores
  const formatTestDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 flex items-center justify-center rounded-md text-center w-32 transition-colors cursor-pointer"
                        onClick={fetchNestedTestScores}
                      >
                        <Timer className="w-4 h-4 text-current mr-2" />
                        <div className="text-base font-bold">{mostRecentTest ? mostRecentTest.score + '%' : '-'}</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      <span className="text-sm font-medium">
                        {mostRecentTest ? mostRecentTest.folderName : folderName}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
            <>
              <div className="flex items-center mb-2 px-2 py-1 hover:bg-accent/30 rounded">
                {/* Chevron column (fixed width) */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center">
                  <button
                    className="p-1 focus:outline-none"
                    onClick={() => setExpandedSubfolders(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                    aria-label={expandedSubfolders[sub.id] ? 'Collapse' : 'Expand'}
                  >
                    {expandedSubfolders[sub.id] ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {/* Icon+name column */}
                <div className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" onClick={() => onOpenSubfolder(sub.id)}>
                  <FolderIcon className="w-5 h-5 text-black" />
                  <span className="text-base text-gray-700 dark:text-gray-100 font-medium truncate">{sub.name}</span>
                </div>
                {/* Buttons group column (fixed width) */}
                <div className="flex gap-2 min-w-[250px] justify-between items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center w-[90px] justify-start"
                    onClick={e => {
                      e.stopPropagation();
                      onSelectMode("flashcards", undefined, sub.id);
                    }}
                  >
                    <Layers className="w-4 h-4 mr-2" /> Cards
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center w-[110px] justify-start"
                    onClick={e => {
                      e.stopPropagation();
                      onSelectMode("test", undefined, sub.id);
                    }}
                  >
                    <Timer className="w-4 h-4 mr-2" />
                    <span className="inline-block min-w-[48px] text-left">
                      Test ({subfolderTestSessions[sub.id]?.score !== undefined ? subfolderTestSessions[sub.id].score + '%' : '-'})
                    </span>
                  </Button>
                </div>
              </div>
              {expandedSubfolders[sub.id] && (
                <div className="ml-8">
                  {folderNotes
                    .filter(note => note.folderId === sub.id)
                    .map(note => (
                      <div
                        key={note.id}
                        className="flex items-center justify-between p-2 hover:bg-accent/20 rounded-md cursor-pointer"
                        onClick={() => onNoteClick(note)}
                      >
                        {/* Chevron placeholder for alignment */}
                        <div className="w-6 flex-shrink-0" />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{note.title}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-[250px] justify-between">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center w-[90px] justify-start"
                            onClick={e => {
                              e.stopPropagation();
                              onSelectMode("flashcards", note);
                            }}
                          >
                            <Layers className="w-4 h-4 mr-2" /> Cards
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center w-[110px] justify-start"
                            onClick={e => {
                              e.stopPropagation();
                              onSelectMode("test", note);
                            }}
                          >
                            <Timer className="w-4 h-4 mr-2" />
                            <span className="inline-block min-w-[48px] text-left">
                              Test ({noteTestSessions[note.id]?.score !== undefined ? noteTestSessions[note.id].score + '%' : '-'})
                            </span>
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
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
                {/* Chevron placeholder for alignment */}
                <div className="w-6 flex-shrink-0" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{note.title}</span>
                </div>
                <div className="flex items-center gap-2 min-w-[250px] justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center w-[90px] justify-start"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectMode("flashcards", note)
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
                      onSelectMode("test", note)
                    }}
                  >
                    <Timer className="w-4 h-4 mr-2" />
                    <span className="inline-block min-w-[48px] text-left">
                      Test ({noteTestSessions[note.id]?.score !== undefined ? noteTestSessions[note.id].score + '%' : '-'})
                    </span>
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Nested Test Scores Dialog */}
      <Dialog open={showNestedTestScores} onOpenChange={setShowNestedTestScores}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="w-5 h-5" />
              Test Scores - {folderName}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {nestedTestScores.length > 0 ? (
              <div className="space-y-3">
                {nestedTestScores.map((score) => (
                  <div key={score.folderId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <FolderIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{score.folderName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-sm">
                        {score.score}%
                      </Badge>
                      {score.lastTestTime && (
                        <span className="text-xs text-muted-foreground">
                          {formatTestDate(score.lastTestTime)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Timer className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No test scores found for nested folders</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNestedTestScores(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
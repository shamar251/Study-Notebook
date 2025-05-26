import { useState } from "react"
import { BookOpen, Brain, Plus, ArrowRight, CheckCircle, Edit, ListChecks, Timer, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import type { Note } from "@/components/note-app"

interface FolderStudyModeProps {
  folderName: string
  folderDescription?: string
  folderNotes: Note[]
  onSelectMode: (mode: "flashcards" | "quiz" | "test") => void
  onCreateNote: () => void
  onEditDescription?: (description: string) => void
}

export default function FolderStudyMode({
  folderName,
  folderDescription,
  folderNotes,
  onSelectMode,
  onCreateNote,
  onEditDescription,
}: FolderStudyModeProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [newDescription, setNewDescription] = useState(folderDescription || "")

  // Count total study items (WHO/WHAT pairs)
  const totalStudyItems = folderNotes.reduce((total, note) => {
    return total + note.blocks.filter((block) => block.type === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0).length
  }, 0)

  // Count notes that have study items
  const notesWithStudyItems = folderNotes.filter((note) =>
    note.blocks.some((block) => block.type === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0),
  ).length

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col items-start mb-8 w-full">
          <h1 className="text-3xl font-bold mb-1">{folderName}</h1>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-500">
              {folderNotes.length} {folderNotes.length === 1 ? "note" : "notes"}
            </span>
            <span className="text-sm text-gray-500">
              • {totalStudyItems} study items
            </span>
          </div>
          <div className="flex items-center gap-2 w-full">
            {folderDescription && (
              <p className="text-sm text-gray-500 mt-0 mb-0 mr-2">{folderDescription}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsEditingDescription(true)}
              aria-label="Edit folder description"
            >
              <Edit className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {totalStudyItems > 0 ? (
          <>
            <p className="text-gray-500 mb-6">
              Choose a study mode to review {totalStudyItems} items from {notesWithStudyItems}{" "}
              {notesWithStudyItems === 1 ? "note" : "notes"}
            </p>

            <div className="flex flex-row gap-6 w-full overflow-x-auto pb-2 md:justify-center md:gap-16">
              {/* Flashcard Study Card */}
              <Card className="min-w-[320px] max-w-sm flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <CardHeader className="bg-blue-50 dark:bg-blue-900/20 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    Flashcard Study
                  </CardTitle>
                  <CardDescription>Review with interactive flashcards</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-gray-600 dark:text-gray-400">
                    Study with flashcards created from your Who and What blocks. Flip cards to test your knowledge.
                  </p>
                  <div className="mt-4 bg-blue-50 dark:bg-blue-900/10 p-3 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                      <CheckCircle className="w-4 h-4" />
                      <span>Best for initial learning and memorization</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => onSelectMode("flashcards")}>Start Flashcards <ArrowRight className="w-4 h-4 ml-2" /></Button>
                </CardFooter>
              </Card>

              {/* Quiz Mode Card */}
              <Card className="min-w-[320px] max-w-sm flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <CardHeader className="bg-green-50 dark:bg-green-900/20 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-green-600 dark:text-green-400" />
                    Quiz Mode
                  </CardTitle>
                  <CardDescription>Test your knowledge with quizzes</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-gray-600 dark:text-gray-400">
                    Challenge yourself with multiple-choice questions generated from your notes.
                  </p>
                  <div className="mt-4 bg-green-50 dark:bg-green-900/10 p-3 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
                      <CheckCircle className="w-4 h-4" />
                      <span>Best for testing recall and reinforcing knowledge</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => onSelectMode("quiz")}>Start Quiz <ArrowRight className="w-4 h-4 ml-2" /></Button>
                </CardFooter>
              </Card>

              {/* Test Mode Card */}
              <Card className="min-w-[320px] max-w-sm flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <CardHeader className="bg-yellow-50 dark:bg-yellow-900/20 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    Test Mode
                  </CardTitle>
                  <CardDescription>Simulate a timed test with randomized questions from your notes.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-gray-600 dark:text-gray-400">
                    Take a full test with a timer, question navigation, and score summary. Great for exam practice!
                  </p>
                  <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded-md">
                    <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                      <CheckCircle className="w-4 h-4" />
                      <span>Best for simulating real exam conditions</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" onClick={() => onSelectMode("test")}>Start Test <ArrowRight className="w-4 h-4 ml-2" /></Button>
                </CardFooter>
              </Card>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <h2 className="text-xl font-bold mb-2">No Study Items Found</h2>
            <p className="text-gray-500 mb-6">Create notes with WHO and WHAT blocks to generate study materials.</p>
            <Button onClick={onCreateNote}>
              <Plus className="w-4 h-4 mr-2" /> Create New Note
            </Button>
          </div>
        )}

        {totalStudyItems > 0 && (
          <div className="mt-8 text-center">
            <Button variant="outline" onClick={onCreateNote}>
              <Plus className="w-4 h-4 mr-2" /> Create New Note
            </Button>
          </div>
        )}
      </div>

      {/* Edit Description Dialog */}
      <Dialog open={isEditingDescription} onOpenChange={setIsEditingDescription}>
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
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Enter folder description"
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditingDescription(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (onEditDescription) {
                  onEditDescription(newDescription)
                }
                setIsEditingDescription(false)
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
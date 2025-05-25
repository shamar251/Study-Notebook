"use client"

import { useState, useEffect } from "react"
import { Check, X, ArrowLeft, CheckCircle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { Note } from "@/components/note-app"
import 'katex/dist/katex.min.css'
import { InlineMath } from 'react-katex'
import type { Block } from "@/lib/db"

interface QuizViewProps {
  note?: Note
  notes?: Note[]
  folderName?: string
  onComplete?: (noteId: string, score: number, total: number) => void
}

interface QuizQuestion {
  question: string
  answer: string
  options: string[]
  questionImage?: string
  answerImage?: string
  noteId: string
  noteTitle: string
  math?: boolean
}

// Helper to render text or math
function renderMathOrText(block: any) {
  const text = block.question || block.answer || block.option || '';
  const math = block.math;
  const normalized = text.replace(/\\/g, '\\');
  if (math || normalized.includes('$')) {
    return <InlineMath math={normalized.replace(/^\$/, '').replace(/\$$/, '')} />;
  }
  return text;
}

export default function QuizView({ note, notes, folderName, onComplete }: QuizViewProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [quizCompleted, setQuizCompleted] = useState(false)
  const [isGroupMode, setIsGroupMode] = useState(false)
  const [progress, setProgress] = useState(0)
  const [shouldInitialize, setShouldInitialize] = useState(true)

  useEffect(() => {
    // Only initialize quiz if we should
    if (!shouldInitialize) return;

    // Determine if we're in group mode (studying a folder)
    setIsGroupMode(!!notes && notes.length > 0)
    console.log(`Quiz view - Group mode: ${isGroupMode}, Notes count: ${notes?.length || 0}`)

    // Generate quiz questions from who/what blocks
    const quizQuestions: QuizQuestion[] = []

    // Collect all unique 'what' blocks from the provided notes (for regular questions only)
    let whatBlocks: string[] = []
    let hasTrueFalseQuestions = false;
    if (notes) {
      notes.forEach((noteItem) => {
        noteItem.blocks.forEach((block) => {
          if (block.type === "what" && block.content && block.content.trim() !== "") {
            // Only count as regular WHAT block if not a true/false block
            if (!(block as any).truthState) {
              whatBlocks.push(block.content.trim())
            }
          }
          // Check for any true/false blocks
          if (block.type === "what" && (block as any).truthState) {
            hasTrueFalseQuestions = true;
          }
        })
      })
    } else if (note) {
      note.blocks.forEach((block) => {
        if (block.type === "what" && block.content && block.content.trim() !== "") {
          if (!(block as any).truthState) {
            whatBlocks.push(block.content.trim())
          }
        }
        if (block.type === "what" && (block as any).truthState) {
          hasTrueFalseQuestions = true;
        }
      })
    }
    // Remove duplicates
    whatBlocks = Array.from(new Set(whatBlocks))

    // If there are fewer than 4 unique regular what blocks and no true/false questions, do not start the quiz
    if (whatBlocks.length < 4 && !hasTrueFalseQuestions) {
      setQuestions([])
      setCurrentIndex(0)
      setSelectedAnswer(null)
      setIsAnswered(false)
      setScore(0)
      setQuizCompleted(false)
      setProgress(0)
      return
    }

    function addQuizQuestionsFromBlocks(blocks: Block[], noteId: string, noteTitle: string, noteObj: Note) {
      blocks.forEach((block) => {
        // True/False questions: only WHO as question, WHAT as statement, user picks True/False
        if (block.type === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
          const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what")
          if (whatBlock && whatBlock.truthState) {
            // Only use the statement, not the answer, in the question
            const statement = whatBlock.originalContent || whatBlock.content;
            quizQuestions.push({
              question: `${block.content}`,
              answer: whatBlock.truthState === "true" ? "True" : "False",
              options: ["True", "False"].sort(() => Math.random() - 0.5),
              questionImage: block.image,
              answerImage: whatBlock.image,
              noteId,
              noteTitle,
              math: whatBlock.math === true,
            });
            return; // Do not generate regular questions for this pair
          }
        }
        // Existing WHO/WHAT logic
        if (block.type === "who") {
          // New structure: Check for linkedBlockIds array
          if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
            const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what")
            if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
              // Only add regular question if not a true/false block
              if (!whatBlock.truthState) {
                // Create a question from the "what" asking about the "who"
                quizQuestions.push({
                  question: `${whatBlock.content.toLowerCase()}`,
                  answer: block.content,
                  options: generateOptions(block.content, [noteObj], "who"),
                  questionImage: block.image,
                  answerImage: whatBlock.image,
                  noteId,
                  noteTitle,
                  math: whatBlock.math === true,
                })
                // Create a question from the "who" asking about the "what"
                quizQuestions.push({
                  question: `${block.content}`,
                  answer: whatBlock.content,
                  options: generateOptions(whatBlock.content, [noteObj], "what"),
                  questionImage: block.image,
                  answerImage: whatBlock.image,
                  noteId,
                  noteTitle,
                  math: block.math === true,
                })
              }
            }
          }
          // Old structure: Look for adjacent WHAT blocks
          else {
            const blockIndex = blocks.findIndex(b => b.id === block.id)
            if (blockIndex !== -1 && blockIndex < blocks.length - 1) {
              const whatBlock = blocks[blockIndex + 1]
              if (whatBlock.type === "what" && whatBlock.content && whatBlock.content.trim() !== "") {
                // Only add regular question if not a true/false block
                if (!whatBlock.truthState) {
                  // Create a question from the "what" asking about the "who"
                  quizQuestions.push({
                    question: `${whatBlock.content.toLowerCase()}`,
                    answer: block.content,
                    options: generateOptions(block.content, [noteObj], "who"),
                    questionImage: block.image,
                    answerImage: whatBlock.image,
                    noteId,
                    noteTitle,
                    math: whatBlock.math === true,
                  })
                  // Create a question from the "who" asking about the "what"
                  quizQuestions.push({
                    question: `${block.content}`,
                    answer: whatBlock.content,
                    options: generateOptions(whatBlock.content, [noteObj], "what"),
                    questionImage: block.image,
                    answerImage: whatBlock.image,
                    noteId,
                    noteTitle,
                    math: block.math === true,
                  })
                }
              }
            }
          }
        }
      })
    }

    if (note) {
      addQuizQuestionsFromBlocks(note.blocks, note.id, note.title, note!)
    } else if (notes) {
      notes.forEach((noteItem) => {
        addQuizQuestionsFromBlocks(noteItem.blocks, noteItem.id, noteItem.title, noteItem)
      })
    }

    console.log(`Generated ${quizQuestions.length} quiz questions`)
    // Shuffle the questions
    const shuffled = [...quizQuestions].sort(() => Math.random() - 0.5)
    setQuestions(shuffled.slice(0, 10)) // Limit to 10 questions
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setIsAnswered(false)
    setScore(0)
    setQuizCompleted(false)
    setProgress(0)
    setShouldInitialize(false)
  }, [note, notes, shouldInitialize])

  useEffect(() => {
    // Update progress
    if (questions.length > 0) {
      setProgress(Math.round((currentIndex / questions.length) * 100))
    }
  }, [currentIndex, questions.length])

  const generateOptions = (correctAnswer: string, notesList: Note[], blockType: "who" | "what"): string[] => {
    // Get all possible answers from the notes
    const allAnswers: string[] = []
    notesList.forEach((noteItem) => {
      noteItem.blocks
        .filter((block) => block.type === blockType)
        .forEach((block) => {
          // Exclude WHAT blocks with a truthState from being used as options
          if (blockType === "what" && (block as any).truthState) return;
          // Exclude WHO blocks linked to a WHAT block with a truthState
          if (blockType === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
            const whatBlock = noteItem.blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what")
            if (whatBlock && whatBlock.truthState) return;
          }
          if (block.content !== correctAnswer) {
            allAnswers.push(block.content)
          }
        })
    })
    // Only use real answers from the notes, no fake answers
    const shuffled = allAnswers.sort(() => Math.random() - 0.5).slice(0, 3)
    // Add the correct answer and shuffle again
    return [...shuffled, correctAnswer].sort(() => Math.random() - 0.5)
  }

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer)
  }

  const checkAnswer = () => {
    if (!selectedAnswer) return

    setIsAnswered(true)
    if (selectedAnswer === questions[currentIndex].answer) {
      setScore(score + 1)
    }
  }

  const goToNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedAnswer(null)
      setIsAnswered(false)
    } else {
      setQuizCompleted(true)
      if (onComplete) {
        // In group mode, we'll just use the ID of the last question's note
        onComplete(questions[currentIndex].noteId, score, questions.length)
      }
    }
  }

  const restartQuiz = () => {
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setIsAnswered(false)
    setScore(0)
    setQuizCompleted(false)
    setProgress(0)
    setShouldInitialize(true) // This will trigger the initialization effect

    // Reshuffle the questions
    setQuestions([...questions].sort(() => Math.random() - 0.5))
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="max-w-md">
          <h2 className="mb-2 text-2xl font-bold">Not enough study material</h2>
          <p className="mb-4 text-gray-500">
            You need at least 4 unique WHAT blocks in this folder to start a quiz. Add more notes or WHAT blocks to begin.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {isGroupMode && (
        <div className="p-4 border-b flex items-center">
          <h1 className="text-xl font-bold">{folderName} Quiz</h1>
        </div>
      )}

      {quizCompleted ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="max-w-md">
            <div className="mb-6 text-green-500 flex justify-center">
              <CheckCircle className="w-16 h-16" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">Quiz Completed!</h2>
            <p className="mb-6 text-xl">
              Your score: {score} / {questions.length} ({Math.round((score / questions.length) * 100)}%)
            </p>
            <div className="flex gap-4 justify-center">
              <Button variant="outline" onClick={restartQuiz}>
                <RotateCcw className="w-4 h-4 mr-2" /> Restart Quiz
              </Button>
              <Button
                onClick={() => {
                  if (note) {
                    // If we're in single note mode, go back to editor
                    setQuizCompleted(false)
                  } else {
                    // If we're in group mode, we'd need a way to go back to the folder view
                    // This would be handled by the parent component
                    setQuizCompleted(false)
                  }
                }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Notes
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 p-4">
          <div className="w-full max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm">
                Question {currentIndex + 1} of {questions.length}
              </div>
              <div className="text-sm">
                Score: {score} ({progress}% Complete)
              </div>
            </div>
            <Progress value={progress} className="h-2 w-full mb-4" />

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">{renderMathOrText(questions[currentIndex])}</h2>
                {isGroupMode && (
                  <Badge variant="outline" className="ml-2">
                    {questions[currentIndex].noteTitle}
                  </Badge>
                )}
              </div>

              {questions[currentIndex].questionImage && (
                <div className="mb-4 flex justify-center">
                  <img
                    src={questions[currentIndex].questionImage}
                    alt="Question"
                    className="max-h-48 rounded-md"
                  />
                </div>
              )}

              <RadioGroup value={selectedAnswer || ""} onValueChange={handleAnswerSelect} className="space-y-3">
                {questions[currentIndex].options.map((option, index) => (
                  <div
                    key={index}
                    className={`flex items-center space-x-2 rounded-lg border p-3 ${isAnswered
                      ? option === questions[currentIndex].answer
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : option === selectedAnswer
                          ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                          : ""
                      : ""
                      }`}
                  >
                    <RadioGroupItem value={option} id={`option-${index}`} disabled={isAnswered} />
                    <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                      {option.startsWith('data:image') ? (
                        <img
                          src={option}
                          alt="Option"
                          className="max-h-16 rounded-md"
                        />
                      ) : (
                        renderMathOrText({ option, math: questions[currentIndex].math })
                      )}
                    </Label>
                    {isAnswered && option === questions[currentIndex].answer && (
                      <Check className="w-5 h-5 text-green-500" />
                    )}
                    {isAnswered && option === selectedAnswer && option !== questions[currentIndex].answer && (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                ))}
              </RadioGroup>

              {isAnswered && questions[currentIndex].answerImage && (
                <div className="mt-4 flex justify-center">
                  <img
                    src={questions[currentIndex].answerImage}
                    alt="Answer"
                    className="max-h-48 rounded-md"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-center gap-4">
              {!isAnswered ? (
                <Button onClick={checkAnswer} disabled={!selectedAnswer}>
                  Check Answer
                </Button>
              ) : (
                <Button onClick={goToNextQuestion}>
                  {currentIndex < questions.length - 1 ? "Next Question" : "See Results"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

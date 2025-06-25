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
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from '@dnd-kit/utilities';
import { db } from "@/lib/db"
import { BlockConnectionManager } from "@/lib/block-connections"
import { generateQuizQuestions } from '@/lib/question-generator'

interface QuizViewProps {
  note?: Note
  notes?: Note[]
  folderName?: string
  onComplete?: (noteId: string, score: number, total: number) => void
}

interface MultipleChoiceQuizQuestion {
  type: "multiple-choice";
  question: string;
  answer: string;
  options: string[];
  questionImage?: string;
  answerImage?: string;
  noteId: string;
  noteTitle: string;
  math?: boolean;
}

interface TrueFalseQuizQuestion {
  type: "true-false";
  question: string;
  statement: string;
  answer: string; // "True" or "False"
  options: string[];
  questionImage?: string;
  answerImage?: string;
  noteId: string;
  noteTitle: string;
  math?: boolean;
}

interface SequenceQuizQuestion {
  type: "sequence";
  question: string;
  sequence: string[]; // correct order
  options: string[]; // shuffled order
  noteId: string;
  noteTitle: string;
}

type AnyQuizQuestion = MultipleChoiceQuizQuestion | TrueFalseQuizQuestion | SequenceQuizQuestion;

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

// Helper to get ordered HOW blocks in the same group as a WHO block
function getOrderedHowBlocksForWho(whoBlock: Block, allBlocks: Block[]): Block[] {
  // Use the same robust group traversal as the editor
  const visited = new Set<string>();
  function traverse(b: Block) {
    if (!b || visited.has(b.id)) return;
    visited.add(b.id);
    // Forward
    (b.linkedBlockIds || []).forEach(id => {
      const next = allBlocks.find(x => x.id === id);
      if (next) traverse(next);
    });
    // Backward
    allBlocks.forEach(x => {
      if (x.linkedBlockIds?.includes(b.id)) traverse(x);
    });
  }
  traverse(whoBlock);

  // Get all blocks in the group
  const groupBlocks = allBlocks.filter(b => visited.has(b.id));

  // Filter HOW blocks and sort by their order in allBlocks (UI order)
  return groupBlocks
    .filter(b => b.type === "how")
    .sort((a, b) => allBlocks.indexOf(a) - allBlocks.indexOf(b));
}

export default function QuizView({ note, notes, folderName, onComplete }: QuizViewProps) {
  const [questions, setQuestions] = useState<AnyQuizQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [quizCompleted, setQuizCompleted] = useState(false)
  const [isGroupMode, setIsGroupMode] = useState(false)
  const [progress, setProgress] = useState(0)
  const [shouldInitialize, setShouldInitialize] = useState(true)
  const [sequenceOrder, setSequenceOrder] = useState<string[]>([]); // for sequence mode
  const [wasSequenceCorrect, setWasSequenceCorrect] = useState<boolean | null>(null); // for sequence mode feedback
  const [userSequenceOrder, setUserSequenceOrder] = useState<string[]>([]); // stores user's submitted order
  const [showUserSequence, setShowUserSequence] = useState(false); // toggles between correct/user sequence
  const [quizStartTime, setQuizStartTime] = useState(Date.now())

  useEffect(() => {
    // Only initialize quiz if we should
    if (!shouldInitialize) return;
    setQuizStartTime(Date.now());

    // Determine if we're in group mode (studying a folder)
    setIsGroupMode(!!notes && notes.length > 0)
    console.log(`Quiz view - Group mode: ${isGroupMode}, Notes count: ${notes?.length || 0}`)

    // Generate quiz questions from who/what blocks
    const quizQuestions = generateQuizQuestions(notes ? notes : note ? [note] : []);

    console.log(`Generated ${quizQuestions.length} quiz questions`)
    // If there are no quiz questions, do not start the quiz
    if (quizQuestions.length === 0) {
      setQuestions([])
      setCurrentIndex(0)
      setSelectedAnswer(null)
      setIsAnswered(false)
      setScore(0)
      setQuizCompleted(false)
      setProgress(0)
      return
    }
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
    const allAnswers: string[] = [];
    notesList.forEach((noteItem) => {
      noteItem.blocks
        .filter((block) => block.type === blockType)
        .forEach((block) => {
          // Exclude WHAT blocks with a truthState from being used as options
          if (blockType === "what" && (block as any).truthState) return;
          // Exclude sequence-based WHAT blocks (those with linkedBlockIds)
          if (blockType === "what" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) return;
          // Exclude WHO blocks linked to a WHAT block with a truthState
          if (blockType === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
            const whatBlock = noteItem.blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what")
            if (whatBlock && whatBlock.truthState) return;
          }
          // Exclude WHO blocks that are sequence-based (2+ linked WHATs)
          if (blockType === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length >= 2) return;
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
    if (!selectedAnswer) return;
    setIsAnswered(true);
    // Only check answer for multiple choice questions
    const q = questions[currentIndex];
    if ('answer' in q && typeof q.answer === 'string' && selectedAnswer === q.answer) {
      setScore(score + 1);
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
        if (notes && notes.length > 0 && folderName) {
          // Save quiz session for folder
          handleQuizComplete(notes[0].folderId, score, questions.length, questions);
        }
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

  // When a sequence question is shown, initialize sequenceOrder and reset wasSequenceCorrect
  useEffect(() => {
    if (questions.length > 0 && questions[currentIndex] && (questions[currentIndex] as any).type === "sequence") {
      setSequenceOrder((questions[currentIndex] as SequenceQuizQuestion).options);
      setIsAnswered(false);
      setWasSequenceCorrect(null);
      setUserSequenceOrder([]);
      setShowUserSequence(false);
    }
    // eslint-disable-next-line
  }, [currentIndex, questions]);

  // Sequence drag-and-drop handlers
  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = sequenceOrder.indexOf(active.id);
      const newIndex = sequenceOrder.indexOf(over.id);
      setSequenceOrder(arrayMove(sequenceOrder, oldIndex, newIndex));
    }
  }

  // Sequence Sortable Item
  function SortableItem({ id, disabled }: { id: string, disabled: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      cursor: disabled ? 'default' : 'grab',
    };
    // Find the block for this id (for image support)
    const block = questions[currentIndex] && 'type' in questions[currentIndex] && questions[currentIndex].type === 'sequence'
      ? (note ? note.blocks : (notes ? notes.flatMap(n => n.blocks) : [])).find((b: any) => b.content === id)
      : null;
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 ${disabled ? 'opacity-60' : ''}`}
      >
        {block && block.image && (
          <img
            src={block.image}
            alt="Option"
            className="max-h-64 max-w-md rounded-md mb-2 object-contain"
            style={{ display: 'block', margin: '0 auto' }}
          />
        )}
        <span className="text-lg font-medium text-center">{id}</span>
      </div>
    );
  }

  const handleQuizComplete = async (folderId: string, score: number, total: number, questions: AnyQuizQuestion[]) => {
    await db.quizSessions.put({
      id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      folderId,
      startTime: quizStartTime,
      endTime: Date.now(),
      duration: Math.floor((Date.now() - quizStartTime) / 1000),
      score: Math.round((score / total) * 100),
      questions: questions.map(q => ({
        blockId: 'blockId' in q ? (q as any).blockId || '' : '',
        userAnswer: 'userAnswer' in q ? (q as any).userAnswer || '' : '',
        correctAnswer: 'correctAnswer' in q ? (q as any).correctAnswer || '' : '',
        isCorrect: 'isCorrect' in q ? (q as any).isCorrect || false : false,
      })),
    });
  };

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
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm">
                Question {currentIndex + 1} of {questions.length}
              </div>
              <div className="text-sm">
                Score: {score} ({progress}% Complete)
              </div>
            </div>
            <Progress value={progress} className="h-2 w-full mb-4" />

            {/* Sequence Mode UI */}
            {('type' in questions[currentIndex]) && questions[currentIndex].type === "sequence" ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 max-w-7xl mx-auto flex flex-col" style={{ height: '500px' }}>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold">{questions[currentIndex].question}</h2>
                  {isGroupMode && (
                    <Badge variant="outline" className="ml-2">
                      {questions[currentIndex].noteTitle}
                    </Badge>
                  )}
                </div>
                {/* Only use DnD when answering */}
                {!isAnswered ? (
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div style={{ maxHeight: '100%', overflowY: 'auto', width: '100%', margin: '0 auto', padding: '0 20px' }} className="flex-1 min-h-0">
                      <SortableContext items={sequenceOrder} strategy={verticalListSortingStrategy}>
                        {sequenceOrder.map((id: string, idx: number) => (
                          <div className="relative" key={id}>
                            <SortableItem id={id} disabled={isAnswered} />
                          </div>
                        ))}
                      </SortableContext>
                    </div>
                  </DndContext>
                ) : (
                  <div style={{ maxHeight: '100%', overflowY: 'auto', width: '100%', margin: '0 auto', padding: '0 20px' }} className="flex-1 min-h-0">
                    {(isAnswered && !wasSequenceCorrect) ? (
                      (showUserSequence ? userSequenceOrder : (questions[currentIndex] as SequenceQuizQuestion).sequence).map((id: string, idx: number) => (
                        <div className="relative cursor-pointer select-none" key={id} onClick={() => setShowUserSequence(s => !s)}>
                          <div className="flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 w-full">
                            <span className="text-lg font-medium text-center">{id}</span>
                          </div>
                          {showUserSequence
                            ? <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-600"><X className="w-5 h-5" /></span>
                            : <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600"><Check className="w-5 h-5" /></span>
                          }
                        </div>
                      ))
                    ) : (
                      sequenceOrder.map((id: string, idx: number) => (
                        <div className="relative select-none" key={id}>
                          <div className="flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 w-full">
                            <span className="text-lg font-medium text-center">{id}</span>
                          </div>
                          {isAnswered && wasSequenceCorrect && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-600">
                              <Check className="w-5 h-5" />
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
                <div className="flex justify-center gap-4 mt-6">
                  {!isAnswered ? (
                    <Button onClick={() => {
                      setUserSequenceOrder(sequenceOrder); // store user's submitted order BEFORE rearranging
                      setIsAnswered(true);
                      const correct = JSON.stringify(sequenceOrder) === JSON.stringify((questions[currentIndex] as SequenceQuizQuestion).sequence);
                      setWasSequenceCorrect(correct);
                      if (correct) {
                        setScore(score + 1);
                      } else {
                        // Rearrange the drag-and-drop items to the correct sequence
                        setSequenceOrder((questions[currentIndex] as SequenceQuizQuestion).sequence);
                        setShowUserSequence(false); // always show correct sequence first
                      }
                    }}>
                      Submit Order
                    </Button>
                  ) : (
                    <Button onClick={goToNextQuestion}>
                      {currentIndex < questions.length - 1 ? "Next Question" : "See Results"}
                    </Button>
                  )}
                </div>
                {/* Feedback at the bottom */}
                {isAnswered && (
                  <div className="mt-4 text-center">
                    {wasSequenceCorrect
                      ? <span className="text-green-600 font-bold">Correct!</span>
                      : <span className="text-red-600 font-bold">Incorrect</span>
                    }
                  </div>
                )}
              </div>
            ) : (
              // Only render multiple choice UI if this is a QuizQuestion
              ('answer' in questions[currentIndex]) && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 max-w-7xl mx-auto">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold">{renderMathOrText(questions[currentIndex])}</h2>
                    {isGroupMode && (
                      <Badge variant="outline" className="ml-2">
                        {questions[currentIndex].noteTitle}
                      </Badge>
                    )}
                  </div>
                  {'questionImage' in questions[currentIndex] && questions[currentIndex].questionImage && (
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
                          ? option === (questions[currentIndex] as MultipleChoiceQuizQuestion).answer
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
                            renderMathOrText({ option, math: 'math' in questions[currentIndex] ? questions[currentIndex].math : false })
                          )}
                        </Label>
                        {isAnswered && option === (questions[currentIndex] as MultipleChoiceQuizQuestion).answer && (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                        {isAnswered && option === selectedAnswer && option !== (questions[currentIndex] as MultipleChoiceQuizQuestion).answer && (
                          <X className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    ))}
                  </RadioGroup>
                  {'answerImage' in questions[currentIndex] && isAnswered && questions[currentIndex].answerImage && (
                    <div className="mt-4 flex justify-center">
                      <img
                        src={questions[currentIndex].answerImage}
                        alt="Answer"
                        className="max-h-48 rounded-md"
                      />
                    </div>
                  )}
                </div>
              )
            )}

            {/* Conditionally render the bottom navigation button only for non-sequence questions */}
            {!(('type' in questions[currentIndex]) && questions[currentIndex].type === "sequence") && (
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}

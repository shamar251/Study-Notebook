"use client"

import { useState, useEffect } from "react"
import { Check, X, ArrowLeft, CheckCircle, RotateCcw, HelpCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
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
import { SpacedRepetitionService } from '@/lib/spaced-repetition'

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
  const [hybridJudgingEnabled, setHybridJudgingEnabled] = useState<boolean>(false)
  const [hybridLow, setHybridLow] = useState<number>(0.65)
  const [hybridHigh, setHybridHigh] = useState<number>(0.9)
  const [llmModel, setLlmModel] = useState<string>('')
  const [llmTemperature, setLlmTemperature] = useState<number>(0.8)
  const [llmTopP, setLlmTopP] = useState<number>(0.9)
  const [userTextAnswer, setUserTextAnswer] = useState<string>("")
  const [openEndedDecision, setOpenEndedDecision] = useState<'correct' | 'partial' | 'incorrect' | null>(null)
  const [partialCreditWeight, setPartialCreditWeight] = useState<number>(0.5)
  const [isJudging, setIsJudging] = useState<boolean>(false)
  const [isHintLoading, setIsHintLoading] = useState<boolean>(false)
  const [hintText, setHintText] = useState<string>("")
  const [perQuestionLLM, setPerQuestionLLM] = useState<Record<string, boolean>>({})
  const [quizLLMChance, setQuizLLMChance] = useState<number>(0.5)

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
      setOpenEndedDecision(null)
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

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const hj = window.localStorage.getItem('quizHybridJudging');
      const low = window.localStorage.getItem('quizHybridLow');
      const high = window.localStorage.getItem('quizHybridHigh');
      const model = window.localStorage.getItem('llmModel');
      const temp = window.localStorage.getItem('llmTemperature');
      const topP = window.localStorage.getItem('llmTopP');
      const partialW = window.localStorage.getItem('quizPartialWeight');
      const llmChance = window.localStorage.getItem('quizLLMChance');
      if (hj != null) setHybridJudgingEnabled(hj === 'true');
      if (low != null) setHybridLow(Number(low));
      if (high != null) setHybridHigh(Number(high));
      if (model) setLlmModel(model);
      if (temp) setLlmTemperature(Number(temp));
      if (topP) setLlmTopP(Number(topP));
      if (partialW) {
        const w = Number(partialW);
        if (!Number.isNaN(w) && w >= 0 && w <= 1) setPartialCreditWeight(w);
      }
      if (llmChance != null) {
        const c = Number(llmChance);
        if (!Number.isNaN(c) && c >= 0 && c <= 1) setQuizLLMChance(c);
      }
    } catch { }
  }, [])

  // Recompute per-question LLM flags whenever questions or difficulty/settings change
  useEffect(() => {
    if (!questions || questions.length === 0) return;
    const mapping: Record<string, boolean> = {};
    questions.forEach((q: any) => {
      const isSeq = 'type' in q && q.type === 'sequence';
      mapping[q.id] = hybridJudgingEnabled && !isSeq ? Math.random() < quizLLMChance : false;
    });
    setPerQuestionLLM(mapping);
  }, [questions, hybridJudgingEnabled, quizLLMChance])

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
          if (block.content && block.content !== correctAnswer) {
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

  const checkAnswer = async () => {
    if (isAnswered || isJudging) return; // guard against double submit
    const q = questions[currentIndex];
    // Sequence handled elsewhere
    if (!q || (('type' in q) && q.type === 'sequence')) return;

    // For existing MCQ/TF flow
    if (!hybridJudgingEnabled) {
      if (!selectedAnswer) return;
      setIsAnswered(true);
      if ('answer' in q && typeof q.answer === 'string' && selectedAnswer === q.answer) {
        setScore(score + 1);
        // Create study item for correct answers
        await createStudyItemFromQuestion(q);
      }
      return;
    }

    // Hybrid judging expects free-text user answer ONLY when this question is flagged for LLM; otherwise use selected option
    const currentIsLLM = perQuestionLLM[(q as any).id] === true;
    const userAnswer = hybridJudgingEnabled && currentIsLLM ? (userTextAnswer || '') : (selectedAnswer || '');
    const correctAnswer = 'answer' in q ? (q as any).answer : '';
    if (!correctAnswer) return;

    // If user submits with empty text in LLM mode, treat as "I don't know" and reveal the answer immediately
    if (hybridJudgingEnabled && currentIsLLM && (!userAnswer || userAnswer.trim() === '')) {
      setIsAnswered(true);
      setOpenEndedDecision('incorrect');
      return;
    }

    setIsAnswered(true);
    if (hybridJudgingEnabled && currentIsLLM) setIsJudging(true);

    // Call IPC grading
    // @ts-ignore
    const isElectron = typeof window !== 'undefined' && window?.electronAPI?.gradeAnswer;
    if (!isElectron || !(hybridJudgingEnabled && currentIsLLM)) {
      // Fallback: exact match
      if (userAnswer && userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
        setScore(s => s + 1);
        // Create study item for correct answers
        await createStudyItemFromQuestion(q);
      }
      return;
    }
    try {
      // @ts-ignore
      const modelToUse = (llmModel && llmModel.trim().length > 0)
        ? llmModel
        : (typeof window !== 'undefined' ? (window.localStorage.getItem('llmModel') || 'llama3:latest') : 'llama3:latest');
      const res = await window.electronAPI.gradeAnswer({
        userAnswer,
        correctAnswer,
        low: hybridLow,
        high: hybridHigh,
        model: modelToUse,
        temperature: llmTemperature,
        top_p: llmTopP,
      });
      // Mirror logs to terminal
      try { /* @ts-ignore */ window.electronAPI?.log?.({ tag: 'QUIZ', res }); } catch { }
      console.log('[QUIZ] grade response', res);
      if (res?.success) {
        if (res.decision === 'correct') {
          setScore(s => s + 1);
          setOpenEndedDecision('correct');
          // Create study item for correct answers
          await createStudyItemFromQuestion(q);
        }
        else if (res.decision === 'partial') {
          setScore(s => s + partialCreditWeight);
          setOpenEndedDecision('partial');
          // Create study item for partial answers too
          await createStudyItemFromQuestion(q);
        }
        else { setOpenEndedDecision('incorrect'); }
        // In future: handle partial credit UI if needed
      } else {
        try { /* @ts-ignore */ window.electronAPI?.log?.({ tag: 'QUIZ', error: res?.error }); } catch { }
        console.warn('[QUIZ] grade failed', res?.error);
        // Fallback to exact match on error
        if (userAnswer && userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
          setScore(s => s + 1); setOpenEndedDecision('correct');
          // Create study item for correct answers
          await createStudyItemFromQuestion(q);
        } else {
          setOpenEndedDecision('incorrect');
        }
      }
    } catch (e) {
      try { /* @ts-ignore */ window.electronAPI?.log?.({ tag: 'QUIZ', thrown: String(e) }); } catch { }
      console.error('[QUIZ] grade threw', e);
      if (userAnswer && userAnswer.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) {
        setScore(s => s + 1); setOpenEndedDecision('correct');
        // Create study item for correct answers
        await createStudyItemFromQuestion(q);
      } else {
        setOpenEndedDecision('incorrect');
      }
    } finally {
      if (hybridJudgingEnabled) setIsJudging(false);
    }
  }

  const createStudyItemFromQuestion = async (question: AnyQuizQuestion) => {
    try {
      // Get the note for this question
      const currentNote = notes?.find(n => n.id === question.noteId) || note;
      if (!currentNote) return;

      // Find the corresponding block
      let block;
      if ('type' in question && question.type === 'sequence') {
        // For sequence questions, find the first WHO block
        block = currentNote.blocks.find((b: any) => b.type === 'who' && b.content === question.question);
      } else {
        // For other questions, find the block that matches the question
        block = currentNote.blocks.find((b: any) =>
          (b.type === 'who' && b.content === question.question) ||
          (b.type === 'what' && b.content === question.answer)
        );
      }

      if (block) {
        // Check if study item already exists
        const existingItems = await SpacedRepetitionService.getStudyItems(currentNote.id);
        const exists = existingItems.some(item => item.blockId === block.id);

        if (!exists) {
          await SpacedRepetitionService.createStudyItemsFromBlocks([block], currentNote);
        }
      }
    } catch (error) {
      console.error('Error creating study item:', error);
    }
  }

  const requestHint = async () => {
    try {
      const q: any = questions[currentIndex] as any;
      if (!q) return;
      setIsHintLoading(true);
      setHintText("");
      // @ts-ignore
      const isElectron = typeof window !== 'undefined' && window?.electronAPI?.hint;
      const modelToUse = (llmModel && llmModel.trim().length > 0)
        ? llmModel
        : (typeof window !== 'undefined' ? (window.localStorage.getItem('llmModel') || 'llama3:latest') : 'llama3:latest');
      if (isElectron) {
        // Prefer Electron IPC when available
        // @ts-ignore
        const res = await window.electronAPI.hint({
          question: q.question || '',
          options: q.options || [],
          correctAnswer: q.answer || '',
          model: modelToUse,
          temperature: llmTemperature,
          top_p: llmTopP,
        });
        if (res?.success) {
          setHintText(res.hint || '');
          return;
        }
      }
      // Fallback: call Ollama HTTP API directly (useful in web or if preload not present)
      const optsText = Array.isArray(q.options) && q.options.length > 0
        ? `\nOptions: ${q.options.map((o: string, i: number) => `(${i + 1}) ${o}`).join(' ')}`
        : '';
      const noRevealLine = 'Do NOT reveal or state the exact answer. Never output the exact solution word or phrase.';
      const correctGuard = q.answer ? `\nThe correct answer is known to you for evaluation but you must not reveal it: [REDACTED]. ${noRevealLine}` : `\n${noRevealLine}`;
      const prompt = `You are a supportive tutor. Provide a single, concise hint (1-2 sentences) to help a student answer this quiz question without giving the answer away.${correctGuard}\nFocus on the key concept or a way to eliminate distractors.${optsText}\n\nQuestion: ${q.question || ''}\n\nHint:`;
      const resp = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToUse,
          prompt,
          options: { temperature: llmTemperature, top_p: llmTopP },
        }),
      });
      const text = await resp.text();
      let acc = '';
      text.split('\n').forEach((line: string) => {
        try { const obj = JSON.parse(line); if (obj.response) acc += obj.response; } catch { /* ignore */ }
      });
      function sanitize(raw: string, answer: string): string {
        let out = (raw || '').replace(/```[\s\S]*?```/g, '').replace(/`([^`]+)`/g, '$1');
        out = out.replace(/^(hint[:\-\s]*)/i, '').trim();
        const parts = out.split(/(?<=[.!?])\s+/).slice(0, 2);
        out = parts.join(' ').trim();
        const ans = (answer || '').trim();
        if (ans.length > 0) {
          const escaped = ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
          const re = new RegExp(escaped, 'ig');
          out = out.replace(re, '____');
          if (/^(true|false)$/i.test(ans)) {
            out = out.replace(/\btrue\b/ig, '____').replace(/\bfalse\b/ig, '____');
          }
        }
        out = out.replace(/\b(the\s+answer\s+is|it\s+is)\b[^.?!]*/ig, '').trim();
        return out.slice(0, 240);
      }
      const cleaned = sanitize(acc, q.answer || '');
      setHintText(cleaned || '');
    } catch (e) {
      setHintText('Hint generation failed.');
    } finally {
      setIsHintLoading(false);
    }
  }

  const goToNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedAnswer(null)
      setUserTextAnswer("")
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
                Score: {Number.isInteger(score) ? score : score.toFixed(1)} ({progress}% Complete)
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
                  {hybridJudgingEnabled && perQuestionLLM[(questions[currentIndex] as any).id] ? (
                    <div className="space-y-3">
                      <label className="text-sm text-muted-foreground">Type your answer</label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={userTextAnswer}
                          onChange={(e) => setUserTextAnswer(e.target.value)}
                          placeholder="Your answer"
                          disabled={isAnswered}
                        />
                        {!isAnswered && (
                          <button
                            onClick={requestHint}
                            disabled={isHintLoading}
                            className={`inline-flex items-center justify-center h-10 w-10 rounded-md border bg-background hover:bg-accent text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed ${isHintLoading ? 'opacity-60' : ''}`}
                            title="Hint"
                            aria-label="Hint"
                            type="button"
                          >
                            {isHintLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <HelpCircle className="w-5 h-5" />}
                          </button>
                        )}
                      </div>
                      {hintText && !isAnswered && (
                        <div className="text-sm text-muted-foreground bg-accent/30 rounded-md p-2">{hintText}</div>
                      )}
                      {!isAnswered && (
                        <div className="flex justify-center">
                          <Button onClick={checkAnswer} disabled={isJudging}>
                            Submit Answer
                          </Button>
                        </div>
                      )}
                      {isAnswered && (
                        <div className="text-sm mt-1">
                          {openEndedDecision === 'correct' && (
                            <div className="space-y-1">
                              <div className="text-green-600 font-semibold">Correct! You nailed it.</div>
                              <div className="text-muted-foreground">Correct answer: {('answer' in questions[currentIndex]) ? (questions[currentIndex] as any).answer : ''}</div>
                            </div>
                          )}
                          {openEndedDecision === 'partial' && (
                            <div className="space-y-1">
                              <div className="text-amber-600 font-semibold">Almost right — partial credit.</div>
                              <div className="text-muted-foreground">Correct answer: {('answer' in questions[currentIndex]) ? (questions[currentIndex] as any).answer : ''}</div>
                            </div>
                          )}
                          {openEndedDecision === 'incorrect' && (
                            <div className="text-red-600 font-semibold">
                              Not quite. Correct answer: {('answer' in questions[currentIndex]) ? (questions[currentIndex] as any).answer : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
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
                  )}
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

            {/* Bottom navigation: only show for non-sequence questions and only after answered in hybrid mode */}
            {!(('type' in questions[currentIndex]) && questions[currentIndex].type === "sequence") && (
              <div className="flex justify-center gap-4">
                {((!hybridJudgingEnabled || !perQuestionLLM[(questions[currentIndex] as any).id]) && !isAnswered) ? (
                  <Button onClick={checkAnswer} disabled={!selectedAnswer}>
                    Check Answer
                  </Button>
                ) : isAnswered ? (
                  <Button onClick={goToNextQuestion} disabled={(hybridJudgingEnabled && perQuestionLLM[(questions[currentIndex] as any).id] && isJudging)}>
                    {currentIndex < questions.length - 1 ? "Next Question" : "See Results"}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

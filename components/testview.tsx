import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { db, Note, Block, TestSession, saveTestSession, getSessionsForNote } from "@/lib/db";
import { FolderIcon, FileText, Timer, CheckCircle, Check, X, ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from '@dnd-kit/utilities';
import { SequenceQuestion } from './SequenceQuestion';
import { BlockConnectionManager } from "@/lib/block-connections"
import 'katex/dist/katex.min.css'
import { InlineMath } from 'react-katex'
import { generateQuizQuestions, AnyQuizQuestion } from '@/lib/question-generator';

// Helper: durations in minutes
const DURATIONS = [15, 30, 60];

interface FolderOption {
  id: string;
  name: string;
}
interface NoteOption {
  id: string;
  title: string;
  folderId: string;
}

interface TestViewProps {
  availableFolders: FolderOption[];
  availableNotes?: NoteOption[]; // Optional: pass all notes for selection
  onTestComplete?: (session: TestSession) => void;
  defaultFolderId?: string;
  defaultNoteId?: string;
  autoStartIfDefault?: boolean;
}

// Helper: recursively get all notes in a folder and its subfolders
async function getAllNotesInFolders(folderIds: string[]): Promise<Note[]> {
  const allFolders = await db.folders.toArray();
  const allNotes = await db.notes.toArray();
  // Get all descendant folder ids
  const getDescendants = (ids: string[]): string[] => {
    let result = [...ids];
    let queue = [...ids];
    while (queue.length) {
      const current = queue.shift()!;
      const children = allFolders.filter(f => f.parentId === current).map(f => f.id);
      result.push(...children);
      queue.push(...children);
    }
    return Array.from(new Set(result));
  };
  const allFolderIds = getDescendants(folderIds);
  return allNotes.filter(n => allFolderIds.includes(n.folderId));
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
  // Filter HOW blocks only (exclude WHO and others)
  return groupBlocks
    .filter(b => b.type === "how")
    .sort((a, b) => allBlocks.indexOf(a) - allBlocks.indexOf(b));
}

// Helper to generate options for a question
function generateOptions(correctAnswer: string, allWhatBlocks: string[], exclude: string[]): string[] {
  // Exclude the correct answer and any in the exclude list
  const pool = allWhatBlocks.filter(w => w !== correctAnswer && !exclude.includes(w));
  // Shuffle and pick up to 3 distractors
  const distractors = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  // Add the correct answer and shuffle again
  const options = [...distractors, correctAnswer].sort(() => Math.random() - 0.5);
  // Remove duplicates just in case
  return Array.from(new Set(options));
}

// Helper to generate test questions (copied from quiz-view)
function generateTestQuestions(notes: Note[]): any[] {
  const quizQuestions: any[] = []

  // Precompute all groups (each group is a set of block IDs)
  const allBlocks = notes.flatMap(note => note.blocks);
  const groups: Block[][] = [];
  const visitedGlobal = new Set<string>();
  for (const block of allBlocks) {
    if (visitedGlobal.has(block.id)) continue;
    // Traverse to get the group for this block
    const visited = new Set<string>();
    function traverse(b: Block) {
      if (!b || visited.has(b.id)) return;
      visited.add(b.id);
      (b.linkedBlockIds || []).forEach(id => {
        const next = allBlocks.find(x => x.id === id);
        if (next) traverse(next);
      });
      allBlocks.forEach(x => {
        if (x.linkedBlockIds?.includes(b.id)) traverse(x);
      });
    }
    traverse(block);
    if (visited.size > 0) {
      groups.push(allBlocks.filter(b => visited.has(b.id)));
      visited.forEach(id => visitedGlobal.add(id));
    }
  }

  function findGroupForBlock(blockId: string): Block[] | undefined {
    return groups.find(g => g.some(b => b.id === blockId));
  }

  function addQuizQuestionsFromBlocks(blocks: Block[], noteId: string, noteTitle: string, noteObj: Note) {
    // Find all WHO blocks
    const whoBlocks = blocks.filter(b => b.type === "who");
    for (const whoBlock of whoBlocks) {
      // Find all blocks in the group (traverse connections)
      const groupBlocks = findGroupForBlock(whoBlock.id) || [];
      // Get all WHAT blocks in the group (including those with truthState)
      const groupWhatBlocks = groupBlocks.filter(b => b.type === "what");
      const groupWhatContents = groupWhatBlocks.map(b => b.content);

      // Get HOW blocks for this WHO block
      const howBlocks = getOrderedHowBlocksForWho(whoBlock, blocks);

      // Handle single HOW block as WHAT block for test questions
      if (howBlocks.length === 1) {
        const singleHowBlock = howBlocks[0];
        // Find all WHAT and HOW blocks from groups other than the current group for distractors
        const currentGroup = findGroupForBlock(singleHowBlock.id) || [];
        const currentGroupIds = new Set(currentGroup.map(b => b.id));
        const distractorPool = allBlocks.filter(b =>
          (b.type === 'what' || b.type === 'how') &&
          !(b as any).truthState &&
          !currentGroupIds.has(b.id)
        );

        const correctContent = singleHowBlock.content || '';
        const distractors = distractorPool
          .filter(b => b.content !== correctContent)
          .map(b => b.content)
          .filter((c): c is string => Boolean(c))
          .filter((c, i, arr) => arr.indexOf(c) === i) // unique by content
          .slice(0, 3);
        const options = [...distractors, correctContent].sort(() => Math.random() - 0.5);

        quizQuestions.push({
          id: `${whoBlock.id}-${singleHowBlock.id}-how`,
          type: "multiple-choice",
          question: whoBlock.content || '',
          answer: singleHowBlock.content || '',
          options,
          questionImage: whoBlock.image,
          answerImage: singleHowBlock.image,
          noteId,
          noteTitle,
          math: whoBlock.math,
        });
      }

      // For each WHAT block in the group, create a question
      for (const whatBlock of groupWhatBlocks) {
        if ((whatBlock as any).truthState) {
          // True/False question
          quizQuestions.push({
            id: `${whoBlock.id}-${whatBlock.id}-tf`,
            type: "true/false",
            question: whoBlock.content || '',
            statement: whatBlock.content || '',
            answer: (whatBlock as any).truthState === "true" ? "True" : "False",
            options: ["True", "False"].sort(() => Math.random() - 0.5),
            questionImage: whoBlock.image,
            answerImage: whatBlock.image,
            noteId,
            noteTitle,
            math: whoBlock.math,
          });
        } else {
          // MCQ: Only one WHAT from the current group (the correct answer), distractors from other groups (by group membership)
          // Find all WHAT blocks from groups other than the current group
          const currentGroup = findGroupForBlock(whatBlock.id) || [];
          const currentGroupIds = new Set(currentGroup.map(b => b.id));
          const distractorPool = allBlocks.filter(b => b.type === "what" && !(b as any).truthState && !currentGroupIds.has(b.id));
          // Debug logging
          console.log('--- MCQ Generation ---');
          console.log('Question:', whoBlock.content);
          console.log('Correct WHAT:', whatBlock.id, whatBlock.content);
          console.log('Current group block IDs:', Array.from(currentGroupIds));
          console.log('Distractor pool:', distractorPool.map(b => ({ id: b.id, content: b.content })));
          // Pick up to 3 distractors, but never include WHATs from the same group or with the same content as the correct answer
          const correctContent = whatBlock.content || '';
          const distractors = distractorPool
            .filter(b => b.content !== correctContent)
            .map(b => b.content)
            .filter((c): c is string => Boolean(c))
            .filter((c, i, arr) => arr.indexOf(c) === i) // unique by content
            .slice(0, 3);
          const options = [...distractors, correctContent].sort(() => Math.random() - 0.5);
          quizQuestions.push({
            id: `${whoBlock.id}-${whatBlock.id}`,
            type: "multiple-choice",
            question: whoBlock.content || '',
            answer: whatBlock.content || '',
            options,
            questionImage: whoBlock.image,
            answerImage: whatBlock.image,
            noteId,
            noteTitle,
            math: whoBlock.math,
          });
        }
      }
    }
    // Keep sequence and true/false logic as before
    blocks.forEach((block) => {
      // Sequence mode: who with 2+ linked how blocks (chain-aware)
      if (BlockConnectionManager.isSequenceBlock(block, blocks)) {
        const howBlocks = getOrderedHowBlocksForWho(block, blocks);
        if (howBlocks.length >= 2) {
          quizQuestions.push({
            id: block.id + "-sequence",
            type: "sequence",
            question: block.content,
            sequence: howBlocks.map(b => b.content),
            options: [...howBlocks.map(b => b.content)].sort(() => Math.random() - 0.5),
            noteId,
            noteTitle,
          });
        }
        return; // Do not create regular MCQs for this who block
      }
      // True/False questions: only WHO as question, WHAT as statement, user picks True/False
      if (BlockConnectionManager.isTrueFalseBlock(block, blocks)) {
        const whatBlock = BlockConnectionManager.findWhatBlock(block, blocks)
        if (whatBlock && whatBlock.truthState) {
          // Only use the statement, not the answer, in the question
          const statement = whatBlock.originalContent || whatBlock.content;
          quizQuestions.push({
            id: block.id + "-tf",
            type: "true/false",
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
    });
  }
  notes.forEach(note => addQuizQuestionsFromBlocks(note.blocks, note.id, note.title, note));
  // Deduplicate by id
  const seen = new Set();
  const deduped = quizQuestions.filter(q => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
  // Shuffle and limit to 10
  return deduped.sort(() => Math.random() - 0.5);
}

// Helper to generate options for a question
function generateOptionsForTest(q: any, allQuestions: any[]): string[] {
  if (q.type === "true/false") {
    return q.options;
  }
  // For who/what, get 3 distractors from other questions of same type
  const allAnswers = allQuestions.filter(b => b.type === q.type && b.answer !== q.answer).map(b => b.answer);
  const shuffled = allAnswers.sort(() => Math.random() - 0.5).slice(0, 3);
  return [...shuffled, q.answer].sort(() => Math.random() - 0.5);
}

// Helper to render text or math (add after imports)
function renderMathOrText(block: any) {
  const text = block.question || block.answer || block.option || '';
  const math = block.math;
  const normalized = text.replace(/\\/g, '\\');
  if (math || normalized.includes('$')) {
    return <InlineMath math={normalized.replace(/^\$/, '').replace(/\$$/, '')} />;
  }
  return text;
}

// 1. Add helper function at the top (after imports)
function arraysEqual(a: any[], b: any[]) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export default function TestView({ availableFolders, availableNotes = [], onTestComplete, defaultFolderId, defaultNoteId, autoStartIfDefault }: TestViewProps) {
  // Step 1: Setup
  const [step, setStep] = useState<"setup" | "test" | "summary">("setup");
  const [selectedDuration, setSelectedDuration] = useState<number>(DURATIONS[0]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(defaultFolderId ? [defaultFolderId] : []);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>(defaultNoteId ? [defaultNoteId] : []);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<{ [blockId: string]: string }>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [timer, setTimer] = useState(selectedDuration * 60);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [allNotes, setAllNotes] = useState<NoteOption[]>([]);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [previousSession, setPreviousSession] = useState<any>(null);
  // Add state for sequence questions
  const [sequenceOrder, setSequenceOrder] = useState<string[]>([]);
  const [isSequenceAnswered, setIsSequenceAnswered] = useState(false);
  const [wasSequenceCorrect, setWasSequenceCorrect] = useState<boolean | null>(null);
  const [userSequenceOrder, setUserSequenceOrder] = useState<string[]>([]);
  const [showUserSequence, setShowUserSequence] = useState(false);
  const [allBlocksFromNotes, setAllBlocksFromNotes] = useState<Block[]>([]);

  // Load all notes for selection if not provided
  useEffect(() => {
    if (availableNotes.length === 0) {
      db.notes.toArray().then(notes => {
        setAllNotes(notes.map(n => ({ id: n.id, title: n.title, folderId: n.folderId })));
      });
    } else {
      setAllNotes(availableNotes);
    }
  }, [availableNotes]);

  // Fetch previous test score for the selected context
  useEffect(() => {
    async function fetchScore() {
      let sessions: any[] = [];
      if (defaultNoteId) {
        sessions = await getSessionsForNote(defaultNoteId);
      } else if (defaultFolderId) {
        // Fetch sessions by folderId
        sessions = await db.testSessions.where('folderId').equals(defaultFolderId).reverse().sortBy('startTime');
      }
      if (sessions.length > 0) {
        // Get the most recent session
        const last = sessions[0];
        setPreviousScore(last.score);
        setPreviousSession(last);
      } else {
        setPreviousScore(null);
        setPreviousSession(null);
      }
    }
    if (defaultNoteId || defaultFolderId) {
      fetchScore();
    }
  }, [defaultNoteId, defaultFolderId, availableNotes]);

  // Pre-select defaults and optionally auto-start
  useEffect(() => {
    let shouldAutoStart = false;
    if (defaultFolderId && !selectedFolderIds.includes(defaultFolderId)) {
      setSelectedFolderIds([defaultFolderId]);
      shouldAutoStart = true;
    }
    if (defaultNoteId && !selectedNoteIds.includes(defaultNoteId)) {
      setSelectedNoteIds([defaultNoteId]);
      shouldAutoStart = true;
    }
    if (autoStartIfDefault && shouldAutoStart) {
      // Wait for state to update, then auto-start
      setTimeout(() => handleStart(), 0);
    }
    // eslint-disable-next-line
  }, []);

  // Step 2: Fetch and randomize questions
  async function generateQuestions(folderIds: string[], noteIds: string[]) {
    let notes: Note[] = [];
    if (folderIds.length > 0) {
      notes = await getAllNotesInFolders(folderIds);
    }
    if (noteIds.length > 0) {
      const extraNotes = await db.notes.bulkGet(noteIds);
      notes.push(...(extraNotes.filter(Boolean) as Note[]));
    }
    // Deduplicate notes
    const noteMap = new Map<string, Note>();
    notes.forEach(n => noteMap.set(n.id, n));
    const uniqueNotes = Array.from(noteMap.values());
    const allBlocksFromNotes = uniqueNotes.flatMap(n => n.blocks);
    // Generate questions using quizview logic
    let testQuestions = generateQuizQuestions(uniqueNotes);
    setQuestions(testQuestions);
    setAllBlocksFromNotes(allBlocksFromNotes);
  }

  // Step 3: Timer logic
  useEffect(() => {
    if (step !== "test" || timer <= 0) return;
    timerRef.current = setTimeout(() => {
      setTimer(t => t - 1);
    }, 1000);
    if (timer === 1) {
      setAutoSubmitted(true);
      handleSubmit();
    }
    return () => clearTimeout(timerRef.current!);
  }, [timer, step]);

  // Step 4: Start test
  const handleStart = async () => {
    await generateQuestions(selectedFolderIds, selectedNoteIds);
    setStep("test");
    setStartTime(Date.now());
    setTimer(selectedDuration * 60);
    setCurrentIdx(0);
    setAnswers({});
    setAutoSubmitted(false);
  };

  // Step 5: Answer capture
  const handleAnswer = (blockId: string, value: string) => {
    setAnswers(a => ({ ...a, [blockId]: value }));
  };

  // Step 6: Navigation
  const handleNext = () => {
    const q = questions[currentIdx];
    if (q.type === "sequence" && !answers[q.id]) {
      setAnswers(a => ({ ...a, [q.id]: sequenceOrder }));
    }
    setCurrentIdx(i => Math.min(i + 1, questions.length - 1));
  };
  const handlePrev = () => setCurrentIdx(i => Math.max(i - 1, 0));

  // Step 7: Submission
  const handleSubmit = async () => {
    const q = questions[currentIdx];
    if (q.type === "sequence" && !answers[q.id]) {
      setAnswers(a => ({ ...a, [q.id]: sequenceOrder }));
    }
    setEndTime(Date.now());
    setStep("summary");
    // For MVP: simple grading (compare to q.answer for all types)
    let correct = 0;
    const graded = questions.map(q => {
      let isCorrect = false;
      const userAnswer = answers[q.id] || "";
      if (q.type === "sequence") {
        // Ensure userAnswer is an array for sequence questions
        isCorrect = Array.isArray(userAnswer) && arraysEqual(userAnswer, q.sequence);
      } else {
        isCorrect = typeof userAnswer === "string" && userAnswer.trim().toLowerCase() === (q.answer?.trim().toLowerCase() || "");
      }
      if (isCorrect) correct++;
      return {
        blockId: q.id,
        userAnswer,
        correctAnswer: q.answer,
        isCorrect,
      };
    });
    // If testing a folder, store folderId; if a note, store noteId
    const session: TestSession = {
      id: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      noteId: selectedNoteIds.join(","),
      folderId: selectedFolderIds.length === 1 ? selectedFolderIds[0] : (selectedFolderIds.join(",") || undefined),
      startTime: startTime!,
      endTime: Date.now(),
      duration: selectedDuration * 60,
      questions: graded,
      score: questions.length ? Math.round((correct / questions.length) * 100) : 0,
    };
    await saveTestSession(session);
  };

  // After test completion, update previousScore
  useEffect(() => {
    if (step === "summary" && (defaultNoteId || defaultFolderId)) {
      // Re-fetch previous score after test
      (async () => {
        let sessions: any[] = [];
        if (defaultNoteId) {
          sessions = await getSessionsForNote(defaultNoteId);
        } else if (defaultFolderId) {
          // Fetch sessions by folderId
          sessions = await db.testSessions.where('folderId').equals(defaultFolderId).reverse().sortBy('startTime');
        }
        if (sessions.length > 0) {
          setPreviousScore(sessions[0].score);
          setPreviousSession(sessions[0]);
        }
      })();
    }
    // eslint-disable-next-line
  }, [step]);

  useEffect(() => {
    if (step === "test" && questions.length > 0 && questions[currentIdx]?.type === "sequence") {
      setSequenceOrder(questions[currentIdx].options);
      setIsSequenceAnswered(false);
      setWasSequenceCorrect(null);
      setUserSequenceOrder([]);
      setShowUserSequence(false);
      if (!answers[questions[currentIdx].id]) {
        setAnswers(a => ({ ...a, [questions[currentIdx].id]: questions[currentIdx].options }));
      }
    }
    // eslint-disable-next-line
  }, [currentIdx, step, questions]);

  function handleSequenceDragEnd(event: any) {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = sequenceOrder.indexOf(active.id);
      const newIndex = sequenceOrder.indexOf(over.id);
      setSequenceOrder(arrayMove(sequenceOrder, oldIndex, newIndex));
    }
  }

  function SequenceSortableItem({ id, disabled }: { id: string, disabled: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      cursor: disabled ? 'default' : 'grab',
    };
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`flex flex-col items-center rounded-lg border p-3 bg-white dark:bg-gray-800 mb-2 ${disabled ? 'opacity-60' : ''}`}
      >
        <span className="text-lg font-medium text-center">{id}</span>
      </div>
    );
  }

  // Step 8: UI
  if (step === "setup") {
    // If a default context is provided, hide folder/note selection
    const isContextual = !!defaultFolderId || !!defaultNoteId;
    let contextLabel = "";
    let contextType = "";
    let contextIcon = null;
    if (defaultNoteId) {
      const note = availableNotes.find(n => n.id === defaultNoteId);
      contextLabel = note ? note.title : "Selected Note";
      contextType = "Note";
      contextIcon = <FileText className="w-8 h-8 text-black" />;
    } else if (defaultFolderId) {
      const folder = availableFolders.find(f => f.id === defaultFolderId);
      contextLabel = folder ? folder.name : "Selected Folder";
      contextType = "Folder";
      contextIcon = <FolderIcon className="w-8 h-8 text-black" />;
    }
    return (
      <Card className="max-w-xl mx-auto mt-16 px-16 py-12 shadow-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {isContextual && (
          <div className="flex flex-col items-center justify-center pt-6 pb-4">
            <div className="flex items-center gap-4 mb-2">
              {contextIcon}
              <span className="text-2xl font-bold text-primary truncate max-w-xs text-center">{contextLabel}</span>
            </div>
            {previousScore !== null ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-base mt-2">
                <CheckCircle className="w-5 h-5" />
                <span>Previous Test Score: <b>{previousScore}%</b></span>
              </div>
            ) : (
              <div className="text-gray-400 text-sm mt-2">No previous test attempts for this selection.</div>
            )}
          </div>
        )}
        <div className="border-t border-gray-200 dark:border-gray-800 my-2" />
        <CardHeader className="pb-2 pt-4 text-center">
          <CardTitle className="text-2xl font-bold">Start a New Test</CardTitle>
          <div className="flex justify-center mt-2 py-2">
            <span className="font-medium text-gray-700 dark:text-gray-200 text-base flex items-center gap-2">
              <Timer className="w-5 h-5 text-gray-400" /> Test Duration
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="flex gap-3 justify-center">
              {DURATIONS.map(d => (
                <Button key={d} variant={selectedDuration === d ? "default" : "outline"} onClick={() => setSelectedDuration(d)} className="px-6 py-2 text-base font-semibold">
                  {d} min
                </Button>
              ))}
            </div>
          </div>
          {!isContextual && (
            <>
              <div className="mb-4">
                <label className="block mb-1 font-medium">Select Folders (optional)</label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 bg-muted/10">
                  {availableFolders.map(f => (
                    <label key={f.id} className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedFolderIds.includes(f.id)}
                        onChange={e => {
                          setSelectedFolderIds(ids => e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id));
                        }}
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block mb-1 font-medium">Select Notes (optional)</label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 bg-muted/10">
                  {availableNotes.map(n => (
                    <label key={n.id} className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        checked={selectedNoteIds.includes(n.id)}
                        onChange={e => {
                          setSelectedNoteIds(ids => e.target.checked ? [...ids, n.id] : ids.filter(id => id !== n.id));
                        }}
                      />
                      {n.title}
                      <span className="text-xs text-gray-400 ml-2">({availableFolders.find(f => f.id === n.folderId)?.name || n.folderId})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mb-2 text-xs text-gray-400">You can select any combination of folders and notes. All questions will be randomized.</div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button className="w-full text-lg py-3 mt-2" onClick={handleStart} disabled={isContextual ? false : (selectedFolderIds.length === 0 && selectedNoteIds.length === 0)}>
            Start Test
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (step === "test") {
    if (questions.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8 w-full max-w-2xl flex flex-col items-center">
            <div className="mb-4 text-2xl font-bold text-red-600 flex items-center gap-2">
              <X className="w-8 h-8" /> No study items available for testing
            </div>
            <div className="mb-2 text-lg text-gray-700 dark:text-gray-200 text-center">
              There are no study items (WHO/WHAT pairs) available in the selected folder or note. Please add some study content and try again.
            </div>
            <Button className="mt-6" onClick={() => setStep("setup")}>Back</Button>
          </div>
        </div>
      );
    }
    const q = questions[currentIdx];
    const progress = questions.length > 0 ? Math.round(((currentIdx) / questions.length) * 100) : 0;
    // Use options as generated for the question
    const options = q.options || [];
    // Debug: log options being rendered
    console.log('Rendering options for question:', q, options);
    // Before rendering SequenceQuestion:
    const allBlocks = questions.length > 0 ? questions.flatMap(qi => qi.blocks) : q ? q.blocks : [];
    // Sequence question UI
    if (q.type === "sequence") {
      return (
        <div className="flex flex-col md:flex-row h-full w-full max-w-5xl mx-auto mt-2">
          <div className="flex-1 flex flex-col items-center">
            <div className="w-full px-2 md:px-0">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-bold">Test Mode</div>
                <div className="text-sm text-gray-500">Time Left: <b>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}</b></div>
              </div>
              <Progress value={progress} className="h-2 w-full mb-4" />
            </div>
            <SequenceQuestion
              question={q}
              blocks={allBlocksFromNotes}
              initialOrder={answers[q.id] || q.options}
              onOrderChange={order => setAnswers(a => ({ ...a, [q.id]: order }))}
              advanceOnSubmit={true}
              showNavigation={true}
              onPrev={handlePrev}
              onNext={handleNext}
              onFinalSubmit={handleSubmit}
              isFirst={currentIdx === 0}
              isLast={currentIdx === questions.length - 1}
            />
          </div>
          {/* Sidebar: question progress */}
          <div className="w-full md:w-64 flex-shrink-0 mt-6 mr-4 md:mt-0 md:ml-8">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 flex flex-col items-center">
              <div className="text-lg font-semibold mb-2">Progress</div>
              <div className="grid grid-cols-5 gap-2 max-h-96 overflow-y-auto">
                {questions.map((_, idx) => (
                  <button
                    key={idx}
                    className={`w-8 h-8 rounded-full flex items-center justify-center border text-sm font-bold transition-all ${idx === currentIdx ? "bg-blue-500 text-white border-blue-500" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"}`}
                    onClick={() => setCurrentIdx(idx)}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col md:flex-row h-full w-full max-w-5xl mx-auto mt-8">
        {/* Main test area */}
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full px-2 md:px-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-bold">Test Mode</div>
              <div className="text-sm text-gray-500">Time Left: <b>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}</b></div>
            </div>
            <Progress value={progress} className="h-2 w-full mb-4" />
          </div>
          <Card className="w-full max-w-2xl shadow-lg mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Question {currentIdx + 1} of {questions.length}</CardTitle>
                {q.type === "true/false" && <Badge variant="outline">True/False</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {/* Question text and image */}
              <div className="mb-4 flex flex-col gap-2">
                <div className="text-base font-medium">{renderMathOrText(q)}</div>
                {'questionImage' in q && q.questionImage && (
                  <div className="flex justify-center">
                    <img
                      src={q.questionImage}
                      alt="Question"
                      className="max-h-48 rounded-md"
                    />
                  </div>
                )}
              </div>
              <RadioGroup value={answers[q.id] || ""} onValueChange={val => handleAnswer(q.id, val)} className="space-y-3">
                {options.map((option: string, idx: number) => (
                  <div
                    key={idx}
                    className={`flex items-center space-x-2 rounded-lg border p-3 ${answers[q.id] === option ? "border-green-500 bg-green-50 dark:bg-green-900/20" : ""}`}
                  >
                    <RadioGroupItem value={option} id={`option-${idx}`} />
                    <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer">
                      {option.startsWith('data:image') ? (
                        <img
                          src={option}
                          alt="Option"
                          className="max-h-16 rounded-md"
                        />
                      ) : (
                        renderMathOrText({ option, math: 'math' in q ? q.math : false })
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {'answerImage' in q && answers[q.id] && q.answerImage && (
                <div className="mt-4 flex justify-center">
                  <img
                    src={q.answerImage}
                    alt="Answer"
                    className="max-h-48 rounded-md"
                  />
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between items-center gap-2">
              <Button variant="outline" onClick={handlePrev} disabled={currentIdx === 0}>Previous</Button>
              {currentIdx < questions.length - 1 ? (
                <Button onClick={handleNext} className="ml-auto" disabled={!answers[q.id]}>Next</Button>
              ) : (
                <Button onClick={handleSubmit} className="ml-auto" disabled={autoSubmitted || !answers[q.id]}>Submit</Button>
              )}
            </CardFooter>
          </Card>
          {timer <= 60 && <div className="text-red-500 text-center mt-2">{autoSubmitted ? "Auto-submitted!" : "Less than 1 minute left!"}</div>}
        </div>
        {/* Sidebar: question progress */}
        <div className="w-full md:w-64 flex-shrink-0 mt-6 md:mt-0 md:ml-8">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4 flex flex-col items-center">
            <div className="text-lg font-semibold mb-2">Progress</div>
            <div className="grid grid-cols-5 gap-2 max-h-96 overflow-y-auto">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  className={`w-8 h-8 rounded-full flex items-center justify-center border text-sm font-bold transition-all ${idx === currentIdx ? "bg-blue-500 text-white border-blue-500" : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700"}`}
                  onClick={() => setCurrentIdx(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Summary
  if (step === "summary") {
    const correct = questions.filter((q, i) => {
      const userAnswer = answers[q.id] || "";
      if (q.type === "sequence") {
        return Array.isArray(userAnswer) && JSON.stringify(userAnswer) === JSON.stringify(q.sequence);
      } else {
        return typeof userAnswer === "string" && userAnswer.trim().toLowerCase() === (q.answer?.trim().toLowerCase() || "");
      }
    }).length;
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8 w-full max-w-2xl flex flex-col items-center">
          <div className="mb-4 text-3xl font-bold text-green-600 flex items-center gap-2">
            <CheckCircle className="w-8 h-8" /> Test Complete!
          </div>
          <div className="mb-2 text-xl font-semibold">Score: <span className="text-blue-600">{correct} / {questions.length}</span> <span className="text-gray-500">({questions.length ? Math.round((correct / questions.length) * 100) : 0}%)</span></div>
          <div className="w-full mt-6 overflow-y-auto max-h-96">
            <div className="mb-2 font-medium text-gray-700 dark:text-gray-200">Question Review</div>
            <ul className="space-y-2">
              {questions.map((q, i) => {
                const userAnswer = answers[q.id] || "";
                const isCorrect = q.type === "sequence"
                  ? Array.isArray(userAnswer) && JSON.stringify(userAnswer) === JSON.stringify(q.sequence)
                  : typeof userAnswer === "string" && userAnswer.trim().toLowerCase() === (q.answer?.trim().toLowerCase() || "");
                return (
                  <li key={q.id} className={`border rounded p-3 flex items-center gap-3 ${isCorrect ? "border-green-400 bg-green-50 dark:bg-green-900/10" : "border-red-400 bg-red-50 dark:bg-red-900/10"}`}>
                    <span className="font-bold">Q{i + 1}.</span>
                    <span className="flex-1">{q.content}</span>
                    <span className={isCorrect ? "text-green-600" : "text-red-600"}>{isCorrect ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex gap-4 mt-8">
            <Button variant="outline" onClick={() => setStep("setup")}>Restart Test</Button>
            <Button onClick={() => setStep("setup")}>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
} 
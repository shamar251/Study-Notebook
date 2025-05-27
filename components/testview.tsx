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

// Helper to generate options for a question (copied from quiz-view)
function generateOptions(correctAnswer: string, notesList: Note[], blockType: "who" | "what"): string[] {
  const allAnswers: string[] = [];
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
  const shuffled = allAnswers.sort(() => Math.random() - 0.5).slice(0, 3)
  return [...shuffled, correctAnswer].sort(() => Math.random() - 0.5)
}

// Helper to generate test questions (copied from quiz-view)
function generateTestQuestions(notes: Note[]): any[] {
  const quizQuestions: any[] = [];
  function addQuizQuestionsFromBlocks(blocks: Block[], noteId: string, noteTitle: string, noteObj: Note) {
    blocks.forEach((block) => {
      // True/False questions: use WHAT block as the statement, answer is its truthState
      if (block.type === "who" && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
        const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what")
        if (whatBlock && whatBlock.truthState) {
          const statement = block.content; // Use WHO block's content as the question
          quizQuestions.push({
            id: block.id + "-tf",
            type: "true/false",
            content: statement, // Use WHO block's content as the question
            answer: whatBlock.truthState === "true" ? "True" : "False",
            options: ["True", "False"].sort(() => Math.random() - 0.5),
            noteId,
            noteTitle,
          });
          return;
        }
      }
      // Reverse: WHO is the question, WHAT is the answer
      if (block.type === "who") {
        if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
          const whatBlock = blocks.find((b) => b.id === block.linkedBlockIds![0] && b.type === "what")
          if (whatBlock && whatBlock.content && whatBlock.content.trim() !== "") {
            if (!whatBlock.truthState) {
              // Create a question from the 'who' asking about the 'what' (reverse direction)
              quizQuestions.push({
                id: block.id + "-who-rev",
                type: "who",
                content: block.content,
                answer: whatBlock.content,
                options: [],
                noteId,
                noteTitle,
              })
            }
          }
        } else {
          // Old structure: Look for adjacent WHAT blocks
          const blockIndex = blocks.findIndex(b => b.id === block.id)
          if (blockIndex !== -1 && blockIndex < blocks.length - 1) {
            const whatBlock = blocks[blockIndex + 1]
            if (whatBlock.type === "what" && whatBlock.content && whatBlock.content.trim() !== "") {
              if (!whatBlock.truthState) {
                quizQuestions.push({
                  id: block.id + "-who-old-rev",
                  type: "who",
                  content: block.content,
                  answer: whatBlock.content,
                  options: [],
                  noteId,
                  noteTitle,
                })
              }
            }
          }
        }
      }
    })
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
  return deduped.sort(() => Math.random() - 0.5).slice(0, 10);
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
    // Generate questions using quizview logic
    let testQuestions = generateTestQuestions(uniqueNotes);
    // For each question, generate options
    testQuestions = testQuestions.map(q => ({
      ...q,
      options: q.type === "true/false"
        ? ["True", "False"].sort(() => Math.random() - 0.5)
        : generateOptions(q.answer, uniqueNotes, "what"),
    }));
    setQuestions(testQuestions);
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
  const handleNext = () => setCurrentIdx(i => Math.min(i + 1, questions.length - 1));
  const handlePrev = () => setCurrentIdx(i => Math.max(i - 1, 0));

  // Step 7: Submission
  const handleSubmit = async () => {
    setEndTime(Date.now());
    setStep("summary");
    // For MVP: simple grading (compare to q.answer for all types)
    let correct = 0;
    const graded = questions.map(q => {
      let isCorrect = false;
      const userAnswer = answers[q.id] || "";
      isCorrect = userAnswer.trim().toLowerCase() === (q.answer?.trim().toLowerCase() || "");
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
    const q = questions[currentIdx];
    const progress = questions.length > 0 ? Math.round(((currentIdx) / questions.length) * 100) : 0;
    const options = q.options;
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
              <div className="mb-4 text-base font-medium">{q.content}</div>
              <RadioGroup value={answers[q.id] || ""} onValueChange={val => handleAnswer(q.id, val)} className="space-y-3">
                {options.map((option: string, idx: number) => (
                  <div
                    key={idx}
                    className={`flex items-center space-x-2 rounded-lg border p-3 ${answers[q.id] === option ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""}`}
                  >
                    <RadioGroupItem value={option} id={`option-${idx}`} />
                    <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
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
            <div className="grid grid-cols-5 gap-2">
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
      return userAnswer.trim().toLowerCase() === (q.answer?.trim().toLowerCase() || "");
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
                const isCorrect = userAnswer.trim().toLowerCase() === (q.answer?.trim().toLowerCase() || "");
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
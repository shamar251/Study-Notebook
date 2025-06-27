"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, RotateCcw, ArrowLeft, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { Note } from "@/components/note-app"
import 'katex/dist/katex.min.css'
import { InlineMath } from 'react-katex'
import type { Block } from "@/lib/db"
import { BlockConnectionManager } from "@/lib/block-connections"
import { getConnectedGroup } from "@/hooks/use-block-connections"

interface FlashcardViewProps {
  note?: Note
  notes?: Note[]
  folderName?: string
  onComplete?: (noteId: string) => void
}

interface Flashcard {
  front: string
  back: string
  frontImage?: string
  backImage?: string
  noteId: string
  noteTitle: string
  math: boolean
  whatMath?: boolean
}

// Helper to render text or math
function renderMathOrText(text: string, math?: boolean) {
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

export default function FlashcardView({ note, notes, folderName, onComplete }: FlashcardViewProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [isGroupMode, setIsGroupMode] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Determine if we're in group mode (studying a folder)
    setIsGroupMode(!!notes && notes.length > 0)
    console.log(`Flashcard view - Group mode: ${isGroupMode}, Notes count: ${notes?.length || 0}`)

    // Generate flashcards from who/what blocks
    const cards: Flashcard[] = []

    function addFlashcardsFromBlocks(blocks: Block[], noteId: string, noteTitle: string) {
      blocks.forEach((block) => {
        if (block.type === "who") {
          // Get HOW blocks for this WHO block
          const howBlocks = getOrderedHowBlocksForWho(block, blocks);

          // Handle single HOW block as WHAT block for flashcards
          if (howBlocks.length === 1) {
            const singleHowBlock = howBlocks[0];
            if (singleHowBlock.content && block.content) {
              cards.push({
                front: block.content,
                back: singleHowBlock.content,
                frontImage: block.image,
                backImage: singleHowBlock.image,
                noteId,
                noteTitle,
                math: block.math === true,
                whatMath: singleHowBlock.math
              });
            }
          }

          // Prefer explicit links if present
          const linkedWhatBlocks = Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0
            ? block.linkedBlockIds
              .map(id => blocks.find(b => b.id === id && b.type === "what" && b.content && b.content.trim() !== ""))
              .filter(Boolean) as Block[]
            : [];
          if (linkedWhatBlocks.length > 0) {
            linkedWhatBlocks.forEach((whatBlock) => {
              if (block.content && whatBlock.content) {
                cards.push({
                  front: block.content,
                  back: whatBlock.content,
                  frontImage: block.image,
                  backImage: whatBlock.image,
                  noteId,
                  noteTitle,
                  math: block.math === true,
                  whatMath: whatBlock.math
                })
              }
            })
          } else {
            // Fallback: group-based logic
            const groupBlocks = getConnectedGroup(block, blocks)
            const whatBlocks = groupBlocks.filter(b => b.type === "what" && b.content && b.content.trim() !== "")
            whatBlocks.forEach((whatBlock) => {
              if (block.content && whatBlock.content) {
                cards.push({
                  front: block.content,
                  back: whatBlock.content,
                  frontImage: block.image,
                  backImage: whatBlock.image,
                  noteId,
                  noteTitle,
                  math: block.math === true,
                  whatMath: whatBlock.math
                })
              }
            })
          }
        }
      })
    }

    if (note) {
      console.log("[FlashcardView] note.blocks:", note.blocks)
      addFlashcardsFromBlocks(note.blocks, note.id, note.title)
    } else if (notes) {
      console.log("[FlashcardView] notes (all blocks):", notes.map(n => ({ id: n.id, title: n.title, blocks: n.blocks })))
      notes.forEach((noteItem) => {
        addFlashcardsFromBlocks(noteItem.blocks, noteItem.id, noteItem.title)
      })
    }

    console.log(`Generated ${cards.length} flashcards`)
    // Shuffle the cards
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    setFlashcards(shuffled)
    setCurrentIndex(0)
    setFlipped(false)
    setCompleted(false)
    setProgress(0)
  }, [note, notes])

  useEffect(() => {
    // Update progress
    if (flashcards.length > 0) {
      setProgress(Math.round((currentIndex / flashcards.length) * 100))
    }
  }, [currentIndex, flashcards.length])

  const goToPrevious = () => {
    setFlipped(false)
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : flashcards.length - 1))
  }

  const goToNext = () => {
    setFlipped(false)

    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setCompleted(true)
      if (onComplete && flashcards.length > 0) {
        // In group mode, we'll just use the ID of the last card's note
        onComplete(flashcards[currentIndex].noteId)
      }
    }
  }

  const toggleFlip = () => {
    setFlipped(!flipped)
  }

  const restartSession = () => {
    setCurrentIndex(0)
    setFlipped(false)
    setCompleted(false)
    setProgress(0)

    // Reshuffle the cards
    setFlashcards([...flashcards].sort(() => Math.random() - 0.5))
  }

  if (flashcards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="max-w-md">
          <h2 className="mb-2 text-2xl font-bold">No flashcards available</h2>
          <p className="mb-4 text-gray-500">
            Create WHO and WHAT blocks in your notes to automatically generate flashcards.
          </p>
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="max-w-md">
          <div className="mb-6 text-green-500 flex justify-center">
            <CheckCircle className="w-16 h-16" />
          </div>
          <h2 className="mb-2 text-2xl font-bold">Session Complete!</h2>
          <p className="mb-6 text-gray-500">You've reviewed all {flashcards.length} flashcards in this session.</p>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={restartSession}>
              <RotateCcw className="w-4 h-4 mr-2" /> Restart Session
            </Button>
            <Button
              onClick={() => {
                if (note) {
                  // If we're in single note mode, go back to editor
                  setCompleted(false)
                } else {
                  // If we're in group mode, we'd need a way to go back to the folder view
                  // This would be handled by the parent component
                  setCompleted(false)
                }
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Notes
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {isGroupMode && (
        <div className="p-4 border-b flex items-center">
          <h1 className="text-xl font-bold">{folderName} Flashcards</h1>
        </div>
      )}

      <div className="flex flex-col items-center justify-center flex-1 p-4">
        <div className="w-full max-w-xl mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">
              Card {currentIndex + 1} of {flashcards.length}
            </div>
            <div className="text-sm">{progress}% Complete</div>
          </div>
          <Progress value={progress} className="h-2 w-full" />
        </div>

        <div className="flex items-center justify-between w-full max-w-xl mb-4">
          <Button variant="outline" size="icon" onClick={goToPrevious}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="text-sm font-medium">
            {isGroupMode && (
              <Badge variant="outline" className="text-xs">
                {flashcards[currentIndex].noteTitle}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={goToNext}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div
          className="w-full max-w-xl h-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg cursor-pointer transition-all duration-500"
          onClick={toggleFlip}
        >
          <div className="relative w-full h-full">
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-opacity duration-300 ${flipped ? "opacity-0" : "opacity-100"
                }`}
            >
              <div className="text-center">
                <div className="mb-2 text-sm font-medium text-gray-500">WHO</div>
                {flashcards[currentIndex].frontImage && (
                  <div className="flex flex-col items-center">
                    <img
                      src={flashcards[currentIndex].frontImage}
                      alt="Flashcard front"
                      className="max-h-48 rounded-md mb-2"
                    />
                  </div>
                )}
                {flashcards[currentIndex].front && (
                  <div className="text-2xl font-bold">{renderMathOrText(flashcards[currentIndex].front, flashcards[currentIndex].math)}</div>
                )}
              </div>
              <div className="absolute bottom-4 text-sm text-gray-400">Click to flip</div>
            </div>

            <div
              className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-opacity duration-300 ${flipped ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
            >
              <div className="text-center">
                <div className="mb-2 text-sm font-medium text-gray-500">WHAT</div>
                {flashcards[currentIndex].backImage && (
                  <div className="flex flex-col items-center">
                    <img
                      src={flashcards[currentIndex].backImage}
                      alt="Flashcard back"
                      className="max-h-48 rounded-md mb-2"
                    />
                  </div>
                )}
                {flashcards[currentIndex].back && (
                  <div className="text-xl">{renderMathOrText(flashcards[currentIndex].back, flashcards[currentIndex].whatMath)}</div>
                )}
              </div>
              <div className="absolute bottom-4 text-sm text-gray-400">Click to flip back</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center mt-6 gap-4">
          <Button variant="outline" size="sm" onClick={() => setFlipped(false)}>
            <RotateCcw className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button size="sm" onClick={goToNext}>
            {currentIndex < flashcards.length - 1 ? "Next Card" : "Complete Session"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Badge({ children, className, variant }: { children: React.ReactNode; className?: string; variant: string }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 ${className}`}>
      {children}
    </span>
  )
}

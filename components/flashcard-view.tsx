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
import { SpacedRepetitionService, type StudyItemWithBlock } from '@/lib/spaced-repetition'
import { Rating } from 'ts-fsrs'
import { useToast } from "@/components/ui/use-toast"
import { db } from "@/lib/db"

interface FlashcardViewProps {
  note?: Note
  notes?: Note[]
  folderName?: string
  studyItems?: StudyItemWithBlock[] // Use proper type for study items
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
  hint?: string
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

// Debug function to inspect study items and their relationships
export function debugStudyItems(studyItems: StudyItemWithBlock[]) {
  console.log('=== STUDY ITEMS DEBUG ===');
  console.log(`Total study items: ${studyItems.length}`);

  studyItems.forEach((item, index) => {
    console.log(`\n--- Study Item ${index + 1} ---`);
    console.log(`ID: ${item.id}`);
    console.log(`Type: ${item.type}`);
    console.log(`Block ID: ${item.blockId}`);
    console.log(`Note ID: ${item.noteId}`);
    console.log(`Note Title: ${item.note?.title || 'Unknown'}`);
    console.log(`Block Content: ${item.block?.content?.substring(0, 100) || 'No content'}`);
    console.log(`Has Block: ${!!item.block}`);
    console.log(`Has Note: ${!!item.note}`);

    if (item.block && item.note) {
      const noteBlocks = item.note.blocks;
      console.log(`Note has ${noteBlocks.length} blocks total`);

      if (item.type === 'who') {
        const howBlocks = getOrderedHowBlocksForWho(item.block, noteBlocks);
        console.log(`Found ${howBlocks.length} HOW blocks for this WHO block`);

        const linkedWhatBlocks = Array.isArray(item.block.linkedBlockIds) && item.block.linkedBlockIds.length > 0
          ? item.block.linkedBlockIds
            .map(id => noteBlocks.find(b => b.id === id && b.type === "what" && b.content && b.content.trim() !== ""))
            .filter(Boolean) as Block[]
          : [];
        console.log(`Found ${linkedWhatBlocks.length} linked WHAT blocks`);
      } else if (item.type === 'what') {
        const whoBlock = noteBlocks.find((b: Block) => b.type === "who" && b.linkedBlockIds?.includes(item.blockId));
        console.log(`Found WHO block that links to this WHAT: ${!!whoBlock}`);
        if (whoBlock) {
          console.log(`WHO block content: ${whoBlock.content?.substring(0, 50) || 'No content'}`);
        }
      }
    }
  });

  console.log('=== END DEBUG ===');
}

export default function FlashcardView({ note, notes, folderName, studyItems, onComplete }: FlashcardViewProps) {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [isGroupMode, setIsGroupMode] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [cardRatings, setCardRatings] = useState<Map<number, Rating>>(new Map())
  const { toast } = useToast()

  useEffect(() => {
    // Determine if we're in group mode (studying a folder)
    setIsGroupMode(!!notes && notes.length > 0)
    console.log(`Flashcard view - Group mode: ${isGroupMode}, Notes count: ${notes?.length || 0}`)
    console.log(`Flashcard view - Study items received:`, studyItems?.map(item => ({
      id: item.id,
      type: item.type,
      blockId: item.blockId,
      noteId: item.noteId,
      noteTitle: item.note?.title || 'Unknown',
      blockContent: item.block?.content?.substring(0, 50) || 'No content'
    })) || 'No study items')

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
                whatMath: singleHowBlock.math,
                hint: "how #1"
              });
            }
          } else if (howBlocks.length > 1) {
            // Multiple HOW blocks - create a card for each
            howBlocks.forEach((howBlock, index) => {
              if (howBlock.content && block.content) {
                cards.push({
                  front: block.content,
                  back: howBlock.content,
                  frontImage: block.image,
                  backImage: howBlock.image,
                  noteId,
                  noteTitle,
                  math: block.math === true,
                  whatMath: howBlock.math,
                  hint: `how #${index + 1}`
                });
              }
            });
          }

          // Prefer explicit links if present
          const linkedWhatBlocks = Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0
            ? block.linkedBlockIds
              .map(id => blocks.find(b => b.id === id && b.type === "what" && b.content && b.content.trim() !== ""))
              .filter(Boolean) as Block[]
            : [];
          if (linkedWhatBlocks.length > 0) {
            linkedWhatBlocks.forEach((whatBlock, index) => {
              if (block.content && whatBlock.content) {
                cards.push({
                  front: block.content,
                  back: whatBlock.content,
                  frontImage: block.image,
                  backImage: whatBlock.image,
                  noteId,
                  noteTitle,
                  math: block.math === true,
                  whatMath: whatBlock.math,
                  hint: linkedWhatBlocks.length > 1 ? `what #${index + 1}` : undefined
                })
              }
            })
          } else {
            // Fallback: group-based logic
            const groupBlocks = getConnectedGroup(block, blocks)
            const whatBlocks = groupBlocks.filter(b => b.type === "what" && b.content && b.content.trim() !== "")
            whatBlocks.forEach((whatBlock, index) => {
              if (block.content && whatBlock.content) {
                cards.push({
                  front: block.content,
                  back: whatBlock.content,
                  frontImage: block.image,
                  backImage: whatBlock.image,
                  noteId,
                  noteTitle,
                  math: block.math === true,
                  whatMath: whatBlock.math,
                  hint: whatBlocks.length > 1 ? `what #${index + 1}` : undefined
                })
              }
            })
          }
        }
      })
    }

    // If studyItems are provided, create flashcards only from those specific items
    if (studyItems && studyItems.length > 0) {
      console.log("[FlashcardView] studyItems provided:", studyItems.map(item => ({
        id: item.id,
        type: item.type,
        blockId: item.blockId,
        noteId: item.noteId,
        noteTitle: item.note?.title || 'Unknown',
        blockContent: item.block?.content?.substring(0, 50) || 'No content',
        hasBlock: !!item.block,
        hasNote: !!item.note
      })))

      studyItems.forEach((studyItem) => {
        console.log(`[FlashcardView] Processing study item ${studyItem.id}:`, {
          type: studyItem.type,
          hasBlock: !!studyItem.block,
          hasNote: !!studyItem.note,
          blockContent: studyItem.block?.content?.substring(0, 50) || 'No content',
          noteTitle: studyItem.note?.title || 'No note'
        });

        if (studyItem.block && studyItem.note) {
          // Create flashcard from the specific study item
          if (studyItem.type === "who" && studyItem.block.content) {
            // For WHO blocks, we need to find the corresponding WHAT block
            const noteBlocks = studyItem.note.blocks;
            const howBlocks = getOrderedHowBlocksForWho(studyItem.block, noteBlocks);

            console.log(`[FlashcardView] WHO block "${studyItem.block.content.substring(0, 30)}" found ${howBlocks.length} HOW blocks`);

            if (howBlocks.length === 1) {
              const singleHowBlock = howBlocks[0];
              if (singleHowBlock.content) {
                console.log(`[FlashcardView] Creating flashcard: WHO -> single HOW`);
                cards.push({
                  front: studyItem.block.content,
                  back: singleHowBlock.content,
                  frontImage: studyItem.block.image,
                  backImage: singleHowBlock.image,
                  noteId: (studyItem.noteId || studyItem.note.id) as string,
                  noteTitle: studyItem.note.title,
                  math: studyItem.block.math === true,
                  whatMath: singleHowBlock.math,
                  hint: "how #1"
                });
              } else {
                console.log(`[FlashcardView] Single HOW block has no content`);
              }
            } else if (howBlocks.length > 1) {
              console.log(`[FlashcardView] Creating flashcards for ${howBlocks.length} HOW blocks`);
              // Multiple HOW blocks - create a card for each
              howBlocks.forEach((howBlock, index) => {
                if (howBlock.content && studyItem.block.content) {
                  cards.push({
                    front: studyItem.block.content,
                    back: howBlock.content,
                    frontImage: studyItem.block.image,
                    backImage: howBlock.image,
                    noteId: (studyItem.noteId || studyItem.note.id) as string,
                    noteTitle: studyItem.note.title,
                    math: studyItem.block.math === true,
                    whatMath: howBlock.math,
                    hint: `how #${index + 1}`
                  });
                }
              });
            } else {
              console.log(`[FlashcardView] No HOW blocks found for WHO block, trying WHAT blocks fallback`);

              // Fallback: Try to find WHAT blocks linked to this WHO block
              const linkedWhatBlocks = Array.isArray(studyItem.block.linkedBlockIds) && studyItem.block.linkedBlockIds.length > 0
                ? studyItem.block.linkedBlockIds
                  .map(id => noteBlocks.find(b => b.id === id && b.type === "what" && b.content && b.content.trim() !== ""))
                  .filter(Boolean) as Block[]
                : [];

              console.log(`[FlashcardView] Found ${linkedWhatBlocks.length} linked WHAT blocks`);

              if (linkedWhatBlocks.length > 0) {
                linkedWhatBlocks.forEach((whatBlock, index) => {
                  if (whatBlock.content && studyItem.block.content) {
                    console.log(`[FlashcardView] Creating flashcard: WHO -> WHAT (fallback)`);
                    cards.push({
                      front: studyItem.block.content,
                      back: whatBlock.content,
                      frontImage: studyItem.block.image,
                      backImage: whatBlock.image,
                      noteId: (studyItem.noteId || studyItem.note.id) as string,
                      noteTitle: studyItem.note.title,
                      math: studyItem.block.math === true,
                      whatMath: whatBlock.math,
                      hint: linkedWhatBlocks.length > 1 ? `what #${index + 1}` : undefined
                    });
                  }
                });
              } else {
                console.log(`[FlashcardView] No linked WHAT blocks found either - trying final fallback`);

                // Final fallback: Create a simple flashcard with just the WHO block content
                // This ensures we always have something to review, even if it's not ideal
                console.log(`[FlashcardView] Creating fallback flashcard with WHO block only`);
                cards.push({
                  front: studyItem.block.content,
                  back: "Review the content above",
                  frontImage: studyItem.block.image,
                  backImage: undefined,
                  noteId: (studyItem.noteId || studyItem.note.id) as string,
                  noteTitle: studyItem.note.title,
                  math: studyItem.block.math === true,
                  whatMath: false,
                  hint: "fallback"
                });
              }
            }
          } else if (studyItem.type === "what" && studyItem.block.content) {
            console.log(`[FlashcardView] Processing WHAT block: "${studyItem.block.content.substring(0, 30)}"`);
            // For WHAT blocks, we need to find the corresponding WHO block
            const noteBlocks = studyItem.note.blocks;
            const whoBlock = noteBlocks.find((b: Block) => b.type === "who" && b.linkedBlockIds?.includes(studyItem.blockId));

            if (whoBlock && whoBlock.content) {
              console.log(`[FlashcardView] Creating flashcard: WHO -> WHAT`);
              cards.push({
                front: whoBlock.content,
                back: studyItem.block.content,
                frontImage: whoBlock.image,
                backImage: studyItem.block.image,
                noteId: studyItem.noteId || studyItem.note.id,
                noteTitle: studyItem.note.title,
                math: whoBlock.math === true,
                whatMath: studyItem.block.math,
                hint: undefined
              });
            } else {
              console.log(`[FlashcardView] No WHO block found that links to this WHAT block - creating fallback`);

              // Fallback: Create a flashcard with just the WHAT block content
              console.log(`[FlashcardView] Creating fallback flashcard with WHAT block only`);
              cards.push({
                front: "What is this?",
                back: studyItem.block.content,
                frontImage: undefined,
                backImage: studyItem.block.image,
                noteId: studyItem.noteId || studyItem.note.id,
                noteTitle: studyItem.note.title,
                math: false,
                whatMath: studyItem.block.math,
                hint: "fallback"
              });
            }
          } else {
            console.log(`[FlashcardView] Study item ${studyItem.id} cannot generate flashcard:`, {
              type: studyItem.type,
              hasContent: !!studyItem.block?.content,
              blockContent: studyItem.block?.content?.substring(0, 30) || 'No content'
            });

            // Even if the block has no content, create a minimal flashcard to avoid empty review sessions
            if (studyItem.block && studyItem.note) {
              console.log(`[FlashcardView] Creating minimal fallback flashcard for study item without content`);
              cards.push({
                front: `Study item from ${studyItem.note.title}`,
                back: studyItem.block.content || "No content available",
                frontImage: undefined,
                backImage: studyItem.block.image,
                noteId: studyItem.noteId || studyItem.note.id,
                noteTitle: studyItem.note.title,
                math: false,
                whatMath: false,
                hint: "minimal"
              });
            }
          }
        } else {
          console.log(`[FlashcardView] Study item ${studyItem.id} missing block or note:`, {
            hasBlock: !!studyItem.block,
            hasNote: !!studyItem.note
          });
        }
      });
    } else if (note) {
      console.log("[FlashcardView] note.blocks:", note.blocks)
      addFlashcardsFromBlocks(note.blocks, note.id, note.title)
    } else if (notes) {
      console.log("[FlashcardView] notes (all blocks):", notes.map(n => ({ id: n.id, title: n.title, blocks: n.blocks })))
      notes.forEach((noteItem) => {
        addFlashcardsFromBlocks(noteItem.blocks, noteItem.id, noteItem.title)
      })
    }

    console.log(`[FlashcardView] Generated ${cards.length} flashcards from ${studyItems?.length || 0} study items`)
    if (cards.length === 0 && studyItems && studyItems.length > 0) {
      console.warn(`[FlashcardView] WARNING: No flashcards generated despite having ${studyItems.length} study items!`);
    }
    // Shuffle the cards
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    setFlashcards(shuffled)
    setCurrentIndex(0)
    setFlipped(false)
    setCompleted(false)
    setProgress(0)
  }, [note, notes, studyItems])

  // Make debug function available globally for console debugging
  useEffect(() => {
    if (typeof window !== 'undefined' && studyItems) {
      (window as any).debugStudyItems = () => debugStudyItems(studyItems);
      console.log('Debug function available: window.debugStudyItems()');
    }
  }, [studyItems]);

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

  const handleRating = async (rating: Rating) => {
    // Store the rating for this card
    setCardRatings(prev => new Map(prev).set(currentIndex, rating))

    // Create or update study item immediately with the rating
    const currentCard = flashcards[currentIndex];
    const notesToProcess = notes || (note ? [note] : []);
    const currentNote = notesToProcess.find(n => n.id === currentCard?.noteId);

    if (currentCard && currentNote) {
      try {
        // First create the study item
        await createStudyItemFromCurrentCard()

        // Reload the note to get the updated study items
        const updatedNote = await db.notes.get(currentNote.id);

        if (updatedNote) {
          // Find the study item and rate it to set the review date
          const block = updatedNote.blocks.find(b =>
            b.type === 'who' && b.content === currentCard.front
          );

          if (block && updatedNote.studyStats?.studyItems) {
            const studyItem = updatedNote.studyStats.studyItems.find(item => item.blockId === block.id);

            if (studyItem) {
              console.log(`🎯 Rating study item ${studyItem.id} with rating ${rating}`);
              await SpacedRepetitionService.reviewStudyItem(studyItem.id, rating);
              console.log(`✅ Study item rated and review date set`);
            } else {
              console.warn('Study item not found for rating');
            }
          }
        }
      } catch (error) {
        console.error('Error rating flashcard:', error);
      }
    }

    // Move to next card or complete
    if (currentIndex < flashcards.length - 1) {
      setFlipped(false)
      setCurrentIndex(currentIndex + 1)
    } else {
      setCompleted(true)
      if (onComplete && flashcards.length > 0) {
        onComplete(flashcards[currentIndex].noteId)
      }
    }
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
      // Create study items from completed flashcards
      createStudyItemsFromFlashcards()
    }
  }

  const createStudyItemFromCurrentCard = async () => {
    const currentCard = flashcards[currentIndex];
    const notesToProcess = notes || (note ? [note] : []);
    const currentNote = notesToProcess.find(n => n.id === currentCard?.noteId);

    if (!currentCard || !currentNote) return;

    try {
      // Find the block that corresponds to this flashcard
      const block = currentNote.blocks.find(b =>
        b.type === 'who' && b.content === currentCard.front
      );

      if (!block) {
        toast({
          title: "Info",
          description: "No matching block found for this flashcard",
        });
        return;
      }

      // Create study items from the block (force create for flashcard rating)
      const studyItems = await SpacedRepetitionService.createStudyItemsFromBlocks(
        [block],
        currentNote,
        true // forceCreate = true for flashcard ratings
      );

      if (studyItems.length > 0) {
        console.log('Created study items:', studyItems);
        toast({
          title: "Success",
          description: `Created ${studyItems.length} study item(s) for spaced repetition`,
        });
      } else {
        console.log('No study items created - card type may not be supported');
        toast({
          title: "Info",
          description: "This card type is not supported for spaced repetition",
        });
      }
    } catch (error) {
      console.error('Error creating study item:', error);

      let errorMessage = "Failed to create study item for spaced repetition";
      let showRetry = false;

      if (error instanceof Error) {
        if (error.message.includes('Database is not properly initialized')) {
          errorMessage = "Database is not properly initialized. Please refresh the page and try again.";
          showRetry = true;
        } else if (error.message.includes('Database upgrade failed')) {
          errorMessage = "Database operation failed. Please refresh the page and try again.";
          showRetry = true;
        } else if (error.message.includes('Database tables could not be created')) {
          errorMessage = "Database operation failed. Please refresh the page and try again.";
          showRetry = true;
        } else {
          errorMessage = error.message;
          showRetry = true;
        }
      }

      // Log debugging information
      console.log('For debugging, you can use these console commands:');
      console.log('- checkDatabaseHealth() - Check database schema status');
      console.log('- initializeDatabase() - Initialize database manually');
      console.log('- debugDatabase() - Basic database status');
      console.log('- resetDatabase() - Reset database (WARNING: clears all data)');

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        action: showRetry ? (
          <button
            onClick={() => {
              // Wait a moment and retry
              setTimeout(() => {
                createStudyItemFromCurrentCard();
              }, 1000);
            }}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
          >
            Retry
          </button>
        ) : undefined
      });
    }
  };

  const getRatingLabel = (rating: Rating) => {
    switch (rating) {
      case Rating.Again: return "Again"
      case Rating.Hard: return "Hard"
      case Rating.Good: return "Good"
      case Rating.Easy: return "Easy"
      default: return "Unknown"
    }
  }

  const getRatingColor = (rating: Rating) => {
    switch (rating) {
      case Rating.Again: return "bg-red-500 hover:bg-red-600"
      case Rating.Hard: return "bg-orange-500 hover:bg-orange-600"
      case Rating.Good: return "bg-blue-500 hover:bg-blue-600"
      case Rating.Easy: return "bg-green-500 hover:bg-green-600"
      default: return "bg-gray-500 hover:bg-gray-600"
    }
  }

  const createStudyItemsFromFlashcards = async () => {
    try {
      console.log('Creating study items from completed flashcard session...');
      const notesToProcess = notes || (note ? [note] : []);

      for (const currentNote of notesToProcess) {
        console.log(`Processing note: ${currentNote.title}`);

        // Check if study items already exist for this note
        const existingItems = await SpacedRepetitionService.getStudyItems(currentNote.id);
        console.log(`Existing study items for note ${currentNote.title}:`, existingItems.length);

        if (existingItems.length === 0) {
          // Create study items from WHO and WHAT blocks
          const whoBlocks = currentNote.blocks.filter(b => b.type === 'who');
          const whatBlocks = currentNote.blocks.filter(b => b.type === 'what');

          console.log(`Found ${whoBlocks.length} WHO blocks and ${whatBlocks.length} WHAT blocks`);

          // Create study items from WHO blocks that have linked WHAT blocks
          for (const whoBlock of whoBlocks) {
            if (whoBlock.linkedBlockIds && whoBlock.linkedBlockIds.length > 0) {
              const linkedWhatBlock = currentNote.blocks.find(b =>
                b.id === whoBlock.linkedBlockIds![0] && b.type === 'what'
              );

              if (linkedWhatBlock) {
                console.log(`Creating study item for WHO block: ${whoBlock.content}`);
                await SpacedRepetitionService.createStudyItemsFromBlocks([whoBlock], currentNote);
              }
            }
          }

          // Also create study items from standalone WHAT blocks
          for (const whatBlock of whatBlocks) {
            if (!whatBlock.linkedBlockIds || whatBlock.linkedBlockIds.length === 0) {
              console.log(`Creating study item for standalone WHAT block: ${whatBlock.content}`);
              await SpacedRepetitionService.createStudyItemsFromBlocks([whatBlock], currentNote);
            }
          }
        } else {
          console.log(`Study items already exist for note ${currentNote.title}`);
        }
      }

      console.log('Study items creation completed');
    } catch (error) {
      console.error('Error creating study items from flashcards:', error);
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

          {/* Spaced Repetition Integration */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-blue-800 dark:text-blue-200">
              Spaced Repetition Active! 🧠
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Your ratings have been saved to optimize future review intervals.
              Cards you found difficult will appear sooner, while easy cards will have longer intervals.
            </p>
            <div className="mt-3 text-xs text-blue-600 dark:text-blue-400">
              Rated cards: {cardRatings.size} / {flashcards.length}
            </div>
          </div>

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
            {/* Hint label - only show when there's a hint */}
            {flashcards[currentIndex].hint && (
              <div className="absolute bottom-4 right-4 z-10">
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                  {flashcards[currentIndex].hint}
                </span>
              </div>
            )}

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

        {!flipped ? (
          <div className="flex items-center justify-center mt-6 gap-4">
            <Button variant="outline" size="sm" onClick={() => setFlipped(false)}>
              <RotateCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
            <Button size="sm" onClick={() => setFlipped(true)}>
              Show Answer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center mt-6 gap-4">
            <div className="flex gap-3 w-full max-w-2xl">
              {[Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((rating) => (
                <Button
                  key={rating}
                  onClick={() => handleRating(rating)}
                  className={`${getRatingColor(rating)} text-white text-sm py-3 px-4 flex-1`}
                >
                  {getRatingLabel(rating)}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNext}
              className="mt-2"
            >
              Skip Rating
            </Button>
          </div>
        )}
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

import { Block } from '@/lib/db';
import {
  generateMultipleChoiceQuestion,
  generateTrueFalseQuestion,
  generateSequenceQuestion,
  findAllHowPathsFromWho,
  AnyQuizQuestion
} from './distractor-generator';

// Main question generator
export function generateQuizQuestions(notes: any[]): AnyQuizQuestion[] {
  const quizQuestions: AnyQuizQuestion[] = [];
  const allBlocks = notes.flatMap(note => note.blocks);

  // Helper to get all groups
  const groups: Block[][] = [];
  const visitedGlobal = new Set<string>();
  for (const block of allBlocks) {
    if (visitedGlobal.has(block.id)) continue;
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

  // Track generated questions to avoid duplicates
  const generatedWhoHowMCQs = new Set<string>();

  // For each who block, generate questions based on its own direct connections
  allBlocks.filter(b => b.type === 'who').forEach(whoBlock => {
    // Find the note that contains this block
    const note = notes.find(n => n.blocks.some((b: Block) => b.id === whoBlock.id));
    const noteId = note?.id || '';
    const noteTitle = note?.title || '';

    // Get all blocks that are directly connected to this WHO block (bidirectional)
    const directlyConnectedBlocks = allBlocks.filter((b: Block) =>
      (whoBlock.linkedBlockIds || []).includes(b.id) ||
      (b.linkedBlockIds || []).includes(whoBlock.id)
    );

    const directlyConnectedWhatBlocks = directlyConnectedBlocks.filter((b: Block) => b.type === 'what');
    const directlyConnectedHowBlocks = directlyConnectedBlocks.filter((b: Block) => b.type === 'how');

    // --- SINGLE HOW LOGIC: If this WHO block has exactly one HOW block connected, treat it as a WHAT block (always MCQ, ignore truthState) ---
    if (directlyConnectedHowBlocks.length === 1 && directlyConnectedWhatBlocks.length === 0) {
      const singleHowBlock = directlyConnectedHowBlocks[0];
      if (singleHowBlock && singleHowBlock.content) {
        const pairKey = `${whoBlock.id}-${singleHowBlock.id}`;
        if (!generatedWhoHowMCQs.has(pairKey)) {
          generatedWhoHowMCQs.add(pairKey);

          const question = generateMultipleChoiceQuestion(
            whoBlock,
            singleHowBlock,
            allBlocks,
            noteId,
            noteTitle,
            directlyConnectedWhatBlocks
          );

          if (question) {
            quizQuestions.push(question);
          }
        }
      }
    }

    // --- WHAT LOGIC: For each direct link to a what block ---
    directlyConnectedWhatBlocks.forEach((linkedBlock: Block) => {
      if (linkedBlock && linkedBlock.content) {
        // True/False: if the what block has a truthState
        if ((linkedBlock as any).truthState) {
          const question = generateTrueFalseQuestion(
            whoBlock,
            linkedBlock,
            noteId,
            noteTitle
          );

          if (question) {
            quizQuestions.push(question);
          }
        } else {
          // Multiple choice: find distractors from other WHAT blocks
          const question = generateMultipleChoiceQuestion(
            whoBlock,
            linkedBlock,
            allBlocks,
            noteId,
            noteTitle,
            directlyConnectedWhatBlocks
          );

          if (question) {
            quizQuestions.push(question);
          }
        }
      }
    });

    // --- SEQUENCE LOGIC: For each unique path from WHO through HOWs, generate a sequence question if path length >= 3 ---
    const allHowPaths = findAllHowPathsFromWho(whoBlock, allBlocks);
    for (const path of allHowPaths) {
      const question = generateSequenceQuestion(
        whoBlock,
        path,
        noteId,
        noteTitle
      );

      if (question) {
        quizQuestions.push(question);
      }
    }

    // --- SINGLE HOW LOGIC: For each directly connected HOW not in any chain, and no WHATs, generate MCQ ---
    if (directlyConnectedWhatBlocks.length === 0) {
      directlyConnectedHowBlocks.forEach((singleHowBlock: Block) => {
        if (!allHowPaths.some(path => path.includes(singleHowBlock)) && singleHowBlock.content) {
          const pairKey = `${whoBlock.id}-${singleHowBlock.id}`;
          if (!generatedWhoHowMCQs.has(pairKey)) {
            generatedWhoHowMCQs.add(pairKey);

            const question = generateMultipleChoiceQuestion(
              whoBlock,
              singleHowBlock,
              allBlocks,
              noteId,
              noteTitle,
              directlyConnectedWhatBlocks
            );

            if (question) {
              quizQuestions.push(question);
            }
          }
        }
      });
    }
  });

  return quizQuestions;
}

// Re-export types for backward compatibility
export type {
  MultipleChoiceQuizQuestion,
  TrueFalseQuizQuestion,
  SequenceQuizQuestion,
  AnyQuizQuestion
} from './distractor-generator'; 
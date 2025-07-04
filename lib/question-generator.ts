import { Block } from '@/lib/db';

// Types for questions
export interface MultipleChoiceQuizQuestion {
  type: 'multiple-choice';
  question: string;
  answer: string;
  options: string[];
  questionImage?: string;
  answerImage?: string;
  noteId: string;
  noteTitle: string;
  math?: boolean;
  id: string;
}

export interface TrueFalseQuizQuestion {
  type: 'true-false';
  question: string;
  statement: string;
  answer: string; // 'True' or 'False'
  options: string[];
  questionImage?: string;
  answerImage?: string;
  noteId: string;
  noteTitle: string;
  math?: boolean;
  id: string;
}

export interface SequenceQuizQuestion {
  type: 'sequence';
  question: string;
  sequence: string[];
  options: string[];
  noteId: string;
  noteTitle: string;
  id: string;
}

export type AnyQuizQuestion = MultipleChoiceQuizQuestion | TrueFalseQuizQuestion | SequenceQuizQuestion;



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

  // Move this inside the generateQuizQuestions function, at the top:
  const generatedWhoHowMCQs = new Set<string>();

  // For each who block, generate questions based on its own direct connections
  allBlocks.filter(b => b.type === 'who').forEach(whoBlock => {
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
        // Multiple choice: find distractors from other WHO blocks' WHAT connections
        const distractorPool = allBlocks.filter((b: Block) =>
          b.type === 'what' &&
          b.id !== singleHowBlock.id &&
          b.content &&
          !(b as any).truthState &&
          // Exclude WHAT blocks that are already connected to this WHO block
          !directlyConnectedWhatBlocks.some((connected: Block) => connected.id === b.id)
        );
        const distractors = distractorPool
          .map((b: Block) => b.content)
          .filter((c: string | undefined): c is string => Boolean(c))
          .filter((c: string, i: number, arr: string[]) => arr.indexOf(c) === i)
          .slice(0, 3);
        // Options: correct answer + distractors, shuffled
        const options = [...distractors, singleHowBlock.content].sort(() => Math.random() - 0.5);
        const pairKey = `${whoBlock.id}-${singleHowBlock.id}`;
        if (!generatedWhoHowMCQs.has(pairKey)) {
          generatedWhoHowMCQs.add(pairKey);
          quizQuestions.push({
            id: getUniqueId(`${whoBlock.id}-${singleHowBlock.id}-how-as-what`),
            type: 'multiple-choice',
            question: whoBlock.content || '',
            answer: singleHowBlock.content || '',
            options,
            questionImage: whoBlock.image,
            answerImage: singleHowBlock.image,
            noteId: whoBlock.noteId || '',
            noteTitle: whoBlock.noteTitle || '',
            math: whoBlock.math,
          });
        }
      }
    }

    // --- WHAT LOGIC: For each direct link to a what block ---
    directlyConnectedWhatBlocks.forEach((linkedBlock: Block) => {
      if (linkedBlock && linkedBlock.content) {
        // True/False: if the what block has a truthState
        if ((linkedBlock as any).truthState) {
          quizQuestions.push({
            id: getUniqueId(`${whoBlock.id}-${linkedBlock.id}-tf`),
            type: 'true-false',
            question: whoBlock.content || '',
            statement: linkedBlock.content || '',
            answer: (linkedBlock as any).truthState === 'true' ? 'True' : 'False',
            options: ['True', 'False'].sort(() => Math.random() - 0.5),
            questionImage: whoBlock.image,
            answerImage: linkedBlock.image,
            noteId: whoBlock.noteId || '',
            noteTitle: whoBlock.noteTitle || '',
            math: whoBlock.math,
          });
        } else {
          // Multiple choice: find distractors from other WHAT blocks
          const distractorPool = allBlocks.filter((b: Block) =>
            b.type === 'what' &&
            b.id !== linkedBlock.id &&
            b.content &&
            !(b as any).truthState &&
            // Exclude WHAT blocks that are already connected to this WHO block
            !directlyConnectedWhatBlocks.some((connected: Block) => connected.id === b.id)
          );
          const distractors = distractorPool
            .map((b: Block) => b.content)
            .filter((c: string | undefined): c is string => Boolean(c))
            .filter((c: string, i: number, arr: string[]) => arr.indexOf(c) === i)
            .slice(0, 3);
          // Options: correct answer + distractors, shuffled
          const options = [...distractors, linkedBlock.content].sort(() => Math.random() - 0.5);
          quizQuestions.push({
            id: getUniqueId(`${whoBlock.id}-${linkedBlock.id}`),
            type: 'multiple-choice',
            question: whoBlock.content || '',
            answer: linkedBlock.content || '',
            options,
            questionImage: whoBlock.image,
            answerImage: linkedBlock.image,
            noteId: whoBlock.noteId || '',
            noteTitle: whoBlock.noteTitle || '',
            math: whoBlock.math,
          });
        }
      }
    });

    // --- SEQUENCE LOGIC: For each unique path from WHO through HOWs, generate a sequence question if path length >= 3 ---
    const allHowPaths = findAllHowPathsFromWho(whoBlock, allBlocks);
    for (const path of allHowPaths) {
      // path: [WHO, HOW, HOW, ...]
      const sequence = path.slice(1).map(b => b.content).filter((c: string | undefined): c is string => Boolean(c));
      quizQuestions.push({
        id: getUniqueId(whoBlock.id + '-sequence-' + path.map(b => b.id).join('>')),
        type: 'sequence',
        question: whoBlock.content || '',
        sequence: [...sequence],
        options: [...sequence].sort(() => Math.random() - 0.5),
        noteId: whoBlock.noteId || '',
        noteTitle: whoBlock.noteTitle || '',
      });
    }

    // --- SINGLE HOW LOGIC: For each directly connected HOW not in any chain, and no WHATs, generate MCQ ---
    if (directlyConnectedWhatBlocks.length === 0) {
      directlyConnectedHowBlocks.forEach((singleHowBlock: Block) => {
        if (!allHowPaths.some(path => path.includes(singleHowBlock)) && singleHowBlock.content) {
          const distractorPool = allBlocks.filter((b: Block) =>
            b.type === 'what' &&
            b.id !== singleHowBlock.id &&
            b.content &&
            !(b as any).truthState &&
            !directlyConnectedWhatBlocks.some((connected: Block) => connected.id === b.id)
          );
          const distractors = distractorPool
            .map((b: Block) => b.content)
            .filter((c: string | undefined): c is string => Boolean(c))
            .filter((c: string, i: number, arr: string[]) => arr.indexOf(c) === i)
            .slice(0, 3);
          const options = [...distractors, singleHowBlock.content].sort(() => Math.random() - 0.5);
          const pairKey = `${whoBlock.id}-${singleHowBlock.id}`;
          if (!generatedWhoHowMCQs.has(pairKey)) {
            generatedWhoHowMCQs.add(pairKey);
            quizQuestions.push({
              id: getUniqueId(`${whoBlock.id}-${singleHowBlock.id}-how-as-what`),
              type: 'multiple-choice',
              question: whoBlock.content || '',
              answer: singleHowBlock.content || '',
              options,
              questionImage: whoBlock.image,
              answerImage: singleHowBlock.image,
              noteId: whoBlock.noteId || '',
              noteTitle: whoBlock.noteTitle || '',
              math: whoBlock.math,
            });
          }
        }
      });
    }
  });

  return quizQuestions;
}

// Helper to traverse a chain of HOW blocks starting from a WHO block
function getHowChainFromWho(whoBlock: Block, allBlocks: Block[]): Block[] {
  const chain: Block[] = [];
  // Find the first HOW block directly connected to the WHO
  let current = (allBlocks.find(
    b => ((whoBlock.linkedBlockIds || []).includes(b.id) || (b.linkedBlockIds || []).includes(whoBlock.id)) && b.type === 'how'
  )) || null;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    chain.push(current);
    visited.add(current.id);
    // Find the next HOW block linked from the current HOW
    const next = (current.linkedBlockIds || [])
      .map((id: string) => allBlocks.find((b: Block) => b.id === id && b.type === 'how'))
      .find((b: Block | undefined): b is Block => b !== undefined);
    current = next || null;
  }
  return chain;
}

// Helper to find all unique paths from a WHO block through HOW blocks
function findAllHowPathsFromWho(whoBlock: Block, allBlocks: Block[]): Block[][] {
  const paths: Block[][] = [];
  const visited = new Set<string>();

  function dfs(currentPath: Block[], currentBlock: Block) {
    visited.add(currentBlock.id);
    // Find all HOWs directly connected to the current block (bidirectional)
    const nextHows = allBlocks.filter(
      b => b.type === 'how' &&
        !visited.has(b.id) &&
        ((currentBlock.linkedBlockIds || []).includes(b.id) || (b.linkedBlockIds || []).includes(currentBlock.id))
    );
    if (nextHows.length === 0) {
      // End of path
      if (currentPath.length >= 3) {
        paths.push([...currentPath]);
      }
    } else {
      for (const next of nextHows) {
        dfs([...currentPath, next], next);
      }
    }
    visited.delete(currentBlock.id);
  }

  dfs([whoBlock], whoBlock);
  return paths;
}

const usedIds = new Set<string>();
function getUniqueId(baseId: string) {
  let id = baseId;
  let counter = 1;
  while (usedIds.has(id)) {
    id = `${baseId}-${counter++}`;
  }
  usedIds.add(id);
  return id;
} 
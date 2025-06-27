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

// Helper to get ordered HOW blocks in the same group as a WHO block
function getOrderedHowBlocksForWho(whoBlock: Block, allBlocks: Block[]): Block[] {
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
  traverse(whoBlock);
  const groupBlocks = allBlocks.filter(b => visited.has(b.id));
  return groupBlocks
    .filter(b => b.type === 'how')
    .sort((a, b) => allBlocks.indexOf(a) - allBlocks.indexOf(b));
}

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

  // For each who block, generate questions for direct links only
  allBlocks.filter(b => b.type === 'who').forEach(whoBlock => {
    // Find the group for this who block
    const group = groups.find(g => g.some(b => b.id === whoBlock.id)) || [];
    const groupWhatBlocks = group.filter(b => b.type === 'what');
    const groupHowBlocks = group.filter(b => b.type === 'how');
    const groupWhatIds = new Set(groupWhatBlocks.map(b => b.id));
    // --- NEW LOGIC: If only one HOW block in the group, treat it as a WHAT block ---
    if (groupHowBlocks.length === 1) {
      const singleHowBlock = groupHowBlocks[0];
      // Only treat as WHAT if not already a WHAT and has content
      if (singleHowBlock && singleHowBlock.content) {
        // True/False: if the how block has a truthState
        if ((singleHowBlock as any).truthState) {
          quizQuestions.push({
            id: `${whoBlock.id}-${singleHowBlock.id}-tf`,
            type: 'true-false',
            question: whoBlock.content || '',
            statement: singleHowBlock.content || '',
            answer: (singleHowBlock as any).truthState === 'true' ? 'True' : 'False',
            options: ['True', 'False'].sort(() => Math.random() - 0.5),
            questionImage: whoBlock.image,
            answerImage: singleHowBlock.image,
            noteId: whoBlock.noteId || '',
            noteTitle: whoBlock.noteTitle || '',
            math: whoBlock.math,
          });
        } else {
          // Distractors: what blocks from other groups (not in this group), and without a truthState
          const distractorPool = allBlocks.filter((b: Block) => b.type === 'what' && b.id !== singleHowBlock.id && !groupWhatIds.has(b.id) && b.content && !(b as any).truthState);
          const distractors = distractorPool
            .map((b: Block) => b.content)
            .filter((c: string | undefined): c is string => Boolean(c))
            .filter((c: string, i: number, arr: string[]) => arr.indexOf(c) === i)
            .slice(0, 3);
          // Options: correct answer + distractors, shuffled
          const options = [...distractors, singleHowBlock.content].sort(() => Math.random() - 0.5);
          quizQuestions.push({
            id: `${whoBlock.id}-${singleHowBlock.id}-how-as-what`,
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
    // For each direct link to a what block
    (whoBlock.linkedBlockIds || []).forEach((linkedId: string) => {
      const linkedBlock = allBlocks.find((b: Block) => b.id === linkedId && b.type === 'what');
      if (linkedBlock && linkedBlock.content) {
        // True/False: if the what block has a truthState
        if ((linkedBlock as any).truthState) {
          quizQuestions.push({
            id: `${whoBlock.id}-${linkedBlock.id}-tf`,
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
          // Distractors: what blocks from other groups (not in this group), and without a truthState
          const distractorPool = allBlocks.filter((b: Block) => b.type === 'what' && b.id !== linkedBlock.id && !groupWhatIds.has(b.id) && b.content && !(b as any).truthState);
          const distractors = distractorPool
            .map((b: Block) => b.content)
            .filter((c: string | undefined): c is string => Boolean(c))
            .filter((c: string, i: number, arr: string[]) => arr.indexOf(c) === i)
            .slice(0, 3);
          // Options: correct answer + distractors, shuffled
          const options = [...distractors, linkedBlock.content].sort(() => Math.random() - 0.5);
          quizQuestions.push({
            id: `${whoBlock.id}-${linkedBlock.id}`,
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
    // Sequence: if 2 or more HOW blocks in the group (use robust traversal)
    const howBlocks = getOrderedHowBlocksForWho(whoBlock, allBlocks);
    if (howBlocks.length >= 2) {
      const howContents = howBlocks.map((b: Block) => b.content).filter((c: string | undefined): c is string => Boolean(c));
      if (howContents.length >= 2) {
        quizQuestions.push({
          id: whoBlock.id + '-sequence',
          type: 'sequence',
          question: whoBlock.content || '',
          sequence: [...howContents],
          options: [...howContents].sort(() => Math.random() - 0.5),
          noteId: whoBlock.noteId || '',
          noteTitle: whoBlock.noteTitle || '',
        });
      }
    }
  });

  return quizQuestions;
} 
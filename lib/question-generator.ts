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

  function addQuizQuestionsFromBlocks(blocks: Block[], noteId: string, noteTitle: string, noteObj: any) {
    const whoBlocks = blocks.filter(b => b.type === 'who');
    for (const whoBlock of whoBlocks) {
      const visited = new Set<string>();
      function traverse(b: Block) {
        if (!b || visited.has(b.id)) return;
        visited.add(b.id);
        (b.linkedBlockIds || []).forEach(id => {
          const next = blocks.find(x => x.id === id);
          if (next) traverse(next);
        });
        blocks.forEach(x => {
          if (x.linkedBlockIds?.includes(b.id)) traverse(x);
        });
      }
      traverse(whoBlock);
      const groupBlocks = blocks.filter(b => visited.has(b.id));
      const groupWhatBlocks = groupBlocks.filter(b => b.type === 'what');
      // Sequence question: if WHO block has 2 or more linked HOW blocks
      const howBlocks = getOrderedHowBlocksForWho(whoBlock, blocks);
      if (howBlocks.length >= 2) {
        quizQuestions.push({
          id: whoBlock.id + '-sequence',
          type: 'sequence',
          question: whoBlock.content,
          sequence: howBlocks.map(b => b.content),
          options: [...howBlocks.map(b => b.content)].sort(() => Math.random() - 0.5),
          noteId,
          noteTitle,
        });
      }
      for (const whatBlock of groupWhatBlocks) {
        if ((whatBlock as any).truthState) {
          quizQuestions.push({
            id: `${whoBlock.id}-${whatBlock.id}-tf`,
            type: 'true-false',
            question: whoBlock.content,
            statement: whatBlock.content,
            answer: (whatBlock as any).truthState === 'true' ? 'True' : 'False',
            options: ['True', 'False'].sort(() => Math.random() - 0.5),
            questionImage: whoBlock.image,
            answerImage: whatBlock.image,
            noteId,
            noteTitle,
            math: whoBlock.math,
          });
        } else {
          const allBlocks = (notes || [noteObj]).flatMap(n => n.blocks);
          const groups: Block[][] = [];
          const visitedGlobal = new Set<string>();
          for (const block of allBlocks) {
            if (visitedGlobal.has(block.id)) continue;
            const visited = new Set<string>();
            function traverseGroup(b: Block) {
              if (!b || visited.has(b.id)) return;
              visited.add(b.id);
              (b.linkedBlockIds || []).forEach(id => {
                const next = allBlocks.find(x => x.id === id);
                if (next) traverseGroup(next);
              });
              allBlocks.forEach(x => {
                if (x.linkedBlockIds?.includes(b.id)) traverseGroup(x);
              });
            }
            traverseGroup(block);
            if (visited.size > 0) {
              groups.push(allBlocks.filter(b => visited.has(b.id)));
              visited.forEach(id => visitedGlobal.add(id));
            }
          }
          const currentGroup = groups.find(g => g.some(b => b.id === whatBlock.id)) || [];
          const currentGroupIds = new Set(currentGroup.map(b => b.id));
          const distractorPool = allBlocks.filter(b => b.type === 'what' && !(b as any).truthState && !currentGroupIds.has(b.id));
          const correctContent = whatBlock.content;
          const distractors = distractorPool
            .filter(b => b.content !== correctContent)
            .map(b => b.content)
            .filter((c, i, arr) => arr.indexOf(c) === i)
            .slice(0, 3);
          const options = [...distractors, correctContent].sort(() => Math.random() - 0.5);
          quizQuestions.push({
            id: `${whoBlock.id}-${whatBlock.id}`,
            type: 'multiple-choice',
            question: whoBlock.content,
            answer: whatBlock.content,
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
  }
  notes.forEach(note => addQuizQuestionsFromBlocks(note.blocks, note.id, note.title, note));
  const seen = new Set();
  const deduped = quizQuestions.filter(q => {
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
  return deduped.sort(() => Math.random() - 0.5);
} 
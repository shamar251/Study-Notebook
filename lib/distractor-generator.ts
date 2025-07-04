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

// Proximity calculation helpers
interface BlockDistance {
  block: Block;
  distance: number;
}

/**
 * Calculate the shortest path distance between two blocks using BFS
 */
function calculateBlockDistance(sourceBlock: Block, targetBlock: Block, allBlocks: Block[]): number {
  if (sourceBlock.id === targetBlock.id) return 0;

  const queue: { block: Block; distance: number }[] = [{ block: sourceBlock, distance: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { block, distance } = queue.shift()!;

    if (block.id === targetBlock.id) {
      return distance;
    }

    if (visited.has(block.id)) continue;
    visited.add(block.id);

    // Add all connected blocks to the queue
    const connectedBlocks = allBlocks.filter(b =>
      (block.linkedBlockIds || []).includes(b.id) ||
      (b.linkedBlockIds || []).includes(block.id)
    );

    for (const connectedBlock of connectedBlocks) {
      if (!visited.has(connectedBlock.id)) {
        queue.push({ block: connectedBlock, distance: distance + 1 });
      }
    }
  }

  // If no path found, return a large distance
  return 1000;
}

/**
 * Get distractors prioritized by proximity to the source block
 */
function getProximityPrioritizedDistractors(
  sourceBlock: Block,
  distractorPool: Block[],
  allBlocks: Block[],
  maxDistractors: number = 3
): string[] {
  // Calculate distances for all potential distractors
  const blockDistances: BlockDistance[] = distractorPool.map(block => ({
    block,
    distance: calculateBlockDistance(sourceBlock, block, allBlocks)
  }));

  // Sort by distance (closest first)
  blockDistances.sort((a, b) => a.distance - b.distance);

  // Take the closest blocks, but add some randomness to avoid always picking the same ones
  const closestBlocks = blockDistances.slice(0, Math.min(maxDistractors * 2, blockDistances.length));

  // Shuffle the closest blocks to add variety while maintaining proximity priority
  const shuffledClosest = closestBlocks.sort(() => Math.random() - 0.5);

  // Return the content of the top distractors
  return shuffledClosest
    .slice(0, maxDistractors)
    .map(bd => bd.block.content)
    .filter((content): content is string => Boolean(content));
}

/**
 * Generate multiple choice question with proximity-based distractors
 */
export function generateMultipleChoiceQuestion(
  questionBlock: Block,
  answerBlock: Block,
  allBlocks: Block[],
  noteId: string,
  noteTitle: string,
  excludeBlocks: Block[] = [],
  maxDistractors: number = 3
): MultipleChoiceQuizQuestion | null {
  if (!answerBlock.content) return null;

  // Find potential distractors from the same type as the answer block
  const distractorPool = allBlocks.filter((b: Block) =>
    b.type === answerBlock.type &&
    b.id !== answerBlock.id &&
    b.content &&
    !(b as any).truthState &&
    !excludeBlocks.some(excludeBlock => excludeBlock.id === b.id)
  );

  const distractors = getProximityPrioritizedDistractors(
    answerBlock,
    distractorPool,
    allBlocks,
    maxDistractors
  );

  if (distractors.length === 0) return null;

  // Create options: distractors + correct answer, shuffled
  const options = [...distractors, answerBlock.content].sort(() => Math.random() - 0.5);

  return {
    id: getUniqueId(`${questionBlock.id}-${answerBlock.id}`),
    type: 'multiple-choice',
    question: questionBlock.content || '',
    answer: answerBlock.content || '',
    options,
    questionImage: questionBlock.image,
    answerImage: answerBlock.image,
    noteId,
    noteTitle,
    math: questionBlock.math,
  };
}

/**
 * Generate true/false question
 */
export function generateTrueFalseQuestion(
  questionBlock: Block,
  statementBlock: Block,
  noteId: string,
  noteTitle: string
): TrueFalseQuizQuestion | null {
  if (!statementBlock.content) return null;

  return {
    id: getUniqueId(`${questionBlock.id}-${statementBlock.id}-tf`),
    type: 'true-false',
    question: questionBlock.content || '',
    statement: statementBlock.content || '',
    answer: (statementBlock as any).truthState === 'true' ? 'True' : 'False',
    options: ['True', 'False'].sort(() => Math.random() - 0.5),
    questionImage: questionBlock.image,
    answerImage: statementBlock.image,
    noteId,
    noteTitle,
    math: questionBlock.math,
  };
}

/**
 * Generate sequence question from a path of blocks
 */
export function generateSequenceQuestion(
  questionBlock: Block,
  path: Block[],
  noteId: string,
  noteTitle: string
): SequenceQuizQuestion | null {
  const sequence = path.slice(1).map(b => b.content).filter((c: string | undefined): c is string => Boolean(c));

  if (sequence.length === 0) return null;

  return {
    id: getUniqueId(questionBlock.id + '-sequence-' + path.map(b => b.id).join('>')),
    type: 'sequence',
    question: questionBlock.content || '',
    sequence: [...sequence],
    options: [...sequence].sort(() => Math.random() - 0.5),
    noteId,
    noteTitle,
  };
}

/**
 * Find all unique paths from a WHO block through HOW blocks
 */
export function findAllHowPathsFromWho(whoBlock: Block, allBlocks: Block[]): Block[][] {
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
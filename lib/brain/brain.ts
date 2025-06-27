import type { Block, Note } from "@/lib/db";
import type {
  Question,
  QuestionType,
  BrainInterfaceConfig,
  QuestionGenerationResult,
  QuestionValidationResult,
  MultipleChoiceQuestion,
  SequenceQuestion,
  TrueFalseQuestion,
  QuestionProcessor
} from "./types";
import { NLPProcessor, LLMProcessor } from "./processors";
import { BlockConnectionManager } from "@/lib/block-connections"

export class BrainInterface {
  private nlpProcessor?: QuestionProcessor;
  private llmProcessor?: QuestionProcessor;
  private cache: Map<string, Question>;
  private cacheDuration: number;

  constructor(config: BrainInterfaceConfig = {}) {
    this.cache = new Map();
    this.cacheDuration = config.cacheDuration || 3600000; // 1 hour default

    if (config.useNLP) {
      // Initialize NLP processor
      this.nlpProcessor = new NLPProcessor(config.nlpConfig);
    }

    if (config.useLLM && config.llmConfig) {
      // Initialize LLM processor only if config is provided
      this.llmProcessor = new LLMProcessor(config.llmConfig);
    }
  }

  /**
   * Generate questions from blocks
   */
  async generateQuestions(blocks: Block[], note: Note): Promise<QuestionGenerationResult> {
    const startTime = Date.now();
    const questions: Question[] = [];
    const byType: Record<QuestionType, number> = {
      'multiple-choice': 0,
      'sequence': 0,
      'true-false': 0
    };

    // Process blocks
    for (const block of blocks) {
      if (block.type === 'who') {
        // Handle sequence questions
        if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
          const howBlocks = this.getAllLinkedHowBlocks(block, blocks);
          if (howBlocks.length >= 2) {
            const question = this.createSequenceQuestion(block, howBlocks, note);
            questions.push(question);
            byType['sequence']++;
            continue;
          }
        }

        // Handle single HOW block as WHAT block for questions
        if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) {
          const howBlocks = this.getAllLinkedHowBlocks(block, blocks);
          if (howBlocks.length === 1) {
            const singleHowBlock = howBlocks[0];
            const mcQuestions = this.createMultipleChoiceQuestions(block, singleHowBlock, note);
            questions.push(...mcQuestions);
            byType['multiple-choice'] += mcQuestions.length;
            continue;
          }
        }

        // Handle true/false questions
        if (Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
          const whatBlock = blocks.find(b => b.id === block.linkedBlockIds![0] && b.type === 'what');
          if (whatBlock?.truthState) {
            const question = this.createTrueFalseQuestion(block, whatBlock, note);
            questions.push(question);
            byType['true-false']++;
            continue;
          }
        }

        // Handle regular multiple choice questions
        const whatBlock = this.findWhatBlock(block, blocks);
        if (whatBlock) {
          const mcQuestions = this.createMultipleChoiceQuestions(block, whatBlock, note);
          questions.push(...mcQuestions);
          byType['multiple-choice'] += mcQuestions.length;
        }
      }
    }

    // Enhance questions if processors are available
    let enhancedByNLP = false;
    let enhancedByLLM = false;

    if (this.nlpProcessor) {
      for (let i = 0; i < questions.length; i++) {
        questions[i] = await this.nlpProcessor.enhanceQuestion(questions[i]);
      }
      enhancedByNLP = true;
    }

    if (this.llmProcessor) {
      for (let i = 0; i < questions.length; i++) {
        questions[i] = await this.llmProcessor.enhanceQuestion(questions[i]);
      }
      enhancedByLLM = true;
    }

    return {
      questions,
      metadata: {
        totalQuestions: questions.length,
        byType,
        processingTime: Date.now() - startTime,
        enhancedByNLP,
        enhancedByLLM
      }
    };
  }

  /**
   * Validate a question
   */
  async validateQuestion(question: Question): Promise<QuestionValidationResult> {
    // Basic validation
    const isValid = this.validateQuestionStructure(question);
    if (!isValid) {
      return {
        isValid: false,
        score: 0,
        feedback: "Invalid question structure"
      };
    }

    // Enhanced validation with processors
    let score = 1;
    let feedback: string[] = [];

    if (this.nlpProcessor) {
      const nlpResult = await this.nlpProcessor.validateQuestion(question);
      score *= nlpResult.score;
      if (nlpResult.feedback) feedback.push(nlpResult.feedback);
    }

    if (this.llmProcessor) {
      const llmResult = await this.llmProcessor.validateQuestion(question);
      score *= llmResult.score;
      if (llmResult.feedback) feedback.push(llmResult.feedback);
    }

    return {
      isValid: true,
      score,
      feedback: feedback.join(" "),
      corrections: [] // TODO: Implement corrections
    };
  }

  // Private helper methods

  private validateQuestionStructure(question: Question): boolean {
    switch (question.type) {
      case 'multiple-choice':
        return this.validateMultipleChoiceQuestion(question);
      case 'sequence':
        return this.validateSequenceQuestion(question);
      case 'true-false':
        return this.validateTrueFalseQuestion(question);
      default:
        return false;
    }
  }

  private validateMultipleChoiceQuestion(question: MultipleChoiceQuestion): boolean {
    return (
      !!question.content &&
      !!question.answer &&
      Array.isArray(question.options) &&
      question.options.length >= 2 &&
      question.options.includes(question.answer)
    );
  }

  private validateSequenceQuestion(question: SequenceQuestion): boolean {
    return (
      !!question.content &&
      Array.isArray(question.sequence) &&
      Array.isArray(question.options) &&
      question.sequence.length >= 2 &&
      question.options.length === question.sequence.length &&
      this.areArraysEqual(new Set(question.sequence), new Set(question.options))
    );
  }

  private validateTrueFalseQuestion(question: TrueFalseQuestion): boolean {
    return (
      !!question.content &&
      !!question.statement &&
      (question.answer === 'True' || question.answer === 'False')
    );
  }

  private areArraysEqual(set1: Set<string>, set2: Set<string>): boolean {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
      if (!set2.has(item)) return false;
    }
    return true;
  }

  private getAllLinkedWhatBlocks(whoBlock: Block, blocks: Block[]): Block[] {
    return BlockConnectionManager.getAllLinkedWhatBlocks(whoBlock, blocks)
  }

  private getAllLinkedHowBlocks(whoBlock: Block, blocks: Block[]): Block[] {
    return BlockConnectionManager.getAllLinkedHowBlocks(whoBlock, blocks)
  }

  private findWhatBlock(whoBlock: Block, blocks: Block[]): Block | undefined {
    return BlockConnectionManager.findWhatBlock(whoBlock, blocks)
  }

  private createSequenceQuestion(whoBlock: Block, howBlocks: Block[], note: Note): SequenceQuestion {
    const howContents = howBlocks.map(b => b.content).filter((c): c is string => Boolean(c));
    return {
      id: `${whoBlock.id}-sequence`,
      type: 'sequence',
      content: whoBlock.content || '',
      sequence: howContents,
      options: [...howContents].sort(() => Math.random() - 0.5),
      noteId: note.id,
      noteTitle: note.title
    };
  }

  private createTrueFalseQuestion(whoBlock: Block, whatBlock: Block, note: Note): TrueFalseQuestion {
    return {
      id: `${whoBlock.id}-tf`,
      type: 'true-false',
      content: whoBlock.content || '',
      statement: whatBlock.content || '',
      answer: (whatBlock as any).truthState === 'true' ? 'True' : 'False',
      noteId: note.id,
      noteTitle: note.title
    };
  }

  private createMultipleChoiceQuestions(whoBlock: Block, whatBlock: Block, note: Note): MultipleChoiceQuestion[] {
    const questions: MultipleChoiceQuestion[] = [];

    // Question from WHO perspective
    questions.push({
      id: `${whoBlock.id}-who`,
      type: 'multiple-choice',
      content: whoBlock.content || '',
      answer: whatBlock.content || '',
      options: this.generateOptions(whatBlock.content || '', note.blocks, 'what'),
      noteId: note.id,
      noteTitle: note.title,
      questionImage: whoBlock.image,
      answerImage: whatBlock.image,
      math: whoBlock.math
    });

    // Question from WHAT perspective
    questions.push({
      id: `${whoBlock.id}-what`,
      type: 'multiple-choice',
      content: (whatBlock.content || '').toLowerCase(),
      answer: whoBlock.content || '',
      options: this.generateOptions(whoBlock.content || '', note.blocks, 'who'),
      noteId: note.id,
      noteTitle: note.title,
      questionImage: whoBlock.image,
      answerImage: whatBlock.image,
      math: whatBlock.math
    });

    return questions;
  }

  private generateOptions(correctAnswer: string, blocks: Block[], blockType: 'who' | 'what'): string[] {
    const allAnswers = blocks
      .filter(block => {
        if (block.type !== blockType) return false;
        if (blockType === 'what' && (block as any).truthState) return false;
        if (blockType === 'what' && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length > 0) return false;
        if (blockType === 'who' && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length === 1) {
          const whatBlock = blocks.find(b => b.id === block.linkedBlockIds![0] && b.type === 'what');
          if (whatBlock?.truthState) return false;
        }
        if (blockType === 'who' && Array.isArray(block.linkedBlockIds) && block.linkedBlockIds.length >= 2) return false;
        return block.content !== correctAnswer;
      })
      .map(block => block.content)
      .filter((c): c is string => Boolean(c));

    const shuffled = allAnswers.sort(() => Math.random() - 0.5).slice(0, 3);
    return [...shuffled, correctAnswer].sort(() => Math.random() - 0.5);
  }
} 
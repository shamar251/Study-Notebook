import type { Block, Note } from "@/lib/db";

export type QuestionType = 'multiple-choice' | 'sequence' | 'true-false';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  content: string;
  noteId: string;
  noteTitle: string;
  metadata?: {
    difficulty?: number;
    tags?: string[];
    lastAnswered?: Date;
    successRate?: number;
    timesAnswered?: number;
    averageResponseTime?: number;
  };
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple-choice';
  answer: string;
  options: string[];
  questionImage?: string;
  answerImage?: string;
  math?: boolean;
}

export interface SequenceQuestion extends BaseQuestion {
  type: 'sequence';
  sequence: string[]; // correct order
  options: string[]; // shuffled order
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'true-false';
  answer: 'True' | 'False';
  statement: string;
}

export type Question = MultipleChoiceQuestion | SequenceQuestion | TrueFalseQuestion;

// Processor interfaces
export interface QuestionProcessor {
  enhanceQuestion(question: Question): Promise<Question>;
  validateQuestion(question: Question): Promise<QuestionValidationResult>;
}

export interface NLPConfig {
  model?: string;
  language?: string;
  options?: Record<string, any>;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom';
  model: string;
  apiKey?: string;
  options?: Record<string, any>;
}

// Configuration interfaces
export interface BrainInterfaceConfig {
  useNLP?: boolean;
  useLLM?: boolean;
  nlpConfig?: NLPConfig;
  llmConfig?: LLMConfig;
  cacheEnabled?: boolean;
  cacheDuration?: number;
}

// Result interfaces
export interface QuestionGenerationResult {
  questions: Question[];
  metadata: {
    totalQuestions: number;
    byType: Record<QuestionType, number>;
    processingTime: number;
    enhancedByNLP?: boolean;
    enhancedByLLM?: boolean;
  };
}

export interface QuestionValidationResult {
  isValid: boolean;
  score: number;
  feedback?: string;
  corrections?: {
    field: string;
    suggestion: string;
  }[];
} 
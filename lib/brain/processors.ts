import type { Question, QuestionProcessor, NLPConfig, LLMConfig, QuestionValidationResult } from "./types";

export class NLPProcessor implements QuestionProcessor {
  private config: NLPConfig;

  constructor(config: NLPConfig = {}) {
    this.config = {
      model: config.model || 'default',
      language: config.language || 'en',
      options: config.options || {}
    };
  }

  async enhanceQuestion(question: Question): Promise<Question> {
    // TODO: Implement actual NLP processing
    // For now, return the question as is
    return question;
  }

  async validateQuestion(question: Question): Promise<QuestionValidationResult> {
    // TODO: Implement actual NLP validation
    return {
      isValid: true,
      score: 1,
      feedback: "NLP validation not implemented yet"
    };
  }
}

export class LLMProcessor implements QuestionProcessor {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    if (!config.provider || !config.model) {
      throw new Error("LLM provider and model are required");
    }
    this.config = config;
  }

  async enhanceQuestion(question: Question): Promise<Question> {
    // TODO: Implement actual LLM processing
    // For now, return the question as is
    return question;
  }

  async validateQuestion(question: Question): Promise<QuestionValidationResult> {
    // TODO: Implement actual LLM validation
    return {
      isValid: true,
      score: 1,
      feedback: "LLM validation not implemented yet"
    };
  }
} 
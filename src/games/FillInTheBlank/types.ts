import type { BaseGameConfig } from '../../shared/types';

export interface FillInTheBlankConfig extends BaseGameConfig {
  sentences: SentenceItem[];
}

export interface SentenceItem {
  /** The sentence text. Use ___ for each blank slot in order. */
  text: string;
  /** Correct word(s) for each blank, in order. */
  answers: string[];
  /** Extra wrong options shown in the word bank alongside the correct ones. */
  distractors: string[];
  /** Optional hint shown on demand. */
  hint?: string;
}

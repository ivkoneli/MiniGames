// ─── Shared types used across all game scenes ─────────────────────────────────

/** Every game config object must extend this */
export interface BaseGameConfig {
  /** Display title shown in the game UI */
  title: string;
  /** Subject label (e.g. "Math", "Biology") */
  subject: string;
  /** Time limit in seconds. Omit for untimed. */
  timeLimit?: number;
  /** Shuffle item order each play */
  shuffleItems?: boolean;
}

export type GameStatus = 'idle' | 'playing' | 'paused' | 'complete';

export interface ScoreData {
  correct: number;
  wrong: number;
  total: number;
  timeElapsed: number; // seconds
}

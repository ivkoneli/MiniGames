import type { BaseGameConfig } from '../../shared/types';

export interface CurveSelectorConfig extends BaseGameConfig {
  questions: CurveQuestion[];
}

export interface CurveQuestion {
  /** Human-readable label shown as the prompt, e.g. "f(x) = x²" */
  label: string;
  /** The correct curve definition */
  correct: CurveDef;
  /** Wrong options shown alongside the correct one */
  distractors: CurveDef[];
  /** Optional domain range [min, max] for the x axis. Default: [-5, 5] */
  xRange?: [number, number];
  /** Optional range [min, max] for the y axis. Default: [-5, 5] */
  yRange?: [number, number];
}

export interface CurveDef {
  /** A function that maps x → y. Written as a JS arrow function string
   *  e.g. "(x) => x * x" — evaluated at runtime via new Function() */
  fn: string;
  /** Optional colour override for this specific curve */
  color?: number;
}

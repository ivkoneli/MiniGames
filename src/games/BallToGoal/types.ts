import type { BaseGameConfig } from '../../shared/types';

export interface BallToGoalConfig extends BaseGameConfig {
  levels: BallToGoalLevel[];
}

export interface BallToGoalLevel {
  description?: string;
  /** Ball drop position [x, y] in math coordinates.
   *  The ball starts slightly above this point and falls. */
  startPos: [number, number];
  /** Target goal [x, y] in math coordinates. */
  goalPos: [number, number];
  /** All selectable equations for this level.
   *  Physics determines which one(s) route the ball to the goal — no pre-labelling needed. */
  options: EquationDef[];
  xRange: [number, number];
  yRange: [number, number];
  /** How many curves must be selected simultaneously to solve the level (default: 1). */
  requiredCurves?: number;
}

export interface EquationDef {
  /** Arrow-function string: "(x) => x * x" */
  fn: string;
  /** Human-readable label shown on the button */
  label: string;
}

/** Internal physics state of the ball (not serialised) */
export interface BallState {
  mx: number;     // math x
  my: number;     // math y
  prevMy: number; // previous frame math y (for curve-crossing detection)
  vx: number;     // math velocity x  (units/s)
  vy: number;     // math velocity y  (units/s, positive = up)
  onCurve: boolean;
}

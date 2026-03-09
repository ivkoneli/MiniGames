import type { BaseGameConfig } from '../../shared/types';

export interface BalancingGameConfig extends BaseGameConfig {
  levels: BalancingLevel[];
}

export interface BalancingLevel {
  /** Optional description shown above the equation */
  description?: string;
  /** Terms on the left-hand side of the equation */
  leftTerms: EquationTerm[];
  /** Terms on the right-hand side of the equation */
  rightTerms: EquationTerm[];
}

/**
 * One term in a chemical equation.
 * The seesaw weight contributed by this term = coefficient × weight.
 */
export interface EquationTerm {
  /** Chemical formula displayed (e.g. "H₂O", "O₂") */
  label: string;
  /**
   * Intrinsic weight per unit of coefficient (e.g. atom count).
   * The seesaw contribution = coefficient × weight.
   */
  weight: number;
  /** Starting / fixed coefficient value */
  coefficient: number;
  /** If true, the player can change this coefficient with +/- buttons */
  adjustable: boolean;
  /** Minimum coefficient value (default 1, only relevant when adjustable=true) */
  min?: number;
  /** Maximum coefficient value (default 9, only relevant when adjustable=true) */
  max?: number;
}

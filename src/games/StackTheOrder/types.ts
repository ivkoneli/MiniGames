import type { BaseGameConfig } from '../../shared/types';

export interface StackOrderConfig extends BaseGameConfig {
  levels: StackOrderLevel[];
}

export interface StackOrderLevel {
  id: string;
  category: string;
  question: string;
  items: StackOrderItem[];
}

export interface StackOrderItem {
  id: string;
  label: string;
  order: number; // 1 = placed first (bottom of stack), N = placed last (top)
}

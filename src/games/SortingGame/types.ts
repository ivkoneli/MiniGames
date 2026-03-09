import type { BaseGameConfig } from '../../shared/types';

export interface SortingConfig extends BaseGameConfig {
  levels: SortingLevel[];
}

export interface SortingLevel {
  id: string;
  category: string;
  question: string;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;   // CSS hex, e.g. '#8b5cf6'
  rightColor?: string;
  items: SortingItem[];
}

export interface SortingItem {
  id: string;
  content: string;      // text shown on card; supports \n
  correct: 'left' | 'right';
  hint?: string;        // small subtitle shown below content
}

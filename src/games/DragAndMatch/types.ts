import type { BaseGameConfig } from '../../shared/types';

export interface DragAndMatchConfig extends BaseGameConfig {
  pairs: MatchPair[];
  /** How many pairs to show per round. Defaults to all. */
  pairsPerRound?: number;
}

export interface MatchPair {
  /** Left-side item (term, image key, formula, etc.) */
  left: MatchItem;
  /** Right-side item (definition, label, value, etc.) */
  right: MatchItem;
}

export interface MatchItem {
  type: 'text' | 'image';
  /** Text content (for type: 'text') */
  value?: string;
  /** Phaser texture key (for type: 'image') */
  textureKey?: string;
}

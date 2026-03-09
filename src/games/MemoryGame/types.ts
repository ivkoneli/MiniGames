import type { BaseGameConfig } from '../../shared/types';

export interface MemoryConfig extends BaseGameConfig {
  levels: MemoryLevel[];
}

export interface MemoryLevel {
  id: string;
  category: string;
  color: string;       // CSS hex — accent colour for this level's cards
  gridCols: number;
  gridRows: number;
  pairs: MemoryPair[];
}

export interface MemoryPair {
  id: string;
  a: string;   // content for card A (e.g. "Mitochondria")
  b: string;   // content for card B (e.g. "Powerhouse of the cell")
}

/** Runtime card object — one entry per physical card on the grid */
export interface CardObject {
  container:  Phaser.GameObjects.Container;
  pairId:     string;
  side:       'a' | 'b';
  state:      'face-down' | 'face-up' | 'matched';
  backFace:   Phaser.GameObjects.Graphics;
  frontFace:  Phaser.GameObjects.Graphics;
  frontText:  Phaser.GameObjects.Text;
  glowGfx:    Phaser.GameObjects.Graphics;
  baseX:      number;
  baseY:      number;
}

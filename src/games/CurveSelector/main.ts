import Phaser from 'phaser';
import { CurveSelectorScene } from './CurveSelectorScene';
import { AudioManager } from '../../shared/AudioManager';
import type { CurveSelectorConfig } from './types';

import content from '../../content/example-math-curves.json';
import { bgCss } from '../../shared/theme';

const gameConfig = content as unknown as CurveSelectorConfig;

// ─── Boot/preload scene ────────────────────────────────────────────────────────
// Loads shared audio assets, then hands off to the game scene with the config.

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    AudioManager.preloadDefaults(this);
  }

  create(): void {
    this.scene.start(CurveSelectorScene.SCENE_KEY, gameConfig);
  }
}

// ─── Phaser game instance ──────────────────────────────────────────────────────

const dpr = window.devicePixelRatio || 1;
const cssH = window.visualViewport?.height ?? window.innerHeight;
const cssW = Math.min(window.visualViewport?.width ?? window.innerWidth, Math.round(cssH * (4 / 3)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: Math.round(cssW * dpr),
  height: Math.round(cssH * dpr),
  backgroundColor: bgCss,
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, CurveSelectorScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
});

// Refresh the Phaser scale manager whenever the browser window is resized.
// This re-fits the canvas without restarting the scene or resetting the question.
window.addEventListener('resize', () => game.scale.refresh());
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => game.scale.refresh());
}

import Phaser from 'phaser';
import { CurveSelectorScene } from './CurveSelectorScene';
import { AudioManager } from '../../shared/AudioManager';
import type { CurveSelectorConfig } from './types';

import content from '../../content/example-math-curves.json';

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

const gameH = window.visualViewport?.height ?? window.innerHeight;
const gameW = Math.min(window.visualViewport?.width ?? window.innerWidth, Math.round(gameH * (4 / 3)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: gameW,
  height: gameH,
  backgroundColor: '#070810',
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, CurveSelectorScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: window.devicePixelRatio || 1,
  },
});

// Refresh the Phaser scale manager whenever the browser window is resized.
// This re-fits the canvas without restarting the scene or resetting the question.
window.addEventListener('resize', () => game.scale.refresh());
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => game.scale.refresh());
}

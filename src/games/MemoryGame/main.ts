import Phaser from 'phaser';
import { MemoryGameScene } from './MemoryGameScene';
import { AudioManager } from '../../shared/AudioManager';
import type { MemoryConfig } from './types';
import content from '../../content/example-memory.json';

const gameConfig = content as unknown as MemoryConfig;

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }
  preload(): void { AudioManager.preloadDefaults(this); }
  create(): void  { this.scene.start(MemoryGameScene.SCENE_KEY, gameConfig); }
}

const dpr = window.devicePixelRatio || 1;
const cssH = window.visualViewport?.height ?? window.innerHeight;
const cssW = Math.min(window.visualViewport?.width ?? window.innerWidth, Math.round(cssH * (4 / 3)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: Math.round(cssW * dpr),
  height: Math.round(cssH * dpr),
  backgroundColor: '#070810',
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, MemoryGameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

window.addEventListener('resize', () => game.scale.refresh());
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => game.scale.refresh());
}

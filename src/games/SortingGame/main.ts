import Phaser from 'phaser';
import { SortingGameScene } from './SortingGameScene';
import { AudioManager } from '../../shared/AudioManager';
import type { SortingConfig } from './types';

import content from '../../content/example-sorting.json';

const gameConfig = content as unknown as SortingConfig;

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }
  preload(): void { AudioManager.preloadDefaults(this); }
  create(): void  { this.scene.start(SortingGameScene.SCENE_KEY, gameConfig); }
}

const gameH = window.innerHeight;
const gameW = Math.min(window.innerWidth, Math.round(gameH * (4 / 3)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: gameW,
  height: gameH,
  backgroundColor: '#070810',
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, SortingGameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

window.addEventListener('resize', () => game.scale.refresh());

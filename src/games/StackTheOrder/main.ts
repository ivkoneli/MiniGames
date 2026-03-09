import Phaser from 'phaser';
import { StackTheOrderScene } from './StackTheOrderScene';
import { AudioManager } from '../../shared/AudioManager';
import type { StackOrderConfig } from './types';

import content from '../../content/example-stack-order.json';

const gameConfig = content as unknown as StackOrderConfig;

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }
  preload(): void { AudioManager.preloadDefaults(this); }
  create(): void  { this.scene.start(StackTheOrderScene.SCENE_KEY, gameConfig); }
}

const dpr   = window.devicePixelRatio || 1;
const gameH = Math.round(window.innerHeight * dpr);
const gameW = Math.min(Math.round(window.innerWidth * dpr), Math.round(gameH * (4 / 3)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: gameW,
  height: gameH,
  backgroundColor: '#070810',
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, StackTheOrderScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

window.addEventListener('resize', () => game.scale.refresh());

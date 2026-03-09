import Phaser from 'phaser';
import { BallToGoalScene } from './BallToGoalScene';
import { AudioManager } from '../../shared/AudioManager';
import type { BallToGoalConfig } from './types';

import content from '../../content/example-ball-to-goal.json';

const gameConfig = content as unknown as BallToGoalConfig;

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }); }
  preload(): void { AudioManager.preloadDefaults(this); }
  create(): void  { this.scene.start(BallToGoalScene.SCENE_KEY, gameConfig); }
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
  scene: [BootScene, BallToGoalScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

window.addEventListener('resize', () => game.scale.refresh());

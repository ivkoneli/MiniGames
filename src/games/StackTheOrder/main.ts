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

const dpr = window.devicePixelRatio || 1;
const cssH = window.visualViewport?.height ?? window.innerHeight;
const cssW = Math.min(window.visualViewport?.width ?? window.innerWidth, Math.round(cssH * (4 / 3)));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: Math.round(cssW * dpr),
  height: Math.round(cssH * dpr),
  backgroundColor: '#070810',
  render: { antialias: true, pixelArt: false },
  scene: [BootScene, StackTheOrderScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

window.addEventListener('resize', () => game.scale.refresh());
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => game.scale.refresh());
}

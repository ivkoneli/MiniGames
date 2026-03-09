import Phaser from 'phaser';
import { FeedbackSystem } from './FeedbackSystem';
import { AudioManager } from './AudioManager';
import type { BaseGameConfig, GameStatus, ScoreData } from './types';

/**
 * Abstract base class for all mini-game scenes.
 *
 * Every game type extends this and implements:
 *   - setupGame()  — spawn your game objects here
 *   - setupUI()    — optional HUD (score, timer, etc.)
 *
 * Call onCorrect() / onWrong() from your game logic.
 * The base class handles scoring, timing, and feedback.
 */
export abstract class BaseGameScene extends Phaser.Scene {
  protected feedback!: FeedbackSystem;
  protected audio!: AudioManager;
  protected gameConfig!: BaseGameConfig;
  protected status: GameStatus = 'idle';

  private _correct = 0;
  private _wrong = 0;
  private _total = 0;
  private _startTime = 0;

  // ─── Phaser lifecycle ────────────────────────────────────────

  init(data: BaseGameConfig): void {
    this.gameConfig = data;
    this._correct = 0;
    this._wrong = 0;
    this._total = 0;
    this.status = 'idle';
  }

  create(): void {
    this.feedback = new FeedbackSystem(this);
    this.audio = new AudioManager(this);
    this._startTime = this.time.now;
    this.status = 'playing';

    this.setupUI();
    this.setupGame();

    // Optional countdown timer
    if (this.gameConfig.timeLimit) {
      this.time.addEvent({
        delay: this.gameConfig.timeLimit * 1000,
        callback: this.onTimeUp,
        callbackScope: this,
      });
    }
  }

  // ─── Implement in subclass ────────────────────────────────────

  /** Set up HUD elements: score display, timer bar, question text, etc. */
  protected setupUI(): void {}

  /** Set up game-specific objects, zones, draggables, etc. */
  protected abstract setupGame(): void;

  // ─── Game events — call these from subclasses ─────────────────

  protected onCorrect(x?: number, y?: number): void {
    this._correct++;
    this._total++;
    this.feedback.showCorrect(x, y);
    this.audio.playCorrect();
  }

  protected onWrong(x?: number, y?: number): void {
    this._wrong++;
    this._total++;
    this.feedback.showWrong(x, y);
    this.audio.playWrong();
  }

  protected onComplete(): void {
    this.status = 'complete';
    this.audio.playWin();
    // Subclasses can override to show a results screen
  }

  protected onTimeUp(): void {
    if (this.status === 'playing') this.onComplete();
  }

  // ─── Helpers ──────────────────────────────────────────────────

  get score(): ScoreData {
    return {
      correct: this._correct,
      wrong: this._wrong,
      total: this._total,
      timeElapsed: Math.floor((this.time.now - this._startTime) / 1000),
    };
  }
}

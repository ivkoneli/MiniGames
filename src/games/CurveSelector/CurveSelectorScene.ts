import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import { CoordinateSystem } from '../../shared/CoordinateSystem';
import { AudioManager } from '../../shared/AudioManager';
import type { CurveSelectorConfig, CurveQuestion, CurveDef } from './types';

// ─── Layout constants ──────────────────────────────────────────────────────────
// Caps at 4:3 so the game is centred and ~70-75% wide on large monitors.

const W = Math.min(window.visualViewport?.width ?? window.innerWidth, Math.round((window.visualViewport?.height ?? window.innerHeight) * (4 / 3)));
const H = window.visualViewport?.height ?? window.innerHeight;
const HUD_H    = 56;
const PROMPT_H = 52;
const MARGIN   = 18;
const GAP      = 12;
const PANEL_W  = (W - MARGIN * 2 - GAP) / 2;
const PANEL_H  = (H - HUD_H - PROMPT_H - MARGIN * 2 - GAP) / 2;
const GRID_PAD = 28;

const PANELS = [
  { x: MARGIN,                  y: HUD_H + PROMPT_H },
  { x: MARGIN + PANEL_W + GAP,  y: HUD_H + PROMPT_H },
  { x: MARGIN,                  y: HUD_H + PROMPT_H + PANEL_H + GAP },
  { x: MARGIN + PANEL_W + GAP,  y: HUD_H + PROMPT_H + PANEL_H + GAP },
];

const SLOT_COLORS = [0x7c3aed, 0x2563eb, 0x10b981, 0xf59e0b];
const SLOT_LABELS = ['A', 'B', 'C', 'D'];

// ─── Scene ────────────────────────────────────────────────────────────────────

export class CurveSelectorScene extends BaseGameScene {
  static readonly SCENE_KEY = 'CurveSelector';

  declare protected gameConfig: CurveSelectorConfig;

  private questions: CurveQuestion[] = [];
  private currentIndex = 0;
  private canInteract = false;
  private disposables: Phaser.GameObjects.GameObject[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: CurveSelectorScene.SCENE_KEY });
  }

  preload(): void {}

  // ─── BaseGameScene hooks ───────────────────────────────────────

  protected setupUI(): void {
    this.add
      .text(14, 18, '← Menu', { fontSize: '13px', color: '#475569', fontFamily: 'Space Grotesk, sans-serif' })
      .setDepth(10)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.progressText = this.add
      .text(W / 2, 20, '', { fontSize: '13px', color: '#64748b', fontFamily: 'Space Grotesk, sans-serif', align: 'center' })
      .setOrigin(0.5, 0).setDepth(10);

    this.scoreText = this.add
      .text(W - 14, 18, '0 correct', { fontSize: '13px', color: '#64748b', fontFamily: 'Space Grotesk, sans-serif' })
      .setOrigin(1, 0).setDepth(10);

    this.add.rectangle(W / 2, HUD_H - 1, W, 1, 0xffffff, 0.06).setDepth(10);
  }

  protected setupGame(): void {
    this.questions = [...this.gameConfig.questions];
    if (this.gameConfig.shuffleItems) Phaser.Utils.Array.Shuffle(this.questions);
    this.loadQuestion(0);
  }

  // ─── Question lifecycle ────────────────────────────────────────

  private loadQuestion(index: number): void {
    this.disposables.forEach(o => o.destroy());
    this.disposables = [];
    this.canInteract = false;

    const question = this.questions[index];
    if (!question) { this.showResults(); return; }

    this.currentIndex = index;
    this.progressText.setText(`Q ${index + 1}  /  ${this.questions.length}`);
    this.scoreText.setText(`${this.score.correct} correct`);

    const prompt = this.track(
      this.add
        .text(W / 2, HUD_H + 14, question.label, {
          fontSize: '19px', fontStyle: 'bold', color: '#e2e8f0',
          fontFamily: 'Space Grotesk, sans-serif', align: 'center', wordWrap: { width: W - 48 },
        })
        .setOrigin(0.5, 0).setAlpha(0),
    );
    this.tweens.add({ targets: prompt, alpha: 1, y: { from: HUD_H + 6, to: HUD_H + 14 }, duration: 280, ease: 'Quad.Out' });

    const options: CurveDef[] = Phaser.Utils.Array.Shuffle([question.correct, ...question.distractors]);
    const correctIndex = options.indexOf(question.correct);

    options.forEach((option, i) => this.renderPanel(i, option, i === correctIndex, question));
    this.time.delayedCall(400, () => { this.canInteract = true; });
  }

  // ─── Panel ────────────────────────────────────────────────────

  private renderPanel(slotIndex: number, option: CurveDef, isCorrect: boolean, question: CurveQuestion): void {
    const pos   = PANELS[slotIndex];
    const color = SLOT_COLORS[slotIndex];
    const label = SLOT_LABELS[slotIndex];

    const coord = new CoordinateSystem({
      x: pos.x, y: pos.y,
      width: PANEL_W, height: PANEL_H,
      xRange: question.xRange ?? [-5, 5],
      yRange: question.yRange ?? [-5, 5],
      padding: GRID_PAD,
    });

    const fn = CoordinateSystem.parseFn(option.fn);
    const cx = pos.x + PANEL_W / 2;
    const cy = pos.y + PANEL_H / 2;

    const bg = this.track(
      this.add
        .rectangle(cx, cy, PANEL_W, PANEL_H, 0x0c0d1a)
        .setStrokeStyle(1, 0xffffff, 0.08)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0),
    ) as Phaser.GameObjects.Rectangle;

    const gfx = this.track(this.add.graphics().setAlpha(0));
    coord.drawGrid(gfx);
    if (fn) coord.drawCurve(gfx, fn, option.color ?? color);

    const labelText = this.track(
      this.add.text(pos.x + 10, pos.y + 7, label, {
        fontSize: '12px', fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Space Grotesk, sans-serif',
      }).setAlpha(0),
    );

    this.tweens.add({ targets: [bg, gfx, labelText], alpha: 1, delay: 60 + slotIndex * 70, duration: 220, ease: 'Quad.Out' });

    bg.on('pointerover', () => {
      if (!this.canInteract) return;
      this.audio.playClick();
      bg.setStrokeStyle(2, color, 0.75);
      this.tweens.add({ targets: bg, scaleX: 1.015, scaleY: 1.015, duration: 120, ease: 'Quad.Out' });
    });
    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, 0xffffff, 0.08);
      this.tweens.add({ targets: bg, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.Out' });
    });
    bg.on('pointerdown', () => {
      if (!this.canInteract) return;
      this.canInteract = false;
      if (isCorrect) this.handleCorrect(bg, gfx);
      else           this.handleWrong(bg);
    });
  }

  // ─── Outcomes ─────────────────────────────────────────────────

  private handleCorrect(bg: Phaser.GameObjects.Rectangle, gfx: Phaser.GameObjects.Graphics): void {
    // Note: onCorrect() calls audio.playCorrect() — do NOT call it here too
    bg.setStrokeStyle(3, 0x10b981, 1);

    // Brief green flash overlay on the panel
    const flash = this.add.rectangle(bg.x, bg.y, PANEL_W, PANEL_H, 0x10b981, 0.22).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });

    this.tweens.add({ targets: gfx, alpha: { from: 1, to: 0.55 }, duration: 110, yoyo: true, repeat: 1 });
    this.tweens.add({
      targets: bg, scaleX: 1.04, scaleY: 1.04, duration: 180, ease: 'Back.Out', yoyo: true,
      onComplete: () => {
        bg.setStrokeStyle(2, 0x10b981, 0.85); // settle to permanent green
        this.onCorrect(bg.x, bg.y);
        this.scoreText.setText(`${this.score.correct} correct`);
        this.time.delayedCall(550, () => this.loadQuestion(this.currentIndex + 1));
      },
    });
  }

  private handleWrong(bg: Phaser.GameObjects.Rectangle): void {
    // Note: onWrong() calls audio.playWrong() — do NOT call it here too
    bg.setStrokeStyle(3, 0xef4444, 1);

    // Brief red flash overlay on the panel
    const flash = this.add.rectangle(bg.x, bg.y, PANEL_W, PANEL_H, 0xef4444, 0.18).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 340, onComplete: () => flash.destroy() });

    this.onWrong(bg.x, bg.y);
    const ox = bg.x;
    this.tweens.add({
      targets: bg, x: { from: ox - 9, to: ox + 9 }, duration: 55, repeat: 3, yoyo: true, ease: 'Sine.InOut',
      // border stays red permanently — do NOT reset to white
      onComplete: () => { bg.x = ox; bg.setStrokeStyle(2, 0xef4444, 0.75); this.canInteract = true; },
    });
  }

  // ─── Results screen ────────────────────────────────────────────

  private showResults(): void {
    this.audio.playWin();
    this.onComplete();
    const s     = this.score;
    const total = this.questions.length;
    const pct   = total > 0 ? Math.round((s.correct / total) * 100) : 0;
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚';

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100);
    this.tweens.add({ targets: overlay, alpha: 0.72, duration: 320 });

    const card = this.add.rectangle(W / 2, H / 2, 420, 300, 0x0d0f1e)
      .setStrokeStyle(1, 0xffffff, 0.1).setDepth(101).setScale(0.82).setAlpha(0);
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, delay: 100, ease: 'Back.Out' });

    const ts = (size: string, color: string) => ({ fontSize: size, color, fontFamily: 'Space Grotesk, sans-serif' });
    const els = [
      this.add.text(W/2, H/2 - 96, emoji,        { fontSize: '52px' }).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 - 44, 'Complete!',  ts('26px', '#e2e8f0')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 + 8,  `${s.correct} / ${total} correct`, ts('16px', '#94a3b8')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 + 44, `${pct}%`,    ts('22px', pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444')).setOrigin(0.5).setDepth(102),
    ];
    els.forEach(el => el.setAlpha(0));
    this.tweens.add({ targets: els, alpha: 1, duration: 280, delay: 280 });

    const btnStyle = (c: string) => ts('15px', c);
    const again = this.add.text(W/2 - 80, H/2 + 96, 'Play Again', btnStyle('#a78bfa'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#c4b5fd'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#a78bfa'); })
      .on('pointerdown', () => { this.scene.restart(); });

    const menu = this.add.text(W/2 + 80, H/2 + 96, '← Menu', btnStyle('#475569'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.tweens.add({ targets: [again, menu], alpha: 1, duration: 240, delay: 420 });
  }

  // ─── Util ─────────────────────────────────────────────────────

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }
}

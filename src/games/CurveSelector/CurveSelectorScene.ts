import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import { CoordinateSystem } from '../../shared/CoordinateSystem';
import { AudioManager } from '../../shared/AudioManager';
import type { CurveSelectorConfig, CurveQuestion, CurveDef } from './types';
import { haptics } from '../../shared/haptics';

// ─── Layout constants ──────────────────────────────────────────────────────────
// Caps at 4:3 so the game is centred and ~70-75% wide on large monitors.

const _dpr = window.devicePixelRatio || 1;
const H    = Math.round((window.visualViewport?.height ?? window.innerHeight) * _dpr);
const W    = Math.min(Math.round((window.visualViewport?.width ?? window.innerWidth) * _dpr), Math.round(H * (4 / 3)));
const HUD_H    = Math.round(H * 0.033);
const PROMPT_H = Math.round(H * 0.030);
const MARGIN   = Math.round(W * 0.015);
const GAP      = Math.round(W * 0.012);
const PANEL_W  = Math.round((W - MARGIN * 2 - GAP) / 2);
const PANEL_H  = PANEL_W; // square panels
const GRID_PAD = Math.round(W * 0.024);

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
    const fs13  = `${Math.round(H * 0.019)}px`;
    const hudY  = Math.round(HUD_H * 0.5);
    this.add
      .text(Math.round(W * 0.014), hudY, '← Menu', { fontSize: fs13, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' })
      .setOrigin(0, 0.5).setDepth(10)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.progressText = this.add
      .text(W / 2, hudY, '', { fontSize: fs13, color: '#64748b', fontFamily: 'Space Grotesk, sans-serif', align: 'center' })
      .setOrigin(0.5, 0.5).setDepth(10);

    this.scoreText = this.add
      .text(W - Math.round(W * 0.014), hudY, '0 correct', { fontSize: fs13, color: '#64748b', fontFamily: 'Space Grotesk, sans-serif' })
      .setOrigin(1, 0.5).setDepth(10);

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

    const promptY = HUD_H + Math.round(H * 0.004);
    const prompt = this.track(
      this.add
        .text(W / 2, promptY, question.label, {
          fontSize: `${Math.round(H * 0.023)}px`, fontStyle: 'bold', color: '#e2e8f0',
          fontFamily: 'Space Grotesk, sans-serif', align: 'center', wordWrap: { width: W - Math.round(W * 0.04) },
        })
        .setOrigin(0.5, 0).setAlpha(0),
    );
    this.tweens.add({ targets: prompt, alpha: 1, y: { from: HUD_H, to: promptY }, duration: 280, ease: 'Quad.Out' });

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
      this.add.text(pos.x + Math.round(W * 0.009), pos.y + Math.round(H * 0.006), label, {
        fontSize: `${Math.round(H * 0.018)}px`, fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Space Grotesk, sans-serif',
      }).setAlpha(0),
    );

    this.tweens.add({ targets: [bg, gfx, labelText], alpha: 1, delay: 60 + slotIndex * 70, duration: 220, ease: 'Quad.Out' });

    bg.on('pointerover', () => {
      if (!this.canInteract) return;
      haptics.select();
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
      haptics.light();
      if (isCorrect) this.handleCorrect(bg, gfx);
      else           this.handleWrong(bg);
    });
  }

  // ─── Outcomes ─────────────────────────────────────────────────

  private handleCorrect(bg: Phaser.GameObjects.Rectangle, gfx: Phaser.GameObjects.Graphics): void {
    // Note: onCorrect() calls audio.playCorrect() — do NOT call it here too
    haptics.success();
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
    haptics.error();
    bg.setStrokeStyle(3, 0xef4444, 1);

    // Brief red flash overlay on the panel
    const flash = this.add.rectangle(bg.x, bg.y, PANEL_W, PANEL_H, 0xef4444, 0.18).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 340, onComplete: () => flash.destroy() });

    this.onWrong(bg.x, bg.y);
    const ox = bg.x;
    this.tweens.add({
      targets: bg, x: { from: ox - 9, to: ox + 9 }, duration: 55, repeat: 3, yoyo: true, ease: 'Sine.InOut',
      onComplete: () => {
        bg.x = ox;
        bg.setStrokeStyle(2, 0xef4444, 0.75);
        this.canInteract = true;
        // Reset border back to default after 1.2 s
        this.time.delayedCall(1200, () => { bg.setStrokeStyle(1, 0xffffff, 0.08); });
      },
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

    const cardW2 = Math.round(W * 0.78);
    const cardH2 = Math.round(H * 0.52);
    const card = this.add.rectangle(W / 2, H / 2, cardW2, cardH2, 0x0d0f1e)
      .setStrokeStyle(1, 0xffffff, 0.1).setDepth(101).setScale(0.82).setAlpha(0);
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, delay: 100, ease: 'Back.Out' });

    const ts = (size: string, color: string) => ({ fontSize: size, color, fontFamily: 'Space Grotesk, sans-serif' });
    const els = [
      this.add.text(W/2, H/2 - H*0.16, emoji,       { fontSize: `${Math.round(H * 0.052)}px` }).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 - H*0.08, 'Complete!', ts(`${Math.round(H * 0.026)}px`, '#e2e8f0')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 + H*0.00, `${s.correct} / ${total} correct`, ts(`${Math.round(H * 0.016)}px`, '#94a3b8')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 + H*0.07, `${pct}%`,   ts(`${Math.round(H * 0.022)}px`, pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444')).setOrigin(0.5).setDepth(102),
    ];
    els.forEach(el => el.setAlpha(0));
    this.tweens.add({ targets: els, alpha: 1, duration: 280, delay: 280 });

    const btnOffX = W * 0.13;
    const btnY    = H / 2 + H * 0.18;
    const btnStyle = (c: string) => ts(`${Math.round(H * 0.015)}px`, c);
    const again = this.add.text(W/2 - btnOffX, btnY, 'Play Again', btnStyle('#a78bfa'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#c4b5fd'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#a78bfa'); })
      .on('pointerdown', () => { this.scene.restart(); });

    const menu = this.add.text(W/2 + btnOffX, btnY, '← Menu', btnStyle('#475569'))
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

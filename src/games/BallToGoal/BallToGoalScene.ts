import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import { CoordinateSystem } from '../../shared/CoordinateSystem';
import type { BallToGoalConfig, BallToGoalLevel, BallState } from './types';
import { haptics } from '../../shared/haptics';

// ─── Layout ───────────────────────────────────────────────────────────────────
// Caps at 4:3 so the game is centred and ~70-75% wide on large monitors.
// Below 900px switches to a narrow (stacked) layout: graph top, 2×2 buttons below.

const _dpr     = window.devicePixelRatio || 1;
const H        = Math.round((window.visualViewport?.height ?? window.innerHeight) * _dpr);
const W        = Math.min(Math.round((window.visualViewport?.width ?? window.innerWidth) * _dpr), Math.round(H * (4 / 3)));
const HUD_H    = Math.round(H * 0.030);
const PROMPT_H = Math.round(H * 0.030);
const GX       = Math.round(W * 0.014);
const GY       = HUD_H + PROMPT_H;
const GPAD     = Math.round(W * 0.030);
const BTN_GAP  = Math.round(W * 0.012);

const IS_NARROW = W < 900;

// Narrow: full-width graph on top (60%), 2×2 button grid below
// Wide:   graph on left, vertical button sidebar on right
const GW = IS_NARROW ? W - GX * 2 : W - 240;
const GH = IS_NARROW
  ? Math.round((H - GY - Math.round(H * 0.005)) * 0.60)
  : H - GY - Math.round(H * 0.005);

const BTN_W = IS_NARROW
  ? Math.round((GW - BTN_GAP) / 2)
  : W - (GX + GW + 12) - 12;
const BTN_H = IS_NARROW
  ? Math.round((H - GY - GH - Math.round(H * 0.015) - BTN_GAP) / 2)
  : Math.max(Math.round(H * 0.080), Math.round(GH * 0.23));
const BTN_X = GX + GW + 12; // only meaningful in wide mode

const SLOT_COLORS = [0x7c3aed, 0x2563eb, 0x10b981, 0xf59e0b];
const SLOT_LABELS = ['A', 'B', 'C', 'D'];

const BALL_COLOR  = 0x60a5fa;
const GOAL_COLOR  = 0x10b981;

// ─── Physics ──────────────────────────────────────────────────────────────────

const GRAVITY      = 9.0;   // math units / s²
const FRICTION     = 0.9996; // per-frame multiplier on vx while on curve
const GOAL_RADIUS  = 0.40;  // math units
const SLOPE_EPS    = 0.0002;
const MAX_DT       = 0.033;  // cap delta to prevent tunnelling

// ─── Scene ────────────────────────────────────────────────────────────────────

type SimState = 'idle' | 'running' | 'won' | 'failed';

export class BallToGoalScene extends BaseGameScene {
  static readonly SCENE_KEY = 'BallToGoal';

  declare protected gameConfig: BallToGoalConfig;

  private levels: BallToGoalLevel[] = [];
  private currentLevelIndex = 0;
  private currentLevel!: BallToGoalLevel;
  private coord!: CoordinateSystem;

  // Physics
  private simState: SimState = 'idle';
  private activeFn:    ((x: number) => number) | null = null; // curve ball is currently sliding on
  private selectedFns: ((x: number) => number)[] = [];        // all selected curves (multi-curve)
  private selectedFnIndices: number[] = [];                    // button indices of selected curves
  private ball!: BallState;
  private simTimeout: Phaser.Time.TimerEvent | null = null;

  // Level-scoped visuals (destroyed between levels)
  private disposables: Phaser.GameObjects.GameObject[] = [];
  private ballArc!: Phaser.GameObjects.Arc;
  private ballGlow!: Phaser.GameObjects.Arc;
  private highlightGfx!: Phaser.GameObjects.Graphics; // selected curve overlay

  private curveGfxList: Phaser.GameObjects.Graphics[] = [];
  private buttonBgs: Phaser.GameObjects.Rectangle[] = [];
  private buttonColors: number[] = [];
  private selectedBtnIndex = -1;   // kept for single-curve compat
  private selectedBg: Phaser.GameObjects.Rectangle | null = null; // single-curve compat
  private launchBtn: Phaser.GameObjects.GameObject[] | null = null; // multi-curve launch button

  // Persistent HUD
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: BallToGoalScene.SCENE_KEY });
  }

  preload(): void {}

  // ─── BaseGameScene hooks ───────────────────────────────────────

  protected setupUI(): void {
    const fs13 = `${Math.round(H * 0.013)}px`;
    const hudY  = Math.round(HUD_H * 0.5);
    this.add
      .text(Math.round(W * 0.014), hudY, '← Menu', { fontSize: fs13, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' })
      .setOrigin(0, 0.5).setDepth(10).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.levelText = this.add
      .text(W / 2, hudY, '', { fontSize: fs13, color: '#64748b', fontFamily: 'Space Grotesk, sans-serif', align: 'center' })
      .setOrigin(0.5, 0.5).setDepth(10);

    this.scoreText = this.add
      .text(W - Math.round(W * 0.014), hudY, '0 correct', { fontSize: fs13, color: '#64748b', fontFamily: 'Space Grotesk, sans-serif' })
      .setOrigin(1, 0.5).setDepth(10);

    this.add.rectangle(W / 2, HUD_H - 1, W, 1, 0xffffff, 0.06).setDepth(10);
  }

  protected setupGame(): void {
    // Shuffle the full pool and pick 5 random levels each session
    const pool = Phaser.Utils.Array.Shuffle([...this.gameConfig.levels]) as typeof this.gameConfig.levels;
    this.levels = pool.slice(0, 5);
    this.loadLevel(0);
  }

  // ─── Level lifecycle ───────────────────────────────────────────

  private loadLevel(index: number): void {
    this.disposables.forEach(o => o.destroy());
    this.disposables = [];
    this.curveGfxList = [];
    this.buttonBgs = [];
    this.buttonColors = [];
    this.simState = 'idle';
    this.activeFn = null;
    this.selectedFns = [];
    this.selectedFnIndices = [];
    this.selectedBtnIndex = -1;
    this.selectedBg = null;
    this.launchBtn = null;
    if (this.simTimeout) { this.simTimeout.destroy(); this.simTimeout = null; }

    const level = this.levels[index];
    if (!level) { this.showResults(); return; }

    this.currentLevelIndex = index;
    this.currentLevel = level;
    this.levelText.setText(`Level ${index + 1}  /  ${this.levels.length}`);
    this.scoreText.setText(`${this.score.correct} correct`);

    this.coord = new CoordinateSystem({
      x: GX, y: GY, width: GW, height: GH,
      xRange: level.xRange, yRange: level.yRange,
      padding: GPAD,
    });

    // ── Description ──
    const descY = HUD_H + Math.round(H * 0.004);
    if (level.description) {
      const prompt = this.track(
        this.add.text(W / 2, descY, level.description, {
          fontSize: `${Math.round(H * 0.017)}px`, fontStyle: 'bold', color: '#e2e8f0',
          fontFamily: 'Space Grotesk, sans-serif', align: 'center', wordWrap: { width: W - Math.round(W * 0.04) },
        }).setOrigin(0.5, 0).setAlpha(0),
      );
      this.tweens.add({ targets: prompt, alpha: 1, y: { from: HUD_H, to: descY }, duration: 280, ease: 'Quad.Out' });
    }

    // ── Graph background ──
    const graphBg = this.track(
      this.add.rectangle(GX + GW / 2, GY + GH / 2, GW, GH, 0x0c0d1a)
        .setStrokeStyle(1, 0xffffff, 0.06).setAlpha(0),
    );

    // ── Grid ──
    const gridGfx = this.track(this.add.graphics().setAlpha(0));
    this.coord.drawGrid(gridGfx);

    // ── All option curves (dim) ──
    level.options.forEach((eq, i) => {
      const fn  = CoordinateSystem.parseFn(eq.fn);
      const gfx = this.track(this.add.graphics().setAlpha(0));
      if (fn) this.coord.drawCurve(gfx, fn, SLOT_COLORS[i], 2, 0.25);
      this.curveGfxList.push(gfx);
    });

    // ── Highlighted curve (drawn on top when selected) ──
    this.highlightGfx = this.track(this.add.graphics().setDepth(5));

    // ── Goal ──
    const dotR   = Math.round(H * 0.007);
    const glowR  = Math.round(H * 0.014);
    const labelOffY = Math.round(H * 0.022);
    const lblFs  = `${Math.round(H * 0.010)}px`;

    const gs = this.coord.mathToScreen(level.goalPos[0], level.goalPos[1]);
    const goalRing = this.track(
      this.add.arc(gs.x, gs.y, Math.round(H * 0.020), 0, 360, false, GOAL_COLOR, 0)
        .setStrokeStyle(2, GOAL_COLOR, 0.6).setDepth(6).setAlpha(0),
    );
    const goalDot   = this.track(this.add.arc(gs.x, gs.y, dotR, 0, 360, false, GOAL_COLOR, 1).setDepth(6).setAlpha(0));
    const goalLabel = this.track(
      this.add.text(gs.x, gs.y - labelOffY, 'GOAL', {
        fontSize: lblFs, fontStyle: 'bold',
        color: `#${GOAL_COLOR.toString(16)}`,
        fontFamily: 'Space Grotesk, sans-serif',
      }).setOrigin(0.5).setDepth(6).setAlpha(0),
    );

    // ── Ball visuals (persistent within level, reset on retry) ──
    const bs = this.coord.mathToScreen(level.startPos[0], level.startPos[1]);
    this.ballGlow     = this.track(this.add.arc(bs.x, bs.y, glowR, 0, 360, false, BALL_COLOR, 0.2).setDepth(8).setAlpha(0));
    this.ballArc      = this.track(this.add.arc(bs.x, bs.y, dotR, 0, 360, false, BALL_COLOR, 1.0).setDepth(9).setAlpha(0));

    const startLabel = this.track(
      this.add.text(bs.x, bs.y - labelOffY, 'START', {
        fontSize: lblFs, fontStyle: 'bold',
        color: `#${BALL_COLOR.toString(16).padStart(6, '0')}`,
        fontFamily: 'Space Grotesk, sans-serif',
      }).setOrigin(0.5).setDepth(9).setAlpha(0),
    );

    // ── Equation buttons ──
    this.buildButtons(level);

    // ── Staggered fade-in ──
    this.tweens.add({ targets: [graphBg, gridGfx], alpha: 1, duration: 280, delay: 40 });
    this.tweens.add({ targets: this.curveGfxList, alpha: 0.25, duration: 280, delay: 100 });
    this.tweens.add({ targets: [goalDot, goalLabel, startLabel, this.ballGlow, this.ballArc], alpha: 1, duration: 280, delay: 180 });

    // Goal ring pulse
    this.time.delayedCall(280, () => {
      goalRing.setAlpha(0.9);
      this.tweens.add({
        targets: goalRing,
        scaleX: { from: 0.6, to: 1.8 }, scaleY: { from: 0.6, to: 1.8 },
        alpha: { from: 0.9, to: 0 },
        duration: 1100, repeat: -1, ease: 'Sine.Out',
      });
    });

    // Init ball physics state
    this.initBall();
  }

  // ─── Equation buttons ──────────────────────────────────────────

  private buildButtons(level: BallToGoalLevel): void {
    // Wide: vertical sidebar. Narrow: 2×2 grid below graph.
    const gridY  = GY + GH + Math.round(H * 0.010); // y of the 2×2 area (narrow only)
    const totalH = level.options.length * BTN_H + (level.options.length - 1) * BTN_GAP;
    const sideStartY = GY + (GH - totalH) / 2; // centred vertically in sidebar (wide only)
    const fs16 = `${Math.round(H * 0.017)}px`;
    const fs13 = `${Math.round(H * 0.013)}px`;
    const stripPad = Math.round(W * 0.003);
    const letterPadX = Math.round(W * 0.012);
    const letterPadY = Math.round(BTN_H * 0.22);
    const eqPadX = Math.round(W * 0.010);

    level.options.forEach((eq, i) => {
      const fn    = CoordinateSystem.parseFn(eq.fn);
      const color = SLOT_COLORS[i];
      const label = SLOT_LABELS[i];

      let btnCX: number, btnCY: number;
      if (IS_NARROW) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        btnCX = GX + col * (BTN_W + BTN_GAP) + BTN_W / 2;
        btnCY = gridY + row * (BTN_H + BTN_GAP) + BTN_H / 2;
      } else {
        btnCX = BTN_X + BTN_W / 2;
        btnCY = sideStartY + i * (BTN_H + BTN_GAP) + BTN_H / 2;
      }

      const leftX = btnCX - BTN_W / 2;

      const bg = this.track(
        this.add.rectangle(btnCX, btnCY, BTN_W, BTN_H, 0x0c0d1a)
          .setStrokeStyle(1, color, 0.22).setInteractive({ useHandCursor: true }).setAlpha(0),
      ) as Phaser.GameObjects.Rectangle;
      this.buttonBgs.push(bg);
      this.buttonColors.push(color);

      const strip  = this.track(this.add.rectangle(leftX + stripPad, btnCY, Math.round(W * 0.003), BTN_H - Math.round(BTN_H * 0.12), color).setAlpha(0));
      const letter = this.track(this.add.text(leftX + letterPadX, btnCY - BTN_H / 2 + letterPadY, label, {
        fontSize: fs16, fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`,
        fontFamily: 'Space Grotesk, sans-serif',
      }).setAlpha(0));
      const eqText = this.track(this.add.text(leftX + eqPadX, btnCY, eq.label, {
        fontSize: fs13, color: '#e2e8f0', fontFamily: 'Space Grotesk, sans-serif',
        wordWrap: { width: BTN_W - Math.round(W * 0.015) },
      }).setOrigin(0, 0.5).setAlpha(0));

      // Staggered fade-in
      this.tweens.add({ targets: [bg, strip, letter, eqText], alpha: 1, duration: 200, delay: 160 + i * 55 });

      const required = level.requiredCurves ?? 1;

      // Hover: highlight border
      bg.on('pointerover', () => {
        if (this.simState !== 'idle') return;
        if (this.selectedFnIndices.includes(i)) return;
        bg.setStrokeStyle(2, color, 0.6);
      });
      bg.on('pointerout', () => {
        if (this.simState !== 'idle') return;
        if (this.selectedFnIndices.includes(i)) return;
        bg.setStrokeStyle(1, color, 0.22);
      });

      bg.on('pointerdown', () => {
        if (this.simState !== 'idle') return;
        if (!fn) return;
        haptics.light();
        this.audio.playClick();

        if (required <= 1) {
          // Single-curve: immediate launch
          this.selectEquation(i, fn, bg, color);
        } else {
          // Multi-curve: toggle selection, blue highlight, show Launch when ready
          this.toggleCurveSelection(i, fn, bg, color, required, level);
        }
      });
    });
  }

  // ─── Equation selection → drop ────────────────────────────────

  /** Single-curve mode: pick one, launch immediately */
  private selectEquation(
    index: number,
    fn: (x: number) => number,
    bg: Phaser.GameObjects.Rectangle,
    color: number,
  ): void {
    this.selectedBtnIndex = index;
    this.selectedFns = [fn];
    this.selectedFnIndices = [index];
    this.selectedBg = bg;

    bg.setStrokeStyle(2, color, 1);
    this.curveGfxList.forEach((g, j) => g.setAlpha(j === index ? 0 : 0.1));

    this.highlightGfx.clear();
    this.coord.drawCurve(this.highlightGfx, fn, color, 3, 1);

    this.launchSimulation();
  }

  /** Multi-curve mode: toggle selection, show Launch button when enough selected */
  private toggleCurveSelection(
    index: number,
    fn: (x: number) => number,
    bg: Phaser.GameObjects.Rectangle,
    color: number,
    required: number,
    level: BallToGoalLevel,
  ): void {
    const alreadyIdx = this.selectedFnIndices.indexOf(index);
    if (alreadyIdx !== -1) {
      // Deselect
      this.selectedFnIndices.splice(alreadyIdx, 1);
      this.selectedFns.splice(alreadyIdx, 1);
      bg.setStrokeStyle(1, color, 0.22);
    } else {
      // Select (blue)
      this.selectedFnIndices.push(index);
      this.selectedFns.push(fn);
      bg.setStrokeStyle(2, 0x3b82f6, 1);
    }

    // Redraw all selected curves on highlight layer
    this.highlightGfx.clear();
    this.selectedFnIndices.forEach(idx => {
      const optFn = CoordinateSystem.parseFn(level.options[idx].fn);
      if (optFn) this.coord.drawCurve(this.highlightGfx, optFn, 0x3b82f6, 3, 1);
    });
    this.curveGfxList.forEach((g, j) =>
      g.setAlpha(this.selectedFnIndices.includes(j) ? 0 : 0.1),
    );

    // Show/update Launch button
    this.updateLaunchButton(required);
  }

  private updateLaunchButton(required: number): void {
    // Destroy existing launch button if present
    if (this.launchBtn) {
      this.launchBtn.forEach(o => o.destroy());
      this.launchBtn = null;
    }

    if (this.selectedFnIndices.length < required) return;

    const btnCX = GX + GW / 2;
    const btnCY = GY + GH - Math.round(H * 0.030);
    const lbtnW = Math.round(W * 0.155);
    const lbtnH = Math.round(H * 0.044);
    const lbg = this.track(
      this.add.rectangle(btnCX, btnCY, lbtnW, lbtnH, 0x111827)
        .setStrokeStyle(1.5, 0x3b82f6, 0.8).setInteractive({ useHandCursor: true })
        .setDepth(20).setAlpha(0),
    );
    const llbl = this.track(
      this.add.text(btnCX, btnCY, '▶  Launch', {
        fontSize: `${Math.round(H * 0.017)}px`, fontStyle: 'bold', color: '#93c5fd',
        fontFamily: 'Space Grotesk, sans-serif',
      }).setOrigin(0.5).setDepth(21).setAlpha(0),
    );
    this.tweens.add({ targets: [lbg, llbl], alpha: 1, duration: 200 });
    lbg.on('pointerover', () => { lbg.setStrokeStyle(2, 0x3b82f6, 1); llbl.setColor('#bfdbfe'); });
    lbg.on('pointerout',  () => { lbg.setStrokeStyle(1.5, 0x3b82f6, 0.8); llbl.setColor('#93c5fd'); });
    lbg.on('pointerdown', () => {
      if (this.simState !== 'idle') return;
      haptics.light();
      this.audio.playClick();
      this.launchSimulation();
    });
    this.launchBtn = [lbg, llbl];
  }

  private launchSimulation(): void {
    this.time.delayedCall(320, () => {
      if (this.simState !== 'idle') return;
      this.initBall();
      this.simState = 'running';
      this.simTimeout = this.time.delayedCall(5000, () => {
        if (this.simState === 'running') this.handleMissed();
      });
    });
  }

  // ─── Ball physics ──────────────────────────────────────────────

  private initBall(): void {
    const { startPos } = this.currentLevel;
    // Start the ball slightly ABOVE startPos so it clearly falls before hitting the curve
    this.ball = {
      mx: startPos[0],
      my: startPos[1] + 0.5,
      prevMy: startPos[1] + 1.5,   // definitely above any curve at start
      vx: 0,
      vy: 0,
      onCurve: false,
    };
    this.syncBallVisuals();
  }

  update(_time: number, delta: number): void {
    if (this.simState !== 'running') return;

    const dt  = Math.min(delta / 1000, MAX_DT);
    const b   = this.ball;
    const lvl = this.currentLevel;

    b.prevMy = b.my;

    if (!b.onCurve) {
      // ── Free fall ──
      b.vy -= GRAVITY * dt;
      b.mx += b.vx * dt;
      b.my += b.vy * dt;

      // Check all selected curves for landing
      for (const fn of this.selectedFns) {
        try {
          const cy = fn(b.mx);
          if (isFinite(cy) && !isNaN(cy) && b.prevMy >= cy && b.my <= cy) {
            b.my = cy;
            b.onCurve = true;
            this.activeFn = fn;
            const m     = this.getSlopeOf(fn, b.mx);
            const tLen  = Math.sqrt(1 + m * m);
            const tx    = 1 / tLen, ty = m / tLen;
            const vDotT = b.vx * tx + b.vy * ty;
            b.vx = vDotT * tx;
            b.vy = vDotT * ty;
            break;
          }
        } catch { /* discontinuity — ignore */ }
      }
    } else {
      // ── Sliding on active curve ──
      const m  = this.getSlopeOf(this.activeFn!, b.mx);
      const ax = -GRAVITY * m / Math.sqrt(1 + m * m);
      b.vx += ax * dt;
      b.vx *= FRICTION;
      b.mx += b.vx * dt;

      try {
        const ny = this.activeFn!(b.mx);
        if (!isFinite(ny) || isNaN(ny)) {
          b.onCurve = false;
          this.activeFn = null;
        } else {
          b.my = ny;
        }
      } catch {
        b.onCurve = false;
        this.activeFn = null;
      }
    }

    // ── Update visuals ──
    this.syncBallVisuals();

    // ── Goal check ──
    const dx = b.mx - lvl.goalPos[0];
    const dy = b.my - lvl.goalPos[1];
    if (Math.hypot(dx, dy) < GOAL_RADIUS) {
      this.handleGoalReached();
      return;
    }

    // ── Out of bounds ──
    const outX = b.mx < lvl.xRange[0] - 0.5 || b.mx > lvl.xRange[1] + 0.5;
    const outY = b.my < lvl.yRange[0] - 1.5;
    if (outX || outY) {
      this.handleMissed();
      return;
    }

    // ── Stopped on curve but not at goal ──
    if (b.onCurve && Math.abs(b.vx) < 0.015 && Math.abs(b.vy) < 0.015) {
      if (Math.hypot(dx, dy) > GOAL_RADIUS) {
        this.handleMissed();
      }
    }
  }

  private getSlopeOf(fn: (x: number) => number, x: number): number {
    try {
      return (fn(x + SLOPE_EPS) - fn(x - SLOPE_EPS)) / (2 * SLOPE_EPS);
    } catch {
      return 0;
    }
  }

  private syncBallVisuals(): void {
    const sp = this.coord.mathToScreen(this.ball.mx, this.ball.my);
    this.ballArc.setPosition(sp.x, sp.y);
    this.ballGlow.setPosition(sp.x, sp.y);
  }

  // ─── Outcomes ─────────────────────────────────────────────────

  private handleGoalReached(): void {
    this.simState = 'won';
    if (this.simTimeout) { this.simTimeout.destroy(); this.simTimeout = null; }

    // Note: onCorrect() calls audio.playCorrect() — do NOT call it here too
    const gs = this.coord.mathToScreen(this.currentLevel.goalPos[0], this.currentLevel.goalPos[1]);
    this.ballArc.setPosition(gs.x, gs.y);
    this.ballGlow.setPosition(gs.x, gs.y);

    // Green flash on ALL selected buttons
    this.selectedFnIndices.forEach(idx => {
      const b = this.buttonBgs[idx];
      if (!b || !b.active) return;
      b.setStrokeStyle(3, 0x10b981, 1);
      const flash = this.add.rectangle(b.x, b.y, b.width, b.height, 0x10b981, 0.20).setDepth(15);
      this.tweens.add({ targets: flash, alpha: 0, duration: 420, onComplete: () => flash.destroy() });
    });

    this.tweens.add({ targets: [this.ballArc, this.ballGlow], scaleX: 1.8, scaleY: 1.8, duration: 150, ease: 'Back.Out', yoyo: true });

    // onCorrect() shows ✓ overlay and plays the correct sound
    haptics.success();
    this.onCorrect(gs.x, gs.y);
    this.scoreText.setText(`${this.score.correct} correct`);
    this.cameras.main.flash(180, 16, 185, 129, false);

    this.time.delayedCall(1300, () => this.loadLevel(this.currentLevelIndex + 1));
  }

  private handleMissed(): void {
    this.simState = 'failed';
    if (this.simTimeout) { this.simTimeout.destroy(); this.simTimeout = null; }

    // Red flash on ALL selected buttons — auto-reset after 1.2s
    this.selectedFnIndices.forEach(idx => {
      const b = this.buttonBgs[idx];
      if (!b || !b.active) return;
      b.setStrokeStyle(3, 0xef4444, 1);
      const flash = this.add.rectangle(b.x, b.y, b.width, b.height, 0xef4444, 0.18).setDepth(15);
      this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
      this.time.delayedCall(1200, () => {
        if (b.active) b.setStrokeStyle(1, this.buttonColors[idx], 0.22);
      });
    });

    // Show ✗ at graph centre — NOT at ball position (which may be off-screen)
    // Note: onWrong() calls audio.playWrong() — do NOT call it separately
    haptics.error();
    const cx = GX + GW / 2;
    const cy = GY + GH / 2;
    this.onWrong(cx, cy);

    // Fade the ball out
    this.tweens.add({ targets: [this.ballArc, this.ballGlow], alpha: 0, duration: 300 });

    this.time.delayedCall(500, () => this.showRetryButton());
  }

  private showRetryButton(): void {
    const btnCX = GX + GW / 2;
    const btnCY = GY + GH / 2 + Math.round(H * 0.060);
    const retryW = Math.round(W * 0.138);
    const retryH = Math.round(H * 0.044);

    const bg = this.add.rectangle(btnCX, btnCY, retryW, retryH, 0x0c0d1a)
      .setStrokeStyle(1, 0xef4444, 0.5).setDepth(20).setAlpha(0)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(btnCX, btnCY, 'Try Again →', {
      fontSize: `${Math.round(H * 0.014)}px`, fontStyle: 'bold', color: '#ef4444',
      fontFamily: 'Space Grotesk, sans-serif',
    }).setOrigin(0.5).setDepth(21).setAlpha(0);

    this.tweens.add({ targets: [bg, label], alpha: 1, duration: 220 });

    bg.on('pointerover', () => { bg.setStrokeStyle(1, 0xef4444, 1); label.setColor('#f87171'); });
    bg.on('pointerout',  () => { bg.setStrokeStyle(1, 0xef4444, 0.5); label.setColor('#ef4444'); });

    bg.on('pointerdown', () => {
      bg.destroy();
      label.destroy();

      // Reset all button borders to their original slot colours
      this.buttonBgs.forEach((b, j) => {
        if (!b.active) return;
        b.setStrokeStyle(1, this.buttonColors[j], 0.22);
      });

      // Reset curves to dim
      this.highlightGfx.clear();
      this.curveGfxList.forEach(g => g.setAlpha(0.25));
      this.selectedBtnIndex = -1;
      this.activeFn = null;
      this.selectedFns = [];
      this.selectedFnIndices = [];
      this.selectedBg = null;
      this.launchBtn = null; // already destroyed via track() on loadLevel, clear ref

      // Reset ball
      this.ballArc.setAlpha(1);
      this.ballGlow.setAlpha(1);
      this.initBall();
      this.simState = 'idle';
    });
  }

  // ─── Results screen ────────────────────────────────────────────

  private showResults(): void {
    this.audio.playWin();
    this.onComplete();
    const s     = this.score;
    const total = this.levels.length;
    const pct   = total > 0 ? Math.round((s.correct / total) * 100) : 0;
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚';

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100);
    this.tweens.add({ targets: overlay, alpha: 0.72, duration: 320 });

    const cardW = Math.round(W * 0.78);
    const cardH = Math.round(H * 0.52);
    const card = this.add.rectangle(W / 2, H / 2, cardW, cardH, 0x0d0f1e)
      .setStrokeStyle(1, 0xffffff, 0.1).setDepth(101).setScale(0.82).setAlpha(0);
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, delay: 100, ease: 'Back.Out' });

    const ts = (sz: string, c: string) => ({ fontSize: sz, color: c, fontFamily: 'Space Grotesk, sans-serif' });
    const els = [
      this.add.text(W/2, H/2 - H*0.16, emoji,  { fontSize: `${Math.round(H * 0.052)}px` }).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 - H*0.08, 'Complete!', ts(`${Math.round(H * 0.026)}px`, '#e2e8f0')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 + H*0.00, `${s.correct} / ${total} levels cleared`, ts(`${Math.round(H * 0.016)}px`, '#94a3b8')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2 + H*0.07, `${pct}%`, ts(`${Math.round(H * 0.022)}px`, pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444')).setOrigin(0.5).setDepth(102),
    ];
    els.forEach(el => el.setAlpha(0));
    this.tweens.add({ targets: els, alpha: 1, duration: 280, delay: 280 });

    const btnOffX = W * 0.13;
    const btnY    = H / 2 + H * 0.18;
    const again = this.add.text(W/2 - btnOffX, btnY, 'Play Again', ts(`${Math.round(H * 0.015)}px`, '#a78bfa'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#c4b5fd'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#a78bfa'); })
      .on('pointerdown', () => { this.scene.restart(); });

    const menu = this.add.text(W/2 + btnOffX, btnY, '← Menu', ts(`${Math.round(H * 0.015)}px`, '#475569'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.tweens.add({ targets: [again, menu], alpha: 1, duration: 240, delay: 420 });
  }

  // ─── Util ──────────────────────────────────────────────────────

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }
}

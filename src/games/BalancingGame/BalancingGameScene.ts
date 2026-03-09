import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import type { BalancingGameConfig, BalancingLevel, EquationTerm } from './types';

// ─── Layout ────────────────────────────────────────────────────────────────────

const W       = Math.min(window.innerWidth, Math.round(window.innerHeight * (4 / 3)));
const H       = window.innerHeight;
const HUD_H   = 52;

// Seesaw geometry
const PIVOT_Y       = Math.round(H * 0.62);   // fulcrum y
const BEAM_ARM      = 52;                       // distance from pivot to beam centre-line
const BEAM_Y        = PIVOT_Y - BEAM_ARM;       // y of beam in world space (at rest)
const BEAM_HALF     = Math.min(Math.round(W * 0.36), 260); // half-length of beam
const BEAM_H_PX     = 14;                       // beam thickness

// Triangle pivot visual
const TRI_H         = 80;
const TRI_W         = 56;

// Equation UI
const EQ_Y          = HUD_H + 44;              // top of equation display area
const COEF_BOX_W    = 46;
const COEF_BOX_H    = 44;
const BTN_SIZE      = 26;
const TERM_GAP      = 22;                       // horizontal gap between terms on same side
const EQ_FONT       = { fontSize: '22px', fontStyle: 'bold', color: '#e2e8f0', fontFamily: 'Space Grotesk, sans-serif' };
const LABEL_FONT    = { fontSize: '20px', color: '#cbd5e1', fontFamily: 'Space Grotesk, sans-serif' };
const COEF_FONT     = { fontSize: '22px', fontStyle: 'bold', color: '#f1f5f9', fontFamily: 'Space Grotesk, sans-serif' };
const BTN_FONT      = { fontSize: '20px', fontStyle: 'bold', color: '#a78bfa', fontFamily: 'Space Grotesk, sans-serif' };

const MAX_TILT      = 0.22;   // radians (~12.6 deg) max tilt during gameplay
const TILT_LERP     = 0.07;   // smoothing speed each frame

// ─── Scene ─────────────────────────────────────────────────────────────────────

export class BalancingGameScene extends BaseGameScene {
  static readonly SCENE_KEY = 'BalancingGame';

  declare protected gameConfig: BalancingGameConfig;

  private levels: BalancingLevel[]  = [];
  private currentLevelIndex         = 0;
  private currentLevel!: BalancingLevel;

  // Per-level disposables
  private disposables: Phaser.GameObjects.GameObject[] = [];

  // Live coefficient state: coefs[0] = left side, coefs[1] = right side
  // Only adjustable terms are stored; index maps to term order
  private coefs: number[][] = [[], []];

  // Seesaw visual
  private seesawContainer!: Phaser.GameObjects.Container;
  private currentAngle  = 0;   // actual rendered angle (radians)
  private targetAngle   = 0;   // goal angle (lerp towards this)
  private isAnimating   = false;

  // UI elements hidden during animation
  private interactiveUI: Phaser.GameObjects.GameObject[] = [];
  private coefTexts:     Phaser.GameObjects.Text[]       = [];

  // HUD (persistent)
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: BalancingGameScene.SCENE_KEY });
  }

  preload(): void {}

  // ─── BaseGameScene hooks ─────────────────────────────────────────────────────

  protected setupUI(): void {
    this.add
      .text(14, 16, '← Menu', { fontSize: '13px', color: '#475569', fontFamily: 'Space Grotesk, sans-serif' })
      .setDepth(10).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.levelText = this.add
      .text(W / 2, 16, '', { fontSize: '13px', color: '#64748b', fontFamily: 'Space Grotesk, sans-serif', align: 'center' })
      .setOrigin(0.5, 0).setDepth(10);

    this.scoreText = this.add
      .text(W - 14, 16, '0 correct', { fontSize: '13px', color: '#64748b', fontFamily: 'Space Grotesk, sans-serif' })
      .setOrigin(1, 0).setDepth(10);

    this.add.rectangle(W / 2, HUD_H - 1, W, 1, 0xffffff, 0.06).setDepth(10);
  }

  protected setupGame(): void {
    const pool = Phaser.Utils.Array.Shuffle([...this.gameConfig.levels]) as typeof this.gameConfig.levels;
    this.levels = pool.slice(0, Math.min(pool.length, 5));
    this.loadLevel(0);
  }

  // ─── Level lifecycle ──────────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    this.disposables.forEach(o => o.destroy());
    this.disposables      = [];
    this.interactiveUI    = [];
    this.coefTexts        = [];
    this.isAnimating      = false;
    this.currentAngle     = 0;
    this.targetAngle      = 0;

    const level = this.levels[index];
    if (!level) { this.showResults(); return; }

    this.currentLevelIndex = index;
    this.currentLevel      = level;
    this.levelText.setText(`Round ${index + 1}  /  ${this.levels.length}`);
    this.scoreText.setText(`${this.score.correct} correct`);

    // Initialise live coefficient arrays from level data
    this.coefs = [
      level.leftTerms.map(t => t.coefficient),
      level.rightTerms.map(t => t.coefficient),
    ];

    // ── Description ──
    if (level.description) {
      const desc = this.track(
        this.add.text(W / 2, HUD_H + 12, level.description, {
          fontSize: '15px', color: '#94a3b8',
          fontFamily: 'Space Grotesk, sans-serif', align: 'center', wordWrap: { width: W - 64 },
        }).setOrigin(0.5, 0).setAlpha(0),
      );
      this.tweens.add({ targets: desc, alpha: 1, y: { from: HUD_H + 6, to: HUD_H + 12 }, duration: 280, ease: 'Quad.Out' });
    }

    // ── Seesaw ──
    this.buildSeesaw(level);

    // ── Equation UI ──
    this.buildEquationUI(level);

    // ── Check button ──
    this.buildCheckButton();

    // Initial tilt update
    this.targetAngle = this.computeBalanceAngle();
  }

  // ─── Seesaw visual ──────────────────────────────────────────────────────────

  private buildSeesaw(level: BalancingLevel): void {
    // Container rotates around the pivot point
    this.seesawContainer = this.track(
      this.add.container(W / 2, PIVOT_Y),
    ) as Phaser.GameObjects.Container;

    const beamGfx = this.add.graphics();
    this.seesawContainer.add(beamGfx); // MUST be index 0 before drawBeam adds labels
    this.drawBeam(beamGfx, level);

    // Pivot triangle (fixed, drawn outside container)
    const pivotGfx = this.track(this.add.graphics());
    pivotGfx.fillStyle(0x7c3aed, 0.9);
    pivotGfx.fillTriangle(
      W / 2 - TRI_W / 2, PIVOT_Y + TRI_H,
      W / 2 + TRI_W / 2, PIVOT_Y + TRI_H,
      W / 2,             PIVOT_Y,
    );
    // Ground line (wide enough to cover full beam sweep)
    const groundGfx = this.track(this.add.graphics());
    groundGfx.lineStyle(2, 0x7c3aed, 0.35);
    groundGfx.beginPath();
    groundGfx.moveTo(W / 2 - BEAM_HALF - 40, PIVOT_Y + TRI_H);
    groundGfx.lineTo(W / 2 + BEAM_HALF + 40, PIVOT_Y + TRI_H);
    groundGfx.strokePath();

    // Fade in the whole seesaw assembly
    this.seesawContainer.setAlpha(0);
    this.tweens.add({ targets: [this.seesawContainer, pivotGfx, groundGfx], alpha: 1, duration: 320, delay: 60 });
  }

  private drawBeam(gfx: Phaser.GameObjects.Graphics, level: BalancingLevel): void {
    // Beam body — glowing bar at y = -BEAM_ARM inside the container
    const by = -BEAM_ARM;

    // Vertical rod connecting beam bottom to pivot (container origin = pivot point)
    gfx.fillStyle(0x7c3aed, 0.85);
    gfx.fillRect(-3, by + BEAM_H_PX / 2, 6, BEAM_ARM - BEAM_H_PX / 2);

    // Glow (wide, transparent)
    gfx.fillStyle(0x7c3aed, 0.12);
    gfx.fillRect(-BEAM_HALF - 4, by - BEAM_H_PX / 2 - 6, (BEAM_HALF + 4) * 2, BEAM_H_PX + 12);

    // Beam body
    gfx.fillStyle(0x7c3aed, 0.85);
    gfx.fillRect(-BEAM_HALF, by - BEAM_H_PX / 2, BEAM_HALF * 2, BEAM_H_PX);

    // Left tray
    gfx.fillStyle(0xa78bfa, 0.70);
    gfx.fillRect(-BEAM_HALF - 2, by - BEAM_H_PX / 2 - 8, 60, 6);

    // Right tray
    gfx.fillRect(BEAM_HALF - 58, by - BEAM_H_PX / 2 - 8, 60, 6);

    // Labels on beam ends (inside container, rotate with beam) — use current coefs
    const leftLabel  = this.makeBeamLabel(level.leftTerms,  this.coefs[0], -BEAM_HALF + 4, by - BEAM_H_PX / 2 - 34);
    const rightLabel = this.makeBeamLabel(level.rightTerms, this.coefs[1],  BEAM_HALF - 4, by - BEAM_H_PX / 2 - 34, true);
    this.seesawContainer.add([leftLabel, rightLabel]);
  }

  private makeBeamLabel(
    terms: EquationTerm[],
    coefs: number[],
    x: number, y: number,
    alignRight = false,
  ): Phaser.GameObjects.Text {
    const text = terms.map((t, i) => `${coefs[i]}${t.label}`).join(' + ');
    return this.add.text(x, y, text, {
      fontSize: '20px', fontStyle: 'bold', color: '#e2e8f0',
      fontFamily: 'Space Grotesk, sans-serif',
      stroke: '#1a1a2e', strokeThickness: 3,
    }).setOrigin(alignRight ? 1 : 0, 1);
  }

  // ─── Equation UI ─────────────────────────────────────────────────────────────

  private buildEquationUI(level: BalancingLevel): void {
    // Measure total width needed
    const leftW  = this.measureSideWidth(level.leftTerms);
    const rightW = this.measureSideWidth(level.rightTerms);
    const eqSignW = 40;
    const totalW  = leftW + eqSignW + rightW;

    let curX = W / 2 - totalW / 2;

    // Left side
    curX = this.renderSide(level.leftTerms, 0, curX, EQ_Y);

    // "=" sign
    const eqSign = this.track(
      this.add.text(curX + eqSignW / 2, EQ_Y + COEF_BOX_H / 2, '=', {
        ...EQ_FONT, fontSize: '26px', color: '#64748b',
      }).setOrigin(0.5, 0.5).setAlpha(0),
    );
    this.tweens.add({ targets: eqSign, alpha: 1, duration: 240, delay: 180 });
    curX += eqSignW;

    // Right side
    this.renderSide(level.rightTerms, 1, curX, EQ_Y);
  }

  private measureSideWidth(terms: EquationTerm[]): number {
    let w = 0;
    terms.forEach((t, i) => {
      if (i > 0) w += 30; // " + " separator
      if (t.adjustable) {
        w += BTN_SIZE + COEF_BOX_W + BTN_SIZE + 10; // [−][coef][+]
      } else {
        w += 32; // fixed coef number
      }
      w += 8 + this.estimateLabelWidth(t.label); // gap + label
      w += TERM_GAP;
    });
    return w;
  }

  private estimateLabelWidth(label: string): number {
    // Rough estimate: ~12px per character
    return label.length * 12;
  }

  private renderSide(
    terms: EquationTerm[],
    side: number,
    startX: number,
    topY: number,
  ): number {
    let curX = startX;
    const midY = topY + COEF_BOX_H / 2;

    terms.forEach((term, ti) => {
      // "+" separator between terms on same side
      if (ti > 0) {
        const plus = this.track(
          this.add.text(curX + 10, midY, '+', { ...EQ_FONT, color: '#475569' }).setOrigin(0, 0.5).setAlpha(0),
        );
        this.interactiveUI.push(plus);
        this.tweens.add({ targets: plus, alpha: 1, duration: 220, delay: 100 });
        curX += 30;
      }

      if (term.adjustable) {
        curX = this.renderAdjustableTerm(term, side, ti, curX, topY, midY);
      } else {
        curX = this.renderFixedTerm(term, curX, midY);
      }

      // Label
      const lbl = this.track(
        this.add.text(curX + 6, midY, term.label, { ...LABEL_FONT }).setOrigin(0, 0.5).setAlpha(0),
      );
      this.interactiveUI.push(lbl);
      this.tweens.add({ targets: lbl, alpha: 1, duration: 220, delay: 120 });
      curX += 8 + this.estimateLabelWidth(term.label) + TERM_GAP;
    });

    return curX;
  }

  private renderAdjustableTerm(
    term: EquationTerm,
    side: number,
    termIndex: number,
    x: number,
    topY: number,
    midY: number,
  ): number {
    const min = term.min ?? 1;
    const max = term.max ?? 9;

    // Dashed outline graphics behind coefficient box
    const dashGfx = this.track(this.add.graphics().setAlpha(0));
    this.drawDashedRect(dashGfx, x + BTN_SIZE, topY, COEF_BOX_W, COEF_BOX_H, 0xa78bfa);
    this.interactiveUI.push(dashGfx);
    this.tweens.add({ targets: dashGfx, alpha: 1, duration: 220, delay: 80 });

    // Coefficient display text
    const coefText = this.track(
      this.add.text(x + BTN_SIZE + COEF_BOX_W / 2, midY,
        `${this.coefs[side][termIndex]}`, { ...COEF_FONT }).setOrigin(0.5, 0.5).setAlpha(0),
    );
    this.coefTexts.push(coefText);
    this.interactiveUI.push(coefText);
    this.tweens.add({ targets: coefText, alpha: 1, duration: 220, delay: 80 });

    // Store the mapping from coefText index to [side, termIndex] for updates
    const coefIdx = this.coefTexts.length - 1;

    // Minus button
    const minusBg = this.track(
      this.add.rectangle(x + BTN_SIZE / 2, midY, BTN_SIZE, BTN_SIZE, 0x1e1b30, 1)
        .setStrokeStyle(1, 0xa78bfa, 0.5).setInteractive({ useHandCursor: true }).setAlpha(0),
    ) as Phaser.GameObjects.Rectangle;
    const minusLbl = this.track(
      this.add.text(x + BTN_SIZE / 2, midY, '−', { ...BTN_FONT }).setOrigin(0.5, 0.5).setAlpha(0),
    );
    this.interactiveUI.push(minusBg, minusLbl);
    this.tweens.add({ targets: [minusBg, minusLbl], alpha: 1, duration: 200, delay: 100 });

    // Plus button
    const plusX = x + BTN_SIZE + COEF_BOX_W;
    const plusBg = this.track(
      this.add.rectangle(plusX + BTN_SIZE / 2, midY, BTN_SIZE, BTN_SIZE, 0x1e1b30, 1)
        .setStrokeStyle(1, 0xa78bfa, 0.5).setInteractive({ useHandCursor: true }).setAlpha(0),
    ) as Phaser.GameObjects.Rectangle;
    const plusLbl = this.track(
      this.add.text(plusX + BTN_SIZE / 2, midY, '+', { ...BTN_FONT }).setOrigin(0.5, 0.5).setAlpha(0),
    );
    this.interactiveUI.push(plusBg, plusLbl);
    this.tweens.add({ targets: [plusBg, plusLbl], alpha: 1, duration: 200, delay: 100 });

    // Button events
    const updateCoef = (delta: number) => {
      if (this.isAnimating) return;
      const cur  = this.coefs[side][termIndex];
      const next = Phaser.Math.Clamp(cur + delta, min, max);
      if (next === cur) return;
      this.coefs[side][termIndex] = next;
      this.audio.playClick();
      // Update the text display
      this.coefTexts[coefIdx].setText(`${next}`);
      // Update the beam label
      this.refreshBeamLabel();
      // Animate coef text pop
      this.tweens.add({ targets: this.coefTexts[coefIdx], scaleX: 1.3, scaleY: 1.3, duration: 80, yoyo: true });
      // Update target tilt
      this.targetAngle = this.computeBalanceAngle();
    };

    this.addBtnHover(minusBg);
    this.addBtnHover(plusBg);
    minusBg.on('pointerdown', () => updateCoef(-1));
    plusBg.on('pointerdown', () => updateCoef(+1));

    return x + BTN_SIZE + COEF_BOX_W + BTN_SIZE;
  }

  private renderFixedTerm(term: EquationTerm, x: number, midY: number): number {
    const coefLabel = `${term.coefficient}`;
    const coefEl = this.track(
      this.add.text(x, midY, coefLabel, { ...COEF_FONT, color: '#94a3b8' }).setOrigin(0, 0.5).setAlpha(0),
    );
    this.interactiveUI.push(coefEl);
    this.tweens.add({ targets: coefEl, alpha: 1, duration: 220, delay: 100 });
    return x + coefLabel.length * 13;
  }

  private addBtnHover(btn: Phaser.GameObjects.Rectangle): void {
    btn.on('pointerover', () => { if (!this.isAnimating) btn.setStrokeStyle(1.5, 0xa78bfa, 1); });
    btn.on('pointerout',  () => { btn.setStrokeStyle(1, 0xa78bfa, 0.5); });
  }

  // ─── Check button ─────────────────────────────────────────────────────────────

  private buildCheckButton(): void {
    const btnY  = H - 52;
    const btnW  = 180;
    const btnH  = 44;

    const bg = this.track(
      this.add.rectangle(W / 2, btnY, btnW, btnH, 0x111827)
        .setStrokeStyle(1.5, 0x7c3aed, 0.7).setInteractive({ useHandCursor: true }).setAlpha(0),
    ) as Phaser.GameObjects.Rectangle;

    const lbl = this.track(
      this.add.text(W / 2, btnY, '▶  Check', {
        fontSize: '16px', fontStyle: 'bold', color: '#a78bfa',
        fontFamily: 'Space Grotesk, sans-serif',
      }).setOrigin(0.5, 0.5).setAlpha(0),
    );

    this.interactiveUI.push(bg, lbl);
    this.tweens.add({ targets: [bg, lbl], alpha: 1, duration: 280, delay: 220 });

    bg.on('pointerover', () => { if (!this.isAnimating) { bg.setStrokeStyle(2, 0x7c3aed, 1); lbl.setColor('#c4b5fd'); } });
    bg.on('pointerout',  () => { bg.setStrokeStyle(1.5, 0x7c3aed, 0.7); lbl.setColor('#a78bfa'); });
    bg.on('pointerdown', () => {
      if (this.isAnimating) return;
      this.audio.playClick();
      this.runCheckAnimation();
    });
  }

  // ─── Balance calculation ──────────────────────────────────────────────────────

  private getLeftTotal(): number {
    return this.currentLevel.leftTerms.reduce((sum, t, i) => sum + this.coefs[0][i] * t.weight, 0);
  }

  private getRightTotal(): number {
    return this.currentLevel.rightTerms.reduce((sum, t, i) => sum + this.coefs[1][i] * t.weight, 0);
  }

  private isBalanced(): boolean {
    return this.getLeftTotal() === this.getRightTotal();
  }

  private computeBalanceAngle(): number {
    const L = this.getLeftTotal();
    const R = this.getRightTotal();
    const total = L + R;
    if (total === 0) return 0;
    const imbalance = (L - R) / total; // positive = left heavy = tilt left side down = positive rotation
    return imbalance * MAX_TILT;
  }

  // ─── Animation ────────────────────────────────────────────────────────────────

  private runCheckAnimation(): void {
    this.isAnimating = true;

    // Fade out interactive UI elements smoothly
    this.tweens.add({ targets: this.interactiveUI, alpha: 0, duration: 200 });

    const correct = this.isBalanced();

    // Phase 1: ~2 seconds of volatile oscillation (creates suspense)
    const volatileAngles = [0.28, -0.32, 0.42, -0.24, 0.38, -0.44, 0.20, -0.18, 0.12, -0.08];
    const durations       = [210,  195,   240,  180,   220,  200,   250,  170,   210,  190];
    let delay = 0;
    volatileAngles.forEach((angle, i) => {
      this.tweens.add({
        targets: this.seesawContainer,
        rotation: angle,
        duration: durations[i],
        delay,
        ease: 'Sine.InOut',
      });
      delay += durations[i];
    });

    // Phase 2: resolve at ~2000ms
    this.time.delayedCall(2000, () => {
      if (correct) {
        this.resolveCorrect();
      } else {
        this.resolveWrong();
      }
    });
  }

  private resolveCorrect(): void {
    // Seesaw slowly levels out to perfect balance
    this.tweens.add({
      targets: this.seesawContainer,
      rotation: 0,
      duration: 900,
      ease: 'Elastic.Out',
      onComplete: () => {
        this.cameras.main.flash(200, 16, 185, 129, false);
        this.onCorrect(W / 2, BEAM_Y);
        this.scoreText.setText(`${this.score.correct} correct`);

        // Show correct overlay text (tracked so it's destroyed on loadLevel)
        const msg = this.track(this.add.text(W / 2, BEAM_Y - 50, '⚖ Balanced!', {
          fontSize: '26px', fontStyle: 'bold', color: '#10b981',
          fontFamily: 'Space Grotesk, sans-serif',
        }).setOrigin(0.5).setDepth(50).setAlpha(0));
        this.tweens.add({ targets: msg, alpha: 1, y: BEAM_Y - 70, duration: 350, ease: 'Quad.Out' });

        this.time.delayedCall(1400, () => this.loadLevel(this.currentLevelIndex + 1));
      },
    });
  }

  private resolveWrong(): void {
    const L   = this.getLeftTotal();
    const R   = this.getRightTotal();
    // Positive dir = left side heavier = tip left side DOWN = container rotates positively
    const dir = L >= R ? 1 : -1;
    const tipAngle = dir * 0.48; // ~27 degrees — stays above visual ground

    // Tip dramatically to one side
    this.tweens.add({
      targets: this.seesawContainer,
      rotation: tipAngle,
      duration: 480,
      ease: 'Cubic.In',
      onComplete: () => {
        // Impact: play drop sound and shake camera
        this.audio.playDrop();
        this.cameras.main.shake(350, 0.012);
        this.onWrong(W / 2, BEAM_Y);

        // Hint message
        const hint = L > R
          ? 'Left side is too heavy'
          : 'Right side is too heavy';
        const hintColor = '#ef4444';

        // Tracked so it's destroyed when loadLevel() is called (retry or next level)
        const hintText = this.track(this.add.text(W / 2, BEAM_Y - 40, hint, {
          fontSize: '18px', fontStyle: 'bold', color: hintColor,
          fontFamily: 'Space Grotesk, sans-serif',
        }).setOrigin(0.5).setDepth(50).setAlpha(0));
        this.tweens.add({ targets: hintText, alpha: 1, y: BEAM_Y - 58, duration: 320, ease: 'Quad.Out' });

        // Show retry button after a short pause
        this.time.delayedCall(600, () => this.showRetryButton());
      },
    });
  }

  // ─── Retry ────────────────────────────────────────────────────────────────────

  private showRetryButton(): void {
    const btnY = PIVOT_Y + TRI_H + 36;

    const bg = this.add.rectangle(W / 2, btnY, 160, 44, 0x0c0d1a)
      .setStrokeStyle(1, 0xef4444, 0.5).setDepth(20).setAlpha(0)
      .setInteractive({ useHandCursor: true });

    const lbl = this.add.text(W / 2, btnY, 'Try Again →', {
      fontSize: '14px', fontStyle: 'bold', color: '#ef4444',
      fontFamily: 'Space Grotesk, sans-serif',
    }).setOrigin(0.5).setDepth(21).setAlpha(0);

    this.tweens.add({ targets: [bg, lbl], alpha: 1, duration: 220 });

    bg.on('pointerover', () => { bg.setStrokeStyle(1, 0xef4444, 1); lbl.setColor('#f87171'); });
    bg.on('pointerout',  () => { bg.setStrokeStyle(1, 0xef4444, 0.5); lbl.setColor('#ef4444'); });
    bg.on('pointerdown', () => {
      bg.destroy();
      lbl.destroy();
      this.loadLevel(this.currentLevelIndex);
    });
  }

  // ─── Frame update ────────────────────────────────────────────────────────────

  update(_time: number, _delta: number): void {
    if (this.isAnimating) return;

    // Smoothly interpolate seesaw to target angle
    if (this.seesawContainer) {
      const diff = this.targetAngle - this.currentAngle;
      if (Math.abs(diff) > 0.001) {
        this.currentAngle += diff * TILT_LERP;
        this.seesawContainer.setRotation(this.currentAngle);
      }
    }
  }

  // ─── Results screen ──────────────────────────────────────────────────────────

  private showResults(): void {
    this.audio.playWin();
    this.onComplete();
    const s     = this.score;
    const total = this.levels.length;
    const pct   = total > 0 ? Math.round((s.correct / total) * 100) : 0;
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚';

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100);
    this.tweens.add({ targets: overlay, alpha: 0.72, duration: 320 });

    const card = this.add.rectangle(W / 2, H / 2, 440, 310, 0x0d0f1e)
      .setStrokeStyle(1, 0xffffff, 0.1).setDepth(101).setScale(0.82).setAlpha(0);
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, delay: 100, ease: 'Back.Out' });

    const ts = (sz: string, c: string) => ({ fontSize: sz, color: c, fontFamily: 'Space Grotesk, sans-serif' });
    const els = [
      this.add.text(W/2, H/2-100, emoji,                              { fontSize: '52px' }).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2-48,  'Complete!',                        ts('26px', '#e2e8f0')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2+4,   `${s.correct} / ${total} balanced`, ts('16px', '#94a3b8')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2+42,  `${pct}%`, ts('22px', pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444')).setOrigin(0.5).setDepth(102),
    ];
    els.forEach(el => el.setAlpha(0));
    this.tweens.add({ targets: els, alpha: 1, duration: 280, delay: 280 });

    const again = this.add.text(W/2-80, H/2+100, 'Play Again', ts('15px', '#a78bfa'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#c4b5fd'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#a78bfa'); })
      .on('pointerdown', () => { this.scene.restart(); });

    const menu = this.add.text(W/2+80, H/2+100, '← Menu', ts('15px', '#475569'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.tweens.add({ targets: [again, menu], alpha: 1, duration: 240, delay: 420 });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Redraw the small formula labels on the beam ends after coefficient changes.
   * The container holds a Graphics object as first child and two Texts after.
   */
  private refreshBeamLabel(): void {
    // Re-build the beam label texts (children index 1 and 2 of container)
    const container = this.seesawContainer;
    if (!container) return;
    const list = container.list as Phaser.GameObjects.GameObject[];
    // Remove old label texts (index 1 and 2), keep Graphics (index 0)
    while (list.length > 1) {
      const last = list[list.length - 1] as Phaser.GameObjects.Text;
      last.destroy();
    }
    const level = this.currentLevel;
    const by    = -BEAM_ARM - BEAM_H_PX / 2 - 34;
    container.add(this.makeBeamLabel(level.leftTerms,  this.coefs[0], -BEAM_HALF + 4, by));
    container.add(this.makeBeamLabel(level.rightTerms, this.coefs[1],  BEAM_HALF - 4, by, true));
  }

  private drawDashedRect(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    color: number,
  ): void {
    gfx.lineStyle(1.5, color, 0.85);
    const dash = 5, gap = 4;

    const dashLine = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len === 0) return;
      const dx = (x2 - x1) / len, dy = (y2 - y1) / len;
      let pos = 0, on = true;
      while (pos < len) {
        const end = Math.min(pos + (on ? dash : gap), len);
        if (on) {
          gfx.beginPath();
          gfx.moveTo(x1 + pos * dx, y1 + pos * dy);
          gfx.lineTo(x1 + end * dx, y1 + end * dy);
          gfx.strokePath();
        }
        pos = end;
        on  = !on;
      }
    };

    dashLine(x,     y,     x + w, y);
    dashLine(x + w, y,     x + w, y + h);
    dashLine(x + w, y + h, x,     y + h);
    dashLine(x,     y + h, x,     y);
  }

  private track<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }
}

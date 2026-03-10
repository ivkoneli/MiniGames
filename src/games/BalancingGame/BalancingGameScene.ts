import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import type { BalancingGameConfig, BalancingLevel, EquationTerm } from './types';
import { haptics } from '../../shared/haptics';
import { T, IS_LIGHT } from '../../shared/theme';

// ─── Layout — all dynamic so the game scales to any screen ────────────────────

const _dpr    = window.devicePixelRatio || 1;
const H       = Math.round((window.visualViewport?.height ?? window.innerHeight) * _dpr);
const W       = Math.min(Math.round((window.visualViewport?.width ?? window.innerWidth) * _dpr), Math.round(H * (4 / 3)));

const HUD_H        = Math.round(H * 0.065);
const PIVOT_Y      = Math.round(H * 0.60);
const BEAM_ARM     = Math.round(H * 0.080);
const BEAM_Y       = PIVOT_Y - BEAM_ARM;
const BEAM_HALF    = Math.round(W * 0.44);           // no cap — full seesaw width
const BEAM_H_PX    = Math.round(H * 0.018);
const TRI_H        = Math.round(H * 0.125);
const TRI_W        = Math.round(W * 0.20);
const EQ_Y         = HUD_H + Math.round(H * 0.055);
const COEF_BOX_W   = Math.round(W * 0.11);
const COEF_BOX_H   = Math.round(H * 0.060);
const BTN_SIZE     = Math.round(H * 0.038);          // smaller +/- buttons
const TERM_GAP     = Math.max(4,  Math.round(W * 0.016));
const FONT_SZ_EQ   = Math.round(H * 0.040);          // bigger equation numbers
const FONT_SZ_BTN  = Math.round(H * 0.020);          // smaller +/- label
const FONT_SZ_LBL  = Math.round(H * 0.032);
const CHAR_W       = Math.round(FONT_SZ_EQ * 0.58);  // estimated char width

const EQ_FONT    = { fontSize: `${FONT_SZ_EQ}px`,  fontStyle: 'bold', color: T.text,    fontFamily: 'Space Grotesk, sans-serif' };
const LABEL_FONT = { fontSize: `${FONT_SZ_LBL}px`, color: T.textMute,                   fontFamily: 'Space Grotesk, sans-serif' };
const COEF_FONT  = { fontSize: `${FONT_SZ_EQ}px`,  fontStyle: 'bold', color: T.textMid, fontFamily: 'Space Grotesk, sans-serif' };
const BTN_FONT   = { fontSize: `${FONT_SZ_BTN}px`, fontStyle: 'bold', color: '#a78bfa', fontFamily: 'Space Grotesk, sans-serif' };

const MAX_TILT   = 0.22;
const TILT_LERP  = 0.07;

// ─── Scene ─────────────────────────────────────────────────────────────────────

export class BalancingGameScene extends BaseGameScene {
  static readonly SCENE_KEY = 'BalancingGame';

  declare protected gameConfig: BalancingGameConfig;

  private levels: BalancingLevel[]  = [];
  private currentLevelIndex         = 0;
  private currentLevel!: BalancingLevel;

  private disposables: Phaser.GameObjects.GameObject[] = [];

  private coefs: number[][] = [[], []];

  private seesawContainer!: Phaser.GameObjects.Container;
  private currentAngle  = 0;
  private targetAngle   = 0;
  private isAnimating   = false;

  private interactiveUI: Phaser.GameObjects.GameObject[] = [];
  private coefTexts:     Phaser.GameObjects.Text[]       = [];

  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: BalancingGameScene.SCENE_KEY });
  }

  preload(): void {}

  // ─── BaseGameScene hooks ─────────────────────────────────────────────────────

  protected setupUI(): void {
    this.add
      .text(14, 16, '← Menu', { fontSize: `${Math.round(H * 0.016)}px`, color: '#475569', fontFamily: 'Space Grotesk, sans-serif' })
      .setDepth(10).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.levelText = this.add
      .text(W / 2, 16, '', { fontSize: `${Math.round(H * 0.016)}px`, color: '#64748b', fontFamily: 'Space Grotesk, sans-serif', align: 'center' })
      .setOrigin(0.5, 0).setDepth(10);

    this.scoreText = this.add
      .text(W - 14, 16, '0 correct', { fontSize: `${Math.round(H * 0.016)}px`, color: '#64748b', fontFamily: 'Space Grotesk, sans-serif' })
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

    this.coefs = [
      level.leftTerms.map(t => t.coefficient),
      level.rightTerms.map(t => t.coefficient),
    ];

    if (level.description) {
      const desc = this.track(
        this.add.text(W / 2, HUD_H + Math.round(H * 0.014), level.description, {
          fontSize: `${Math.round(H * 0.018)}px`, color: '#94a3b8',
          fontFamily: 'Space Grotesk, sans-serif', align: 'center', wordWrap: { width: W - 64 },
        }).setOrigin(0.5, 0).setAlpha(0),
      );
      this.tweens.add({ targets: desc, alpha: 1, y: { from: HUD_H + 6, to: HUD_H + Math.round(H * 0.014) }, duration: 280, ease: 'Quad.Out' });
    }

    this.buildSeesaw(level);
    this.buildEquationUI(level);
    this.buildCheckButton();

    this.targetAngle = this.computeBalanceAngle();
  }

  // ─── Seesaw visual ──────────────────────────────────────────────────────────

  private buildSeesaw(level: BalancingLevel): void {
    this.seesawContainer = this.track(
      this.add.container(W / 2, PIVOT_Y),
    ) as Phaser.GameObjects.Container;

    const beamGfx = this.add.graphics();
    this.seesawContainer.add(beamGfx);
    this.drawBeam(beamGfx, level);

    const pivotGfx = this.track(this.add.graphics());
    pivotGfx.fillStyle(IS_LIGHT ? 0xffffff : 0x070810, 1);
    pivotGfx.fillTriangle(
      W / 2 - TRI_W / 2, PIVOT_Y + TRI_H,
      W / 2 + TRI_W / 2, PIVOT_Y + TRI_H,
      W / 2,             PIVOT_Y,
    );
    pivotGfx.lineStyle(2.5, 0x7c3aed, 1);
    pivotGfx.beginPath();
    pivotGfx.moveTo(W / 2 - TRI_W / 2, PIVOT_Y + TRI_H);
    pivotGfx.lineTo(W / 2 + TRI_W / 2, PIVOT_Y + TRI_H);
    pivotGfx.lineTo(W / 2,             PIVOT_Y);
    pivotGfx.closePath();
    pivotGfx.strokePath();
    const groundGfx = this.track(this.add.graphics());
    groundGfx.lineStyle(3, 0x7c3aed, 0.45);
    groundGfx.beginPath();
    groundGfx.moveTo(0,  PIVOT_Y + TRI_H);
    groundGfx.lineTo(W,  PIVOT_Y + TRI_H);
    groundGfx.strokePath();

    this.seesawContainer.setAlpha(0);
    this.tweens.add({ targets: [this.seesawContainer, pivotGfx, groundGfx], alpha: 1, duration: 320, delay: 60 });
  }

  private drawBeam(gfx: Phaser.GameObjects.Graphics, level: BalancingLevel): void {
    const by = -BEAM_ARM;

    gfx.fillStyle(0x7c3aed, 0.85);
    gfx.fillRect(-3, by + BEAM_H_PX / 2, 6, BEAM_ARM - BEAM_H_PX / 2);

    gfx.fillStyle(0x7c3aed, 0.12);
    gfx.fillRect(-BEAM_HALF - 4, by - BEAM_H_PX / 2 - 6, (BEAM_HALF + 4) * 2, BEAM_H_PX + 12);

    gfx.fillStyle(0x7c3aed, 0.85);
    gfx.fillRect(-BEAM_HALF, by - BEAM_H_PX / 2, BEAM_HALF * 2, BEAM_H_PX);

    gfx.fillStyle(0xa78bfa, 0.70);
    gfx.fillRect(-BEAM_HALF - 2, by - BEAM_H_PX / 2 - 8, 60, 6);
    gfx.fillRect(BEAM_HALF - 58, by - BEAM_H_PX / 2 - 8, 60, 6);

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
      fontSize: `${Math.round(H * 0.022)}px`, fontStyle: 'bold', color: '#e2e8f0',
      fontFamily: 'Space Grotesk, sans-serif',
      stroke: '#1a1a2e', strokeThickness: 3,
    }).setOrigin(alignRight ? 1 : 0, 1);
  }

  // ─── Equation UI — rendered into a container that auto-scales to fit ─────────

  private buildEquationUI(level: BalancingLevel): void {
    const leftW  = this.measureSideWidth(level.leftTerms);
    const rightW = this.measureSideWidth(level.rightTerms);
    const eqSignW = Math.round(W * 0.10);
    const totalW  = leftW + eqSignW + rightW;

    // Scale down the whole equation if it would overflow the screen
    const availW  = W * 0.94;
    const eqScale = totalW > availW ? availW / totalW : 1;

    const eqCont = this.track(
      this.add.container(W / 2, EQ_Y + COEF_BOX_H / 2),
    ) as Phaser.GameObjects.Container;
    eqCont.setScale(eqScale);

    let curX = -totalW / 2;

    curX = this.renderSide(level.leftTerms, 0, curX, eqCont);

    const eqSign = this.add.text(curX + eqSignW / 2, 0, '=', {
      ...EQ_FONT, fontSize: `${Math.round(FONT_SZ_EQ * 1.18)}px`, color: '#64748b',
    }).setOrigin(0.5, 0.5).setAlpha(0);
    eqCont.add(eqSign);
    this.track(eqSign);
    this.tweens.add({ targets: eqSign, alpha: 1, duration: 240, delay: 180 });
    curX += eqSignW;

    this.renderSide(level.rightTerms, 1, curX, eqCont);
  }

  private measureSideWidth(terms: EquationTerm[]): number {
    let w = 0;
    terms.forEach((t, i) => {
      if (i > 0) w += Math.round(W * 0.075);
      if (t.adjustable) {
        w += BTN_SIZE + COEF_BOX_W + BTN_SIZE + 10;
      } else {
        w += Math.round(CHAR_W * 2);
      }
      w += 8 + this.estimateLabelWidth(t.label);
      w += TERM_GAP;
    });
    return w;
  }

  private estimateLabelWidth(label: string): number {
    return label.length * CHAR_W;
  }

  private renderSide(
    terms: EquationTerm[],
    side: number,
    startX: number,
    container: Phaser.GameObjects.Container,
  ): number {
    let curX = startX;
    const midY = 0;   // relative to container centre
    const topY = -COEF_BOX_H / 2;
    const SEP_W = Math.round(W * 0.075);

    terms.forEach((term, ti) => {
      if (ti > 0) {
        const plus = this.add.text(curX + SEP_W * 0.4, midY, '+', { ...EQ_FONT, color: '#475569' })
          .setOrigin(0, 0.5).setAlpha(0);
        container.add(plus);
        this.track(plus);
        this.interactiveUI.push(plus);
        this.tweens.add({ targets: plus, alpha: 1, duration: 220, delay: 100 });
        curX += SEP_W;
      }

      if (term.adjustable) {
        curX = this.renderAdjustableTerm(term, side, ti, curX, topY, midY, container);
      } else {
        curX = this.renderFixedTerm(term, curX, midY, container);
      }

      const lbl = this.add.text(curX + 6, midY, term.label, { ...LABEL_FONT }).setOrigin(0, 0.5).setAlpha(0);
      container.add(lbl);
      this.track(lbl);
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
    container: Phaser.GameObjects.Container,
  ): number {
    const min = term.min ?? 1;
    const max = term.max ?? 9;

    const dashGfx = this.add.graphics().setAlpha(0);
    this.drawDashedRect(dashGfx, x + BTN_SIZE, topY, COEF_BOX_W, COEF_BOX_H, 0xa78bfa);
    container.add(dashGfx);
    this.track(dashGfx);
    this.interactiveUI.push(dashGfx);
    this.tweens.add({ targets: dashGfx, alpha: 1, duration: 220, delay: 80 });

    const coefText = this.add.text(
      x + BTN_SIZE + COEF_BOX_W / 2, midY,
      `${this.coefs[side][termIndex]}`, { ...COEF_FONT },
    ).setOrigin(0.5, 0.5).setAlpha(0);
    container.add(coefText);
    this.track(coefText);
    this.coefTexts.push(coefText);
    this.interactiveUI.push(coefText);
    this.tweens.add({ targets: coefText, alpha: 1, duration: 220, delay: 80 });

    const coefIdx = this.coefTexts.length - 1;

    const minusBg = this.add.rectangle(x + BTN_SIZE / 2, midY, BTN_SIZE, BTN_SIZE, T.inputBg, 1)
      .setStrokeStyle(1, 0xa78bfa, 0.5).setInteractive({ useHandCursor: true }).setAlpha(0);
    const minusLbl = this.add.text(x + BTN_SIZE / 2, midY, '−', { ...BTN_FONT }).setOrigin(0.5, 0.5).setAlpha(0);
    container.add(minusBg);
    container.add(minusLbl);
    this.track(minusBg as unknown as Phaser.GameObjects.GameObject);
    this.track(minusLbl);
    this.interactiveUI.push(minusBg as unknown as Phaser.GameObjects.GameObject, minusLbl);
    this.tweens.add({ targets: [minusBg, minusLbl], alpha: 1, duration: 200, delay: 100 });

    const plusX  = x + BTN_SIZE + COEF_BOX_W;
    const plusBg = this.add.rectangle(plusX + BTN_SIZE / 2, midY, BTN_SIZE, BTN_SIZE, T.inputBg, 1)
      .setStrokeStyle(1, 0xa78bfa, 0.5).setInteractive({ useHandCursor: true }).setAlpha(0);
    const plusLbl = this.add.text(plusX + BTN_SIZE / 2, midY, '+', { ...BTN_FONT }).setOrigin(0.5, 0.5).setAlpha(0);
    container.add(plusBg);
    container.add(plusLbl);
    this.track(plusBg as unknown as Phaser.GameObjects.GameObject);
    this.track(plusLbl);
    this.interactiveUI.push(plusBg as unknown as Phaser.GameObjects.GameObject, plusLbl);
    this.tweens.add({ targets: [plusBg, plusLbl], alpha: 1, duration: 200, delay: 100 });

    const updateCoef = (delta: number) => {
      if (this.isAnimating) return;
      const cur  = this.coefs[side][termIndex];
      const next = Phaser.Math.Clamp(cur + delta, min, max);
      if (next === cur) return;
      this.coefs[side][termIndex] = next;
      haptics.light();
      this.audio.playClick();
      this.coefTexts[coefIdx].setText(`${next}`);
      this.refreshBeamLabel();
      this.tweens.add({ targets: this.coefTexts[coefIdx], scaleX: 1.3, scaleY: 1.3, duration: 80, yoyo: true });
      this.targetAngle = this.computeBalanceAngle();
    };

    minusBg.on('pointerdown', () => updateCoef(-1));
    plusBg.on('pointerdown',  () => updateCoef(+1));

    return x + BTN_SIZE + COEF_BOX_W + BTN_SIZE;
  }

  private renderFixedTerm(
    term: EquationTerm,
    x: number,
    midY: number,
    container: Phaser.GameObjects.Container,
  ): number {
    const coefLabel = `${term.coefficient}`;
    const coefEl = this.add.text(x, midY, coefLabel, { ...COEF_FONT, color: '#94a3b8' })
      .setOrigin(0, 0.5).setAlpha(0);
    container.add(coefEl);
    this.track(coefEl);
    this.interactiveUI.push(coefEl);
    this.tweens.add({ targets: coefEl, alpha: 1, duration: 220, delay: 100 });
    return x + coefLabel.length * CHAR_W;
  }

  // ─── Check button ─────────────────────────────────────────────────────────────

  private buildCheckButton(): void {
    const btnY = Math.round(H * 0.800);
    const btnW = Math.round(W * 0.50);
    const btnH = Math.round(H * 0.075);

    const bg = this.track(
      this.add.rectangle(W / 2, btnY, btnW, btnH, T.btnBg)
        .setStrokeStyle(1.5, 0x10b981, 0.7).setInteractive({ useHandCursor: true }).setAlpha(0),
    ) as Phaser.GameObjects.Rectangle;

    const lbl = this.track(
      this.add.text(W / 2, btnY, '▶  Check', {
        fontSize: `${Math.round(H * 0.022)}px`, fontStyle: 'bold', color: '#10b981',
        fontFamily: 'Space Grotesk, sans-serif',
      }).setOrigin(0.5, 0.5).setAlpha(0),
    );

    this.interactiveUI.push(bg, lbl);
    this.tweens.add({ targets: [bg, lbl], alpha: 1, duration: 280, delay: 220 });

    bg.on('pointerover', () => { bg.setStrokeStyle(2, 0x10b981, 1); lbl.setColor('#34d399'); })
      .on('pointerout',  () => { bg.setStrokeStyle(1.5, 0x10b981, 0.7); lbl.setColor('#10b981'); });

    bg.on('pointerdown', () => {
      if (this.isAnimating) return;
      haptics.light();
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
    const imbalance = (L - R) / total;
    return imbalance * MAX_TILT;
  }

  // ─── Animation ────────────────────────────────────────────────────────────────

  private runCheckAnimation(): void {
    this.isAnimating = true;
    this.tweens.add({ targets: this.interactiveUI, alpha: 0, duration: 200 });

    const correct = this.isBalanced();

    const volatileAngles = [0.28, -0.32, 0.42, -0.24, 0.38, -0.44, 0.20, -0.18, 0.12, -0.08];
    const durations       = [210,  195,   240,  180,   220,  200,   250,  170,   210,  190];
    let delay = 0;
    volatileAngles.forEach((angle, i) => {
      this.tweens.add({
        targets: this.seesawContainer,
        rotation: angle, duration: durations[i], delay, ease: 'Sine.InOut',
      });
      delay += durations[i];
    });

    this.time.delayedCall(2000, () => {
      if (correct) this.resolveCorrect(); else this.resolveWrong();
    });
  }

  private resolveCorrect(): void {
    this.tweens.add({
      targets: this.seesawContainer, rotation: 0, duration: 900, ease: 'Elastic.Out',
      onComplete: () => {
        this.cameras.main.flash(200, 16, 185, 129, false);
        haptics.success();
        this.onCorrect(W / 2, BEAM_Y);
        this.scoreText.setText(`${this.score.correct} correct`);

        const msgY = Math.round(H * 0.36);
        const msg = this.track(this.add.text(W / 2, msgY + 20, '⚖ Balanced!', {
          fontSize: `${Math.round(H * 0.038)}px`, fontStyle: 'bold', color: '#10b981',
          fontFamily: 'Space Grotesk, sans-serif',
          stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(50).setAlpha(0));
        this.tweens.add({ targets: msg, alpha: 1, y: msgY, duration: 350, ease: 'Quad.Out' });

        this.time.delayedCall(1400, () => this.loadLevel(this.currentLevelIndex + 1));
      },
    });
  }

  private resolveWrong(): void {
    const L   = this.getLeftTotal();
    const R   = this.getRightTotal();
    const dir = L >= R ? 1 : -1;

    this.tweens.add({
      targets: this.seesawContainer, rotation: dir * 0.72, duration: 520, ease: 'Cubic.In',
      onComplete: () => {
        haptics.error();
        this.audio.playDrop();
        this.cameras.main.shake(350, 0.012);
        this.onWrong(W / 2, BEAM_Y);

        const hint = L > R ? 'Left side is too heavy' : 'Right side is too heavy';
        const hintY = Math.round(H * 0.38);
        const hintText = this.track(this.add.text(W / 2, hintY + 16, hint, {
          fontSize: `${Math.round(H * 0.026)}px`, fontStyle: 'bold', color: '#ef4444',
          fontFamily: 'Space Grotesk, sans-serif',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50).setAlpha(0));
        this.tweens.add({ targets: hintText, alpha: 1, y: hintY, duration: 320, ease: 'Quad.Out' });

        this.time.delayedCall(600, () => this.showRetryButton());
      },
    });
  }

  // ─── Retry ────────────────────────────────────────────────────────────────────

  private showRetryButton(): void {
    const btnY = PIVOT_Y + TRI_H + Math.round(H * 0.045);

    const bg = this.add.rectangle(W / 2, btnY, Math.round(W * 0.44), Math.round(H * 0.060), T.panelBg)
      .setStrokeStyle(1, 0xef4444, 0.5).setDepth(20).setAlpha(0)
      .setInteractive({ useHandCursor: true });

    const lbl = this.add.text(W / 2, btnY, 'Try Again →', {
      fontSize: `${Math.round(H * 0.020)}px`, fontStyle: 'bold', color: '#ef4444',
      fontFamily: 'Space Grotesk, sans-serif',
    }).setOrigin(0.5).setDepth(21).setAlpha(0);

    this.tweens.add({ targets: [bg, lbl], alpha: 1, duration: 220 });

    bg.on('pointerdown', () => {
      bg.destroy();
      lbl.destroy();
      this.loadLevel(this.currentLevelIndex);
    });
  }

  // ─── Frame update ────────────────────────────────────────────────────────────

  update(_time: number, _delta: number): void {
    if (this.isAnimating) return;

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

    const cardW = Math.min(W * 0.80, 440);
    const cardH = Math.min(H * 0.46, 310);
    const card = this.add.rectangle(W / 2, H / 2, cardW, cardH, 0x0d0f1e)
      .setStrokeStyle(1, 0xffffff, 0.1).setDepth(101).setScale(0.82).setAlpha(0);
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, delay: 100, ease: 'Back.Out' });

    const ts = (sz: string, c: string) => ({ fontSize: sz, color: c, fontFamily: 'Space Grotesk, sans-serif' });
    const fs = (f: number) => `${Math.round(H * f)}px`;
    const els = [
      this.add.text(W/2, H/2-cardH*0.42, emoji,         { fontSize: fs(0.068) }).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2-cardH*0.18, 'Complete!',   ts(fs(0.038), '#e2e8f0')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2+cardH*0.04, `${s.correct} / ${total} balanced`, ts(fs(0.022), '#94a3b8')).setOrigin(0.5).setDepth(102),
      this.add.text(W/2, H/2+cardH*0.20, `${pct}%`, ts(fs(0.032), pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444')).setOrigin(0.5).setDepth(102),
    ];
    els.forEach(el => el.setAlpha(0));
    this.tweens.add({ targets: els, alpha: 1, duration: 280, delay: 280 });

    const again = this.add.text(W/2 - W*0.12, H/2+cardH*0.40, 'Play Again', ts(fs(0.022), '#a78bfa'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { this.scene.restart(); });

    const menu = this.add.text(W/2 + W*0.12, H/2+cardH*0.40, '← Menu', ts(fs(0.022), '#475569'))
      .setOrigin(0.5).setDepth(102).setAlpha(0).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.tweens.add({ targets: [again, menu], alpha: 1, duration: 240, delay: 420 });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private refreshBeamLabel(): void {
    const container = this.seesawContainer;
    if (!container) return;
    const list = container.list as Phaser.GameObjects.GameObject[];
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

import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import type { SortingConfig, SortingLevel, SortingItem } from './types';
import {
  playCountdownBeep,
  playGoBeep,
  playBuzzer,
  playCountdownTick,
  warmAudio,
} from './SoundGenerator';
import { haptics } from '../../shared/haptics';
import { hudHex, T, IS_LIGHT } from '../../shared/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hexStr(css: string): number {
  return parseInt(css.replace('#', ''), 16);
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class SortingGameScene extends BaseGameScene {
  static readonly SCENE_KEY = 'SortingGame';

  declare protected gameConfig: SortingConfig;

  // ── Layout ───────────────────────────────────────────────────────────────
  private W = 0;
  private H = 0;
  private HUD_H = 0;
  private CARD_W = 0;
  private CARD_H = 0;
  private CARD_X = 0;
  private CARD_Y = 0;
  private ZONE_Y = 0;
  private ZONE_H = 0;

  // ── Session state ────────────────────────────────────────────────────────
  private sessionLevels: SortingLevel[] = [];
  private sessionIndex = 0;
  private currentItems: SortingItem[] = [];
  private itemIndex = 0;
  private streak = 0;
  private bestStreak = 0;
  private inputLocked = false;

  // ── Timer state ──────────────────────────────────────────────────────────
  private readonly TIMER_DURATION = 5;
  private timerSeconds = 5;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private timerBarTween: Phaser.Tweens.Tween | null = null;
  private startTimerAfterCard = false;

  // ── HUD ─────────────────────────────────────────────────────────────────
  private scoreText!: Phaser.GameObjects.Text;
  private streakBadge!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private questionText!: Phaser.GameObjects.Text;

  // Clock
  private clockContainer!: Phaser.GameObjects.Container;
  private clockFaceGfx!: Phaser.GameObjects.Graphics;
  private clockHandGfx!: Phaser.GameObjects.Graphics;
  private clockNum!: Phaser.GameObjects.Text;
  private clockRadius = 0;

  // Timer bar
  private timerBarFill!: Phaser.GameObjects.Rectangle;

  // Zone visuals
  private leftZoneBg!: Phaser.GameObjects.Rectangle;
  private rightZoneBg!: Phaser.GameObjects.Rectangle;
  private leftZoneLabel!: Phaser.GameObjects.Text;
  private rightZoneLabel!: Phaser.GameObjects.Text;

  // Buttons
  private leftBtnBg!: Phaser.GameObjects.Rectangle;
  private leftBtnLbl!: Phaser.GameObjects.Text;
  private rightBtnBg!: Phaser.GameObjects.Rectangle;
  private rightBtnLbl!: Phaser.GameObjects.Text;

  // Active game card
  private currentCard: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: SortingGameScene.SCENE_KEY });
  }

  init(data: SortingConfig): void {
    super.init(data);
    this.streak = 0;
    this.bestStreak = 0;
    this.sessionIndex = 0;
    this.itemIndex = 0;
    this.inputLocked = true;
    this.currentCard = null;
    this.timerEvent = null;
    this.timerBarTween = null;
    this.startTimerAfterCard = false;
  }

  // ── BaseGameScene hooks ──────────────────────────────────────────────────

  protected setupUI(): void {
    const { width: W, height: H } = this.scale;
    this.W = W;
    this.H = H;
    const FONT = "'Space Grotesk', sans-serif";
    const fs   = (f: number) => `${Math.round(H * f)}px`;

    this.CARD_W = Math.round(W * 0.52);
    this.CARD_H = Math.round(H * 0.27);
    this.CARD_X = W / 2;
    this.CARD_Y = H * 0.465;

    // ── HUD band ─────────────────────────────────────────────────────────
    this.HUD_H = H * 0.12;
    const HUD_H = this.HUD_H;
    this.add.rectangle(W / 2, HUD_H / 2, W, HUD_H, hudHex).setDepth(10);

    // ── Timer bar (bottom edge of HUD) ────────────────────────────────────
    const BAR_H = Math.max(Math.round(H * 0.012), 7);
    const BAR_Y = HUD_H;
    this.add.rectangle(W / 2, BAR_Y, W, BAR_H, T.timerBg).setDepth(11);
    // Origin at left so scaleX depletes rightward
    this.timerBarFill = this.add.rectangle(0, BAR_Y, W, BAR_H, 0x10b981)
      .setOrigin(0, 0.5)
      .setDepth(12)
      .setAlpha(0);

    // ── Clock icon (left of score) ─────────────────────────────────────────
    this.clockRadius = Math.round(HUD_H * 0.40);
    this.clockContainer = this.add.container(W * 0.28, HUD_H / 2).setDepth(20);
    this.clockFaceGfx   = this.add.graphics();
    this.clockHandGfx   = this.add.graphics();
    this.clockNum = this.add.text(0, this.clockRadius * 0.22, '5', {
      fontFamily: FONT, fontSize: fs(0.020), fontStyle: 'bold', color: T.textMid,
    }).setOrigin(0.5);
    this.clockContainer.add([this.clockFaceGfx, this.clockHandGfx, this.clockNum]);
    this.buildClockFace();
    this.redrawClockHand(5);

    // ── HUD text elements ─────────────────────────────────────────────────
    this.add.text(W * 0.025, HUD_H / 2, '<- Menu', {
      fontFamily: FONT, fontSize: fs(0.020), color: '#475569',
    }).setOrigin(0, 0.5).setDepth(20)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.scoreText = this.add.text(W * 0.54, HUD_H / 2, 'Score: 0', {
      fontFamily: FONT, fontSize: fs(0.030), fontStyle: 'bold', color: '#00d4ff',
    }).setOrigin(0.5).setDepth(20);

    this.streakBadge = this.add.text(W * 0.76, HUD_H / 2, '', {
      fontFamily: FONT, fontSize: fs(0.022), fontStyle: 'bold', color: '#f59e0b',
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.progressText = this.add.text(W * 0.94, HUD_H / 2, '', {
      fontFamily: FONT, fontSize: fs(0.020), color: '#606880',
    }).setOrigin(1, 0.5).setDepth(20);

    // ── Question text (below timer bar) ───────────────────────────────────
    this.questionText = this.add.text(W / 2, HUD_H + H * 0.065, '', {
      fontFamily: FONT, fontSize: fs(0.022), color: '#c8d0e8', align: 'center',
    }).setOrigin(0.5).setDepth(10);

    // ── Zone backgrounds ──────────────────────────────────────────────────
    const ZONE_TOP = HUD_H + H * 0.108;
    const ZONE_BOT = H * 0.795;
    this.ZONE_H = ZONE_BOT - ZONE_TOP;
    this.ZONE_Y = ZONE_TOP + this.ZONE_H / 2;

    // Each zone takes 50% of the width (no gap — divider sits on top)
    this.leftZoneBg  = this.add.rectangle(W * 0.25, this.ZONE_Y, W * 0.50, this.ZONE_H, 0x7c3aed, 0.07).setDepth(1);
    this.rightZoneBg = this.add.rectangle(W * 0.75, this.ZONE_Y, W * 0.50, this.ZONE_H, 0x00aacc, 0.07).setDepth(1);
    this.add.rectangle(W / 2, this.ZONE_Y, 1.5, this.ZONE_H, T.divider, 0.8).setDepth(2);

    // ── Zone labels — placed at top of zone so they don't overlap the card ──
    const zoneLabelY = ZONE_TOP + H * 0.055;
    const zStyle = { fontFamily: FONT, fontSize: fs(0.036), fontStyle: 'bold', align: 'center' as const };
    this.leftZoneLabel  = this.add.text(W * 0.22, zoneLabelY, '', { ...zStyle, color: '#8b5cf6' })
      .setOrigin(0.5).setDepth(5).setWordWrapWidth(W * 0.36);
    this.rightZoneLabel = this.add.text(W * 0.78, zoneLabelY, '', { ...zStyle, color: '#00d4ff' })
      .setOrigin(0.5).setDepth(5).setWordWrapWidth(W * 0.36);

    const arrowY = this.CARD_Y + H * 0.135;
    this.add.text(W * 0.07, arrowY, '<--', { fontFamily: FONT, fontSize: fs(0.034), color: '#1e2236' }).setOrigin(0.5).setDepth(3);
    this.add.text(W * 0.93, arrowY, '-->', { fontFamily: FONT, fontSize: fs(0.034), color: '#1e2236' }).setOrigin(0.5).setDepth(3);

    // ── Left / Right buttons — each 44% wide, centered in their zone ──────
    const BTN_W = W * 0.44;
    const BTN_H = Math.round(H * 0.090);
    const BTN_Y = H * 0.880;

    this.leftBtnBg = this.add.rectangle(W * 0.25, BTN_Y, BTN_W, BTN_H, T.btnBg)
      .setStrokeStyle(2, 0x7c3aed, 0.8).setInteractive({ useHandCursor: true }).setDepth(30);
    this.leftBtnLbl = this.add.text(W * 0.25, BTN_Y, '<- Left', {
      fontFamily: FONT, fontSize: fs(0.032), fontStyle: 'bold', color: '#8b5cf6',
    }).setOrigin(0.5).setDepth(31);
    this.leftBtnBg
      .on('pointerdown', () => {
        if (!this.handleChoice('left')) return;
        haptics.light();
        this.tweens.add({ targets: [this.leftBtnBg, this.leftBtnLbl], scaleX: 0.92, scaleY: 0.92, duration: 75 });
      })
      .on('pointerup', () => {
        this.tweens.add({ targets: [this.leftBtnBg, this.leftBtnLbl], scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.Out' });
      });

    this.rightBtnBg = this.add.rectangle(W * 0.75, BTN_Y, BTN_W, BTN_H, T.btnBg)
      .setStrokeStyle(2, 0x00aacc, 0.8).setInteractive({ useHandCursor: true }).setDepth(30);
    this.rightBtnLbl = this.add.text(W * 0.75, BTN_Y, 'Right ->', {
      fontFamily: FONT, fontSize: fs(0.032), fontStyle: 'bold', color: '#00d4ff',
    }).setOrigin(0.5).setDepth(31);
    this.rightBtnBg
      .on('pointerdown', () => {
        if (!this.handleChoice('right')) return;
        haptics.light();
        this.tweens.add({ targets: [this.rightBtnBg, this.rightBtnLbl], scaleX: 0.92, scaleY: 0.92, duration: 75 });
      })
      .on('pointerup', () => {
        this.tweens.add({ targets: [this.rightBtnBg, this.rightBtnLbl], scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.Out' });
      });

    this.input.keyboard?.on('keydown-LEFT',  () => this.handleChoice('left'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.handleChoice('right'));
    this.input.keyboard?.on('keydown-A',     () => this.handleChoice('left'));
    this.input.keyboard?.on('keydown-D',     () => this.handleChoice('right'));

    // Pre-warm AudioContext on very first touch anywhere (iOS Safari)
    this.input.once('pointerdown', () => warmAudio());
  }

  protected setupGame(): void {
    const all = this.gameConfig.levels ?? [];
    this.sessionLevels = shuffle(all).slice(0, Math.min(5, all.length));
    this.sessionIndex = 0;
    this.loadLevel(0);
  }

  // ── Clock drawing ─────────────────────────────────────────────────────────

  private buildClockFace(): void {
    const g = this.clockFaceGfx;
    const r = this.clockRadius;
    g.clear();
    g.fillStyle(T.clockFace, 1);
    g.fillCircle(0, 0, r);
    g.lineStyle(1.8, T.border, 1);
    g.strokeCircle(0, 0, r);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const isMaj = i % 3 === 0;
      const inner = r * (isMaj ? 0.68 : 0.80);
      const outer = r * 0.92;
      g.lineStyle(isMaj ? 1.5 : 1, isMaj ? 0x606880 : 0x3a3f5c, 1);
      g.beginPath();
      g.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      g.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      g.strokePath();
    }
  }

  private redrawClockHand(secondsLeft: number): void {
    const g     = this.clockHandGfx;
    const r     = this.clockRadius;
    const angle = -Math.PI / 2 + ((this.TIMER_DURATION - secondsLeft) / this.TIMER_DURATION) * Math.PI * 2;
    const len   = r * 0.56;
    const col   = secondsLeft <= 2 ? 0xef4444 : secondsLeft <= 3 ? 0xf59e0b : 0x00d4ff;
    g.clear();
    g.lineStyle(2, col, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    g.strokePath();
    g.fillStyle(col, 1);
    g.fillCircle(0, 0, 2.5);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.timerSeconds = this.TIMER_DURATION;
    this.timerBarFill.setAlpha(1).setScale(1, 1);
    this.updateClockDisplay(this.TIMER_DURATION);
    this.updateTimerBarColor(this.TIMER_DURATION);
    playCountdownTick(0.14); // tick at "5" so total = 6 sounds: 5,4,3,2,1 + buzzer

    this.timerBarTween = this.tweens.add({
      targets: this.timerBarFill,
      scaleX: 0,
      duration: this.TIMER_DURATION * 1000,
      ease: 'Linear',
    });

    // fires once per second; repeat: N-1 means N total calls
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: this.TIMER_DURATION - 1,
      callback: this.onTimerTick,
      callbackScope: this,
    });
  }

  private stopTimer(): void {
    if (this.timerEvent)    { this.timerEvent.remove();  this.timerEvent    = null; }
    if (this.timerBarTween) { this.timerBarTween.stop(); this.timerBarTween = null; }
  }

  private onTimerTick(): void {
    this.timerSeconds--;
    this.updateClockDisplay(this.timerSeconds);
    this.updateTimerBarColor(this.timerSeconds);

    // Tick volume and pulse scale up as time runs out
    const urgency  = (this.TIMER_DURATION - this.timerSeconds) / this.TIMER_DURATION; // 0→1
    const tickVol  = 0.14 + urgency * 0.28; // 0.14 → 0.42
    const pulseAmt = this.timerSeconds <= 2 ? 1.26 : 1.15;
    if (this.timerSeconds > 0) {
      playCountdownTick(tickVol);
      this.tweens.add({
        targets: this.clockContainer,
        scaleX: pulseAmt, scaleY: pulseAmt,
        duration: 85, ease: 'Quad.Out', yoyo: true,
      });
    }

    if (this.timerSeconds <= 0) this.onTimerExpired();
  }

  private updateClockDisplay(seconds: number): void {
    this.clockNum.setText(`${seconds}`);
    this.redrawClockHand(seconds);
    this.clockNum.setColor(seconds <= 2 ? '#ef4444' : seconds <= 3 ? '#f59e0b' : T.textMid);
  }

  private updateTimerBarColor(seconds: number): void {
    const col = seconds <= 1 ? 0xef4444 : seconds <= 2 ? 0xf97316 : seconds <= 3 ? 0xf59e0b : 0x10b981;
    this.timerBarFill.setFillStyle(col);
  }

  private onTimerExpired(): void {
    this.timerEvent    = null;
    this.timerBarTween = null;
    if (this.inputLocked || !this.currentCard) return;
    this.inputLocked = true;

    // Shake clock
    const origX = this.clockContainer.x;
    this.tweens.add({
      targets: this.clockContainer,
      x: { from: origX - 9, to: origX + 9 },
      duration: 45, repeat: 6, yoyo: true,
      onComplete: () => { this.clockContainer.x = origX; },
    });

    playBuzzer();

    // Card flies straight up — no answer revealed
    const card = this.currentCard;
    this.currentCard = null;
    this.tweens.add({
      targets: card,
      y: -this.H * 0.15,
      scaleX: 0.4, scaleY: 0.4, alpha: 0,
      duration: 380, ease: 'Cubic.In',
      onComplete: () => {
        card.destroy();
        this.time.delayedCall(300, () => this.advanceToNextCard());
      },
    });
  }

  // ── Level management ──────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    const level = this.sessionLevels[index];
    if (!level) { this.showGameComplete(); return; }

    const items = this.gameConfig.shuffleItems !== false ? shuffle(level.items) : [...level.items];
    this.currentItems = items;
    this.itemIndex    = 0;
    this.inputLocked  = true;

    const leftColor  = level.leftColor  ?? '#8b5cf6';
    const rightColor = level.rightColor ?? '#00d4ff';
    this.leftZoneLabel.setText(level.leftLabel).setColor(leftColor);
    this.rightZoneLabel.setText(level.rightLabel).setColor(rightColor);
    this.leftZoneBg.setFillStyle(hexStr(leftColor), 0.07);
    this.rightZoneBg.setFillStyle(hexStr(rightColor), 0.07);
    this.questionText.setText(level.question);

    this.updateHUD();
    this.showLevelIntroCard(level);
  }

  // ── Level intro card ──────────────────────────────────────────────────────

  private showLevelIntroCard(level: SortingLevel): void {
    const W    = this.W, H = this.H;
    const FONT = "'Space Grotesk', sans-serif";
    const fs   = (f: number) => `${Math.round(H * f)}px`;
    const CW   = Math.round(W * 0.82);
    const CH   = Math.round(H * 0.44);

    const intro = this.add.container(W / 2, H * 0.47).setDepth(60);

    // Outer glow
    const glow = this.add.graphics();
    glow.fillStyle(0x10b981, 0.06);
    glow.fillRoundedRect(-CW / 2 - 12, -CH / 2 - 12, CW + 24, CH + 24, 28);

    // Card body
    const bg = this.add.graphics();
    bg.fillStyle(T.panelBg, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 20);
    bg.lineStyle(2, 0x10b981, 0.65);
    bg.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, 20);

    // Category label
    const cat = this.add.text(0, -CH * 0.38, level.category.toUpperCase(), {
      fontFamily: FONT, fontSize: fs(0.018), color: T.textFade,
    }).setOrigin(0.5);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, T.divider, 1);
    div.beginPath();
    div.moveTo(-CW * 0.38, -CH * 0.25);
    div.lineTo( CW * 0.38, -CH * 0.25);
    div.strokePath();

    // Question text
    const qText = this.add.text(0, -CH * 0.06, level.question, {
      fontFamily: FONT, fontSize: fs(0.040), fontStyle: 'bold',
      color: T.textMid, align: 'center',
      wordWrap: { width: CW - 60 },
    }).setOrigin(0.5);

    // Instruction hint
    const instr = this.add.text(0, CH * 0.21, 'Sort each item  Left  or  Right', {
      fontFamily: FONT, fontSize: fs(0.019), color: '#4a5070', align: 'center',
    }).setOrigin(0.5);

    // Ready button
    const btnW = Math.round(CW * 0.44);
    const btnH = Math.round(CH * 0.17);
    const btnY = CH * 0.375;
    let readyLocked = false;

    const readyBg = this.add.rectangle(0, btnY, btnW, btnH, T.panelBg)
      .setStrokeStyle(2, 0x10b981, 0.9)
      .setInteractive({ useHandCursor: true });
    const readyLbl = this.add.text(0, btnY, 'READY!', {
      fontFamily: FONT, fontSize: fs(0.028), fontStyle: 'bold', color: '#10b981',
    }).setOrigin(0.5);

    intro.add([glow, bg, cat, div, qText, instr, readyBg, readyLbl]);

    readyBg
      .on('pointerover', () => { if (!readyLocked) { readyBg.setFillStyle(0x0c1f18); readyLbl.setColor('#34d399'); } })
      .on('pointerout',  () => { readyBg.setFillStyle(T.panelBg); readyLbl.setColor('#10b981'); })
      .on('pointerdown', () => {
        if (readyLocked) return;
        readyLocked = true;
        warmAudio();
        haptics.light();
        this.audio.playClick();
        this.tweens.add({ targets: [readyBg, readyLbl], scaleX: 0.92, scaleY: 0.92, duration: 80 });
        this.time.delayedCall(110, () => {
          this.tweens.add({
            targets: intro,
            scaleX: 0.05, scaleY: 0.05, alpha: 0,
            duration: 280, ease: 'Back.In',
            onComplete: () => { intro.destroy(); this.startCountdown(); },
          });
        });
      });

    // Pop-in entrance
    intro.setScale(0.1).setAlpha(0);
    this.tweens.add({ targets: intro, scaleX: 1, scaleY: 1, alpha: 1, duration: 400, ease: 'Back.Out' });
  }

  // ── 3-2-1-GO countdown ────────────────────────────────────────────────────

  private startCountdown(): void {
    const W    = this.W, H = this.H;
    const FONT = "'Space Grotesk', sans-serif";

    const steps: Array<{ label: string; color: string }> = [
      { label: '3',   color: '#ef4444' },
      { label: '2',   color: '#f59e0b' },
      { label: '1',   color: '#10b981' },
      { label: 'GO!', color: '#00d4ff' },
    ];
    let i = 0;

    const showStep = () => {
      if (i >= steps.length) {
        // Launch first card; timer starts when card finishes popping in
        this.startTimerAfterCard = true;
        this.showCard(this.currentItems[0]);
        return;
      }

      const { label, color } = steps[i++];
      const isGo = label === 'GO!';
      if (isGo) playGoBeep(); else playCountdownBeep();

      const txt = this.add.text(W / 2, H * 0.44, label, {
        fontFamily: FONT,
        fontSize: `${Math.round(H * (isGo ? 0.100 : 0.140))}px`,
        fontStyle: 'bold', color,
        stroke: '#000000',
        strokeThickness: isGo ? 4 : 7,
      }).setOrigin(0.5).setDepth(70).setScale(0.4).setAlpha(0);

      this.tweens.add({
        targets: txt, scaleX: 1, scaleY: 1, alpha: 1,
        duration: 200, ease: 'Back.Out',
        onComplete: () => {
          this.time.delayedCall(isGo ? 360 : 330, () => {
            this.tweens.add({
              targets: txt,
              scaleX: isGo ? 1.3 : 1.5, scaleY: isGo ? 1.3 : 1.5,
              alpha: 0, duration: 170, ease: 'Quad.In',
              onComplete: () => {
                txt.destroy();
                this.time.delayedCall(isGo ? 0 : 60, showStep);
              },
            });
          });
        },
      });
    };

    showStep();
  }

  // ── Card display ──────────────────────────────────────────────────────────

  private showCard(item: SortingItem): void {
    const CW   = this.CARD_W, CH = this.CARD_H;
    const FONT = "'Space Grotesk', sans-serif";
    const fs   = (f: number) => `${Math.round(this.H * f)}px`;

    const container = this.add.container(this.CARD_X, this.CARD_Y).setDepth(50);

    const glow = this.add.graphics();
    glow.lineStyle(3, IS_LIGHT ? 0x8b5cf6 : 0x5b5fe6, IS_LIGHT ? 0.30 : 0.45);
    glow.strokeRoundedRect(-CW / 2 - 5, -CH / 2 - 5, CW + 10, CH + 10, 21);

    const bg = this.add.graphics();
    bg.fillStyle(T.cardBg, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 16);
    bg.lineStyle(2, IS_LIGHT ? 0x6366f1 : 0x5b5fe6, 1);
    bg.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, 16);

    const hasHint  = !!item.hint;
    const contentY = hasHint ? -CH * 0.10 : 0;
    const ctxt     = this.add.text(0, contentY, item.content, {
      fontFamily: FONT, fontSize: fs(0.044), fontStyle: 'bold',
      color: T.textMid, align: 'center',
      wordWrap: { width: CW - 36 },
    }).setOrigin(0.5);

    container.add([glow, bg, ctxt]);

    if (hasHint) {
      container.add(this.add.text(0, CH * 0.26, item.hint!, {
        fontFamily: FONT, fontSize: fs(0.020), color: '#5a6180', align: 'center',
        wordWrap: { width: CW - 44 },
      }).setOrigin(0.5));
    }

    this.currentCard = container;
    container.setScale(0).setAlpha(0);
    this.tweens.add({
      targets: container, scaleX: 1, scaleY: 1, alpha: 1,
      duration: 340, ease: 'Back.Out',
      onComplete: () => {
        this.inputLocked = false;
        if (this.startTimerAfterCard) {
          this.startTimerAfterCard = false;
          this.startTimer();
        }
      },
    });

    this.updateHUD();
  }

  private animateCardOut(direction: 'left' | 'right', onComplete: () => void): void {
    if (!this.currentCard) { onComplete(); return; }
    const card = this.currentCard;
    this.currentCard = null;
    this.tweens.add({
      targets: card,
      x: direction === 'left' ? -this.W * 0.55 : this.W * 1.55,
      rotation: direction === 'left' ? -0.42 : 0.42,
      scaleX: 0.60, scaleY: 0.78, alpha: 0,
      duration: 420, ease: 'Cubic.In',
      onComplete: () => { card.destroy(); onComplete(); },
    });
  }

  // ── Choice handler ────────────────────────────────────────────────────────

  private handleChoice(direction: 'left' | 'right'): boolean {
    if (this.inputLocked || !this.currentCard) return false;
    this.inputLocked = true;
    this.stopTimer();

    const item      = this.currentItems[this.itemIndex];
    const isCorrect = item.correct === direction;
    this.audio.playClick();

    this.animateCardOut(direction, () => {
      if (isCorrect) {
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        haptics.success();
        this.onCorrect(this.CARD_X, this.CARD_Y);
        // Override the fixed-rate correct sound with streak-pitched version
        if (this.cache.audio.exists('sfx-correct')) {
          this.sound.stopByKey('sfx-correct');
          const streakFactor = Math.min(this.streak - 1, 9);
          this.sound.play('sfx-correct', {
            volume: 0.65 + streakFactor * 0.015,
            rate: 1.0 + streakFactor * 0.03,
          });
        }
        this.flashZone(direction === 'left', true);
        this.spawnSparkles(this.CARD_X, this.CARD_Y, 0x10b981);
        if (this.streak >= 3) this.showStreakBurst();
      } else {
        this.streak = 0;
        haptics.error();
        this.onWrong(this.CARD_X, this.CARD_Y);
        this.flashZone(direction === 'left', false);
      }
      this.updateHUD();
      this.time.delayedCall(580, () => this.advanceToNextCard());
    });

    return true;
  }

  private advanceToNextCard(): void {
    this.itemIndex++;
    if (this.itemIndex >= this.currentItems.length) {
      this.showLevelComplete();
    } else {
      this.startTimerAfterCard = true;
      this.showCard(this.currentItems[this.itemIndex]);
    }
  }

  // ── Visual effects ────────────────────────────────────────────────────────

  private flashZone(isLeft: boolean, isCorrect: boolean): void {
    const x     = isLeft ? this.W * 0.25 : this.W * 0.75;
    const col   = isCorrect ? 0x10b981 : 0xef4444;
    const flash = this.add.rectangle(x, this.ZONE_Y, this.W * 0.50, this.ZONE_H, col, 0).setDepth(8);
    this.tweens.add({
      targets: flash, alpha: { from: 0, to: isCorrect ? 0.32 : 0.24 },
      duration: 130, yoyo: true, repeat: isCorrect ? 0 : 1,
      onComplete: () => flash.destroy(),
    });
  }

  private spawnSparkles(cx: number, cy: number, color: number): void {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist  = 65 + Math.random() * 55;
      const g     = this.add.graphics().setDepth(150);
      g.fillStyle(color, 1);
      g.fillCircle(0, 0, 3 + Math.random() * 4);
      g.setPosition(cx, cy);
      this.tweens.add({
        targets: g,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1, to: 0 }, scaleY: { from: 1, to: 0 },
        duration: 500 + Math.random() * 200, ease: 'Quad.Out',
        onComplete: () => g.destroy(),
      });
    }
  }

  private showStreakBurst(): void {
    const FONT  = "'Space Grotesk', sans-serif";
    const label = this.streak >= 5 ? `STREAK x${this.streak}!!` : `STREAK x${this.streak}!`;
    const color = this.streak >= 5 ? '#ef4444' : '#f59e0b';
    const txt   = this.add.text(this.CARD_X, this.CARD_Y - this.CARD_H * 0.72, label, {
      fontFamily: FONT, fontSize: `${Math.round(this.H * 0.042)}px`, fontStyle: 'bold', color,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200).setAlpha(0).setScale(0.5);
    this.tweens.add({
      targets: txt, alpha: 1, scaleX: 1, scaleY: 1, duration: 280, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: txt, alpha: 0, y: txt.y - 44,
          duration: 480, delay: 420, ease: 'Quad.In',
          onComplete: () => txt.destroy(),
        });
      },
    });
    if (this.streak >= 5) this.spawnSparkles(this.CARD_X, this.CARD_Y, 0xf59e0b);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private updateHUD(): void {
    const s       = this.score;
    const total   = this.currentItems.length;
    const current = Math.min(this.itemIndex + 1, total);
    const lvl     = this.sessionIndex + 1;
    const maxLvl  = this.sessionLevels.length;

    this.scoreText.setText(`Score: ${s.correct}`);
    this.progressText.setText(`${current}/${total}  L${lvl}/${maxLvl}`);

    if (this.streak >= 2) {
      this.streakBadge.setText(`${this.streak} in a row!`).setAlpha(1);
    } else {
      this.streakBadge.setAlpha(0);
    }
  }

  // ── Level complete ────────────────────────────────────────────────────────

  private showLevelComplete(): void {
    this.stopTimer();
    this.inputLocked = true;
    this.tweens.add({ targets: this.timerBarFill, alpha: 0, duration: 220 });

    const { W, H } = this;
    const FONT = "'Space Grotesk', sans-serif";

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100);
    const banner  = this.add.text(W / 2, H * 0.46, 'Level Complete!', {
      fontFamily: FONT,
      fontSize: `${Math.round(H * 0.060)}px`,
      fontStyle: 'bold', color: '#10b981',
    }).setOrigin(0.5).setDepth(101).setAlpha(0).setScale(0.7);

    this.tweens.add({ targets: overlay, alpha: 0.55, duration: 240 });
    this.tweens.add({
      targets: banner, alpha: 1, scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.Out',
      onComplete: () => {
        this.time.delayedCall(1100, () => {
          this.tweens.add({
            targets: [overlay, banner], alpha: 0, duration: 220,
            onComplete: () => {
              overlay.destroy(); banner.destroy();
              this.sessionIndex++;
              this.loadLevel(this.sessionIndex);
            },
          });
        });
      },
    });
    this.feedback.flashSuccess();
  }

  // ── Game complete ─────────────────────────────────────────────────────────

  private showGameComplete(): void {
    this.stopTimer();
    this.onComplete();
    const s    = this.score;
    const { W, H } = this;
    const FONT = "'Space Grotesk', sans-serif";
    const fs   = (f: number) => `${Math.round(H * f)}px`;

    this.add.rectangle(W / 2, H / 2, W, H, 0x070810, 0.94).setDepth(200);

    const title = this.add.text(W / 2, H * 0.24, 'Session Complete!', {
      fontFamily: FONT, fontSize: fs(0.062), fontStyle: 'bold', color: '#00d4ff',
    }).setOrigin(0.5).setDepth(201).setAlpha(0).setScale(0.7);
    this.tweens.add({ targets: title, alpha: 1, scaleX: 1, scaleY: 1, duration: 420, ease: 'Back.Out' });

    const acc      = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    const accColor = acc >= 80 ? '#10b981' : acc >= 60 ? '#f59e0b' : '#ef4444';
    const valStyle = { fontFamily: FONT, fontStyle: 'bold' as const, fontSize: fs(0.054), align: 'center' as const };
    const lblStyle = { fontFamily: FONT, fontSize: fs(0.022), color: '#606880', align: 'center' as const };

    [
      { x: W * 0.28, value: `${s.correct}`,      color: '#10b981', label: 'Correct'     },
      { x: W * 0.50, value: `${acc}%`,            color: accColor,  label: 'Accuracy'    },
      { x: W * 0.72, value: `${this.bestStreak}`, color: '#f59e0b', label: 'Best Streak' },
    ].forEach(({ x, value, color, label }, i) => {
      const val = this.add.text(x, H * 0.42, value, { ...valStyle, color }).setOrigin(0.5).setDepth(201).setAlpha(0);
      const lbl = this.add.text(x, H * 0.50, label, lblStyle).setOrigin(0.5).setDepth(201).setAlpha(0);
      this.tweens.add({ targets: val, alpha: 1, duration: 280, delay: 350 + i * 80 });
      this.tweens.add({ targets: lbl, alpha: 1, duration: 280, delay: 390 + i * 80 });
    });

    this.add.text(W / 2, H * 0.57, `${s.wrong} wrong  |  ${s.total} total`, {
      fontFamily: FONT, fontSize: fs(0.022), color: '#3a3f5c',
    }).setOrigin(0.5).setDepth(201);

    const btnY = H * 0.72;
    const btnW = Math.min(W * 0.28, 210);
    const btnH = Math.min(H * 0.085, 66);

    const againBg = this.add.rectangle(W * 0.34, btnY, btnW, btnH, 0x0d0f1e)
      .setStrokeStyle(2, 0x7c3aed, 0.9).setInteractive({ useHandCursor: true }).setDepth(202);
    this.add.text(W * 0.34, btnY, 'Play Again', {
      fontFamily: FONT, fontSize: fs(0.028), fontStyle: 'bold', color: '#8b5cf6',
    }).setOrigin(0.5).setDepth(203);
    againBg.on('pointerover', () => againBg.setFillStyle(0x1a0a2e))
           .on('pointerout',  () => againBg.setFillStyle(0x0d0f1e))
           .on('pointerdown', () => this.scene.restart());

    const menuBg = this.add.rectangle(W * 0.66, btnY, btnW, btnH, 0x0d0f1e)
      .setStrokeStyle(2, 0x3a3f5c, 0.9).setInteractive({ useHandCursor: true }).setDepth(202);
    this.add.text(W * 0.66, btnY, '<- Menu', {
      fontFamily: FONT, fontSize: fs(0.028), fontStyle: 'bold', color: '#94a3b8',
    }).setOrigin(0.5).setDepth(203);
    menuBg.on('pointerover', () => menuBg.setFillStyle(0x1a1c2e))
          .on('pointerout',  () => menuBg.setFillStyle(0x0d0f1e))
          .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.spawnSparkles(W / 2,        H * 0.32, 0x00d4ff);
    this.time.delayedCall(280, () => this.spawnSparkles(W * 0.28, H * 0.52, 0x10b981));
    this.time.delayedCall(560, () => this.spawnSparkles(W * 0.72, H * 0.52, 0xf59e0b));
  }
}

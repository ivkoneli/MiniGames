import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import type { MemoryConfig, MemoryLevel, MemoryPair, CardObject } from './types';
import {
  playCountdownBeep,
  playGoBeep,
} from '../SortingGame/SoundGenerator';
import { haptics } from '../../shared/haptics';

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

export class MemoryGameScene extends BaseGameScene {
  static readonly SCENE_KEY = 'MemoryGame';

  declare protected gameConfig: MemoryConfig;

  // ── Layout ───────────────────────────────────────────────────────────────
  private W = 0;
  private H = 0;
  private HUD_H = 0;

  // ── Session state ────────────────────────────────────────────────────────
  private sessionLevels: MemoryLevel[] = [];
  private sessionIndex  = 0;
  private cards:         CardObject[]  = [];
  private firstFlipped:  CardObject | null = null;
  private inputLocked    = false;
  private matchedPairs   = 0;
  private totalPairs     = 0;
  private moveCount      = 0;

  // ── HUD ─────────────────────────────────────────────────────────────────
  private pairsText!:    Phaser.GameObjects.Text;
  private movesText!:    Phaser.GameObjects.Text;
  private levelText!:    Phaser.GameObjects.Text;

  // ── Flip config ──────────────────────────────────────────────────────────
  private readonly FLIP_HALF = 155;   // ms per half of the flip
  private readonly MISMATCH_DELAY = 850; // ms before flipping unmatched cards back

  constructor() {
    super({ key: MemoryGameScene.SCENE_KEY });
  }

  init(data: MemoryConfig): void {
    super.init(data);
    this.cards        = [];
    this.firstFlipped = null;
    this.inputLocked  = false;
    this.matchedPairs = 0;
    this.totalPairs   = 0;
    this.moveCount    = 0;
    this.sessionIndex = 0;
  }

  // ── BaseGameScene hooks ──────────────────────────────────────────────────

  protected setupUI(): void {
    const { width: W, height: H } = this.scale;
    this.W     = W;
    this.H     = H;
    this.HUD_H = Math.round(H * 0.10);
    const HUD_H = this.HUD_H;
    const FONT  = "'Space Grotesk', sans-serif";
    const fs    = (f: number) => `${Math.round(H * f)}px`;

    // HUD background
    this.add.rectangle(W / 2, HUD_H / 2, W, HUD_H, 0x0d0f1e).setDepth(10);

    // Menu link
    this.add.text(W * 0.025, HUD_H / 2, '<- Menu', {
      fontFamily: FONT, fontSize: fs(0.020), color: '#475569',
    }).setOrigin(0, 0.5).setDepth(20)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    // Pairs counter — centered so text growth doesn't cause overlap
    this.pairsText = this.add.text(W * 0.44, HUD_H / 2, 'Pairs: 0/0', {
      fontFamily: FONT, fontSize: fs(0.022), fontStyle: 'bold', color: '#10b981',
    }).setOrigin(0.5, 0.5).setDepth(20);

    // Moves counter
    this.movesText = this.add.text(W * 0.70, HUD_H / 2, 'Moves: 0', {
      fontFamily: FONT, fontSize: fs(0.022), fontStyle: 'bold', color: '#00d4ff',
    }).setOrigin(0.5, 0.5).setDepth(20);

    // Level progress
    this.levelText = this.add.text(W * 0.975, HUD_H / 2, 'L1/1', {
      fontFamily: FONT, fontSize: fs(0.019), color: '#606880',
    }).setOrigin(1, 0.5).setDepth(20);
  }

  protected setupGame(): void {
    const all = this.gameConfig.levels ?? [];
    this.sessionLevels = shuffle(all).slice(0, Math.min(5, all.length));
    this.sessionIndex  = 0;
    this.loadLevel(0);
  }

  // ── Level management ──────────────────────────────────────────────────────

  private loadLevel(index: number): void {
    const level = this.sessionLevels[index];
    if (!level) { this.showGameComplete(); return; }

    // Destroy any leftover cards from previous level
    this.cards.forEach(c => c.container.destroy());
    this.cards        = [];
    this.firstFlipped = null;
    this.inputLocked  = true;
    this.matchedPairs = 0;
    // moveCount is NOT reset here — it accumulates across the session

    // Select pairs exactly once here — passed all the way to buildGrid
    const pairsNeeded = (level.gridCols * level.gridRows) / 2;
    const chosen      = shuffle(level.pairs).slice(0, pairsNeeded);
    this.totalPairs   = chosen.length;

    this.updateHUD(level);
    this.showLevelIntroCard(level, chosen);
  }

  // ── Level intro card ──────────────────────────────────────────────────────

  private showLevelIntroCard(level: MemoryLevel, pairs: MemoryPair[]): void {
    const W    = this.W, H = this.H;
    const FONT = "'Space Grotesk', sans-serif";
    const fs   = (f: number) => `${Math.round(H * f)}px`;
    const CW   = Math.round(W * 0.82);
    const CH   = Math.round(H * 0.54);
    const col  = hexStr(level.color);

    const intro = this.add.container(W / 2, H * 0.47).setDepth(60);

    // Glow
    const glow = this.add.graphics();
    glow.fillStyle(col, 0.05);
    glow.fillRoundedRect(-CW / 2 - 12, -CH / 2 - 12, CW + 24, CH + 24, 28);

    // Card body
    const bg = this.add.graphics();
    bg.fillStyle(0x0c0e1a, 1);
    bg.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 20);
    bg.lineStyle(2, col, 0.65);
    bg.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, 20);

    // Category label
    const cat = this.add.text(0, -CH * 0.38, level.category.toUpperCase(), {
      fontFamily: FONT, fontSize: fs(0.018), color: '#606880',
    }).setOrigin(0.5);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x252940, 1);
    div.beginPath();
    div.moveTo(-CW * 0.38, -CH * 0.27);
    div.lineTo( CW * 0.38, -CH * 0.27);
    div.strokePath();

    // Title
    const title = this.add.text(0, -CH * 0.12, 'Memory Match', {
      fontFamily: FONT, fontSize: fs(0.040), fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // Pairs info
    const info = this.add.text(0, CH * 0.14, `${this.totalPairs} pairs  ·  ${level.gridCols}×${level.gridRows} grid`, {
      fontFamily: FONT, fontSize: fs(0.022), color: level.color,
    }).setOrigin(0.5);

    // Instruction
    const instr = this.add.text(0, CH * 0.24, 'Find all matching pairs', {
      fontFamily: FONT, fontSize: fs(0.019), color: '#4a5070', align: 'center',
    }).setOrigin(0.5);

    // Ready button
    const btnW = Math.round(CW * 0.44);
    const btnH = Math.round(CH * 0.17);
    const btnY = CH * 0.375;
    let readyLocked = false;

    const readyBg = this.add.rectangle(0, btnY, btnW, btnH, 0x0c0e1a)
      .setStrokeStyle(2, col, 0.9)
      .setInteractive({ useHandCursor: true });
    const readyLbl = this.add.text(0, btnY, 'READY!', {
      fontFamily: FONT, fontSize: fs(0.028), fontStyle: 'bold', color: level.color,
    }).setOrigin(0.5);

    intro.add([glow, bg, cat, div, title, info, instr, readyBg, readyLbl]);

    readyBg
      .on('pointerover', () => { if (!readyLocked) { readyBg.setFillStyle(hexStr(level.color) & 0x111111); readyLbl.setAlpha(0.85); } })
      .on('pointerout',  () => { readyBg.setFillStyle(0x0c0e1a); readyLbl.setAlpha(1); })
      .on('pointerdown', () => {
        if (readyLocked) return;
        readyLocked = true;
        haptics.light();
        this.audio.playClick();
        this.tweens.add({ targets: [readyBg, readyLbl], scaleX: 0.92, scaleY: 0.92, duration: 80 });
        this.time.delayedCall(110, () => {
          this.tweens.add({
            targets: intro,
            scaleX: 0.05, scaleY: 0.05, alpha: 0,
            duration: 260, ease: 'Back.In',
            onComplete: () => {
              intro.destroy();
              this.startCountdown(level, pairs);
            },
          });
        });
      });

    // Pop-in entrance
    intro.setScale(0.1).setAlpha(0);
    this.tweens.add({ targets: intro, scaleX: 1, scaleY: 1, alpha: 1, duration: 380, ease: 'Back.Out' });
  }

  // ── 3-2-1-GO countdown ────────────────────────────────────────────────────

  private startCountdown(level: MemoryLevel, pairs: MemoryPair[]): void {
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
        // Build and show the grid
        this.buildGrid(level, pairs);
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
              onComplete: () => { txt.destroy(); this.time.delayedCall(isGo ? 0 : 60, showStep); },
            });
          });
        },
      });
    };

    showStep();
  }

  // ── Grid building ─────────────────────────────────────────────────────────

  private buildGrid(level: MemoryLevel, pairs: MemoryPair[]): void {
    const W       = this.W, H = this.H;
    const cols    = level.gridCols;
    const rows    = level.gridRows;
    const GAP     = Math.max(Math.round(W * 0.016), 8);
    const GRID_T  = this.HUD_H + Math.round(H * 0.030);
    const availW  = W - Math.round(H * 0.04);
    const availH  = H - GRID_T - Math.round(H * 0.02);

    let CARD_W = Math.floor((availW - GAP * (cols - 1)) / cols);
    let CARD_H = Math.floor((availH - GAP * (rows - 1)) / rows);
    // Cap aspect ratio — cards stay portrait-ish
    CARD_H = Math.min(CARD_H, CARD_W * 1.55);
    CARD_W = Math.min(CARD_W, CARD_H * 0.80);

    const gridW  = CARD_W * cols + GAP * (cols - 1);
    const gridH  = CARD_H * rows + GAP * (rows - 1);
    const startX = (W - gridW) / 2 + CARD_W / 2;
    const startY = GRID_T + (availH - gridH) / 2 + CARD_H / 2;

    // Build card defs from the pre-selected pairs, then shuffle positions
    const cardDefs: Array<{ pairId: string; side: 'a' | 'b'; content: string }> = [];
    for (const p of pairs) {
      cardDefs.push({ pairId: p.id, side: 'a', content: p.a });
      cardDefs.push({ pairId: p.id, side: 'b', content: p.b });
    }
    const shuffled = shuffle(cardDefs);

    this.cards         = [];
    this.firstFlipped  = null;
    this.matchedPairs  = 0;
    // totalPairs already set in loadLevel

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx  = r * cols + c;
        const def  = shuffled[idx];
        const bx   = startX + c * (CARD_W + GAP);
        const by   = startY + r * (CARD_H + GAP);
        const card = this.createCard(def.pairId, def.side, def.content, bx, by, CARD_W, CARD_H, level.color);
        this.cards.push(card);

        // Staggered entrance
        card.container.setAlpha(0).setScale(0.5);
        this.tweens.add({
          targets: card.container, alpha: 1, scaleX: 1, scaleY: 1,
          duration: 240, ease: 'Back.Out',
          delay: idx * 28,
          onComplete: () => {
            if (idx === shuffled.length - 1) {
              this.inputLocked = false;
            }
          },
        });
      }
    }

    this.updateHUD(level);
  }

  // ── Card factory ──────────────────────────────────────────────────────────

  private createCard(
    pairId: string, side: 'a' | 'b', content: string,
    bx: number, by: number, CW: number, CH: number,
    levelColor: string,
  ): CardObject {
    const FONT   = "'Space Grotesk', sans-serif";
    const H      = this.H;
    const fs     = (f: number) => `${Math.round(H * f)}px`;
    const radius = Math.max(Math.round(CW * 0.09), 8);
    const accentH = Math.max(Math.round(CH * 0.06), 4);
    const lcol   = hexStr(levelColor);

    const container = this.add.container(bx, by).setDepth(30);

    // ── Back face ──────────────────────────────────────────────────────────
    const backFace = this.add.graphics();
    backFace.fillStyle(0x0d0f1e, 1);
    backFace.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, radius);
    backFace.lineStyle(1.5, 0x252945, 1);
    backFace.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, radius);
    // Decorative inner diamond pattern
    const dm = Math.min(CW, CH) * 0.18;
    backFace.lineStyle(1, 0x1e2240, 1);
    backFace.beginPath();
    backFace.moveTo(0,  -dm); backFace.lineTo( dm, 0);
    backFace.lineTo(0,   dm); backFace.lineTo(-dm, 0);
    backFace.closePath(); backFace.strokePath();
    // Question mark
    const qStyle = { fontFamily: FONT, fontSize: `${Math.round(Math.min(CW, CH) * 0.38)}px`, fontStyle: 'bold', color: '#1e2240' };
    const qMark  = this.add.text(0, 0, '?', qStyle).setOrigin(0.5);

    // ── Front face ─────────────────────────────────────────────────────────
    const frontFace = this.add.graphics();
    frontFace.fillStyle(0x12131f, 1);
    frontFace.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, radius);
    frontFace.lineStyle(1.5, 0x3a3f6a, 1);
    frontFace.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, radius);
    // Top accent bar
    frontFace.fillStyle(lcol, 0.55);
    frontFace.fillRoundedRect(-CW / 2, -CH / 2, CW, accentH, { tl: radius, tr: radius, bl: 0, br: 0 });

    // Content text — font size scales with card size
    const baseFontF = Math.min(CW * 0.095, CH * 0.13) / H;
    const frontText = this.add.text(0, CH * 0.04, content, {
      fontFamily: FONT,
      fontSize: fs(Math.max(baseFontF, 0.018)),
      fontStyle: 'bold',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: CW - 16 },
    }).setOrigin(0.5);

    // ── Matched glow ───────────────────────────────────────────────────────
    const glowGfx = this.add.graphics();
    glowGfx.fillStyle(0x10b981, 0.12);
    glowGfx.fillRoundedRect(-CW / 2 - 3, -CH / 2 - 3, CW + 6, CH + 6, radius + 3);
    glowGfx.lineStyle(2.5, 0x10b981, 0.9);
    glowGfx.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, radius);
    glowGfx.setVisible(false);

    container.add([glowGfx, backFace, qMark, frontFace, frontText]);

    // Initial state: back visible, front hidden
    frontFace.setVisible(false);
    frontText.setVisible(false);

    const card: CardObject = {
      container, pairId, side, state: 'face-down',
      backFace, frontFace, frontText, glowGfx,
      baseX: bx, baseY: by,
    };

    // Click/tap handler
    backFace.setInteractive(
      new Phaser.Geom.Rectangle(-CW / 2, -CH / 2, CW, CH),
      Phaser.Geom.Rectangle.Contains,
    );
    frontFace.setInteractive(
      new Phaser.Geom.Rectangle(-CW / 2, -CH / 2, CW, CH),
      Phaser.Geom.Rectangle.Contains,
    );

    backFace.on('pointerdown',  () => this.onCardClick(card));
    frontFace.on('pointerdown', () => this.onCardClick(card));

    // Hover effects
    backFace.on('pointerover', () => {
      if (card.state !== 'face-down' || this.inputLocked) return;
      this.tweens.add({ targets: container, y: card.baseY - 5, scaleX: 1.04, scaleY: 1.04, duration: 120, ease: 'Quad.Out' });
    });
    backFace.on('pointerout', () => {
      if (card.state !== 'face-down') return;
      this.tweens.add({ targets: container, y: card.baseY, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.Out' });
    });

    return card;
  }

  // ── Click handler ─────────────────────────────────────────────────────────

  private onCardClick(card: CardObject): void {
    if (this.inputLocked) return;
    if (card.state !== 'face-down') return;

    this.flipUp(card, () => {
      if (!this.firstFlipped) {
        // First card of a pair attempt
        this.firstFlipped = card;
        return;
      }

      // Second card — evaluate
      this.inputLocked = true;
      this.moveCount++;
      const first = this.firstFlipped;
      this.firstFlipped = null;

      if (first.pairId === card.pairId) {
        // ── MATCH ──────────────────────────────────────────────────────────
        haptics.success();
        this.onCorrect(card.baseX, card.baseY);
        this.time.delayedCall(80, () => {
          this.markMatched(first, card);
          this.matchedPairs++;
          const level = this.sessionLevels[this.sessionIndex];
          this.updateHUD(level);
          if (this.matchedPairs >= this.totalPairs) {
            this.time.delayedCall(480, () => this.showLevelComplete());
          } else {
            this.inputLocked = false;
          }
        });
      } else {
        // ── MISMATCH ────────────────────────────────────────────────────────
        haptics.error();
        this.onWrong(card.baseX, card.baseY);
        this.shakePair(first, card);
        this.time.delayedCall(this.MISMATCH_DELAY, () => {
          this.flipDown(first, () => {});
          this.flipDown(card, () => {
            this.inputLocked = false;
          });
        });
      }

      const level = this.sessionLevels[this.sessionIndex];
      this.updateHUD(level);
    });
  }

  // ── Flip animation ────────────────────────────────────────────────────────

  private flipUp(card: CardObject, onDone: () => void): void {
    if (card.state !== 'face-down') { onDone(); return; }
    card.state = 'face-up';
    haptics.light();
    this.audio.playClick();
    this.animateFlip(card, /* toFront */ true, onDone);
  }

  private flipDown(card: CardObject, onDone: () => void): void {
    if (card.state === 'matched') { onDone(); return; }
    card.state = 'face-down';
    this.animateFlip(card, /* toFront */ false, onDone);
  }

  private animateFlip(card: CardObject, toFront: boolean, onDone: () => void): void {
    const con  = card.container;
    const half = this.FLIP_HALF;

    // Phase 1 — collapse
    this.tweens.add({
      targets: con,
      scaleX: 0,
      y: card.baseY - 7,
      duration: half,
      ease: 'Cubic.In',
      onComplete: () => {
        // Swap faces at midpoint
        if (toFront) {
          card.backFace.setVisible(false);
          (con.getAt(2) as Phaser.GameObjects.Text).setVisible(false); // qMark
          card.frontFace.setVisible(true);
          card.frontText.setVisible(true);
        } else {
          card.frontFace.setVisible(false);
          card.frontText.setVisible(false);
          card.backFace.setVisible(true);
          (con.getAt(2) as Phaser.GameObjects.Text).setVisible(true); // qMark
        }
        // Phase 2 — expand
        this.tweens.add({
          targets: con,
          scaleX: 1,
          y: card.baseY,
          duration: half,
          ease: 'Cubic.Out',
          onComplete: onDone,
        });
      },
    });
  }

  // ── Match effects ─────────────────────────────────────────────────────────

  private markMatched(a: CardObject, b: CardObject): void {
    [a, b].forEach(card => {
      card.state = 'matched';
      card.glowGfx.setVisible(true);

      // Bounce-pop celebration
      this.tweens.add({
        targets: card.container,
        scaleX: 1.12, scaleY: 1.12,
        duration: 130, ease: 'Quad.Out', yoyo: true,
        onComplete: () => {
          this.tweens.add({
            targets: card.container,
            scaleX: 1, scaleY: 1,
            duration: 90, ease: 'Quad.In',
          });
        },
      });
    });

    // Sparkle burst between the two cards
    const mx = (a.baseX + b.baseX) / 2;
    const my = (a.baseY + b.baseY) / 2;
    this.spawnSparkles(mx, my, 0x10b981);
    haptics.medium();
    this.audio.playDrop();
  }

  private shakePair(a: CardObject, b: CardObject): void {
    [a, b].forEach(card => {
      const bx = card.baseX;
      this.tweens.add({
        targets: card.container,
        x: { from: bx - 7, to: bx + 7 },
        duration: 40, repeat: 4, yoyo: true,
        onComplete: () => { card.container.x = bx; },
      });
    });
  }

  private spawnSparkles(cx: number, cy: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const dist  = 50 + Math.random() * 45;
      const g     = this.add.graphics().setDepth(150);
      g.fillStyle(color, 1);
      g.fillCircle(0, 0, 2.5 + Math.random() * 3.5);
      g.setPosition(cx, cy);
      this.tweens.add({
        targets: g,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: { from: 1, to: 0 },
        scaleX: { from: 1, to: 0 }, scaleY: { from: 1, to: 0 },
        duration: 460 + Math.random() * 180, ease: 'Quad.Out',
        onComplete: () => g.destroy(),
      });
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private updateHUD(level: MemoryLevel): void {
    this.pairsText.setText(`Pairs: ${this.matchedPairs}/${this.totalPairs}`);
    this.movesText.setText(`Moves: ${this.moveCount}`);
    this.levelText.setText(`L${this.sessionIndex + 1}/${this.sessionLevels.length}`);
    // Color the pairs text based on completion progress
    const pct = this.totalPairs > 0 ? this.matchedPairs / this.totalPairs : 0;
    this.pairsText.setColor(pct >= 1 ? '#00d4ff' : pct >= 0.5 ? '#10b981' : '#10b981');
  }

  // ── Level complete ────────────────────────────────────────────────────────

  private showLevelComplete(): void {
    this.inputLocked = true;
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
      { x: W * 0.28, value: `${s.correct}`,   color: '#10b981', label: 'Pairs Found' },
      { x: W * 0.50, value: `${acc}%`,         color: accColor,  label: 'Accuracy'   },
      { x: W * 0.72, value: `${this.moveCount}`, color: '#00d4ff', label: 'Total Moves' },
    ].forEach(({ x, value, color, label }, i) => {
      const val = this.add.text(x, H * 0.42, value, { ...valStyle, color }).setOrigin(0.5).setDepth(201).setAlpha(0);
      const lbl = this.add.text(x, H * 0.50, label, lblStyle).setOrigin(0.5).setDepth(201).setAlpha(0);
      this.tweens.add({ targets: val, alpha: 1, duration: 280, delay: 350 + i * 80 });
      this.tweens.add({ targets: lbl, alpha: 1, duration: 280, delay: 390 + i * 80 });
    });

    this.add.text(W / 2, H * 0.57, `${s.wrong} misses  |  ${s.total} pair attempts`, {
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

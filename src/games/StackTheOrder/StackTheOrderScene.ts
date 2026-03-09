import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import type { StackOrderConfig, StackOrderLevel, StackOrderItem } from './types';
import { haptics } from '../../shared/haptics';

// ─── Colors ───────────────────────────────────────────────────────────────────
const COL_BLOCK_FILL   = 0x130d2f;
const COL_BLOCK_STROKE = 0x7c3aed;
const COL_HOVER_STROKE = 0xa78bfa;
const COL_SUCCESS_FILL = 0x052d1a;
const COL_SUCCESS_STR  = 0x10b981;
const COL_FAIL_STROKE  = 0xef4444;
const COL_HOOK         = 0x94a3b8;
const COL_GROUND       = 0x4f46e5;
const COL_TEXT         = '#e2e8f0';
const COL_DIM          = '#2d2b55';

interface SelectionEntry {
  item:      StackOrderItem;
  container: Phaser.GameObjects.Container;
  gfx:       Phaser.GameObjects.Graphics;
  homeY:     number;
}

export class StackTheOrderScene extends BaseGameScene {
  static readonly SCENE_KEY = 'StackTheOrderScene';

  // ─── Session ──────────────────────────────────────────────────────────────
  private sessionLevels: StackOrderLevel[] = [];
  private sessionIndex = 0;

  // ─── Level state ──────────────────────────────────────────────────────────
  private currentLevel!: StackOrderLevel;
  private correctOrder:      string[] = [];
  private placedOrder:       string[] = [];
  private selEntries:        SelectionEntry[] = [];
  private stackedContainers: Phaser.GameObjects.Container[] = [];
  private isAnimating = false;
  private levelObjects: Phaser.GameObjects.GameObject[] = [];

  // ─── Hook visuals ─────────────────────────────────────────────────────────
  private hookContainer!:    Phaser.GameObjects.Container;
  private leftHandle!:       Phaser.GameObjects.Rectangle;
  private rightHandle!:      Phaser.GameObjects.Rectangle;
  private hookMoveTween?:    Phaser.Tweens.Tween;
  private leftWiggleTween?:  Phaser.Tweens.Tween;
  private rightWiggleTween?: Phaser.Tweens.Tween;
  private hookSound:         Phaser.Sound.BaseSound | null = null;

  // ─── Persistent HUD ───────────────────────────────────────────────────────
  private levelText!: Phaser.GameObjects.Text;

  // ─── Layout (all relative to canvas, computed once) ───────────────────────
  private W  = 0; private H  = 0;
  private HUD_H    = 0;   // height of question/HUD area at top
  private BLOCK_W  = 0; private BLOCK_H  = 0; private BLOCK_GAP = 0;
  private GROUND_Y = 0;
  private SEL_Y    = 0; private SEL_Y2   = 0; private SEL_GAP  = 0;
  private HOOK_MIN_X = 0; private HOOK_MAX_X = 0;
  private CEIL_Y   = 0; private CEIL_THICK = 0;
  private ROD_LEN  = 0; private BODY_H    = 0; private BODY_W   = 0;
  private HOOK_GRAB_Y = 0;  // world Y of block centre when held

  constructor() { super({ key: StackTheOrderScene.SCENE_KEY }); }

  // ─── Persistent UI (drawn once, survives level reloads) ───────────────────

  protected setupUI(): void {
    // Use scale.width/height to stay in Phaser's physical-pixel coordinate space
    const W  = this.scale.width;
    const H  = this.scale.height;
    const fs = `${Math.round(H * 0.018)}px`;

    this.add.text(Math.round(W * 0.036), Math.round(H * 0.014), '← Menu', {
      fontSize: fs, color: '#475569',
      fontFamily: 'Space Grotesk, sans-serif',
    }).setDepth(20).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.levelText = this.add.text(W - Math.round(W * 0.036), Math.round(H * 0.014), '', {
      fontSize: fs, color: '#64748b',
      fontFamily: 'Space Grotesk, sans-serif',
    }).setOrigin(1, 0).setDepth(20);
  }

  // ─── Game setup ───────────────────────────────────────────────────────────

  protected setupGame(): void {
    const config = this.gameConfig as StackOrderConfig;

    this.W = this.scale.width;
    this.H = this.scale.height;

    // HUD band at the top contains question text; hook lives below it
    this.HUD_H     = Math.round(this.H * 0.165);
    this.BLOCK_W   = Math.round(this.W * 0.155);
    // On portrait mobile, H >> W so 0.083*H makes very tall blocks.
    // Cap BLOCK_H at BLOCK_W*1.1 so blocks stay roughly square on all screens.
    this.BLOCK_H   = Math.min(Math.round(this.H * 0.083), Math.round(this.BLOCK_W * 1.1));
    this.BLOCK_GAP = Math.max(3, Math.round(this.H * 0.006));
    this.GROUND_Y  = Math.round(this.H * 0.820);
    this.SEL_Y     = Math.round(this.H * 0.892);
    this.SEL_Y2    = Math.round(this.H * 0.940);
    this.SEL_GAP   = Math.round(this.W * 0.013);
    this.HOOK_MIN_X = Math.round(this.W * 0.13);
    this.HOOK_MAX_X = Math.round(this.W * 0.87);
    this.CEIL_Y    = this.HUD_H;
    this.CEIL_THICK = Math.max(2, Math.round(this.H * 0.010));
    this.ROD_LEN   = Math.round(this.H * 0.090);
    this.BODY_H    = Math.round(this.H * 0.052);
    this.BODY_W    = Math.round(this.W * 0.100);

    // Block centre in world-Y while hanging from hook
    this.HOOK_GRAB_Y =
      this.CEIL_Y + this.CEIL_THICK + this.ROD_LEN + this.BODY_H +
      Math.round(this.BLOCK_H / 2);

    // Shuffle and pick up to 5 levels for this session
    const shuffled = Phaser.Utils.Array.Shuffle([...config.levels]) as StackOrderLevel[];
    this.sessionLevels = shuffled.slice(0, Math.min(5, shuffled.length));
    this.sessionIndex  = 0;

    this.drawBackground();
    this.loadLevel(0);
  }

  // ─── Static dot-grid background ───────────────────────────────────────────

  private drawBackground(): void {
    const { W, H } = this;
    const bg   = this.add.graphics();
    const step = Math.round(W / 22);
    bg.fillStyle(0x1a1040, 0.22);
    for (let x = 0; x <= W; x += step)
      for (let y = 0; y <= H; y += step)
        bg.fillCircle(x, y, 1);
  }

  // ─── Level lifecycle ──────────────────────────────────────────────────────

  private loadLevel(idx: number): void {
    this.clearLevel();

    this.currentLevel = this.sessionLevels[idx];
    this.correctOrder = [...this.currentLevel.items]
      .sort((a, b) => a.order - b.order)
      .map(i => i.id);
    this.placedOrder  = [];
    this.isAnimating  = false;

    this.levelText.setText(`Round ${idx + 1} / ${this.sessionLevels.length}`);

    this.buildGround();
    this.buildHook();
    this.buildHUD();
    this.buildSelectionTray();
  }

  private clearLevel(): void {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.hookSound?.stop();
    this.hookSound        = null;
    this.hookMoveTween    = undefined;
    this.leftWiggleTween  = undefined;
    this.rightWiggleTween = undefined;
    for (const obj of this.levelObjects)
      if (obj?.active) obj.destroy();
    this.levelObjects      = [];
    this.selEntries        = [];
    this.stackedContainers = [];
  }

  private tr<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.levelObjects.push(obj);
    return obj;
  }

  // ─── Ground platform ──────────────────────────────────────────────────────

  private buildGround(): void {
    const { W, H, GROUND_Y } = this;
    const barH = Math.round(H * 0.013);
    const gfx  = this.tr(this.add.graphics());
    gfx.fillStyle(COL_GROUND, 0.06);
    gfx.fillRect(W * 0.05, GROUND_Y - barH * 3, W * 0.90, barH * 2);
    gfx.fillStyle(COL_GROUND, 0.18);
    gfx.fillRect(W * 0.05, GROUND_Y - barH * 0.5, W * 0.90, barH * 0.5);
    gfx.fillStyle(COL_GROUND, 1);
    gfx.fillRoundedRect(W * 0.05, GROUND_Y, W * 0.90, barH, 3);
  }

  // ─── Hook mechanism ───────────────────────────────────────────────────────
  //
  // The hook Container sits at world (hookX, 0).
  // All hook parts are drawn in local coords starting at y = CEIL_Y,
  // so the ceiling bar is always at HUD_H regardless of hook x.

  private buildHook(): void {
    const { W, CEIL_Y, CEIL_THICK, ROD_LEN, BODY_H, BODY_W, HOOK_MIN_X, HOOK_MAX_X } = this;

    const rodW    = Math.max(2, Math.round(W * 0.005));
    const handleW = Math.max(3, Math.round(W * 0.005));
    const handleH = Math.round(this.H * 0.028);
    const bodyTop = CEIL_Y + CEIL_THICK + ROD_LEN;

    // Static ceiling bar (full-width, drawn once as a separate object)
    const ceiling = this.tr(this.add.graphics());
    ceiling.fillStyle(COL_HOOK, 0.26);
    ceiling.fillRect(0, CEIL_Y, W, CEIL_THICK);
    ceiling.fillStyle(COL_HOOK, 0.10);
    ceiling.fillRect(0, CEIL_Y + CEIL_THICK, W, Math.round(this.H * 0.007));

    // Moving hook graphics (drawn in local coords of hookContainer)
    const hookGfx = this.add.graphics();

    // Vertical rod descending from ceiling
    hookGfx.fillStyle(COL_HOOK, 1);
    hookGfx.fillRect(-Math.floor(rodW / 2), CEIL_Y + CEIL_THICK, rodW, ROD_LEN);

    // Hook body
    hookGfx.fillStyle(0x1e1b4b, 1);
    hookGfx.fillRoundedRect(-BODY_W / 2, bodyTop, BODY_W, BODY_H, 5);
    hookGfx.lineStyle(Math.round(W * 0.0035), COL_HOOK, 1);
    hookGfx.strokeRoundedRect(-BODY_W / 2, bodyTop, BODY_W, BODY_H, 5);
    hookGfx.fillStyle(COL_HOOK, 0.18);
    hookGfx.fillRect(-BODY_W / 2 + 4, bodyTop + 5, BODY_W - 8, Math.round(BODY_H * 0.22));

    // Handles — separate Rectangles so they can wiggle independently
    const handleY = bodyTop + Math.round(BODY_H * 0.28);
    this.leftHandle = this.add.rectangle(
      -Math.round(BODY_W / 2) - Math.floor(handleW / 2),
      handleY, handleW, handleH, COL_HOOK,
    );
    this.leftHandle.setOrigin(0.5, 0).setAngle(-20);

    this.rightHandle = this.add.rectangle(
      Math.round(BODY_W / 2) + Math.floor(handleW / 2),
      handleY, handleW, handleH, COL_HOOK,
    );
    this.rightHandle.setOrigin(0.5, 0).setAngle(20);

    this.hookContainer = this.tr(
      this.add.container(HOOK_MIN_X, 0, [hookGfx, this.leftHandle, this.rightHandle]),
    );

    this.hookMoveTween = this.tweens.add({
      targets: this.hookContainer,
      x: { from: HOOK_MIN_X, to: HOOK_MAX_X },
      duration: 2700, ease: 'Sine.InOut', yoyo: true, repeat: -1,
    });
    this.leftWiggleTween = this.tweens.add({
      targets: this.leftHandle,
      angle: { from: -20, to: -42 },
      duration: 280, ease: 'Sine.InOut', yoyo: true, repeat: -1,
    });
    this.rightWiggleTween = this.tweens.add({
      targets: this.rightHandle,
      angle: { from: 20, to: 42 },
      duration: 280, ease: 'Sine.InOut', yoyo: true, repeat: -1,
    });

    // Ambient hook-movement loop (plays while hook is sweeping)
    if (this.cache.audio.exists('sfx-hook')) {
      this.hookSound = this.sound.add('sfx-hook', { loop: true, volume: 0.22 });
      this.hookSound.play();
    }
  }

  // ─── Per-level HUD (question band above the hook) ─────────────────────────

  private buildHUD(): void {
    const { W, H, HUD_H } = this;
    const total   = this.sessionLevels.length;
    const current = this.sessionIndex + 1;

    // Separator below HUD band
    const sep = this.tr(this.add.graphics());
    sep.fillStyle(0xffffff, 0.05);
    sep.fillRect(0, HUD_H - 1, W, 1);

    // Progress dots (top of HUD band)
    const dotR       = Math.round(W * 0.007);
    const dotSpacing = Math.round(W * 0.036);
    const dotStartX  = W / 2 - ((total - 1) * dotSpacing) / 2;
    const dotY       = Math.round(H * 0.026);
    for (let i = 0; i < total; i++) {
      const dot = this.tr(this.add.graphics());
      dot.fillStyle(i < current ? 0x7c3aed : 0x2d2b55);
      dot.fillCircle(dotStartX + i * dotSpacing, dotY, dotR);
    }

    // Category badge
    this.tr(this.add.text(W / 2, Math.round(H * 0.050),
      this.currentLevel.category.toUpperCase(), {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: `${Math.round(H * 0.020)}px`,
        color: '#7c3aed', fontStyle: 'bold', letterSpacing: 2,
      },
    ).setOrigin(0.5));

    // Question text — fits within HUD band, above the ceiling bar
    this.tr(this.add.text(W / 2, Math.round(H * 0.082),
      this.currentLevel.question, {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: `${Math.round(H * 0.026)}px`,
        color: COL_TEXT,
        wordWrap: { width: W * 0.78 },
        align: 'center',
      },
    ).setOrigin(0.5, 0));

    // Instruction hint just above the selection tray
    this.tr(this.add.text(W / 2, Math.round(H * 0.770),
      'Click a block to place it on the stack', {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: `${Math.round(H * 0.022)}px`,
        color: COL_DIM,
      },
    ).setOrigin(0.5));
  }

  // ─── Selection tray ───────────────────────────────────────────────────────

  private buildSelectionTray(): void {
    const { BLOCK_W, BLOCK_H, H } = this;
    const items     = Phaser.Utils.Array.Shuffle([...this.currentLevel.items]) as StackOrderItem[];
    const positions = this.computeSelectionPositions(items.length);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { x, y } = positions[i];

      const gfx = this.add.graphics();
      this.drawBlock(gfx, BLOCK_W, BLOCK_H, 6, COL_BLOCK_FILL, COL_BLOCK_STROKE, 2);

      const lbl = this.add.text(0, 0, item.label, {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: `${Math.round(H * 0.022)}px`,
        color: COL_TEXT, align: 'center',
        wordWrap: { width: BLOCK_W - 8, useAdvancedWrap: true },
      }).setOrigin(0.5);

      const startY = y + Math.round(H * 0.020);
      const cont   = this.tr(this.add.container(x, startY, [gfx, lbl]));
      cont.setSize(BLOCK_W, BLOCK_H).setAlpha(0);

      const entry: SelectionEntry = { item, container: cont, gfx, homeY: y };
      this.selEntries.push(entry);

      this.tweens.add({
        targets: cont, alpha: 1, y,
        duration: 330, delay: i * 60, ease: 'Back.Out',
        onComplete: () => { entry.homeY = cont.y; },
      });

      cont.setInteractive({ useHandCursor: true });
      cont.on('pointerover', () => {
        if (this.isAnimating || cont.alpha < 0.8) return;
        this.drawBlock(gfx, BLOCK_W, BLOCK_H, 6, COL_BLOCK_FILL, COL_HOVER_STROKE, 2.5);
      });
      cont.on('pointerout', () => {
        if (cont.alpha < 0.8) return;
        this.drawBlock(gfx, BLOCK_W, BLOCK_H, 6, COL_BLOCK_FILL, COL_BLOCK_STROKE, 2);
      });
      cont.on('pointerdown', () => {
        if (this.isAnimating || cont.alpha < 0.8) return;
        this.onBlockClicked(entry);
      });
    }
  }

  private computeSelectionPositions(n: number): { x: number; y: number }[] {
    const { W, BLOCK_W, SEL_GAP, SEL_Y, SEL_Y2 } = this;
    const positions: { x: number; y: number }[] = [];

    const makeRow = (count: number, y: number) => {
      const totalW = count * BLOCK_W + (count - 1) * SEL_GAP;
      const startX = W / 2 - totalW / 2 + BLOCK_W / 2;
      for (let i = 0; i < count; i++)
        positions.push({ x: Math.round(startX + i * (BLOCK_W + SEL_GAP)), y });
    };

    if (n <= 5) { makeRow(n, SEL_Y); }
    else        { makeRow(Math.ceil(n / 2), SEL_Y); makeRow(n - Math.ceil(n / 2), SEL_Y2); }
    return positions;
  }

  // ─── Block graphics helper ────────────────────────────────────────────────

  private drawBlock(
    gfx: Phaser.GameObjects.Graphics,
    w: number, h: number, r: number,
    fill: number, stroke: number, sw: number,
  ): void {
    gfx.clear();
    gfx.fillStyle(fill);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    gfx.lineStyle(sw, stroke);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }

  // ─── Block click → placement sequence ────────────────────────────────────

  private onBlockClicked(entry: SelectionEntry): void {
    this.isAnimating = true;
    haptics.light();
    this.audio.playClick();

    // Dim all other entries while this block is in transit
    for (const e of this.selEntries) {
      if (e !== entry) {
        e.container.disableInteractive();
        this.tweens.add({ targets: e.container, alpha: 0.22, duration: 200 });
      }
    }

    const hookX = this.hookContainer.x;
    this.hookMoveTween?.pause();
    this.leftWiggleTween?.pause();
    this.rightWiggleTween?.pause();
    (this.hookSound as any)?.pause?.();
    this.tweens.add({ targets: this.leftHandle,  angle: -20, duration: 130 });
    this.tweens.add({ targets: this.rightHandle, angle:  20, duration: 130 });

    this.animateFlyToHook(entry, hookX, () => {
      this.animateHookToCenter(entry, () => {
        this.animateDrop(entry, this.placedOrder.length, () => {
          this.onBlockLanded(entry);
        });
      });
    });
  }

  private animateFlyToHook(entry: SelectionEntry, hookX: number, onDone: () => void): void {
    this.tweens.add({
      targets: entry.container,
      x: hookX, y: this.HOOK_GRAB_Y,
      duration: 440, ease: 'Quad.Out',
      onComplete: () => {
        this.tweens.add({
          targets: this.hookContainer,
          y: -Math.round(this.H * 0.009),
          duration: 80, yoyo: true, ease: 'Quad.Out',
          onComplete: onDone,
        });
      },
    });
  }

  private animateHookToCenter(entry: SelectionEntry, onDone: () => void): void {
    // Hook is now moving → resume ambient sound immediately
    (this.hookSound as any)?.resume?.();
    this.tweens.add({
      targets: [this.hookContainer, entry.container],
      x: Math.round(this.W / 2),
      duration: 560, ease: 'Sine.InOut',
      onComplete: onDone,
    });
  }

  private animateDrop(entry: SelectionEntry, stackIdx: number, onDone: () => void): void {
    this.tweens.add({
      targets: entry.container,
      y: this.getStackCenterY(stackIdx),
      duration: 380, ease: 'Quad.In',
      onComplete: onDone,
    });
  }

  private getStackCenterY(n: number): number {
    return this.GROUND_Y - Math.round(this.BLOCK_H / 2) - n * (this.BLOCK_H + this.BLOCK_GAP);
  }

  // ─── Block landed ─────────────────────────────────────────────────────────

  private onBlockLanded(entry: SelectionEntry): void {
    // Squash-and-stretch impact
    this.tweens.add({
      targets: entry.container,
      scaleX: { from: 1.22, to: 1 },
      scaleY: { from: 0.70, to: 1 },
      duration: 300, ease: 'Back.Out',
    });
    haptics.medium();
    this.audio.playPlace();

    // Block is now placed — disable interaction permanently
    entry.container.disableInteractive();

    this.placedOrder.push(entry.item.id);
    this.stackedContainers.push(entry.container);

    const idx = this.selEntries.indexOf(entry);
    if (idx !== -1) this.selEntries.splice(idx, 1);

    this.time.delayedCall(300, () => {
      if (this.placedOrder.length >= this.currentLevel.items.length) {
        this.hookSound?.stop();
        this.hookSound = null;
        this.evaluateOrder();
      } else {
        for (const e of this.selEntries) {
          e.container.setInteractive({ useHandCursor: true });
          this.tweens.add({ targets: e.container, alpha: 1, duration: 200 });
        }
        this.hookMoveTween?.resume();
        this.leftWiggleTween?.resume();
        this.rightWiggleTween?.resume();
        this.isAnimating = false;
      }
    });
  }

  // ─── Evaluation ───────────────────────────────────────────────────────────
  //
  // Correct:  sway dir → slam 0 → sway -dir → slam 0 → stabilise green
  // Wrong:    strong lean to dir → blocks fall + scatter to ground

  private evaluateOrder(): void {
    this.isAnimating = true;
    const isCorrect = this.placedOrder.every((id, i) => id === this.correctOrder[i]);
    const dir = Math.random() < 0.5 ? -1 : 1;

    if (isCorrect) {
      // Three escalating sways, each lean more dramatic than the last.
      // Top-block angles: ~17° → ~27° → ~40°. Between each: violent Back.Out snap.
      // Whoosh plays at the start of each sway phase.
      // Total duration ≈ 2.8 s before resolveCorrect fires.
      this.audio.playWhoosh();
      this.swayBlocks(dir,  0.30, 52, 580, 'Sine.InOut', () => {
        this.audio.playDrop();
        this.snapBlocksCenter(230, () => {
          this.audio.playWhoosh();
          this.swayBlocks(-dir, 0.48, 78, 650, 'Sine.InOut', () => {
            this.audio.playDrop();
            this.snapBlocksCenter(250, () => {
              this.audio.playWhoosh();
              this.swayBlocks(dir, 0.70, 108, 780, 'Sine.InOut', () => {
                this.audio.playDrop();
                this.snapBlocksCenter(280, () => this.resolveCorrect());
              });
            });
          });
        });
      });
    } else {
      // Phase 1: moderate lean (≈16°) — tower wobbles, player worries.
      // Phase 2: VERY dramatic lean (≈37°) on the opposite side — clearly going to fall.
      // Snap between phases uses Sine.InOut so the glide through neutral is visible.
      // Second sway uses Cubic.In so it accelerates into the final lean for maximum drama.
      this.audio.playWhoosh();
      this.swayBlocks(dir,  0.28, 50, 680, 'Sine.InOut', () => {
        this.snapBlocksCenter(400, () => {
          this.audio.playWhoosh();
          this.swayBlocks(-dir, 0.65, 98, 850, 'Cubic.In', () => {
            this.dropBlocks(-dir);
          });
        }, 'Sine.InOut');
      });
    }
  }

  // Sway each block with progressive rotation + x drift.
  // Bottom block (i=0): factor ≈ 1/n (small). Top (i=n-1): factor ≈ 1 (full).
  private swayBlocks(
    dir: number, maxAngle: number, maxDrift: number,
    duration: number, ease: string, onComplete: () => void,
  ): void {
    const n = this.stackedContainers.length;
    if (n === 0) { onComplete(); return; }
    let done = 0;
    for (let i = 0; i < n; i++) {
      const cont = this.stackedContainers[i];
      const factor = (i + 1) / n;
      this.tweens.add({
        targets: cont,
        rotation: maxAngle * factor * dir,
        x: this.W / 2 + maxDrift * factor * dir,
        duration, ease,
        onComplete: () => { if (++done === n) onComplete(); },
      });
    }
  }

  // Snap all blocks back to centre.
  // ease='Back.Out' (default) for win — bouncy smack.
  // ease='Sine.InOut' for wrong — smooth glide through neutral.
  private snapBlocksCenter(duration: number, onComplete: () => void, ease = 'Back.Out'): void {
    const n = this.stackedContainers.length;
    if (n === 0) { onComplete(); return; }
    let done = 0;
    for (const cont of this.stackedContainers) {
      this.tweens.add({
        targets: cont,
        rotation: 0, x: this.W / 2,
        duration, ease,
        onComplete: () => { if (++done === n) onComplete(); },
      });
    }
  }

  // ─── Correct outcome ──────────────────────────────────────────────────────

  private resolveCorrect(): void {
    const { BLOCK_W, BLOCK_H, W, H, GROUND_Y } = this;

    for (const cont of this.stackedContainers) {
      this.drawBlock(
        cont.getAt(0) as Phaser.GameObjects.Graphics,
        BLOCK_W, BLOCK_H, 6, COL_SUCCESS_FILL, COL_SUCCESS_STR, 2,
      );
    }

    this.cameras.main.flash(200, 16, 185, 129, false);
    haptics.success();
    this.onCorrect(W / 2, GROUND_Y);

    const msg = this.tr(this.add.text(
      W / 2, Math.round(GROUND_Y - H * 0.38),
      '✓ Correct Order!', {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: `${Math.round(H * 0.038)}px`,
        color: '#10b981', fontStyle: 'bold',
      },
    ).setOrigin(0.5).setAlpha(0).setDepth(50));
    this.tweens.add({ targets: msg, alpha: 1, y: msg.y - 20, duration: 350, ease: 'Back.Out' });

    this.time.delayedCall(1600, () => {
      this.sessionIndex++;
      if (this.sessionIndex < this.sessionLevels.length) this.loadLevel(this.sessionIndex);
      else                                                this.showResultsScreen();
    });
  }

  // ─── Wrong outcome — blocks fall with arc physics ─────────────────────────
  //
  // Landing positions are pre-computed geometrically so no block overlaps another.
  // For a block at rotation θ, horizontal half-extent = W/2·|cos θ| + H/2·|sin θ|.
  // Each block's left edge is placed just past the previous block's right edge.
  //
  // Block 0: snaps back upright, never falls.
  // Block 1: "slides down" block 0 — delayed x start so it falls first, then slides.
  // Blocks 2+: arc physics (x=Sine.Out, y=Quad.In), staggered 140 ms apart.
  // Top block rolls off screen ONLY when n >= 5.

  private dropBlocks(dir: number): void {
    const { W, H, GROUND_Y, BLOCK_H, BLOCK_W } = this;
    const n = this.stackedContainers.length;

    for (const cont of this.stackedContainers) {
      this.drawBlock(cont.getAt(0) as Phaser.GameObjects.Graphics,
        BLOCK_W, BLOCK_H, 6, 0x1f0a0a, COL_FAIL_STROKE, 2);
    }
    haptics.error();
    this.onWrong(W / 2, GROUND_Y);   // wrong.mp3 + score recorded immediately

    // ── Pre-compute non-overlapping landing positions ────────────────────────
    // hExtent(θ) = half the block's horizontal footprint when rotated by θ
    const hExtent = (θ: number) =>
      BLOCK_W / 2 * Math.cos(θ) + BLOCK_H / 2 * Math.sin(θ);
    const vExtent = (θ: number) =>
      BLOCK_W / 2 * Math.sin(θ) + BLOCK_H / 2 * Math.cos(θ);

    const landX   = new Array<number>(n).fill(W / 2);
    const landRot = new Array<number>(n).fill(0);

    // Block 0 stays upright at centre.
    // Blocks 1…(n-1) fan out in `dir` direction with even spacing.
    // For n ≥ 5, the top block (i=n-1, falls first) is allowed off-screen —
    // it lands near the edge for a visible ricochet hit then rolls off.
    // All other blocks must remain visible on screen.
    const onScreen = n >= 5 ? n - 2 : n - 1;   // visible falling blocks (excl. block 0)
    const availW   = (W / 2 - BLOCK_W * 0.55) * 0.88; // usable width from centre to edge
    const step     = availW / Math.max(onScreen, 1);


  const layout = [
    { x: 0.00, rot: 0.00 },  // block 0 (center)
    { x: 0.125, rot: 0.58 },  // block 1
    { x: 0.23, rot: 0.70 },  // block 2
    { x: 0.38, rot: 0.38 },  // block 3
    { x: 0.70, rot: 0.48 }   // block 4
  ];

  for (let i = 1; i < n; i++) {
    const conf = layout[Math.min(i, layout.length - 1)];
    landRot[i] = dir * conf.rot;
    landX[i] = W / 2 + dir * (conf.x * W);
  }

    // For n≥5: override top block's x so it hits near the screen edge (visible impact)
    if (n >= 5) landX[n - 1] = W / 2 + dir * W * 0.43;

    // Landing y: lowest corner of the rotated block sits flush on GROUND_Y
    const landY = landRot.map(rot =>
      GROUND_Y - vExtent(Math.abs(rot)));

    // ── Animate ──────────────────────────────────────────────────────────────
    const yDur     = 380;
    const stagger  = 140;
    const doRico   = n >= 5;         // ricochet only in 5-block levels
    let lastLandMs = 0;

    for (let i = 0; i < n; i++) {
      const cont  = this.stackedContainers[i];
      const delay = (n - 1 - i) * stagger;   // top (i=n-1) falls first

      // Block 0: reset to upright, no fall
      if (i === 0) {
        this.tweens.add({ targets: cont, x: W / 2, rotation: 0,
          duration: 300, ease: 'Sine.InOut' });
        continue;
      }

      const isTop    = (i === n - 1);
      const factor   = i / Math.max(n - 1, 1);
      lastLandMs     = Math.max(lastLandMs, delay + yDur);

      // ── Y: gravity ─────────────────────────────────────────────────────────
      this.tweens.add({
        targets: cont, y: landY[i],
        duration: yDur, delay, ease: 'Quad.In',
        onComplete: () => {
          haptics.medium();
          this.audio.playCollide();

          if (isTop && doRico) {
            // 5-block top block: squash → brief settle → roll off screen
            this.tweens.add({
              targets: cont,
              scaleX: { from: 1.32, to: 1 }, scaleY: { from: 0.68, to: 1 },
              duration: 130, ease: 'Back.Out',
              onComplete: () => {
                this.cameras.main.shake(260, 0.012);
                this.time.delayedCall(110, () => {
                  this.tweens.add({
                    targets: cont,
                    y: H + BLOCK_H * 2,
                    x: cont.x + dir * W * 0.30,
                    rotation: cont.rotation + dir * Math.PI * 1.5,
                    duration: 500, ease: 'Quad.In',
                  });
                });
              },
            });
          } else {
            // Normal squash on landing
            const sq = 0.08 + factor * 0.20;
            this.tweens.add({
              targets: cont,
              scaleX: { from: 1 + sq, to: 1 },
              scaleY: { from: 1 - sq * 0.58, to: 1 },
              duration: 148, ease: 'Back.Out',
            });
            if (isTop) this.cameras.main.shake(220, 0.010);
            else if (i === 1) this.cameras.main.shake(160, 0.006);
          }
        },
      });

      // ── X ─────────────────────────────────────────────────────────────────
      if (i === 1) {
        // Block 1 "slides down" block 0:
        //   falls mostly straight first, then slides sideways into its rest position.
        //   Achieved by delaying x until 30% into the fall.
        this.tweens.add({
          targets: cont, x: landX[1],
          duration: yDur * 0.80,
          delay: delay + Math.round(yDur * 0.30),
          ease: 'Cubic.Out',
        });
      } else {
        // Arc momentum for all other blocks
        this.tweens.add({
          targets: cont, x: landX[i],
          duration: yDur * 1.20, delay, ease: 'Sine.Out',
        });
      }

      // ── Rotation: tumbles during fall ──────────────────────────────────────
      this.tweens.add({
        targets: cont, rotation: landRot[i],
        duration: yDur * 0.85, delay, ease: 'Quad.In',
      });
    }

    // Message fires after everything settles.
    // If a ricochet happened add its extra time (squash 130 + pause 110 + fall 500 = 740 ms).
    const ricoMs = doRico ? yDur + 740 : 0;
    const msgMs  = Math.max(lastLandMs, ricoMs) + 160;

    this.time.delayedCall(msgMs, () => {
      const msg = this.tr(this.add.text(
        W / 2, Math.round(H * 0.480), 'Wrong order!', {
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: `${Math.round(H * 0.036)}px`,
          color: '#ef4444', fontStyle: 'bold',
        }).setOrigin(0.5).setAlpha(0).setDepth(50));
      this.tweens.add({ targets: msg, alpha: 1, duration: 280 });

      this.time.delayedCall(700, () => {
        this.showRetryButton();
        this.isAnimating = false;
      });
    });
  }

  // ─── Retry button ─────────────────────────────────────────────────────────

  private showRetryButton(): void {

    this.hookSound?.stop();
    this.hookSound = null;

    const { W, H } = this;
    const cy   = Math.round(H * 0.578);
    const btnW = Math.round(W * 0.420);
    const btnH = Math.round(H * 0.072);
    const fs   = Math.round(H * 0.030);

    const btnGfx = this.tr(this.add.graphics().setAlpha(0));
    const btnLbl = this.tr(this.add.text(W / 2, cy, 'Try Again  →', {
      fontFamily: 'Space Grotesk, sans-serif', fontSize: `${fs}px`, color: COL_TEXT,
    }).setOrigin(0.5).setAlpha(0));

    this.drawBtn(btnGfx, W / 2, cy, btnW, btnH, 0x2d2b55, COL_BLOCK_STROKE);
    this.tweens.add({ targets: [btnGfx, btnLbl], alpha: 1, duration: 280 });

    const zone = this.tr(
      this.add.zone(W / 2, cy, btnW, btnH).setInteractive({ useHandCursor: true }),
    );
    zone.on('pointerover', () => this.drawBtn(btnGfx, W / 2, cy, btnW, btnH, 0x3d3580, COL_HOVER_STROKE));
    zone.on('pointerout',  () => this.drawBtn(btnGfx, W / 2, cy, btnW, btnH, 0x2d2b55, COL_BLOCK_STROKE));
    zone.on('pointerdown', () => {
      haptics.light();
      this.audio.playClick();
      this.loadLevel(this.sessionIndex);   // same level, no extra penalty
    });
  }

  private drawBtn(
    gfx: Phaser.GameObjects.Graphics,
    cx: number, cy: number, w: number, h: number,
    fill: number, stroke: number,
  ): void {
    gfx.clear();
    gfx.fillStyle(fill);
    gfx.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    gfx.lineStyle(1.5, stroke);
    gfx.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
  }

  // ─── Results screen — matches BalancingGame card style ────────────────────

  private showResultsScreen(): void {

    this.hookSound?.stop();
    this.hookSound = null;
    const { W, H } = this;
    const s     = this.score;
    const total = this.sessionLevels.length;
    const pct   = total > 0 ? Math.round((s.correct / total) * 100) : 0;
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚';

    this.onComplete();

    // Dark overlay
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100);
    this.tweens.add({ targets: overlay, alpha: 0.75, duration: 320 });

    // Card
    const cardW = Math.round(W * 0.58);
    const cardH = Math.round(H * 0.56);
    const card  = this.add.rectangle(W / 2, H / 2, cardW, cardH, 0x0d0f1e)
      .setStrokeStyle(1, 0xffffff, 0.10)
      .setDepth(101).setScale(0.82).setAlpha(0);
    this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, alpha: 1, duration: 340, delay: 100, ease: 'Back.Out' });

    const ts = (sz: number, c: string): Phaser.Types.GameObjects.Text.TextStyle =>
      ({ fontFamily: 'Space Grotesk, sans-serif', fontSize: `${sz}px`, color: c });
    const fs = Math.round(H * 0.026);

    const els = [
      this.add.text(W / 2, H / 2 - H * 0.19, emoji,
        { fontSize: `${Math.round(H * 0.082)}px` }).setOrigin(0.5).setDepth(102),
      this.add.text(W / 2, H / 2 - H * 0.09, 'Complete!',
        ts(Math.round(H * 0.048), '#e2e8f0')).setOrigin(0.5).setDepth(102),
      this.add.text(W / 2, H / 2 - H * 0.01, `${s.correct} / ${total} correct`,
        ts(fs, '#94a3b8')).setOrigin(0.5).setDepth(102),
      this.add.text(W / 2, H / 2 + H * 0.07, `${pct}%`,
        ts(Math.round(H * 0.040), pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'))
        .setOrigin(0.5).setDepth(102),
    ];
    els.forEach(el => el.setAlpha(0));
    this.tweens.add({ targets: els, alpha: 1, duration: 280, delay: 280 });

    const again = this.add.text(W / 2 - W * 0.10, H / 2 + H * 0.19, 'Play Again',
      ts(Math.round(H * 0.026), '#a78bfa'))
      .setOrigin(0.5).setDepth(102).setAlpha(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#c4b5fd'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#a78bfa'); })
      .on('pointerdown', () => { this.scene.restart(); });

    const menu = this.add.text(W / 2 + W * 0.10, H / 2 + H * 0.19, '← Menu',
      ts(Math.round(H * 0.026), '#475569'))
      .setOrigin(0.5).setDepth(102).setAlpha(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) { this.setColor('#94a3b8'); })
      .on('pointerout',  function (this: Phaser.GameObjects.Text) { this.setColor('#475569'); })
      .on('pointerdown', () => { window.location.href = import.meta.env.BASE_URL; });

    this.tweens.add({ targets: [again, menu], alpha: 1, duration: 240, delay: 420 });
  }
}

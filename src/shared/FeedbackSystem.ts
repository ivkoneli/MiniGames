import Phaser from 'phaser';

/**
 * Reusable animation toolkit for game feedback.
 * Pass the current scene in the constructor.
 *
 * All methods are fire-and-forget — they clean up after themselves.
 */
export class FeedbackSystem {
  constructor(private scene: Phaser.Scene) {}

  // ─── Correct / wrong flashes ──────────────────────────────────

  showCorrect(x?: number, y?: number): void {
    const cx = x ?? this.scene.scale.width / 2;
    const cy = y ?? this.scene.scale.height / 2;

    const fs = Math.round(this.scene.scale.height * 0.10);
    const text = this.scene.add
      .text(cx, cy, '✓', { fontSize: `${fs}px`, color: '#10b981' })
      .setOrigin(0.5)
      .setDepth(200)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: text,
      alpha: 1,
      scaleX: { from: 0.4, to: 1.1 },
      scaleY: { from: 0.4, to: 1.1 },
      duration: 200,
      ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          alpha: 0,
          y: cy - Math.round(this.scene.scale.height * 0.04),
          duration: 400,
          delay: 250,
          ease: 'Quad.In',
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  showWrong(x?: number, y?: number): void {
    const cx = x ?? this.scene.scale.width / 2;
    const cy = y ?? this.scene.scale.height / 2;

    const fs = Math.round(this.scene.scale.height * 0.10);
    const text = this.scene.add
      .text(cx, cy, '✗', { fontSize: `${fs}px`, color: '#ef4444' })
      .setOrigin(0.5)
      .setDepth(200)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: text,
      alpha: 1,
      scaleX: { from: 0.4, to: 1 },
      scaleY: { from: 0.4, to: 1 },
      duration: 150,
      ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: text,
          alpha: 0,
          duration: 400,
          delay: 250,
          onComplete: () => text.destroy(),
        });
      },
    });

    this.scene.cameras.main.shake(280, 0.007);
  }

  // ─── Object animations ────────────────────────────────────────

  /** Quick horizontal wiggle — use on wrong drop targets */
  wiggle(target: Phaser.GameObjects.GameObject & { x: number }): void {
    const originX = target.x;
    this.scene.tweens.add({
      targets: target,
      x: { from: originX - 10, to: originX + 10 },
      duration: 60,
      repeat: 3,
      yoyo: true,
      ease: 'Sine.InOut',
      onComplete: () => { target.x = originX; },
    });
  }

  /** Squash-and-stretch pop — use when an item snaps into a correct slot */
  popIn(target: Phaser.GameObjects.GameObject): void {
    this.scene.tweens.add({
      targets: target,
      scaleX: { from: 0, to: 1 },
      scaleY: { from: 0, to: 1 },
      duration: 320,
      ease: 'Back.Out',
    });
  }

  /** Smooth snap to position with squash landing — use on correct drag-drops */
  snapTo(
    target: Phaser.GameObjects.GameObject & { x: number; y: number },
    toX: number,
    toY: number,
    onComplete?: () => void,
  ): void {
    this.scene.tweens.add({
      targets: target,
      x: toX,
      y: toY,
      scaleX: 1.12,
      scaleY: 0.88,
      duration: 120,
      ease: 'Quad.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: target,
          scaleX: 1,
          scaleY: 1,
          duration: 220,
          ease: 'Back.Out',
          onComplete: () => onComplete?.(),
        });
      },
    });
  }

  /** Bounce the item slightly when first touched */
  onPickUp(target: Phaser.GameObjects.GameObject): void {
    this.scene.tweens.add({
      targets: target,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 100,
      ease: 'Quad.Out',
      yoyo: true,
    });
  }

  /** Float item back to its starting position (wrong drop / cancel) */
  returnTo(
    target: Phaser.GameObjects.GameObject & { x: number; y: number },
    originX: number,
    originY: number,
  ): void {
    this.scene.tweens.add({
      targets: target,
      x: originX,
      y: originY,
      scaleX: 1,
      scaleY: 1,
      duration: 280,
      ease: 'Back.Out',
    });
  }

  /** Full-screen green flash — use on level/round complete */
  flashSuccess(): void {
    const flash = this.scene.add
      .rectangle(
        this.scene.scale.width / 2,
        this.scene.scale.height / 2,
        this.scene.scale.width,
        this.scene.scale.height,
        0x10b981,
      )
      .setAlpha(0)
      .setDepth(300);

    this.scene.tweens.add({
      targets: flash,
      alpha: { from: 0, to: 0.25 },
      duration: 150,
      yoyo: true,
      onComplete: () => flash.destroy(),
    });
  }
}

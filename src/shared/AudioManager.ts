import Phaser from 'phaser';

/**
 * Centralised sound playback for all game scenes.
 *
 * Sound keys are loaded in each game's preload() and registered here.
 * Call AudioManager.preloadDefaults(scene) in any game's preload() to load
 * the shared sound set from /public/sounds/.
 *
 * All play methods are safe to call even if the key isn't loaded —
 * Phaser will just log a warning instead of throwing.
 */
export class AudioManager {
  private muted = false;

  constructor(private scene: Phaser.Scene) {}

  // ─── Preload helper ───────────────────────────────────────────

  /**
   * Call this in your scene's preload() to load the default shared sounds.
   *
   * Expected files in /public/sounds/:
   *   correct.mp3 | wrong.mp3 | drop.mp3 | click.mp3 | win.mp3 | tick.mp3
   */
  static preloadDefaults(scene: Phaser.Scene): void {
    const files: [string, string][] = [
      ['sfx-correct', '/sounds/correct.mp3'],
      ['sfx-wrong',   '/sounds/wrong.mp3'],
      ['sfx-drop',    '/sounds/drop.mp3'],
      ['sfx-click',   '/sounds/click.mp3'],
      ['sfx-win',     '/sounds/win.mp3'],
      ['sfx-tick',    '/sounds/tick.mp3'],
      ['sfx-place',   '/sounds/place.mp3'],    // block lands on stack
      ['sfx-collide', '/sounds/collide.mp3'],  // block hits ground during collapse
      ['sfx-hook',    '/sounds/hook.mp3'],     // looping hook movement ambient
      ['sfx-whoosh',  '/sounds/whoosh.mp3'],   // wind whoosh during tower sway
    ];
    for (const [key, path] of files) {
      if (!scene.cache.audio.exists(key)) {
        scene.load.audio(key, path);
      }
    }
  }

  // ─── Playback ─────────────────────────────────────────────────

  playCorrect(): void  { this.play('sfx-correct', 0.65); }
  playWrong(): void    { this.play('sfx-wrong',   0.65); }
  playDrop(): void     { this.play('sfx-drop',    0.80); }
  playClick(): void    { this.play('sfx-click',   0.50); }
  playWin(): void      { this.play('sfx-win',     0.75); }
  playTick(): void     { this.play('sfx-tick',    0.40); }
  playPlace(): void    { this.play('sfx-place',   0.75); }   // block placed on stack
  playCollide(): void  { this.play('sfx-collide', 0.85); }   // block hits ground
  playWhoosh(): void   { this.play('sfx-whoosh',  0.55); }   // wind whoosh during sway

  // ─── Control ──────────────────────────────────────────────────

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.scene.sound.setMute(this.muted);
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  // ─── Internal ─────────────────────────────────────────────────

  private play(key: string, volume: number): void {
    if (this.muted) return;
    if (!this.scene.cache.audio.exists(key)) return;
    this.scene.sound.play(key, { volume });
  }
}

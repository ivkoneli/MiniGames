import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import { AudioManager } from '../../shared/AudioManager';
import type { FillInTheBlankConfig, SentenceItem } from './types';

/**
 * Fill in the Blank
 *
 * Layout:
 *   - Sentence rendered at the top with blank slots as drop zones
 *   - Word bank at the bottom with draggable word tiles
 *   - On correct drop: snapTo animation + playDrop sound
 *   - On wrong drop:   wiggle animation + playWrong sound + tile returns
 *   - All blanks filled correctly → advance to next sentence
 */
export class FillInTheBlankScene extends BaseGameScene {
  declare protected gameConfig: FillInTheBlankConfig;

  private sentences: SentenceItem[] = [];
  private currentIndex = 0;

  // ─── Phaser lifecycle ────────────────────────────────────────

  preload(): void {
    AudioManager.preloadDefaults(this);
  }

  protected setupGame(): void {
    this.sentences = [...this.gameConfig.sentences];

    if (this.gameConfig.shuffleItems) {
      Phaser.Utils.Array.Shuffle(this.sentences);
    }

    this.loadSentence(0);
  }

  // ─── Sentence rendering ───────────────────────────────────────

  private loadSentence(index: number): void {
    this.currentIndex = index;
    const sentence = this.sentences[index];

    if (!sentence) {
      this.onComplete();
      return;
    }

    this.children.removeAll(true); // clear previous sentence
    this.setupUI();                 // re-draw HUD on top

    this.renderSentence(sentence);
    this.renderWordBank(sentence);
  }

  private renderSentence(_sentence: SentenceItem): void {
    // TODO:
    // 1. Split sentence.text by '___' to get text segments
    // 2. Render each segment as a Phaser Text object
    // 3. Between segments, place a DropZone rectangle (the blank slot)
    // 4. Track which zone expects which answer
    //
    // Example approach:
    //   const parts = sentence.text.split('___');
    //   parts.forEach((part, i) => {
    //     add.text(x, y, part, style);
    //     if (i < parts.length - 1) {
    //       const zone = add.zone(x, y, SLOT_W, SLOT_H).setRectangleDropZone(SLOT_W, SLOT_H);
    //       // store zone with its expected answer: sentence.answers[i]
    //     }
    //   });
  }

  private renderWordBank(_sentence: SentenceItem): void {
    // TODO:
    // 1. Combine sentence.answers + sentence.distractors, then shuffle
    // 2. Render each word as a draggable Text or Image game object
    // 3. On drag start  → feedback.onPickUp(tile)
    // 4. On drag end (drop onto correct zone) → feedback.snapTo + audio.playDrop + onCorrect()
    // 5. On drag end (wrong zone or no zone)  → feedback.wiggle(tile) + audio.playWrong + feedback.returnTo
    // 6. When all blanks in current sentence are filled → loadSentence(currentIndex + 1)
  }
}

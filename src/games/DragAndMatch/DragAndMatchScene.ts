import Phaser from 'phaser';
import { BaseGameScene } from '../../shared/BaseGameScene';
import { AudioManager } from '../../shared/AudioManager';
import type { DragAndMatchConfig } from './types';

/**
 * Drag & Match
 *
 * Layout:
 *   - Left column:  draggable items (terms, images, formulas)
 *   - Right column: static drop targets (definitions, labels, values)
 *   - Player drags a left item onto its matching right target
 *   - Correct match → items lock in place with snapTo animation + green highlight
 *   - Wrong match   → wiggle + return to origin
 *   - All pairs matched → onComplete()
 */
export class DragAndMatchScene extends BaseGameScene {
  declare protected gameConfig: DragAndMatchConfig;

  preload(): void {
    AudioManager.preloadDefaults(this);
  }

  protected setupGame(): void {
    const pairs = [...this.gameConfig.pairs];

    if (this.gameConfig.shuffleItems) {
      Phaser.Utils.Array.Shuffle(pairs);
    }

    const limit = this.gameConfig.pairsPerRound ?? pairs.length;
    const activePairs = pairs.slice(0, limit);

    this.renderColumns(activePairs);
  }

  private renderColumns(_pairs: DragAndMatchConfig['pairs']): void {
    // TODO:
    // Left column — draggable items:
    //   1. Render each left item as a game object (Text or Image)
    //   2. setInteractive() + this.input.setDraggable()
    //   3. Track each item's origin position for returnTo()
    //   4. On drag start → feedback.onPickUp(item), bring to top (setDepth)
    //   5. On drag end:
    //      - Check if pointer is over a matching drop zone
    //      - Correct → feedback.snapTo(item, zone.x, zone.y), lock item (disableInteractive)
    //                  audio.playDrop(), onCorrect()
    //                  if all pairs matched → onComplete()
    //      - Wrong   → feedback.wiggle(item), feedback.returnTo(item, origin)
    //                  audio.playWrong(), onWrong()
    //
    // Right column — drop target zones:
    //   1. Render each right item as static text/image
    //   2. Attach a Phaser.GameObjects.Zone as the drop area
    //   3. Store the expected left item's id on the zone for matching
    //
    // Matching logic:
    //   On drag-end, iterate over all zones and use
    //   Phaser.Geom.Rectangle.Contains(zone.getBounds(), pointer.x, pointer.y)
    //   to find which zone the item was dropped on.
  }
}

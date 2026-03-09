import Phaser from 'phaser';

export interface CoordSystemOptions {
  /** Panel top-left corner in screen pixels */
  x: number;
  y: number;
  width: number;
  height: number;
  xRange: [number, number];
  yRange: [number, number];
  /** Inner padding before the drawing area. Default: 28 */
  padding?: number;
}

/**
 * Reusable coordinate system renderer.
 *
 * Handles the mapping between math coordinates and screen pixels,
 * and provides drawGrid / drawCurve helpers used by multiple game scenes.
 */
export class CoordinateSystem {
  /** Screen pixel bounds of the actual drawing area (inside padding) */
  readonly left:   number;
  readonly right:  number;
  readonly top:    number;
  readonly bottom: number;

  readonly xRange: [number, number];
  readonly yRange: [number, number];

  constructor(opts: CoordSystemOptions) {
    const pad    = opts.padding ?? 28;
    this.left    = opts.x + pad;
    this.right   = opts.x + opts.width  - pad;
    this.top     = opts.y + pad;
    this.bottom  = opts.y + opts.height - pad;
    this.xRange  = opts.xRange;
    this.yRange  = opts.yRange;
  }

  // ─── Coordinate mapping ────────────────────────────────────────

  mathToScreen(mx: number, my: number): { x: number; y: number } {
    return {
      x: this.left   + ((mx - this.xRange[0]) / (this.xRange[1] - this.xRange[0])) * (this.right  - this.left),
      y: this.bottom - ((my - this.yRange[0]) / (this.yRange[1] - this.yRange[0])) * (this.bottom - this.top),
    };
  }

  screenToMath(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.xRange[0] + ((sx - this.left)    / (this.right  - this.left))  * (this.xRange[1] - this.xRange[0]),
      y: this.yRange[0] + ((this.bottom - sy)   / (this.bottom - this.top))   * (this.yRange[1] - this.yRange[0]),
    };
  }

  // ─── Validation ────────────────────────────────────────────────

  /**
   * Returns true if fn(goalX) is within `tolerance` of goalY.
   * Used to check whether a plotted curve passes through a target point.
   */
  passesThroughPoint(
    fn: (x: number) => number,
    goalX: number,
    goalY: number,
    tolerance = 0.12,
  ): boolean {
    try {
      const y = fn(goalX);
      return isFinite(y) && Math.abs(y - goalY) <= tolerance;
    } catch {
      return false;
    }
  }

  // ─── Drawing ───────────────────────────────────────────────────

  drawGrid(gfx: Phaser.GameObjects.Graphics): void {
    const { left, right, top, bottom, xRange, yRange } = this;
    const mx = (v: number) => left   + ((v - xRange[0]) / (xRange[1] - xRange[0])) * (right - left);
    const my = (v: number) => bottom - ((v - yRange[0]) / (yRange[1] - yRange[0])) * (bottom - top);

    // Minor grid lines
    gfx.lineStyle(1, 0xffffff, 0.04);
    for (let x = Math.ceil(xRange[0]);  x <= Math.floor(xRange[1]);  x++) gfx.lineBetween(mx(x), top,  mx(x), bottom);
    for (let y = Math.ceil(yRange[0]);  y <= Math.floor(yRange[1]);  y++) gfx.lineBetween(left,  my(y), right,  my(y));

    // Axes
    gfx.lineStyle(1, 0xffffff, 0.22);
    if (yRange[0] <= 0 && 0 <= yRange[1]) gfx.lineBetween(left,  my(0), right, my(0));
    if (xRange[0] <= 0 && 0 <= xRange[1]) gfx.lineBetween(mx(0), top,   mx(0), bottom);

    // Integer tick marks
    const tick = 3;
    gfx.lineStyle(1, 0xffffff, 0.14);
    for (let x = Math.ceil(xRange[0]); x <= Math.floor(xRange[1]); x++) {
      if (x === 0) continue;
      const sx = mx(x);
      const sy = (yRange[0] <= 0 && 0 <= yRange[1]) ? my(0) : (top + bottom) / 2;
      gfx.lineBetween(sx, sy - tick, sx, sy + tick);
    }
    for (let y = Math.ceil(yRange[0]); y <= Math.floor(yRange[1]); y++) {
      if (y === 0) continue;
      const sy = my(y);
      const sx = (xRange[0] <= 0 && 0 <= xRange[1]) ? mx(0) : (left + right) / 2;
      gfx.lineBetween(sx - tick, sy, sx + tick, sy);
    }
  }

  /**
   * Plot a function curve onto a Phaser Graphics object.
   *
   * @param gfx         The graphics object to draw on
   * @param fn          The function to plot: y = fn(x)
   * @param color       Line colour as a 24-bit integer
   * @param lineWidth   Stroke width in pixels (default 2.5)
   * @param alpha       Line alpha (default 1)
   */
  drawCurve(
    gfx: Phaser.GameObjects.Graphics,
    fn: (x: number) => number,
    color: number,
    lineWidth = 2.5,
    alpha = 1,
  ): void {
    const { left, right, top, bottom, xRange, yRange } = this;
    const mx = (v: number) => left   + ((v - xRange[0]) / (xRange[1] - xRange[0])) * (right - left);
    const my = (v: number) => bottom - ((v - yRange[0]) / (yRange[1] - yRange[0])) * (bottom - top);

    const STEPS = 320;
    const step  = (xRange[1] - xRange[0]) / STEPS;
    const yMin  = yRange[0] - 1;
    const yMax  = yRange[1] + 1;

    gfx.lineStyle(lineWidth, color, alpha);
    gfx.beginPath();
    let penDown = false;

    for (let i = 0; i <= STEPS; i++) {
      const x = xRange[0] + i * step;
      let y: number;
      try { y = fn(x); } catch { penDown = false; continue; }
      if (!isFinite(y) || isNaN(y) || y < yMin || y > yMax) { penDown = false; continue; }

      const sx = mx(x);
      const sy = Math.max(top, Math.min(bottom, my(y)));
      // Break path if sx is outside horizontal bounds
      if (sx < left || sx > right) { penDown = false; continue; }
      if (!penDown) { gfx.moveTo(sx, sy); penDown = true; }
      else          { gfx.lineTo(sx, sy); }
    }

    gfx.strokePath();
  }

  // ─── Static helpers ────────────────────────────────────────────

  /**
   * Parse an arrow-function string into a callable.
   * Accepts: "(x) => expr"  or  "x => expr"
   * Returns null if parsing fails.
   */
  static parseFn(fnStr: string): ((x: number) => number) | null {
    try {
      const body = fnStr.replace(/^\s*\(?\s*x\s*\)?\s*=>\s*/, '');
      return new Function('x', `return ${body}`) as (x: number) => number;
    } catch {
      return null;
    }
  }
}

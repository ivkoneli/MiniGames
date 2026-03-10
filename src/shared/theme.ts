/** Read once at module load. Games and scenes import these to adapt colors. */

export const IS_LIGHT = (() => {
  try { return localStorage.getItem('mg-theme') === 'light'; } catch { return false; }
})();

/** CSS color string for Phaser backgroundColor config */
export const bgCss = IS_LIGHT ? '#f0f4ff' : '#070810';

/** HUD band fill as Phaser hex number */
export const hudHex = IS_LIGHT ? 0xf1f5f9 : 0x0d0f1e;

/** Separator line color + alpha under HUD */
export const sepCol   = IS_LIGHT ? 0x000000 : 0xffffff;
export const sepAlpha = IS_LIGHT ? 0.08     : 0.06;

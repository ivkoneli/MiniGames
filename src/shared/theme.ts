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

/** Full color token map for scene use */
export const T = {
  // ── Phaser hex fills ──────────────────────────────────────────
  cardBg:    IS_LIGHT ? 0xffffff : 0x12131f,
  cardBg2:   IS_LIGHT ? 0xf8fafc : 0x0d0f1e,
  panelBg:   IS_LIGHT ? 0xf8fafc : 0x0c0e1a,
  inputBg:   IS_LIGHT ? 0xeef2ff : 0x1e1b30,
  btnBg:     IS_LIGHT ? 0xf8fafc : 0x0d0f1e,
  timerBg:   IS_LIGHT ? 0xe2e8f0 : 0x161824,
  clockFace: IS_LIGHT ? 0xf0f4ff : 0x0d1020,
  border:    IS_LIGHT ? 0xcbd5e1 : 0x3a3f6a,
  divider:   IS_LIGHT ? 0xe2e8f0 : 0x252940,
  // ── CSS text strings ──────────────────────────────────────────
  text:      IS_LIGHT ? '#0f172a' : '#e2e8f0',
  textMid:   IS_LIGHT ? '#1e293b' : '#ffffff',
  textMute:  IS_LIGHT ? '#475569' : '#64748b',
  textDim:   IS_LIGHT ? '#64748b' : '#475569',
  textFade:  IS_LIGHT ? '#475569' : '#606880',
  stroke:    IS_LIGHT ? '#cbd5e1' : '#1a1a2e',
  // ── Border alpha (for setStrokeStyle) ─────────────────────────
  panelBorderCol:   IS_LIGHT ? 0x000000 : 0xffffff,
  panelBorderAlpha: IS_LIGHT ? 0.10     : 0.08,
};

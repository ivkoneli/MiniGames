// Haptic feedback via Web Vibration API.
// Works on Android Chrome/Firefox. No-ops silently on iOS Safari (Apple doesn't implement it).
const vib = (pattern: number | number[]) => {
  try { navigator.vibrate?.(pattern); } catch {}
};

export const haptics = {
  light:   () => vib(10),
  medium:  () => vib(25),
  heavy:   () => vib(50),
  success: () => vib([10, 30, 10]),
  warning: () => vib([30, 10, 30]),
  error:   () => vib([50, 10, 50]),
  select:  () => vib(5),
};

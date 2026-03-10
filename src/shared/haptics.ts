import { WebHaptics, defaultPatterns } from 'web-haptics';

// Lazy-init so AudioContext isn't created before a user gesture (would break SoundGenerator).
let _wh: WebHaptics | null = null;
const wh = (): WebHaptics => (_wh ??= new WebHaptics());

export const haptics = {
  light:   () => wh().trigger(defaultPatterns.light),
  medium:  () => wh().trigger(defaultPatterns.medium),
  heavy:   () => wh().trigger(defaultPatterns.heavy),
  success: () => wh().trigger(defaultPatterns.success),
  warning: () => wh().trigger(defaultPatterns.warning),
  error:   () => wh().trigger(defaultPatterns.error),
  select:  () => wh().trigger(defaultPatterns.selection),
};

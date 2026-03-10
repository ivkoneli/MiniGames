/**
 * Synthesised sounds via Web Audio API — no audio files needed.
 * All functions are fire-and-forget safe.
 */

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext();
  // Resume in case browser suspended it
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  onEnd?: () => void,
): void {
  try {
    const ctx  = getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    if (onEnd) osc.onended = onEnd;
  } catch {
    onEnd?.();
  }
}

/** Short high beep — countdown numbers 3, 2, 1 */
export function playCountdownBeep(onEnd?: () => void): void {
  tone(660, 0.16, 'sine', 0.50, onEnd);
}

/** Longer higher GO tone */
export function playGoBeep(onEnd?: () => void): void {
  tone(1050, 0.55, 'sine', 0.60, onEnd);
}

/** Harsh buzzer — timer expired */
export function playBuzzer(onEnd?: () => void): void {
  try {
    const ctx   = getCtx();
    const osc   = ctx.createOscillator();
    const gain  = ctx.createGain();
    const dist  = ctx.createWaveShaper();

    // Create distortion curve for harsh buzz
    const samples = 256;
    const curve   = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
    }
    dist.curve = curve;
    dist.oversample = '2x';

    osc.connect(dist);
    dist.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sawtooth';
    osc.frequency.value = 130;
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.9);
    if (onEnd) osc.onended = onEnd;
  } catch {
    onEnd?.();
  }
}

/** Sharp tick — plays every timer second; volume scales with urgency */
export function playCountdownTick(volume = 0.28, onEnd?: () => void): void {
  tone(1200, 0.055, 'square', volume, onEnd);
}

/**
 * Pre-warm the AudioContext inside a user-gesture handler so it is already
 * running when the countdown fires 100-400 ms later (iOS Safari requirement).
 */
export function warmAudio(): void {
  try {
    const ctx = getCtx();
    if (ctx.state !== 'running') ctx.resume();
    // Play a 1-sample silent buffer — unlocks audio on iOS Safari within the gesture
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* ignore */ }
}

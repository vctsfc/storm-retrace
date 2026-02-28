/**
 * Notification chime using the Web Audio API.
 *
 * Plays a pleasant two-tone chime to notify the user when a long-running
 * operation completes (e.g. radar frame caching, media export).
 * No audio files needed — tones are synthesised in real time.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browsers require user gesture)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a two-note "ding-ding" chime.
 *
 * Uses two sine-wave oscillators with a quick exponential decay envelope
 * to produce a clean, unobtrusive notification sound.
 *
 * @param volume  0-1 gain (default 0.3 — subtle but audible)
 */
export function playChime(volume = 0.3): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Two ascending notes: E5 → G5  (pleasant major third)
    const notes = [659.25, 783.99]; // Hz
    const noteDuration = 0.12; // seconds per note
    const gap = 0.08; // seconds between notes

    for (let i = 0; i < notes.length; i++) {
      const startTime = now + i * (noteDuration + gap);

      // Oscillator — clean sine wave
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = notes[i];

      // Gain envelope — quick attack, exponential decay
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.2);
    }
  } catch {
    // Silently fail — audio isn't critical
  }
}

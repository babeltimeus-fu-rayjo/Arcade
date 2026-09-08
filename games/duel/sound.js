/**
 * Tiny synthesised sound effects (no audio files): a metallic hit, a whoosh and
 * a thud, built from noise bursts and short oscillator sweeps. The audio
 * context is created lazily by unlock(), which must run inside a user gesture.
 */
export function createSounds() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // One second of white noise, reused by every effect.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function ready() {
    return ctx && master && ctx.state === 'running';
  }

  function noise(duration, { type = 'bandpass', from = 1000, to = from, q = 1, gain = 0.5 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    const t = ctx.currentTime;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function tone(type, from, to, duration, gain) {
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    unlock,
    get enabled() {
      return ready();
    },
    /** Metallic clang with a low thump underneath. */
    hit() {
      if (!ready()) return;
      noise(0.14, { type: 'bandpass', from: 2200, to: 900, q: 1.2, gain: 0.7 });
      tone('triangle', 1100, 700, 0.22, 0.18);
      tone('triangle', 1650, 1200, 0.16, 0.1);
      tone('sine', 140, 55, 0.2, 0.6);
    },
    /** Air rushing past a swinging weapon. */
    whoosh() {
      if (!ready()) return;
      noise(0.22, { type: 'bandpass', from: 500, to: 2600, q: 0.8, gain: 0.35 });
    },
    /** Heavy landing. */
    thud() {
      if (!ready()) return;
      tone('sine', 110, 38, 0.28, 0.7);
      noise(0.18, { type: 'lowpass', from: 600, to: 200, q: 0.7, gain: 0.4 });
    },
  };
}

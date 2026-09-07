/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Every game round is generated from a seed, so the same seed + settings
 * reproduces the same round on any device. That is the foundation for
 * multiplayer: peers only need to share the seed, not every target.
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Float in [0, 1). */
    next,
    /** Float in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max], inclusive. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** Random element of an array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

/** A fresh 32-bit seed. */
export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

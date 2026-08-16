// Deterministic seeded PRNG. All simulation randomness must go through an
// instance of this — never Math.random() directly (CLAUDE.md: "Deterministic
// RNG"). Ported unchanged from prototype/js/rng.js.

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(input: string | number): number {
  const str = String(input);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

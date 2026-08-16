// Single seeded PRNG for every random decision in the simulation (trait
// variation, coat inheritance, parent pairing). Nothing in simulation.js or
// render.js may call Math.random() directly — everything goes through an
// instance created here, so a fixed seed reproduces a run exactly.

// mulberry32: small, fast, and good enough statistically for a teaching
// simulation. Deterministic: same seed -> same output sequence, forever.
export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A non-negative 32-bit integer seed derived from any string, so the UI can
// accept a human-typed seed ("gen4-retry") as well as a bare number.
export function seedFromString(input) {
  const str = String(input);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// The simulation core. Every function here is pure: same inputs (including
// the same rng call sequence) always produce the same outputs. No DOM access,
// no reading or writing UI state — render.js and main.js call into this file,
// never the other way round.

export const TRAIT_MIN = 0;
export const TRAIT_MAX = 100;
export const MIN_PARENTS = 2;

const NUMERIC_TRAITS = ["bodySize", "bodyRoundness", "docility", "skittishness", "curiosity"];

// Real guinea pig breeds, distinguished by coat type rather than colour.
// Categorical and independently inherited from coatHue, same as personality.
export const BREEDS = ["american", "abyssinian", "silkie", "teddy", "bald", "crested"];

// Personality is deliberately NOT derived from docility/skittishness: real
// domesticated populations still have individuals that stay wary of people
// regardless of how "tame" their stats say they are. It's a separate,
// independently-inherited trait that gates how much of the docility-driven
// approach behaviour (behaviour.js) actually gets expressed.
export const PERSONALITIES = ["shy", "neutral", "friendly"];
const PERSONALITY_WEIGHTS = [0.25, 0.5, 0.25];

function weightedPersonality(rng) {
  const roll = rng();
  let cumulative = 0;
  for (let i = 0; i < PERSONALITIES.length; i++) {
    cumulative += PERSONALITY_WEIGHTS[i];
    if (roll < cumulative) return PERSONALITIES[i];
  }
  return PERSONALITIES[PERSONALITIES.length - 1];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomTrait(rng) {
  return clamp(Math.round(rng() * TRAIT_MAX), TRAIT_MIN, TRAIT_MAX);
}

function makeId(generation, index) {
  return `g${generation}-${index}`;
}

// Wild cavies are agouti brown with a plain short coat — the fancy colours
// and breeds (silkie's long hair, crested's rosette, ...) are all products of
// later selective breeding, not something a wild-caught founder population
// would show. Hue is constrained to a natural brown range and breed is fixed
// to the ancestral "american" (plain, short-coated) type; wider colour and
// breed diversity only enters the population via mutation in inheritHue /
// inheritBreed as generations pass, mirroring real domestication history.
const WILD_HUE_MIN = 15;
const WILD_HUE_MAX = 45;
const WILD_BREED = "american";

// A fresh, unrelated population — used for generation 1 only. Every later
// generation comes from breedPopulation() instead, so traits stay connected
// to whoever the player selected.
export function createPopulation(size, generation, rng) {
  const cavies = [];
  for (let i = 0; i < size; i++) {
    cavies.push({
      id: makeId(generation, i),
      bodySize: randomTrait(rng),
      bodyRoundness: randomTrait(rng),
      docility: randomTrait(rng),
      skittishness: randomTrait(rng),
      curiosity: randomTrait(rng),
      coatHue: WILD_HUE_MIN + Math.floor(rng() * (WILD_HUE_MAX - WILD_HUE_MIN)),
      breed: WILD_BREED,
      personality: weightedPersonality(rng),
      selected: false,
    });
  }
  return cavies;
}

// Marks one cavy selected. Returns a new array — the population passed in is
// never mutated, so callers can compare before/after freely.
export function selectAnimal(population, id) {
  return population.map((cavy) =>
    cavy.id === id ? { ...cavy, selected: true } : cavy,
  );
}

export function deselectAnimal(population, id) {
  return population.map((cavy) =>
    cavy.id === id ? { ...cavy, selected: false } : cavy,
  );
}

export function clearSelection(population) {
  return population.map((cavy) =>
    cavy.selected ? { ...cavy, selected: false } : cavy,
  );
}

// offspring trait ≈ midpoint of the two parents + small random variation,
// clamped back into bounds. This is what makes selection matter: breed from
// two high-docility parents and the midpoint pulls every offspring up with
// them, not toward some fixed target.
export function inheritTrait(parentValueA, parentValueB, rng, options = {}) {
  const { min = TRAIT_MIN, max = TRAIT_MAX, mutationSpread = 8 } = options;
  const midpoint = (parentValueA + parentValueB) / 2;
  const variation = (rng() - 0.5) * 2 * mutationSpread;
  return clamp(Math.round(midpoint + variation), min, max);
}

// Hue is circular (0 and 359 are neighbours), so averaging it like a normal
// number would drag orange and violet toward a muddy green through the middle
// of the wheel. This walks the short way round instead.
export function inheritHue(hueA, hueB, rng, mutationSpread = 20) {
  const diff = ((hueB - hueA + 540) % 360) - 180;
  const midpoint = (hueA + diff / 2 + 360) % 360;
  const variation = (rng() - 0.5) * 2 * mutationSpread;
  return ((midpoint + variation) % 360 + 360) % 360;
}

// Simplified breed inheritance, as the brief allows: usually copy one
// parent's breed, occasionally mutate to something else entirely.
export function inheritBreed(breedA, breedB, rng, mutationChance = 0.1) {
  if (rng() < mutationChance) {
    return BREEDS[Math.floor(rng() * BREEDS.length)];
  }
  return rng() < 0.5 ? breedA : breedB;
}

// Same "usually copy one parent, occasionally mutate" shape as coat pattern,
// but a mutation redraws from the weighted distribution rather than a flat
// one — so shy/neutral/friendly proportions stay realistic across many
// generations instead of drifting toward an even three-way split.
export function inheritPersonality(personalityA, personalityB, rng, mutationChance = 0.12) {
  if (rng() < mutationChance) {
    return weightedPersonality(rng);
  }
  return rng() < 0.5 ? personalityA : personalityB;
}

// One offspring from a random pair of parents (drawn from the breeding pool
// with replacement — a small selected pool can still produce a full
// generation, and the same pair can contribute more than one offspring).
function breedOne(parents, id, rng) {
  const parentA = parents[Math.floor(rng() * parents.length)];
  let parentB = parents[Math.floor(rng() * parents.length)];
  if (parents.length > 1) {
    let guard = 0;
    while (parentB.id === parentA.id && guard < 10) {
      parentB = parents[Math.floor(rng() * parents.length)];
      guard += 1;
    }
  }
  const offspring = { id, selected: false };
  for (const trait of NUMERIC_TRAITS) {
    offspring[trait] = inheritTrait(parentA[trait], parentB[trait], rng);
  }
  offspring.coatHue = inheritHue(parentA.coatHue, parentB.coatHue, rng);
  offspring.breed = inheritBreed(parentA.breed, parentB.breed, rng);
  offspring.personality = inheritPersonality(parentA.personality, parentB.personality, rng);
  return offspring;
}

export function breedPopulation(parents, size, generation, rng) {
  if (parents.length < MIN_PARENTS) {
    throw new Error(`breedPopulation needs at least ${MIN_PARENTS} parents, got ${parents.length}`);
  }
  const offspring = [];
  for (let i = 0; i < size; i++) {
    offspring.push(breedOne(parents, makeId(generation, i), rng));
  }
  return offspring;
}

export function calculateStatistics(population) {
  const size = population.length;
  const totals = { bodySize: 0, bodyRoundness: 0, docility: 0, skittishness: 0, curiosity: 0 };
  const personalityCounts = { shy: 0, neutral: 0, friendly: 0 };
  for (const cavy of population) {
    for (const trait of NUMERIC_TRAITS) {
      totals[trait] += cavy[trait];
    }
    personalityCounts[cavy.personality] += 1;
  }
  const averages = {};
  for (const trait of NUMERIC_TRAITS) {
    averages[trait] = size ? totals[trait] / size : 0;
  }
  return { population: size, averages, personalityCounts };
}

// Runs the whole "select -> breed -> next generation" step. Throws if fewer
// than MIN_PARENTS are selected — main.js is expected to check that first and
// show a message instead of letting the error surface, but the guard lives
// here too so the rule can never be bypassed by a caller that forgets to ask.
export function advanceGeneration(population, generation, rng, options = {}) {
  const parents = population.filter((cavy) => cavy.selected);
  if (parents.length < MIN_PARENTS) {
    throw new Error(`Select at least ${MIN_PARENTS} parents before advancing.`);
  }
  const size = options.size ?? population.length;
  const nextGenerationNumber = generation + 1;
  const nextPopulation = breedPopulation(parents, size, nextGenerationNumber, rng);
  return { population: nextPopulation, generation: nextGenerationNumber };
}

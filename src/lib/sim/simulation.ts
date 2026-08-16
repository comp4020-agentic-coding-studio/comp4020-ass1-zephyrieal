// The simulation core. Every function here is pure: same inputs (including
// the same rng call sequence) always produce the same outputs. No DOM access,
// no reading or writing UI state — render.ts and app.ts call into this file,
// never the other way round. Ported unchanged from prototype/js/simulation.js
// (CLAUDE.md: "Simulation architecture rule").
import type { Rng } from "./rng";

export const TRAIT_MIN = 0;
export const TRAIT_MAX = 100;
export const MIN_PARENTS = 2;

export const NUMERIC_TRAITS = [
  "bodySize",
  "bodyRoundness",
  "docility",
  "skittishness",
  "curiosity",
] as const;
export type NumericTrait = (typeof NUMERIC_TRAITS)[number];

// Recognised, named breeds — every one of these is a post-domestication
// classification formalised by breeders (in Europe, the Americas, or the
// Andes), not something a wild population would already sort into. Most are
// distinguished by coat type; "cuy" instead reflects the larger-bodied,
// meat-purpose lines raised across the Andes (Peru, Ecuador, Bolivia,
// Colombia) rather than a hair type. All of them stay categorical and
// independently inherited from coatHue and the numeric traits, same as
// personality — a real cuy is heavier/more muscular in practice, but
// modelling that as a breed-conditional trait skew would contradict the
// independence this simulation deliberately keeps. inheritBreed() only ever
// mutates *into* one of these — see WILD_BREED below for the ancestral state
// they all mutate out of.
export const BREEDS = ["shorthair", "abyssinian", "peruvian", "teddy", "bald", "crested", "cuy"] as const;
// "wild" is the founder-only ancestral type — no formal breed, since none had
// been named yet. It's a valid Breed but deliberately excluded from BREEDS
// (the mutation-target pool), so a population can only ever diversify away
// from "wild" and never mutate back into it, mirroring domestication as a
// one-way process the same way personality/docility drift is.
export type Breed = (typeof BREEDS)[number] | "wild";

// Personality is deliberately NOT derived from docility/skittishness: real
// domesticated populations still have individuals that stay wary of people
// regardless of how "tame" their stats say they are. It's a separate,
// independently-inherited trait that gates how much of the docility-driven
// approach behaviour (behaviour.ts) actually gets expressed.
export const PERSONALITIES = ["shy", "neutral", "friendly"] as const;
export type Personality = (typeof PERSONALITIES)[number];
const PERSONALITY_WEIGHTS = [0.25, 0.5, 0.25];

export interface Cavy {
  id: string;
  bodySize: number;
  bodyRoundness: number;
  docility: number;
  skittishness: number;
  curiosity: number;
  coatHue: number;
  breed: Breed;
  personality: Personality;
  selected: boolean;
}

export interface Statistics {
  population: number;
  averages: Record<NumericTrait, number>;
  personalityCounts: Record<Personality, number>;
}

function weightedPersonality(rng: Rng): Personality {
  const roll = rng();
  let cumulative = 0;
  for (let i = 0; i < PERSONALITIES.length; i++) {
    cumulative += PERSONALITY_WEIGHTS[i];
    if (roll < cumulative) return PERSONALITIES[i];
  }
  return PERSONALITIES[PERSONALITIES.length - 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomTrait(rng: Rng): number {
  return clamp(Math.round(rng() * TRAIT_MAX), TRAIT_MIN, TRAIT_MAX);
}

function makeId(generation: number, index: number): string {
  return `g${generation}-${index}`;
}

// Wild cavies are agouti brown with a plain short coat and no formal breed —
// "Shorthair", like every other named breed, only exists because later
// breeders in captivity selected for and standardised it; a wild-caught
// founder population predates all of that naming. Hue is constrained to a
// natural brown range and breed is fixed to the ancestral "wild" type; wider
// colour and breed diversity only enters the population via mutation in
// inheritHue / inheritBreed as generations pass, mirroring real domestication
// history.
const WILD_HUE_MIN = 15;
const WILD_HUE_MAX = 45;
const WILD_BREED: Breed = "wild";

// Named breeds are a later development than early domestication — real
// selective, appearance-driven breeding only took off once cavies reached
// Europe and were kept purely as pets, not working animals (see
// data/timeline.ts's "european-history" era, minGeneration 5 — keep this in
// sync if that threshold ever changes). Before that generation, inheritBreed
// never lets a "wild" population mutate into a named breed, so the early
// eras stay uniformly wild-type the way they would have been historically.
const BREED_MUTATION_UNLOCK_GENERATION = 5;

// A fresh, unrelated population — used for generation 1 only. Every later
// generation comes from breedPopulation() instead, so traits stay connected
// to whoever the player selected.
export function createPopulation(size: number, generation: number, rng: Rng): Cavy[] {
  const cavies: Cavy[] = [];
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

export function selectAnimal(population: Cavy[], id: string): Cavy[] {
  return population.map((cavy) => (cavy.id === id ? { ...cavy, selected: true } : cavy));
}

export function deselectAnimal(population: Cavy[], id: string): Cavy[] {
  return population.map((cavy) => (cavy.id === id ? { ...cavy, selected: false } : cavy));
}

export function clearSelection(population: Cavy[]): Cavy[] {
  return population.map((cavy) => (cavy.selected ? { ...cavy, selected: false } : cavy));
}

export interface InheritTraitOptions {
  min?: number;
  max?: number;
  mutationSpread?: number;
}

// offspring trait ≈ midpoint of the two parents + small random variation,
// clamped back into bounds.
export function inheritTrait(
  parentValueA: number,
  parentValueB: number,
  rng: Rng,
  options: InheritTraitOptions = {},
): number {
  const { min = TRAIT_MIN, max = TRAIT_MAX, mutationSpread = 8 } = options;
  const midpoint = (parentValueA + parentValueB) / 2;
  const variation = (rng() - 0.5) * 2 * mutationSpread;
  return clamp(Math.round(midpoint + variation), min, max);
}

// Hue is circular (0 and 359 are neighbours), so averaging it like a normal
// number would drag orange and violet toward a muddy green through the middle
// of the wheel. This walks the short way round instead.
//
// A rare leap mutation also gives coatHue a small chance to land anywhere on
// the wheel, not just within mutationSpread of the parents' colour. Ordinary
// coat-colour genes (like white spotting) don't always arrive as a short step
// from the parents' shade, and without this, wild founders (hue ~15-45) could
// never realistically drift the ~150° to reach white (~240°) within this
// simulation's short generation budget by ordinary drift alone. Either branch
// still consumes exactly one more rng() call, so the seeded sequence doesn't
// depend on which path was taken (same pattern as inheritBreed below).
const HUE_LEAP_MUTATION_CHANCE = 0.04;

export function inheritHue(hueA: number, hueB: number, rng: Rng, mutationSpread = 20): number {
  const diff = ((hueB - hueA + 540) % 360) - 180;
  const midpoint = (hueA + diff / 2 + 360) % 360;
  const leapRolled = rng() < HUE_LEAP_MUTATION_CHANCE;
  if (leapRolled) {
    return rng() * 360;
  }
  const variation = (rng() - 0.5) * 2 * mutationSpread;
  return (((midpoint + variation) % 360) + 360) % 360;
}

export function inheritBreed(
  breedA: Breed,
  breedB: Breed,
  rng: Rng,
  generation: number,
  mutationChance = 0.1,
): Breed {
  const mutationRolled = rng() < mutationChance;
  if (mutationRolled && generation >= BREED_MUTATION_UNLOCK_GENERATION) {
    return BREEDS[Math.floor(rng() * BREEDS.length)];
  }
  // Either no mutation was rolled, or one was suppressed because named
  // breeds don't exist yet this early — either branch still consumes exactly
  // one more rng() call, so the seeded sequence doesn't depend on which path
  // was taken.
  return rng() < 0.5 ? breedA : breedB;
}

export function inheritPersonality(
  personalityA: Personality,
  personalityB: Personality,
  rng: Rng,
  mutationChance = 0.12,
): Personality {
  if (rng() < mutationChance) {
    return weightedPersonality(rng);
  }
  return rng() < 0.5 ? personalityA : personalityB;
}

function breedOne(parents: Cavy[], id: string, generation: number, rng: Rng): Cavy {
  const parentA = parents[Math.floor(rng() * parents.length)];
  let parentB = parents[Math.floor(rng() * parents.length)];
  if (parents.length > 1) {
    let guard = 0;
    while (parentB.id === parentA.id && guard < 10) {
      parentB = parents[Math.floor(rng() * parents.length)];
      guard += 1;
    }
  }
  const offspring = { id, selected: false } as Cavy;
  for (const trait of NUMERIC_TRAITS) {
    offspring[trait] = inheritTrait(parentA[trait], parentB[trait], rng);
  }
  offspring.coatHue = inheritHue(parentA.coatHue, parentB.coatHue, rng);
  offspring.breed = inheritBreed(parentA.breed, parentB.breed, rng, generation);
  offspring.personality = inheritPersonality(parentA.personality, parentB.personality, rng);
  return offspring;
}

export function breedPopulation(parents: Cavy[], size: number, generation: number, rng: Rng): Cavy[] {
  if (parents.length < MIN_PARENTS) {
    throw new Error(`breedPopulation needs at least ${MIN_PARENTS} parents, got ${parents.length}`);
  }
  const offspring: Cavy[] = [];
  for (let i = 0; i < size; i++) {
    offspring.push(breedOne(parents, makeId(generation, i), generation, rng));
  }
  return offspring;
}

export function calculateStatistics(population: Cavy[]): Statistics {
  const size = population.length;
  const totals: Record<NumericTrait, number> = {
    bodySize: 0,
    bodyRoundness: 0,
    docility: 0,
    skittishness: 0,
    curiosity: 0,
  };
  const personalityCounts: Record<Personality, number> = { shy: 0, neutral: 0, friendly: 0 };
  for (const cavy of population) {
    for (const trait of NUMERIC_TRAITS) {
      totals[trait] += cavy[trait];
    }
    personalityCounts[cavy.personality] += 1;
  }
  const averages = {} as Record<NumericTrait, number>;
  for (const trait of NUMERIC_TRAITS) {
    averages[trait] = size ? totals[trait] / size : 0;
  }
  return { population: size, averages, personalityCounts };
}

export interface AdvanceGenerationOptions {
  size?: number;
}

export interface AdvanceGenerationResult {
  population: Cavy[];
  generation: number;
}

export function advanceGeneration(
  population: Cavy[],
  generation: number,
  rng: Rng,
  options: AdvanceGenerationOptions = {},
): AdvanceGenerationResult {
  const parents = population.filter((cavy) => cavy.selected);
  if (parents.length < MIN_PARENTS) {
    throw new Error(`You'll need at least ${MIN_PARENTS} parents!`);
  }
  const size = options.size ?? population.length;
  const nextGenerationNumber = generation + 1;
  const nextPopulation = breedPopulation(parents, size, nextGenerationNumber, rng);
  return { population: nextPopulation, generation: nextGenerationNumber };
}

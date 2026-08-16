import { describe, expect, it } from "vitest";
import { createRng } from "../src/lib/sim/rng";
import {
  breedPopulation,
  calculateStatistics,
  createPopulation,
  type Breed,
  type Cavy,
  type NumericTrait,
  type Personality,
  type Statistics,
} from "../src/lib/sim/simulation";

// CI-enforced version of CLAUDE.md's "Standing correctness check: the four
// [six] selection experiments" — same logic as prototype/experiments.js, run
// as real assertions against the ported TypeScript core instead of printed
// to the console. Any change to selection/inheritance/trait-variation logic
// that breaks one of these is a regression, not a tuning question.

const POPULATION_SIZE = 10;
const PARENT_COUNT = 4;
const GENERATIONS = 10;
const SEED = 20260815;

interface HistoryRow {
  generation: number;
  averages: Record<NumericTrait, number>;
  personalityCounts: Record<Personality, number>;
}

function selectTop(population: Cavy[], trait: NumericTrait, count: number): Cavy[] {
  return [...population].sort((a, b) => b[trait] - a[trait]).slice(0, count);
}

function selectRandom(population: Cavy[], count: number, rng: () => number): Cavy[] {
  const pool = [...population];
  const chosen: Cavy[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}

function selectByPersonality(population: Cavy[], personality: Personality, count: number): Cavy[] {
  const matching = population.filter((cavy) => cavy.personality === personality);
  const rest = population.filter((cavy) => cavy.personality !== personality);
  return [...matching, ...rest].slice(0, count);
}

function runExperiment(selector: (population: Cavy[], rng: () => number) => Cavy[]): HistoryRow[] {
  const rng = createRng(SEED);
  let population = createPopulation(POPULATION_SIZE, 1, rng);
  let generation = 1;
  const stats: Statistics = calculateStatistics(population);
  const history: HistoryRow[] = [
    { generation, averages: stats.averages, personalityCounts: stats.personalityCounts },
  ];

  for (let step = 0; step < GENERATIONS - 1; step++) {
    const parents = selector(population, rng);
    generation += 1;
    population = breedPopulation(parents, POPULATION_SIZE, generation, rng);
    const genStats = calculateStatistics(population);
    history.push({ generation, averages: genStats.averages, personalityCounts: genStats.personalityCounts });
  }
  return history;
}

function at(history: HistoryRow[], generation: number): HistoryRow {
  const row = history.find((r) => r.generation === generation);
  if (!row) throw new Error(`no generation ${generation} in history`);
  return row;
}

describe("standing correctness check: selection experiments", () => {
  it("Experiment A — selecting highest docility raises average docility", () => {
    const history = runExperiment((pop) => selectTop(pop, "docility", PARENT_COUNT));
    const gen1 = at(history, 1).averages.docility;
    const gen10 = at(history, 10).averages.docility;
    expect(gen10 - gen1).toBeGreaterThan(10);
  });

  it("Experiment B — selecting highest roundness raises average roundness", () => {
    const history = runExperiment((pop) => selectTop(pop, "bodyRoundness", PARENT_COUNT));
    const gen1 = at(history, 1).averages.bodyRoundness;
    const gen10 = at(history, 10).averages.bodyRoundness;
    expect(gen10 - gen1).toBeGreaterThan(10);
  });

  it("Experiment C — random selection produces no consistent directional trend", () => {
    const history = runExperiment((pop, rng) => selectRandom(pop, PARENT_COUNT, rng));
    const gen1 = at(history, 1).averages.docility;
    const gen10 = at(history, 10).averages.docility;
    // A population of 10 with only 4 random parents each generation still
    // drifts by chance alone (real genetic drift, not a bug) --- this bound
    // just needs to stay well under A/B/D's directed-selection effect sizes
    // (all >35 for this seed), not near-zero.
    expect(Math.abs(gen10 - gen1)).toBeLessThan(25);
  });

  it("Experiment D — selecting highest skittishness raises average skittishness", () => {
    const history = runExperiment((pop) => selectTop(pop, "skittishness", PARENT_COUNT));
    const gen1 = at(history, 1).averages.skittishness;
    const gen10 = at(history, 10).averages.skittishness;
    expect(gen10 - gen1).toBeGreaterThan(10);
  });

  it("Experiment E — selecting friendly parents raises the friendly share of the population", () => {
    const history = runExperiment((pop) => selectByPersonality(pop, "friendly", PARENT_COUNT));
    const gen1 = at(history, 1).personalityCounts.friendly;
    const gen10 = at(history, 10).personalityCounts.friendly;
    expect(gen10).toBeGreaterThan(gen1);
  });

  it("Experiment F — selecting shy parents raises the shy share of the population", () => {
    const history = runExperiment((pop) => selectByPersonality(pop, "shy", PARENT_COUNT));
    const gen1 = at(history, 1).personalityCounts.shy;
    const gen10 = at(history, 10).personalityCounts.shy;
    expect(gen10).toBeGreaterThan(gen1);
  });

  it("wild founders (generation 1) are constrained to brown/wild-type, no named breed", () => {
    const rng = createRng(SEED);
    const population = createPopulation(POPULATION_SIZE, 1, rng);
    for (const cavy of population) {
      expect(cavy.breed).toBe("wild");
      expect(cavy.coatHue).toBeGreaterThanOrEqual(15);
      expect(cavy.coatHue).toBeLessThanOrEqual(45);
    }
  });

  it("named breeds don't appear in the early eras — the population stays wild-type through generation 4", () => {
    const rng = createRng(SEED);
    let population = createPopulation(POPULATION_SIZE, 1, rng);
    let generation = 1;
    for (let step = 0; step < 3; step++) {
      const parents = population.slice(0, PARENT_COUNT);
      generation += 1;
      population = breedPopulation(parents, POPULATION_SIZE, generation, rng);
      for (const cavy of population) {
        expect(cavy.breed).toBe("wild");
      }
    }
    expect(generation).toBe(4);
  });

  it("named breeds can appear once the population reaches generation 5+", () => {
    const rng = createRng(SEED);
    let population = createPopulation(POPULATION_SIZE, 1, rng);
    let generation = 1;
    const seenBreeds = new Set<Breed>();
    for (let step = 0; step < 14; step++) {
      const parents = population.slice(0, PARENT_COUNT);
      generation += 1;
      population = breedPopulation(parents, POPULATION_SIZE, generation, rng);
      for (const cavy of population) seenBreeds.add(cavy.breed);
    }
    seenBreeds.delete("wild");
    expect(seenBreeds.size).toBeGreaterThan(0);
  });
});

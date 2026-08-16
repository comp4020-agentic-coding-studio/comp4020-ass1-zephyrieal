// Standing correctness check (CLAUDE.md: "Standing correctness check: the
// four selection experiments"). Runs entirely against the pure simulation
// functions — no DOM, no browser — so it can run headless in CI or on the
// command line: `node prototype/experiments.js`.
import { createRng } from "./js/rng.js";
import { createPopulation, breedPopulation, calculateStatistics } from "./js/simulation.js";

const POPULATION_SIZE = 10;
const PARENT_COUNT = 4;
const GENERATIONS = 10;
const SEED = 20260815;

function selectTop(population, trait, count) {
  return [...population].sort((a, b) => b[trait] - a[trait]).slice(0, count);
}

function selectBottom(population, trait, count) {
  return [...population].sort((a, b) => a[trait] - b[trait]).slice(0, count);
}

function selectRandom(population, count, rng) {
  const pool = [...population];
  const chosen = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(rng() * pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}

// Personality is categorical, not a sortable number, so selection prioritises
// exact matches first and only falls back to the rest of the population if
// there aren't enough of that personality to fill the parent pool.
function selectByPersonality(population, personality, count) {
  const matching = population.filter((cavy) => cavy.personality === personality);
  const rest = population.filter((cavy) => cavy.personality !== personality);
  return [...matching, ...rest].slice(0, count);
}

function runExperiment(selector) {
  const rng = createRng(SEED);
  let population = createPopulation(POPULATION_SIZE, 1, rng);
  let generation = 1;
  const stats = calculateStatistics(population);
  const history = [{ generation, ...stats.averages, personalityCounts: stats.personalityCounts }];

  for (let step = 0; step < GENERATIONS - 1; step++) {
    const parents = selector(population, rng);
    generation += 1;
    population = breedPopulation(parents, POPULATION_SIZE, generation, rng);
    const genStats = calculateStatistics(population);
    history.push({ generation, ...genStats.averages, personalityCounts: genStats.personalityCounts });
  }
  return history;
}

function at(history, generation) {
  return history.find((row) => row.generation === generation);
}

function report(name, trait, history, expectation) {
  const gen1 = at(history, 1)[trait];
  const gen5 = at(history, 5)[trait];
  const gen10 = at(history, 10)[trait];
  console.log(`${name}`);
  console.log(`  gen 1:  ${gen1.toFixed(1)}`);
  console.log(`  gen 5:  ${gen5.toFixed(1)}`);
  console.log(`  gen 10: ${gen10.toFixed(1)}`);
  console.log(`  expected: ${expectation}`);
  console.log("");
  return { gen1, gen5, gen10 };
}

function reportPersonality(name, personality, history, expectation) {
  const gen1 = at(history, 1).personalityCounts[personality];
  const gen5 = at(history, 5).personalityCounts[personality];
  const gen10 = at(history, 10).personalityCounts[personality];
  console.log(`${name}`);
  console.log(`  gen 1:  ${gen1}/${POPULATION_SIZE} ${personality}`);
  console.log(`  gen 5:  ${gen5}/${POPULATION_SIZE} ${personality}`);
  console.log(`  gen 10: ${gen10}/${POPULATION_SIZE} ${personality}`);
  console.log(`  expected: ${expectation}`);
  console.log("");
  return { gen1, gen5, gen10 };
}

console.log(`seed ${SEED}, population ${POPULATION_SIZE}, ${PARENT_COUNT} parents selected per generation\n`);

const a = runExperiment((pop) => selectTop(pop, "docility", PARENT_COUNT));
report("Experiment A — select highest docility", "docility", a, "docility rises");

const b = runExperiment((pop) => selectTop(pop, "bodyRoundness", PARENT_COUNT));
report("Experiment B — select highest roundness", "bodyRoundness", b, "roundness rises");
report(
  "Experiment B (cross-trait check) — docility under roundness selection",
  "docility",
  b,
  "should NOT systematically rise — traits inherit independently",
);

const c = runExperiment((pop, rng) => selectRandom(pop, PARENT_COUNT, rng));
report("Experiment C — select randomly", "docility", c, "no consistent directional trend");

const d = runExperiment((pop) => selectTop(pop, "skittishness", PARENT_COUNT));
report(
  "Experiment D — select highest skittishness",
  "skittishness",
  d,
  "skittishness rises — population more likely to flee the pointer",
);

// Bonus check, not one of the four standing experiments: selection can also
// push a trait down, not just up.
const bonus = runExperiment((pop) => selectBottom(pop, "docility", PARENT_COUNT));
report(
  "Bonus — select lowest docility",
  "docility",
  bonus,
  "docility falls",
);

const e = runExperiment((pop) => selectByPersonality(pop, "friendly", PARENT_COUNT));
reportPersonality(
  "Experiment E — select FRIENDLY parents",
  "friendly",
  e,
  "friendly proportion rises — population more comfortable around humans",
);

const f = runExperiment((pop) => selectByPersonality(pop, "shy", PARENT_COUNT));
reportPersonality(
  "Experiment F — select SHY parents",
  "shy",
  f,
  "shy proportion rises — population more likely to flee",
);

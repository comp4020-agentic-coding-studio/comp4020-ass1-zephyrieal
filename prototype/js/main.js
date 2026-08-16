// App wiring only: DOM refs, event handlers, and calls into simulation.js /
// render.js. No trait or inheritance math lives here — see CLAUDE.md's
// "Simulation architecture rule".
import { createRng, seedFromString } from "./rng.js";
import {
  TRAIT_MIN,
  TRAIT_MAX,
  MIN_PARENTS,
  createPopulation,
  selectAnimal,
  deselectAnimal,
  clearSelection,
  calculateStatistics,
  advanceGeneration,
} from "./simulation.js";
import { createRenderer } from "./render.js";

const POPULATION_SIZE = 10;
const NUMERIC_TRAITS = ["bodySize", "bodyRoundness", "docility", "skittishness", "curiosity"];
const TRAIT_LABELS = {
  bodySize: "Body size",
  bodyRoundness: "Roundness",
  docility: "Docility",
  skittishness: "Skittishness",
  curiosity: "Curiosity",
};
const BREED_LABELS = {
  american: "American",
  abyssinian: "Abyssinian",
  silkie: "Silkie/Peruvian",
  teddy: "Teddy",
  bald: "Bald",
  crested: "Crested",
};

function traitBar(value) {
  const filled = clamp(Math.round(value / 10), 0, 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Placeholder eras (prompt section 13) — display labelling only, not
// simulation state. The real historical content arrives in a later phase;
// for now the marker just needs to move as generations progress.
const ERAS = [
  { maxGeneration: 3, label: "WILD CAVIES" },
  { maxGeneration: 7, label: "EARLY DOMESTICATION" },
  { maxGeneration: 12, label: "ANDEAN DOMESTICATION" },
  { maxGeneration: Infinity, label: "LATER HISTORY" },
];
const TIMELINE_SPAN_GENERATIONS = 15;

function getEraLabel(generation) {
  return ERAS.find((era) => generation <= era.maxGeneration).label;
}

const params = new URLSearchParams(window.location.search);
const seedParam = params.get("seed");
const seed = seedParam ?? String(Date.now());
if (!seedParam) {
  params.set("seed", seed);
  history.replaceState(null, "", `?${params.toString()}`);
}

// One seed drives two rng instances: `simRng` for every simulation decision
// (breeding, trait variation) and `renderRng` for cosmetic wander, so the
// simulation's sequence never depends on how long the animation has been
// running before the player clicks Next Generation. Both derive from the
// same seed, so the run is still fully reproducible end to end.
const simRng = createRng(seedFromString(seed));
const renderRng = createRng(seedFromString(`${seed}:movement`));

const els = {
  seed: document.querySelector("[data-testid='seed']"),
  generation: document.querySelector("[data-testid='generation']"),
  selectedCount: document.querySelector("[data-testid='selected-count']"),
  stats: document.querySelector("[data-testid='stats']"),
  comparison: document.querySelector("[data-testid='comparison']"),
  timeline: document.querySelector("[data-testid='timeline']"),
  inspect: document.querySelector("[data-testid='inspect']"),
  keepButton: document.querySelector("[data-testid='keep-button']"),
  nextButton: document.querySelector("[data-testid='next-generation']"),
  message: document.querySelector("[data-testid='message']"),
  playArea: document.querySelector("[data-testid='play-area']"),
};

let population = createPopulation(POPULATION_SIZE, 1, simRng);
let generation = 1;
let inspectedId = null;
const gen1Stats = calculateStatistics(population);
const history_ = [{ generation, ...gen1Stats }];

els.seed.textContent = seed;

function assertPopulationSanity(pop) {
  if (pop.length !== POPULATION_SIZE) {
    console.warn(`Population sanity: expected ${POPULATION_SIZE}, got ${pop.length}`);
  }
  for (const cavy of pop) {
    for (const trait of NUMERIC_TRAITS) {
      const value = cavy[trait];
      if (Number.isNaN(value) || value < TRAIT_MIN || value > TRAIT_MAX) {
        console.warn(`Population sanity: ${cavy.id}.${trait} out of bounds: ${value}`);
      }
    }
  }
}

function renderStats() {
  const { population: count, averages, personalityCounts } = calculateStatistics(population);
  els.stats.innerHTML = `
    <p>Population: ${count}</p>
    <ul>
      ${NUMERIC_TRAITS.map(
        (trait) => `<li>${TRAIT_LABELS[trait]}: ${averages[trait].toFixed(1)}</li>`,
      ).join("")}
    </ul>
    <p class="personality-heading">Personality</p>
    <ul class="personality-counts">
      <li>Shy <strong>${personalityCounts.shy}</strong></li>
      <li>Neutral <strong>${personalityCounts.neutral}</strong></li>
      <li>Friendly <strong>${personalityCounts.friendly}</strong></li>
    </ul>
  `;
}

function renderComparison() {
  const current = calculateStatistics(population).averages;
  const gen1 = gen1Stats.averages;
  els.comparison.innerHTML = `
    <table>
      <thead>
        <tr><th>Trait</th><th>Gen 1</th><th>Gen ${generation}</th><th>Change</th></tr>
      </thead>
      <tbody>
        ${NUMERIC_TRAITS.map((trait) => {
          const delta = current[trait] - gen1[trait];
          const sign = delta > 0 ? "+" : "";
          return `<tr>
            <td>${TRAIT_LABELS[trait]}</td>
            <td>${gen1[trait].toFixed(1)}</td>
            <td>${current[trait].toFixed(1)}</td>
            <td>${sign}${delta.toFixed(1)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderTimeline() {
  const markerPercent = Math.min(1, generation / TIMELINE_SPAN_GENERATIONS) * 100;
  els.timeline.innerHTML = `
    <div class="timeline-bar">
      <span class="timeline-end">6000 BCE</span>
      <div class="timeline-track">
        <div class="timeline-marker" style="left: ${markerPercent}%"></div>
      </div>
      <span class="timeline-end">NOW</span>
    </div>
    <p class="timeline-caption">Generation ${generation} &mdash; ${getEraLabel(generation)}</p>
  `;
}

function renderInspect() {
  const cavy = population.find((c) => c.id === inspectedId);
  if (!cavy) {
    els.inspect.innerHTML = "<p>Click a cavy to inspect it.</p>";
    els.keepButton.disabled = true;
    return;
  }
  els.inspect.innerHTML = `
    <p><strong>${cavy.id}</strong></p>
    <p class="inspect-personality">Personality: <strong>${cavy.personality}</strong></p>
    <ul class="trait-list">
      ${NUMERIC_TRAITS.map(
        (trait) =>
          `<li><span class="trait-name">${TRAIT_LABELS[trait]}</span><span class="trait-bar">${traitBar(cavy[trait])}</span><span class="trait-value">${cavy[trait]}</span></li>`,
      ).join("")}
    </ul>
    <ul>
      <li>Breed: ${BREED_LABELS[cavy.breed]}, coat hue ${cavy.coatHue.toFixed(0)}</li>
      <li>${cavy.selected ? "Selected as parent" : "Not selected"}</li>
    </ul>
  `;
  els.keepButton.disabled = false;
  els.keepButton.textContent = cavy.selected ? "UN-KEEP" : "KEEP";
}

function renderSelectedCount() {
  const count = population.filter((c) => c.selected).length;
  els.selectedCount.textContent = `${count} selected (need ${MIN_PARENTS}+)`;
}

function renderGeneration() {
  els.generation.textContent = String(generation);
}

function renderAll() {
  renderStats();
  renderComparison();
  renderTimeline();
  renderInspect();
  renderSelectedCount();
  renderGeneration();
  renderer.syncPopulation(population);
}

function setMessage(text) {
  els.message.textContent = text ?? "";
}

function toggleSelection(id) {
  const cavy = population.find((c) => c.id === id);
  population = cavy?.selected
    ? deselectAnimal(population, id)
    : selectAnimal(population, id);
  inspectedId = id;
  setMessage("");
  renderAll();
}

const renderer = createRenderer({
  container: els.playArea,
  rng: renderRng,
  onCavyClick: toggleSelection,
});

els.keepButton.addEventListener("click", () => {
  if (inspectedId) toggleSelection(inspectedId);
});

els.nextButton.addEventListener("click", () => {
  try {
    const result = advanceGeneration(population, generation, simRng, {
      size: POPULATION_SIZE,
    });
    population = clearSelection(result.population);
    generation = result.generation;
    inspectedId = null;
    assertPopulationSanity(population);
    history_.push({ generation, ...calculateStatistics(population) });
    setMessage("");
    renderAll();
  } catch (error) {
    setMessage(error.message);
  }
});

renderAll();
renderer.start();

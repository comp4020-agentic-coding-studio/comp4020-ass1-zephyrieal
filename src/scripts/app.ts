// App wiring only: DOM refs, event handlers, and calls into lib/sim/* and
// render.ts. No trait or inheritance math lives here (CLAUDE.md: "Simulation
// architecture rule"). Ported and extended from prototype/js/main.js — adds
// the historical timeline, generation-narrative feedback, and final
// wild-vs-modern comparison the Astro build prompt asks for.
import { createRng, seedFromString } from "../lib/sim/rng";
import {
  MIN_PARENTS,
  NUMERIC_TRAITS,
  createPopulation,
  selectAnimal,
  deselectAnimal,
  clearSelection,
  calculateStatistics,
  advanceGeneration,
  type Breed,
  type Cavy,
  type NumericTrait,
  type Statistics,
} from "../lib/sim/simulation";
import { createRenderer, createCavyPortrait } from "./render";
import { describeGenerationChange } from "../lib/narrative";
import { ERAS, TIMELINE_SPAN_GENERATIONS, currentEra, isEraUnlocked, type Era } from "../data/timeline";
import { historicalEventForEra } from "../data/historicalEvents";

const POPULATION_SIZE = 10;

const TRAIT_LABELS: Record<NumericTrait, string> = {
  bodySize: "Body size",
  bodyRoundness: "Roundness",
  docility: "Docility",
  skittishness: "Skittishness",
  curiosity: "Curiosity",
};
const BREED_LABELS: Record<Breed, string> = {
  shorthair: "Shorthair",
  abyssinian: "Abyssinian",
  peruvian: "Peruvian",
  teddy: "Teddy",
  bald: "Bald",
  crested: "Crested",
  cuy: "Cuy",
  wild: "Wild-type (no breed)",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function traitBar(value: number): string {
  const pct = clamp(Math.round(value), 0, 100);
  return `<span class="trait-bar-fill" style="width:${pct}%"></span>`;
}

function qs<T extends Element>(testId: string): T {
  const el = document.querySelector<T>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`Missing element for data-testid="${testId}"`);
  return el;
}

// Short synthesised tones, not sound files — there's no natural recording for
// either of these the way there's a real cavy wheek, so they're generated
// with the Web Audio API instead. Purely decorative: unsupported/blocked
// playback is swallowed rather than surfaced to the player.
function playTone(frequency: number, durationSeconds: number, peakVolume: number) {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(peakVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationSeconds);
    oscillator.onended = () => ctx.close();
  } catch {
    // Decorative only; ignore playback failures.
  }
}

function playEraChangeDing() {
  playTone(880, 0.5, 0.25);
}

function playButtonClickSound() {
  playTone(320, 0.08, 0.18);
}

// Delegated so every button gets the click sound, including ones added
// later, without wiring each one by hand. Disabled buttons never dispatch a
// click event, so a disabled KEEP/Next Generation stays silent for free.
document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("button")) {
    playButtonClickSound();
  }
});

const els = {
  landing: qs<HTMLElement>("landing-section"),
  gameView: qs<HTMLElement>("game-view"),
  startButton: qs<HTMLButtonElement>("start-button"),
  heroHeading: qs<HTMLElement>("hero-heading"),
  generation: qs<HTMLElement>("generation"),
  selectedCount: qs<HTMLElement>("selected-count"),
  stats: qs<HTMLElement>("stats"),
  comparison: qs<HTMLElement>("comparison"),
  finalComparisonSection: qs<HTMLElement>("final-comparison-section"),
  restartButton: qs<HTMLButtonElement>("restart-button"),
  inspect: qs<HTMLElement>("inspect"),
  keepButton: qs<HTMLButtonElement>("keep-button"),
  nextButton: qs<HTMLButtonElement>("next-generation"),
  message: qs<HTMLElement>("message"),
  playArea: qs<HTMLElement>("play-area"),
  timelineCaption: qs<HTMLElement>("timeline-caption"),
  timelineFill: qs<HTMLElement>("timeline-fill"),
  historicalTitle: qs<HTMLElement>("historical-title"),
  historicalBody: qs<HTMLElement>("historical-body"),
  generationNarrative: qs<HTMLElement>("generation-narrative"),
  traitHistory: qs<HTMLElement>("trait-history"),
};
const eraButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="timeline-era-button"]'));

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

let population = createPopulation(POPULATION_SIZE, 1, simRng);
let generation = 1;
let inspectedId: string | null = null;
const gen1Stats = calculateStatistics(population);
const generationHistory: Array<{ generation: number } & Statistics> = [{ generation, ...gen1Stats }];

// The timeline's "current" era always follows generation progress. A player
// can click back to view an already-unlocked era's historical content
// without that click touching simulation state at all; `followCurrentEra`
// just tracks whether the view should snap back to "current" on the next
// generation, or stay put because the player deliberately looked backward.
let focusedEraId: string = currentEra(generation).id;
let followCurrentEra = true;

function assertPopulationSanity(pop: Cavy[]) {
  if (pop.length !== POPULATION_SIZE) {
    console.warn(`Population sanity: expected ${POPULATION_SIZE}, got ${pop.length}`);
  }
  for (const cavy of pop) {
    for (const trait of NUMERIC_TRAITS) {
      const value = cavy[trait];
      if (Number.isNaN(value) || value < 0 || value > 100) {
        console.warn(`Population sanity: ${cavy.id}.${trait} out of bounds: ${value}`);
      }
    }
  }
}

function renderStats() {
  const { population: count, averages, personalityCounts } = calculateStatistics(population);
  els.stats.innerHTML = `
    <p class="population-count">Population: ${count}</p>
    <ul class="trait-list">
      ${NUMERIC_TRAITS.map(
        (trait) =>
          `<li><span class="trait-name">${TRAIT_LABELS[trait]}</span><span class="trait-bar">${traitBar(averages[trait])}</span><span class="trait-value">${averages[trait].toFixed(1)}</span></li>`,
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

let hasScrolledToFinalComparison = false;

function renderComparison() {
  const current = calculateStatistics(population).averages;
  const gen1 = gen1Stats.averages;
  els.comparison.innerHTML = `
    <table>
      <thead>
        <tr><th>Trait</th><th>Wild founders</th><th>Generation ${generation}</th><th>Change</th></tr>
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
  const wasHidden = els.finalComparisonSection.hidden;
  els.finalComparisonSection.hidden = generation < TIMELINE_SPAN_GENERATIONS;
  if (wasHidden && !els.finalComparisonSection.hidden && !hasScrolledToFinalComparison) {
    hasScrolledToFinalComparison = true;
    els.finalComparisonSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderTimeline() {
  const active = currentEra(generation);
  for (const button of eraButtons) {
    const eraId = button.dataset.eraId ?? "";
    const era = ERAS.find((candidate) => candidate.id === eraId) as Era;
    const unlocked = isEraUnlocked(era, generation);
    button.disabled = !unlocked;
    button.classList.toggle("current", era.id === active.id);
    button.classList.toggle("focused", era.id === focusedEraId);
    button.setAttribute("aria-current", era.id === focusedEraId ? "true" : "false");
  }
  // Progress fill tracks generation, not the focused era — looking back at
  // an unlocked era's history shouldn't make the bar itself retreat.
  const span = TIMELINE_SPAN_GENERATIONS - 1;
  const progress = span <= 0 ? 100 : clamp(((generation - 1) / span) * 100, 0, 100);
  els.timelineFill.style.width = `${progress}%`;
  els.timelineCaption.textContent = `Generation ${generation} — ${active.label}`;
  renderHistoricalPanel();
}

function renderHistoricalPanel() {
  const event = historicalEventForEra(focusedEraId);
  els.historicalTitle.textContent = event?.title ?? "";
  els.historicalBody.textContent = event?.body ?? "";
}

function renderGenerationSummary() {
  const previousEntry = generationHistory[generationHistory.length - 2] ?? null;
  const currentEntry = generationHistory[generationHistory.length - 1];
  els.generationNarrative.textContent = describeGenerationChange(previousEntry, currentEntry);

  const recent = generationHistory.slice(-8);
  els.traitHistory.innerHTML = NUMERIC_TRAITS.map((trait) => {
    const bars = recent
      .map((entry) => {
        const height = clamp(Math.round((entry.averages[trait] / 100) * 100), 4, 100);
        return `<span class="trait-history-bar" style="height:${height}%" title="Gen ${entry.generation}: ${entry.averages[trait].toFixed(1)}"></span>`;
      })
      .join("");
    return `<div class="trait-history-row"><span class="trait-history-label">${TRAIT_LABELS[trait]}</span><span class="trait-history-bars">${bars}</span></div>`;
  }).join("");
}

function renderInspect() {
  const cavy = population.find((c) => c.id === inspectedId);
  if (!cavy) {
    els.inspect.innerHTML = "<p>Click a cavy to inspect it.</p>";
    els.keepButton.disabled = true;
    return;
  }
  els.inspect.innerHTML = `
    <ul class="trait-list">
      ${NUMERIC_TRAITS.map(
        (trait) =>
          `<li><span class="trait-name">${TRAIT_LABELS[trait]}</span><span class="trait-bar">${traitBar(cavy[trait])}</span><span class="trait-value">${cavy[trait]}</span></li>`,
      ).join("")}
    </ul>
    <p class="inspect-detail">Personality: <strong class="capitalize">${cavy.personality}</strong></p>
    <p class="inspect-detail">Breed: <strong>${BREED_LABELS[cavy.breed]}</strong>, coat hue ${cavy.coatHue.toFixed(0)}</p>
    <p class="inspect-detail">${cavy.selected ? "Selected as parent" : "Not selected"}</p>
    <div class="inspect-portrait" aria-hidden="true">${createCavyPortrait(cavy).outerHTML}</div>
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
  if (followCurrentEra) {
    focusedEraId = currentEra(generation).id;
  }
  renderStats();
  renderComparison();
  renderTimeline();
  renderGenerationSummary();
  renderInspect();
  renderSelectedCount();
  renderGeneration();
  renderer.syncPopulation(population);
}

function setMessage(text?: string) {
  els.message.textContent = text ?? "";
}

function toggleSelection(id: string) {
  const cavy = population.find((c) => c.id === id);
  population = cavy?.selected ? deselectAnimal(population, id) : selectAnimal(population, id);
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
    const previousEra = currentEra(generation);
    const result = advanceGeneration(population, generation, simRng, { size: POPULATION_SIZE });
    population = clearSelection(result.population);
    generation = result.generation;
    inspectedId = null;
    assertPopulationSanity(population);
    generationHistory.push({ generation, ...calculateStatistics(population) });
    setMessage("");
    renderAll();
    if (currentEra(generation).id !== previousEra.id) playEraChangeDing();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error));
  }
});

for (const button of eraButtons) {
  button.addEventListener("click", () => {
    const eraId = button.dataset.eraId ?? "";
    const era = ERAS.find((candidate) => candidate.id === eraId);
    if (!era || !isEraUnlocked(era, generation)) return;
    focusedEraId = era.id;
    followCurrentEra = era.id === currentEra(generation).id;
    renderTimeline();
  });
}

// A fresh seed and a real reload, rather than resetting population/generation/
// history in place, so "New Game" can't drift out of sync with any state this
// file tracks (gen1Stats, generationHistory, focusedEraId, and so on).
els.restartButton.addEventListener("click", () => {
  const freshParams = new URLSearchParams(window.location.search);
  freshParams.set("seed", String(Date.now()));
  window.location.search = freshParams.toString();
});

// Deferred until the player clicks Start: syncPopulation (called from
// renderAll) and the RAF loop in renderer.start() both read the play area's
// real layout bounds to place and clamp cavies. Running either while the
// game view is still `hidden` (bounds 0×0) would pin every cavy near the
// corner for as long as the landing screen shows, then look broken the
// moment it's revealed.
function startGame() {
  els.landing.hidden = true;
  els.gameView.hidden = false;
  els.heroHeading.focus();
  renderAll();
  renderer.start();
}

els.startButton.addEventListener("click", startGame, { once: true });

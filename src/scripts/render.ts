// Rendering and movement only. This file reads trait values to decide how a
// cavy looks and moves, but never computes trait math, inheritance, or
// selection logic inline — that all lives in lib/sim/simulation.ts. The
// mouse/food/toy-response decisions themselves (flee/cautious/neutral/
// tolerate/approach and their food/toy equivalents, and how strongly) are
// also pure calculations, in lib/sim/behaviour.ts; this file only turns each
// signed strength into an actual on-screen vector. Per-frame position/
// velocity/familiarity is ephemeral view state, not simulation data: it
// resets whenever a new generation's ids replace the old ones, and
// familiarity in particular must never be written back onto a cavy or
// affect inheritance. Ported from prototype/js/render.js.
import { calculateMouseResponse, calculateFoodResponse, calculatePlayResponse, AWARENESS_RADIUS } from "../lib/sim/behaviour";
import type { Cavy, Breed } from "../lib/sim/simulation";
import type { Rng } from "../lib/sim/rng";
import shorthairSprite from "../assets/cavies/shorthair.svg?raw";
import crestedSprite from "../assets/cavies/crested.svg?raw";
import abyssinianSprite from "../assets/cavies/abyssinian.svg?raw";
import wildSprite from "../assets/cavies/wild.svg?raw";
import baldSprite from "../assets/cavies/bald.svg?raw";
import teddySprite from "../assets/cavies/teddy.svg?raw";
import peruvianSprite from "../assets/cavies/peruvian.svg?raw";
import cuySprite from "../assets/cavies/cuy.svg?raw";
import carrotArt from "../assets/items/carrot.svg?raw";
import toyArt from "../assets/items/toy.svg?raw";

const FLEE_ACCEL = 0.75;
const APPROACH_ACCEL = 0.55;
const FOOD_APPROACH_ACCEL = 0.4;
const FOOD_AVOID_ACCEL = 0.35;
const TOY_APPROACH_ACCEL = 0.45;
const TOY_AVOID_ACCEL = 0.3;
const WANDER_ACCEL = 0.03;
const WANDER_TURN_RATE = 0.12;
const RESPONSE_SMOOTHING = 0.12;
const FRICTION = 0.92;
const MAX_SPEED = 7;
const ITEM_SIZE = 34;
// Ephemeral per-individual "used to the player" value: rises while a cavy
// stays close to the cursor, decays otherwise, and is consulted by
// calculateMouseResponse as a small pre-personality nudge — it can soften a
// flee reaction over time but never override a shy cavy's ceiling into
// actual approach, and it's never stored anywhere but this render-only
// motion map.
const FAMILIARITY_RADIUS = 80;
const FAMILIARITY_GAIN = 0.15;
const FAMILIARITY_DECAY = 0.05;
// "Wheek!" is a purely decorative vocalisation cue — a real guinea pig's
// anticipatory call when it's actively coming toward a person or food, not a
// trait or simulation signal. It fires off the same responseStrength/
// foodResponseStrength values the movement code above already computes, so
// it never duplicates trait/inheritance math (Simulation architecture rule).
const WHEEK_STRENGTH_THRESHOLD = 0.2;
const WHEEK_TRIGGER_CHANCE = 0.02;
const WHEEK_VISIBLE_MS = 700;
const WHEEK_COOLDOWN_MIN_MS = 2500;
const WHEEK_COOLDOWN_MAX_MS = 6000;
const WHEEK_TEXTS = ["Wheek!", "Wheek wheek!"];
// How far past a cavy's own centreline the cursor must sit before the art
// flips — a plain >/< comparison would flicker constantly while the cursor
// drifts back and forth right at the centre.
const FACING_DEADZONE = 10;

// Breeds with real hand-drawn art. Each entry is the id of a <symbol> in one
// of the parsed sprite sheets below — paths inside that symbol are pre-tagged
// "coat-a"/"coat-b" (see src/assets/cavies/*.svg) so the two coat swatches can
// be recoloured per cavy, while the black outline/eye paths, white patches,
// and pink nose (untagged, or fixed colours) never change. Every Breed has an
// entry here, so this is total rather than Partial.
const BREED_ART: Record<Breed, string> = {
  shorthair: "cavy-body-shorthair",
  crested: "cavy-body-crested",
  abyssinian: "cavy-body-abyssinian",
  wild: "cavy-body-wild",
  bald: "cavy-body-bald",
  teddy: "cavy-body-teddy",
  peruvian: "cavy-body-peruvian",
  cuy: "cavy-body-cuy",
};

// `<use href="#symbol">` looked like the obvious way to share one copy of the
// art across every cavy, but a <use>'s referenced content is cloned into an
// internal shadow instance that CSS custom properties do not reliably pierce
// in Chromium: `getComputedStyle` on the <use> element itself resolves
// --coat-a-color correctly, but the cloned <path> inside it falls back to the
// var()'s default instead of the real value. So each cavy that needs art gets
// its own real, adopted clone of the template's paths instead (population is
// capped at 10, so the DOM cost is trivial) — real nodes mean fill can just be
// set directly, no CSS/shadow-boundary pitfalls.
const spriteDocs = [
  shorthairSprite,
  crestedSprite,
  abyssinianSprite,
  wildSprite,
  baldSprite,
  teddySprite,
  peruvianSprite,
  cuySprite,
].map((svg) => new DOMParser().parseFromString(svg, "image/svg+xml"));

function bodyTemplate(symbolId: string): Element | null {
  for (const doc of spriteDocs) {
    const found = doc.getElementById(symbolId);
    if (found) return found;
  }
  return null;
}

// Real guinea pigs come in a wide range of named coat colours — white, black,
// grey, red, orange, yellow, cream, gold, beige, blue-grey ("slate"),
// purple-grey ("lilac"), brown — but never green/cyan/bright purple. coatHue
// (a free-drifting circular trait in simulation.ts; see inheritHue) is mapped
// onto this named palette rather than used as a raw HSL hue: the twelve
// colours are placed as anchors evenly around the full 360° circle, each with
// its own tuned saturation/lightness (a single fixed saturation/lightness
// can't make both a near-white and a near-black read correctly), in an order
// where every step to a neighbouring anchor is a plausible half-step —
// black -> brown -> red -> orange -> gold -> yellow -> cream -> beige ->
// white -> blue-grey -> purple-grey -> grey -> back to black. paletteColorAt
// blends the two nearest anchors, so coatHue's continuous drift/mutation
// still produces continuous colour drift, never a discrete jump, the same
// way the flat hsl(coatHue, ...) circle already read coatHue continuously.
// This is purely a display decision: coatHue itself is untouched.
interface CoatColorAnchor {
  angle: number;
  h: number;
  s: number;
  l: number;
}

const COAT_COLOR_ANCHORS: CoatColorAnchor[] = [
  { angle: 0, h: 30, s: 0.18, l: 0.12 }, // black
  { angle: 30, h: 20, s: 0.45, l: 0.28 }, // brown
  { angle: 60, h: 8, s: 0.55, l: 0.34 }, // red
  { angle: 90, h: 25, s: 0.78, l: 0.5 }, // orange
  { angle: 120, h: 42, s: 0.72, l: 0.56 }, // gold
  { angle: 150, h: 50, s: 0.75, l: 0.64 }, // yellow
  { angle: 180, h: 45, s: 0.55, l: 0.82 }, // cream
  { angle: 210, h: 35, s: 0.35, l: 0.74 }, // beige
  { angle: 240, h: 40, s: 0.05, l: 0.95 }, // white
  { angle: 270, h: 210, s: 0.14, l: 0.58 }, // blue-grey
  { angle: 300, h: 280, s: 0.14, l: 0.56 }, // purple-grey
  { angle: 330, h: 0, s: 0, l: 0.5 }, // grey
];
const COAT_COLOR_ANCHOR_STEP = 360 / COAT_COLOR_ANCHORS.length;

// Bald cavies have no fur to show a coat colour through — coatHue still
// inherits and drifts the same as every other breed, but running it through
// the fur palette above would paint hairless skin brown or slate-grey, which
// reads as wrong (real hairless/skinny cavies show bare pink-toned skin, not
// fur colours). So bald gets its own anchor ring instead of the fur one: same
// 12-anchor/easing machinery, but every anchor stays in the pink/rose/mauve
// family — coatHue still visibly changes the skin's warmth and depth, it just
// never leaves "pink" the way fur can range all the way to black or white.
const SKIN_COLOR_ANCHORS: CoatColorAnchor[] = [
  { angle: 0, h: 350, s: 0.55, l: 0.86 }, // pale pink
  { angle: 30, h: 355, s: 0.62, l: 0.8 }, // pink
  { angle: 60, h: 5, s: 0.65, l: 0.74 }, // rosy pink
  { angle: 90, h: 12, s: 0.55, l: 0.7 }, // warm rose
  { angle: 120, h: 20, s: 0.4, l: 0.72 }, // dusty rose-tan
  { angle: 150, h: 25, s: 0.3, l: 0.78 }, // pale tan-pink
  { angle: 180, h: 340, s: 0.15, l: 0.82 }, // ashy pink
  { angle: 210, h: 320, s: 0.12, l: 0.78 }, // mauve-grey pink
  { angle: 240, h: 300, s: 0.08, l: 0.74 }, // cool grey-pink
  { angle: 270, h: 330, s: 0.2, l: 0.7 }, // slate pink
  { angle: 300, h: 345, s: 0.35, l: 0.72 }, // deep rose
  { angle: 330, h: 350, s: 0.45, l: 0.8 }, // blush pink
];
const SKIN_COLOR_ANCHOR_STEP = 360 / SKIN_COLOR_ANCHORS.length;

// coat-b is the lighter of the two swatches in every sprite (a highlight/
// underside, not a separate patch), so it samples the same palette at a hue
// offset from coat-a (as before) but nudged lighter/less saturated — this
// keeps the two-tone look while still letting both swatches range across all
// twelve named colours as coatHue drifts.
const COAT_B_HUE_OFFSET = 20;
const COAT_B_LIGHTNESS_BOOST = 0.14;
const COAT_B_SATURATION_CUT = 0.12;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Circular lerp: always takes the shorter way round the hue wheel.
function lerpHueShort(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return ((a + diff * t) % 360 + 360) % 360;
}

// Plain linear t spends only its first few percent near each anchor's exact
// colour before sliding toward the next one — fine for anchor pairs that are
// close in lightness/saturation, but "grey" sits right next to "black" with a
// steep lightness drop (0.5 -> 0.12), so a linear blend turns visibly grey
// into visibly dark-brown-black within about 10% of the segment. Easing t
// keeps each anchor's own colour dominant for roughly the first/last third of
// its segment (only the middle third does the actual transitioning), so every
// named colour — not just grey — gets a fair, recognisable band on screen
// instead of being a blink-and-you-miss-it transitional sliver.
function easeSegment(t: number): number {
  return t * t * (3 - 2 * t);
}

function colorAtAnchors(
  hue: number,
  anchors: CoatColorAnchor[],
  step: number,
): { h: number; s: number; l: number } {
  const wrapped = ((hue % 360) + 360) % 360;
  const index = Math.floor(wrapped / step) % anchors.length;
  const next = (index + 1) % anchors.length;
  const rawT = (wrapped - index * step) / step;
  const t = easeSegment(rawT);
  const from = anchors[index];
  const to = anchors[next];
  return {
    h: lerpHueShort(from.h, to.h, t),
    s: lerp(from.s, to.s, t),
    l: lerp(from.l, to.l, t),
  };
}

function paletteColorAt(hue: number): { h: number; s: number; l: number } {
  return colorAtAnchors(hue, COAT_COLOR_ANCHORS, COAT_COLOR_ANCHOR_STEP);
}

function skinColorAt(hue: number): { h: number; s: number; l: number } {
  return colorAtAnchors(hue, SKIN_COLOR_ANCHORS, SKIN_COLOR_ANCHOR_STEP);
}

function hslToHex(hueDeg: number, saturation: number, lightness: number): string {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hPrime = hueDeg / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = lightness - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hPrime < 1) [r, g, b] = [c, x, 0];
  else if (hPrime < 2) [r, g, b] = [x, c, 0];
  else if (hPrime < 3) [r, g, b] = [0, c, x];
  else if (hPrime < 4) [r, g, b] = [0, x, c];
  else if (hPrime < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function naturalCoatColors(coatHue: number, breed: Breed): { a: string; b: string } {
  const colorAt = breed === "bald" ? skinColorAt : paletteColorAt;
  const a = colorAt(coatHue);
  const b = colorAt(coatHue + COAT_B_HUE_OFFSET);
  return {
    a: hslToHex(a.h, a.s, a.l),
    b: hslToHex(b.h, Math.max(0, b.s - COAT_B_SATURATION_CUT), Math.min(0.97, b.l + COAT_B_LIGHTNESS_BOOST)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface Motion {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  wanderAngle: number;
  responseStrength: number;
  foodResponseStrength: number;
  toyResponseStrength: number;
  familiarity: number;
  wheekHideAt: number;
  wheekCooldownUntil: number;
  // All hand-drawn art faces left, so this tracks whether the cursor is
  // currently on the cavy's right side and it should render mirrored. Persists
  // across frames where the cursor is inactive or straddling the deadzone,
  // rather than resetting to the drawn-left default, so the flip doesn't
  // flicker back the instant the mouse leaves.
  facingRight: boolean;
}

interface ItemState {
  x: number;
  y: number;
  width: number;
  height: number;
  dragging: boolean;
  placed: boolean;
}

export interface CreateRendererOptions {
  container: HTMLElement;
  rng: Rng;
  onCavyClick: (id: string) => void;
}

export interface Renderer {
  syncPopulation: (population: Cavy[]) => void;
  start: () => void;
  stop: () => void;
}

// `rng` here is a dedicated instance derived from the same seed as the
// simulation's rng (see app.ts), kept separate so animation-frame-rate
// wander draws never perturb the exact sequence breeding relies on — both
// still go through the one seeded PRNG utility, never Math.random().
export function createRenderer({ container, rng, onCavyClick }: CreateRendererOptions): Renderer {
  const elements = new Map<string, HTMLButtonElement>();
  const wheekBubbles = new Map<string, HTMLSpanElement>();
  const motion = new Map<string, Motion>();
  const cursor = { x: -9999, y: -9999, active: false };
  let currentIds = new Set<string>();
  let frameHandle: number | null = null;
  let latestPopulation: Cavy[] = [];

  container.addEventListener("mousemove", (event) => {
    const rect = container.getBoundingClientRect();
    cursor.x = event.clientX - rect.left;
    cursor.y = event.clientY - rect.top;
    cursor.active = true;
  });
  container.addEventListener("mouseleave", () => {
    cursor.active = false;
  });

  // Food and toy are always-present, player-draggable world objects — not
  // simulation entities, so their position is plain render-owned state,
  // dragged via standard pointer-capture, same as any draggable UI element.
  // Arrow keys nudge the item when it has focus, so dragging isn't the only
  // way to reposition food/toy.
  function createItem(art: string, className: string, label: string) {
    const el = document.createElement("div");
    el.className = `interaction-item ${className}`;
    el.innerHTML = art;
    const svg = el.querySelector("svg");
    svg?.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", `${label}, drag or use arrow keys to move`);
    container.appendChild(el);
    const state: ItemState = { x: 0, y: 0, width: ITEM_SIZE, height: ITEM_SIZE, dragging: false, placed: false };

    el.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      el.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    el.addEventListener("pointermove", (event) => {
      if (!state.dragging) return;
      const rect = container.getBoundingClientRect();
      state.x = clamp(event.clientX - rect.left - state.width / 2, 0, Math.max(1, rect.width - state.width));
      state.y = clamp(event.clientY - rect.top - state.height / 2, 0, Math.max(1, rect.height - state.height));
      placeElement(el, state.x, state.y);
    });
    el.addEventListener("pointerup", (event) => {
      state.dragging = false;
      el.releasePointerCapture(event.pointerId);
    });
    el.addEventListener("keydown", (event) => {
      const step = 16;
      const rect = container.getBoundingClientRect();
      const maxX = Math.max(1, rect.width - state.width);
      const maxY = Math.max(1, rect.height - state.height);
      let handled = true;
      if (event.key === "ArrowLeft") state.x = clamp(state.x - step, 0, maxX);
      else if (event.key === "ArrowRight") state.x = clamp(state.x + step, 0, maxX);
      else if (event.key === "ArrowUp") state.y = clamp(state.y - step, 0, maxY);
      else if (event.key === "ArrowDown") state.y = clamp(state.y + step, 0, maxY);
      else handled = false;
      if (handled) {
        event.preventDefault();
        placeElement(el, state.x, state.y);
      }
    });

    return { el, state };
  }

  const food = createItem(carrotArt, "food-item", "Food");
  const toy = createItem(toyArt, "toy-item", "Toy");

  function placeItemsIfNeeded(bounds: DOMRect) {
    if (bounds.width <= 1) return;
    if (!food.state.placed) {
      food.state.x = 24;
      food.state.y = 24;
      placeElement(food.el, food.state.x, food.state.y);
      food.state.placed = true;
    }
    if (!toy.state.placed) {
      toy.state.x = Math.max(24, bounds.width - toy.state.width - 24);
      toy.state.y = 24;
      placeElement(toy.el, toy.state.x, toy.state.y);
      toy.state.placed = true;
    }
  }

  function makeElement(cavy: Cavy): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cavy";
    el.dataset.id = cavy.id;
    el.setAttribute("aria-label", `Inspect cavy ${cavy.id}`);
    el.addEventListener("click", () => onCavyClick(cavy.id));
    el.classList.add("has-art");
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "cavy-svg");
    svg.setAttribute("viewBox", "0 0 2048 2048");
    const template = bodyTemplate(BREED_ART[cavy.breed]);
    if (template) {
      for (const child of Array.from(template.children)) {
        svg.appendChild(document.importNode(child, true));
      }
    }
    el.appendChild(svg);
    const bubble = document.createElement("span");
    bubble.className = "wheek-bubble";
    bubble.setAttribute("aria-hidden", "true");
    el.appendChild(bubble);
    wheekBubbles.set(cavy.id, bubble);
    container.appendChild(el);
    return el;
  }

  // A cavy's on-screen box isn't square (roundness stretches it), so its
  // width/height are computed once here and reused for both drawing and the
  // movement math below — the two must agree, or the point that "chases" the
  // pointer won't match the point the player sees.
  function cavySize(cavy: Cavy): { width: number; height: number } {
    // Big enough overall to actually show the hand-drawn art (the old 18-58px
    // range read as a smear of colour at a glance), and a wide enough spread
    // (42-130px, >3x) that selecting for body size across a few generations
    // produces an obviously bigger cavy, not just a few imperceptible pixels —
    // bodySize also saturates near its ceiling within 3-4 generations of
    // consistent top-selection, so the range front-loads the visible growth
    // into that window.
    const width = 42 + (cavy.bodySize / 100) * 88;
    const roundness = 0.55 + (cavy.bodyRoundness / 100) * 0.45;
    return { width, height: width * roundness };
  }

  function styleElement(el: HTMLButtonElement, cavy: Cavy) {
    const { width, height } = cavySize(cavy);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    const { a, b } = naturalCoatColors(cavy.coatHue, cavy.breed);
    const svg = el.querySelector(".cavy-svg");
    for (const path of svg?.querySelectorAll(".coat-a") ?? []) {
      path.setAttribute("fill", a);
    }
    for (const path of svg?.querySelectorAll(".coat-b") ?? []) {
      path.setAttribute("fill", b);
    }
    el.classList.toggle("selected", cavy.selected);
  }

  function placeElement(el: HTMLElement, x: number, y: number) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  // Reconciles the DOM with a new population array: removes cavies whose ids
  // are gone (previous generation), adds elements + starting positions for
  // new ids, and re-styles everyone else. Called once per generation and
  // once after every selection change.
  function syncPopulation(population: Cavy[]) {
    const nextIds = new Set(population.map((cavy) => cavy.id));
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        elements.get(id)?.remove();
        elements.delete(id);
        motion.delete(id);
        wheekBubbles.delete(id);
      }
    }
    const bounds = container.getBoundingClientRect();
    for (const cavy of population) {
      let el = elements.get(cavy.id);
      if (!el) {
        el = makeElement(cavy);
        elements.set(cavy.id, el);
        const { width, height } = cavySize(cavy);
        motion.set(cavy.id, {
          x: rng() * Math.max(1, bounds.width - width),
          y: rng() * Math.max(1, bounds.height - height),
          vx: 0,
          vy: 0,
          width,
          height,
          // Wander direction as a slowly-turning heading rather than fresh
          // independent x/y noise every frame, so the path curves smoothly
          // instead of jittering.
          wanderAngle: rng() * Math.PI * 2,
          // Low-pass-filtered response strengths, one per interaction, so a
          // cavy can be mid-flee from the cursor while still drifting toward
          // food — independent pulls that simply add together.
          responseStrength: 0,
          foodResponseStrength: 0,
          toyResponseStrength: 0,
          familiarity: 0,
          wheekHideAt: 0,
          wheekCooldownUntil: 0,
          facingRight: false,
        });
      }
      styleElement(el, cavy);
    }
    currentIds = nextIds;
    latestPopulation = population;
  }

  function step() {
    const bounds = container.getBoundingClientRect();
    placeItemsIfNeeded(bounds);

    for (const cavy of latestPopulation) {
      const pos = motion.get(cavy.id);
      const el = elements.get(cavy.id);
      if (!pos || !el) continue;

      const maxX = Math.max(1, bounds.width - pos.width);
      const maxY = Math.max(1, bounds.height - pos.height);

      pos.wanderAngle += (rng() - 0.5) * 2 * WANDER_TURN_RATE;
      let ax = Math.cos(pos.wanderAngle) * WANDER_ACCEL;
      let ay = Math.sin(pos.wanderAngle) * WANDER_ACCEL;

      // Chase/flee the cavy's centre, not its top-left corner.
      const centerX = pos.x + pos.width / 2;
      const centerY = pos.y + pos.height / 2;

      // Cursor (mouse response)
      let cursorDist = 1;
      if (cursor.active) {
        const dx = centerX - cursor.x;
        const dy = centerY - cursor.y;
        cursorDist = Math.hypot(dx, dy) || 1;

        // Face the cursor left/right, but only once it's within the same
        // radius that actually drives the flee/approach reaction — outside
        // that range the cavy isn't "running toward" or away from it at all,
        // so there's nothing for the facing to react to. A deadzone around
        // the centreline stops the flip flickering when the cursor sits
        // almost directly above/below; leaving pos.facingRight untouched
        // outside the radius (rather than resetting to the drawn-left
        // default) means it holds whichever way it was last reacting.
        if (cursorDist < AWARENESS_RADIUS) {
          if (cursor.x > centerX + FACING_DEADZONE) pos.facingRight = true;
          else if (cursor.x < centerX - FACING_DEADZONE) pos.facingRight = false;
        }

        if (cursorDist < FAMILIARITY_RADIUS) {
          pos.familiarity = Math.min(100, pos.familiarity + FAMILIARITY_GAIN);
        } else {
          pos.familiarity = Math.max(0, pos.familiarity - FAMILIARITY_DECAY);
        }

        let targetStrength = 0;
        if (cursorDist > 12) {
          targetStrength = calculateMouseResponse(cavy, cursorDist, rng, AWARENESS_RADIUS, pos.familiarity).strength;
        }
        pos.responseStrength += (targetStrength - pos.responseStrength) * RESPONSE_SMOOTHING;

        if (Math.abs(pos.responseStrength) > 0.001) {
          if (pos.responseStrength < 0) {
            const magnitude = -pos.responseStrength;
            ax += (dx / cursorDist) * FLEE_ACCEL * magnitude;
            ay += (dy / cursorDist) * FLEE_ACCEL * magnitude;
          } else {
            ax -= (dx / cursorDist) * APPROACH_ACCEL * pos.responseStrength;
            ay -= (dy / cursorDist) * APPROACH_ACCEL * pos.responseStrength;
          }
        }
      } else {
        pos.familiarity = Math.max(0, pos.familiarity - FAMILIARITY_DECAY);
        pos.responseStrength += (0 - pos.responseStrength) * RESPONSE_SMOOTHING;
      }
      el.classList.toggle("facing-right", pos.facingRight);

      // Food
      {
        const foodCenterX = food.state.x + food.state.width / 2;
        const foodCenterY = food.state.y + food.state.height / 2;
        const dx = centerX - foodCenterX;
        const dy = centerY - foodCenterY;
        const dist = Math.hypot(dx, dy) || 1;
        let targetStrength = 0;
        if (dist > 12) {
          targetStrength = calculateFoodResponse(cavy, dist, rng).strength;
        }
        pos.foodResponseStrength += (targetStrength - pos.foodResponseStrength) * RESPONSE_SMOOTHING;
        if (Math.abs(pos.foodResponseStrength) > 0.001) {
          if (pos.foodResponseStrength < 0) {
            const magnitude = -pos.foodResponseStrength;
            ax += (dx / dist) * FOOD_AVOID_ACCEL * magnitude;
            ay += (dy / dist) * FOOD_AVOID_ACCEL * magnitude;
          } else {
            ax -= (dx / dist) * FOOD_APPROACH_ACCEL * pos.foodResponseStrength;
            ay -= (dy / dist) * FOOD_APPROACH_ACCEL * pos.foodResponseStrength;
          }
        }
      }

      // Toy
      {
        const toyCenterX = toy.state.x + toy.state.width / 2;
        const toyCenterY = toy.state.y + toy.state.height / 2;
        const dx = centerX - toyCenterX;
        const dy = centerY - toyCenterY;
        const dist = Math.hypot(dx, dy) || 1;
        let targetStrength = 0;
        if (dist > 12) {
          targetStrength = calculatePlayResponse(cavy, dist, rng).strength;
        }
        pos.toyResponseStrength += (targetStrength - pos.toyResponseStrength) * RESPONSE_SMOOTHING;
        if (Math.abs(pos.toyResponseStrength) > 0.001) {
          if (pos.toyResponseStrength < 0) {
            const magnitude = -pos.toyResponseStrength;
            ax += (dx / dist) * TOY_AVOID_ACCEL * magnitude;
            ay += (dy / dist) * TOY_AVOID_ACCEL * magnitude;
          } else {
            ax -= (dx / dist) * TOY_APPROACH_ACCEL * pos.toyResponseStrength;
            ay -= (dy / dist) * TOY_APPROACH_ACCEL * pos.toyResponseStrength;
          }
        }
      }

      // Wheek! — a cavy actively coming toward the cursor or drawn toward
      // food (a positive response strength, same signal that already pulls
      // it there) occasionally gets a brief "Wheek!" bubble. One rng() roll
      // per eligible frame, gated by a cooldown so it can't fire every frame.
      const isComingToward =
        pos.responseStrength > WHEEK_STRENGTH_THRESHOLD || pos.foodResponseStrength > WHEEK_STRENGTH_THRESHOLD;
      const bubble = wheekBubbles.get(cavy.id);
      if (bubble) {
        const now = performance.now();
        if (
          isComingToward &&
          now >= pos.wheekCooldownUntil &&
          !bubble.classList.contains("visible") &&
          rng() < WHEEK_TRIGGER_CHANCE
        ) {
          bubble.textContent = WHEEK_TEXTS[Math.floor(rng() * WHEEK_TEXTS.length)];
          bubble.classList.add("visible");
          pos.wheekHideAt = now + WHEEK_VISIBLE_MS;
          pos.wheekCooldownUntil = now + WHEEK_COOLDOWN_MIN_MS + rng() * (WHEEK_COOLDOWN_MAX_MS - WHEEK_COOLDOWN_MIN_MS);
        } else if (bubble.classList.contains("visible") && now >= pos.wheekHideAt) {
          bubble.classList.remove("visible");
        }
      }

      pos.vx = clamp((pos.vx + ax) * FRICTION, -MAX_SPEED, MAX_SPEED);
      pos.vy = clamp((pos.vy + ay) * FRICTION, -MAX_SPEED, MAX_SPEED);

      // Bounce off the play-area edges instead of sticking to them.
      let nextX = pos.x + pos.vx;
      if (nextX <= 0 || nextX >= maxX) {
        pos.vx = -pos.vx;
        pos.wanderAngle = Math.PI - pos.wanderAngle;
        nextX = clamp(nextX, 0, maxX);
      }
      let nextY = pos.y + pos.vy;
      if (nextY <= 0 || nextY >= maxY) {
        pos.vy = -pos.vy;
        pos.wanderAngle = -pos.wanderAngle;
        nextY = clamp(nextY, 0, maxY);
      }
      pos.x = nextX;
      pos.y = nextY;
      placeElement(el, pos.x, pos.y);
    }
    frameHandle = requestAnimationFrame(step);
  }

  function start() {
    if (frameHandle === null) frameHandle = requestAnimationFrame(step);
  }

  function stop() {
    if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    frameHandle = null;
  }

  return { syncPopulation, start, stop };
}

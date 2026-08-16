// Rendering and movement only. This file reads trait values to decide how a
// cavy looks and moves, but never computes trait math, inheritance, or
// selection logic inline — that all lives in simulation.js. The mouse/food/
// toy-response decisions themselves (flee/cautious/neutral/tolerate/approach
// and their food/toy equivalents, and how strongly) are also pure
// calculations, in behaviour.js; this file only turns each signed strength
// into an actual on-screen vector. Per-frame position/velocity/familiarity is
// ephemeral view state, not simulation data: it resets whenever a new
// generation's ids replace the old ones, and familiarity in particular must
// never be written back onto a cavy or affect inheritance (prompt section 8).
import { calculateMouseResponse, calculateFoodResponse, calculatePlayResponse, AWARENESS_RADIUS } from "./behaviour.js";

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
// Ephemeral per-individual "used to the player" value (prompt section 8):
// rises while a cavy stays close to the cursor, decays otherwise, and is
// consulted by calculateMouseResponse as a small pre-personality nudge — it
// can soften a flee reaction over time but never override a shy cavy's
// ceiling into actual approach, and it's never stored anywhere but this
// render-only motion map.
const FAMILIARITY_RADIUS = 80;
const FAMILIARITY_GAIN = 0.15;
const FAMILIARITY_DECAY = 0.05;
// Placeholder textures standing in for each breed's real coat type (spec
// section 19: no graphics polish yet) — just enough to tell breeds apart at a
// glance. Independent of coatHue, which still carries colour.
const BREED_TEXTURES = {
  american: null,
  abyssinian: "radial-gradient(circle at 25% 30%, rgb(0 0 0 / 25%) 0 10%, transparent 11%), radial-gradient(circle at 55% 20%, rgb(0 0 0 / 25%) 0 8%, transparent 9%), radial-gradient(circle at 70% 55%, rgb(0 0 0 / 25%) 0 10%, transparent 11%), radial-gradient(circle at 35% 70%, rgb(0 0 0 / 25%) 0 9%, transparent 10%)",
  silkie: "linear-gradient(180deg, transparent 50%, rgb(255 255 255 / 30%) 75%, transparent 100%)",
  teddy: "repeating-linear-gradient(45deg, rgb(0 0 0 / 14%) 0 2px, transparent 2px 5px), repeating-linear-gradient(-45deg, rgb(0 0 0 / 14%) 0 2px, transparent 2px 5px)",
  bald: "linear-gradient(rgb(255 235 225 / 55%), rgb(255 235 225 / 55%))",
  crested: "radial-gradient(circle at 50% 12%, rgb(255 255 255 / 60%) 0 10%, transparent 11%)",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// `rng` here is a dedicated instance derived from the same seed as the
// simulation's rng (see main.js), kept separate so animation-frame-rate
// wander draws never perturb the exact sequence breeding relies on — both
// still go through the one seeded PRNG utility, never Math.random().
export function createRenderer({ container, rng, onCavyClick }) {
  const elements = new Map();
  const motion = new Map();
  const cursor = { x: -9999, y: -9999, active: false };
  let currentIds = new Set();
  let frameHandle = null;

  container.addEventListener("mousemove", (event) => {
    const rect = container.getBoundingClientRect();
    cursor.x = event.clientX - rect.left;
    cursor.y = event.clientY - rect.top;
    cursor.active = true;
  });
  container.addEventListener("mouseleave", () => {
    cursor.active = false;
  });

  // Food and toy are always-present, player-draggable world objects (prompt
  // sections 5/6) — not simulation entities, so their position is plain
  // render-owned state, dragged via standard pointer-capture, same as any
  // draggable UI element.
  function createItem(emoji, className) {
    const el = document.createElement("div");
    el.className = `interaction-item ${className}`;
    el.textContent = emoji;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", className === "food-item" ? "Food, drag to move" : "Toy, drag to move");
    container.appendChild(el);
    const state = { x: 0, y: 0, width: ITEM_SIZE, height: ITEM_SIZE, dragging: false, placed: false };

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

    return { el, state };
  }

  const food = createItem("🥕", "food-item");
  const toy = createItem("🧸", "toy-item");

  function placeItemsIfNeeded(bounds) {
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

  function makeElement(cavy) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cavy";
    el.dataset.id = cavy.id;
    el.setAttribute("aria-label", `Inspect cavy ${cavy.id}`);
    el.addEventListener("click", () => onCavyClick(cavy.id));
    container.appendChild(el);
    return el;
  }

  // A cavy's on-screen box isn't square (roundness stretches it), so its
  // width/height are computed once here and reused for both drawing and the
  // movement math below — the two must agree, or the point that "chases" the
  // pointer won't match the point the player sees.
  function cavySize(cavy) {
    const width = 22 + (cavy.bodySize / 100) * 26;
    const roundness = 0.55 + (cavy.bodyRoundness / 100) * 0.45;
    return { width, height: width * roundness };
  }

  function styleElement(el, cavy) {
    const { width, height } = cavySize(cavy);
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.background = `hsl(${cavy.coatHue.toFixed(0)}deg 65% 55%)`;
    el.style.backgroundImage = BREED_TEXTURES[cavy.breed] ?? "none";
    el.classList.toggle("selected", cavy.selected);
  }

  function placeElement(el, x, y) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  // Reconciles the DOM with a new population array: removes cavies whose ids
  // are gone (previous generation), adds elements + starting positions for
  // new ids, and re-styles everyone else. Called once per generation and
  // once after every selection change.
  function syncPopulation(population) {
    const nextIds = new Set(population.map((cavy) => cavy.id));
    for (const id of currentIds) {
      if (!nextIds.has(id)) {
        elements.get(id)?.remove();
        elements.delete(id);
        motion.delete(id);
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
          // independent x/y noise every frame — the latter produces a
          // high-frequency jitter (each frame yanks the accel vector to a
          // whole new random direction), while a heading that only nudges by
          // a small amount per frame traces a smooth, gently curving path.
          wanderAngle: rng() * Math.PI * 2,
          // Low-pass-filtered response strengths: each calculate*Response
          // re-rolls its hesitation chance every frame, and applying that raw
          // value directly would make the flee/approach push snap on and off
          // at 60fps. Smoothing keeps the *behaviour* (occasional hesitation)
          // while making the resulting motion fluid. One per interaction so a
          // cavy can be, say, mid-flee from the cursor while still drifting
          // toward food — they're independent pulls that simply add together.
          responseStrength: 0,
          foodResponseStrength: 0,
          toyResponseStrength: 0,
          // Ephemeral only — see the FAMILIARITY_* constants above.
          familiarity: 0,
        });
      }
      styleElement(el, cavy);
    }
    currentIds = nextIds;
    latestPopulation = population;
  }

  let latestPopulation = [];

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

      // Chase/flee the cavy's centre, not its top-left corner — otherwise the
      // corner (not the visible body) ends up the point that homes in on
      // whatever it's reacting to.
      const centerX = pos.x + pos.width / 2;
      const centerY = pos.y + pos.height / 2;

      // Cursor (mouse response)
      let cursorDist = 1;
      if (cursor.active) {
        const dx = centerX - cursor.x;
        const dy = centerY - cursor.y;
        cursorDist = Math.hypot(dx, dy) || 1;

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

      pos.vx = clamp((pos.vx + ax) * FRICTION, -MAX_SPEED, MAX_SPEED);
      pos.vy = clamp((pos.vy + ay) * FRICTION, -MAX_SPEED, MAX_SPEED);

      // Bounce off the play-area edges instead of sticking to them: reflect
      // the velocity and mirror the wander heading across the wall's normal,
      // so the cavy visibly changes direction on contact rather than pinning
      // itself against the edge while still "pushing" into it.
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

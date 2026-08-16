// Pure interaction-response calculations. Given a cavy's traits, its distance
// to whatever it's reacting to, and the shared rng, these return a signed
// reaction — never touch the DOM or decide screen coordinates; render.ts
// turns each one into an actual on-screen vector. Ported unchanged from
// prototype/js/behaviour.js.
import type { Rng } from "./rng";
import type { Cavy, Personality } from "./simulation";

export const AWARENESS_RADIUS = 150;

export interface Response {
  mode: string;
  strength: number;
}

// docility -> affinity, piecewise-linear across five bands:
//   0-25 strongly flee, 25-45 cautious, 45-60 neutral, 60-80 tolerate,
//   80-100 approach. Interpolating between the band centres (rather than a
//   hard cliff at one threshold) gives a continuous spectrum instead of a
//   binary good/bad split.
const DOCILITY_AFFINITY_POINTS: [number, number][] = [
  [0, -1],
  [25, -0.6],
  [45, -0.06],
  [60, 0.06],
  [80, 0.4],
  [100, 1],
];

// curiosity -> affinity for the toy. Low curiosity reads as indifference, not
// fear — a bored cavy just doesn't care about a toy, it isn't scared of one —
// so the low end sits much closer to 0 than docility's low end does.
const CURIOSITY_AFFINITY_POINTS: [number, number][] = [
  [0, -0.2],
  [30, -0.05],
  [50, 0.05],
  [70, 0.35],
  [100, 0.9],
];

function traitAffinity(value: number, points: [number, number][]): number {
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return points[points.length - 1][1];
}

// Personality (simulation.ts) is inherited independently of docility/
// curiosity, so two cavies with identical stats can still behave differently.
// Critically, this has to be applied to the affinity value itself, BEFORE the
// flee-vs-approach branch below decides which way a cavy reacts — a
// multiplier applied only after that branch is chosen can scale the reaction
// up or down but can never flip it, so a "friendly" cavy whose docility has
// drifted low would still be stuck fleeing forever. A floor/ceiling on
// affinity fixes that: "friendly" cavies always have at least a mild
// approach-leaning affinity no matter how their stats read, "shy" ones always
// keep at least a mild avoid-leaning affinity even at high docility/
// curiosity, and "neutral" ones have their affinity pulled toward
// indifference either way.
//
// Each interaction (mouse/food/toy) gets its own gating tables, tuned to how
// strongly personality should override the raw trait for that interaction:
//   - mouse: shy always keeps some wariness; friendly always keeps some pull.
//   - food: shy is only gently capped (hesitate/approach slowly, not a
//     permanent flee) and neutral gets a small floor too (may investigate and
//     eventually approach).
//   - toy: shy is capped harder (generally avoids the toy); neutral is
//     damped rather than floored (occasionally investigates).
const MOUSE_FLOOR: Partial<Record<Personality, number>> = { friendly: 0.35 };
const MOUSE_CEILING: Partial<Record<Personality, number>> = { shy: -0.15 };
const MOUSE_DAMPING: Partial<Record<Personality, number>> = { neutral: 0.3 };

const FOOD_FLOOR: Partial<Record<Personality, number>> = { friendly: 0.5, neutral: 0.15 };
const FOOD_CEILING: Partial<Record<Personality, number>> = { shy: -0.05 };
const FOOD_DAMPING: Partial<Record<Personality, number>> = {};

const TOY_FLOOR: Partial<Record<Personality, number>> = { friendly: 0.45 };
const TOY_CEILING: Partial<Record<Personality, number>> = { shy: -0.2 };
const TOY_DAMPING: Partial<Record<Personality, number>> = { neutral: 0.35 };

function applyPersonality(
  affinity: number,
  personality: Personality,
  floorTable: Partial<Record<Personality, number>>,
  ceilingTable: Partial<Record<Personality, number>>,
  dampingTable: Partial<Record<Personality, number>>,
): number {
  let result = affinity * (dampingTable[personality] ?? 1);
  const floor = floorTable[personality];
  if (floor !== undefined) result = Math.max(result, floor);
  const ceiling = ceilingTable[personality];
  if (ceiling !== undefined) result = Math.min(result, ceiling);
  return result;
}

interface ModeNames {
  stronglyAway: string;
  mildlyAway: string;
  stronglyToward: string;
  mildlyToward: string;
  neutral: string;
}

// Shared shape for all three interactions: signed strength (negative = move
// away, positive = move toward, 0 = ignore), magnitude in [0, 1], with a
// small chance to hesitate rather than react this tick so behaviour isn't
// perfectly predictable frame to frame.
function respond(
  affinity: number,
  proximity: number,
  modeNames: ModeNames,
  rng: Rng,
  awayMultiplier = 1,
): Response {
  let strength: number;
  let mode: string;
  if (affinity < -0.02) {
    strength = affinity * proximity * awayMultiplier;
    mode = affinity < -0.4 ? modeNames.stronglyAway : modeNames.mildlyAway;
  } else if (affinity > 0.02) {
    strength = affinity * proximity;
    mode = affinity > 0.6 ? modeNames.stronglyToward : modeNames.mildlyToward;
  } else {
    return { mode: modeNames.neutral, strength: 0 };
  }

  if (rng() < 0.12) {
    strength *= 0.15;
  }

  return { mode, strength: Math.max(-1, Math.min(1, strength)) };
}

// Returns { mode, strength }. render.ts just needs to turn the sign +
// magnitude into a vector. `familiarity` (0-100) is ephemeral render-only
// state tracking repeated interaction with this individual — it nudges the
// raw docility affinity up slightly BEFORE personality gating, so a shy cavy
// flees a little less over time without ever crossing its personality's
// ceiling into actually approaching (taming an individual softens fear, it
// doesn't rewrite temperament or genetics).
export function calculateMouseResponse(
  cavy: Cavy,
  distance: number,
  rng: Rng,
  radius = AWARENESS_RADIUS,
  familiarity = 0,
): Response {
  if (distance >= radius) {
    return { mode: "neutral", strength: 0 };
  }
  const rawAffinity = traitAffinity(cavy.docility, DOCILITY_AFFINITY_POINTS) + (familiarity / 100) * 0.3;
  const affinity = applyPersonality(rawAffinity, cavy.personality, MOUSE_FLOOR, MOUSE_CEILING, MOUSE_DAMPING);
  const proximity = 1 - distance / radius;

  // A skittish animal reacts harder to a given amount of "unease"; a calm one
  // (low skittishness) shrugs off the same affinity even if its docility
  // score is middling. Only scales the flee side's magnitude — mode is still
  // decided from the unscaled affinity, so skittishness can't itself flip a
  // "cautious" reaction into "flee".
  const skittishFactor = 0.4 + 0.6 * (cavy.skittishness / 100);

  return respond(
    affinity,
    proximity,
    {
      stronglyAway: "flee",
      mildlyAway: "cautious",
      stronglyToward: "approach",
      mildlyToward: "tolerate",
      neutral: "neutral",
    },
    rng,
    skittishFactor,
  );
}

// Food response: driven by docility (comfort with a human-offered object),
// gated more gently than the mouse response since food isn't inherently
// threatening the way a looming pointer can be.
export function calculateFoodResponse(cavy: Cavy, distance: number, rng: Rng, radius = AWARENESS_RADIUS): Response {
  if (distance >= radius) {
    return { mode: "neutral", strength: 0 };
  }
  const affinity = applyPersonality(
    traitAffinity(cavy.docility, DOCILITY_AFFINITY_POINTS),
    cavy.personality,
    FOOD_FLOOR,
    FOOD_CEILING,
    FOOD_DAMPING,
  );
  const proximity = 1 - distance / radius;
  return respond(affinity, proximity, {
    stronglyAway: "avoid",
    mildlyAway: "hesitant",
    stronglyToward: "eating",
    mildlyToward: "interested",
    neutral: "neutral",
  }, rng);
}

// Toy response: driven by curiosity rather than docility — a cavy's interest
// in play is a different question from its comfort around a human.
export function calculatePlayResponse(cavy: Cavy, distance: number, rng: Rng, radius = AWARENESS_RADIUS): Response {
  if (distance >= radius) {
    return { mode: "neutral", strength: 0 };
  }
  const affinity = applyPersonality(
    traitAffinity(cavy.curiosity, CURIOSITY_AFFINITY_POINTS),
    cavy.personality,
    TOY_FLOOR,
    TOY_CEILING,
    TOY_DAMPING,
  );
  const proximity = 1 - distance / radius;
  return respond(affinity, proximity, {
    stronglyAway: "avoid",
    mildlyAway: "wary",
    stronglyToward: "play",
    mildlyToward: "investigate",
    neutral: "neutral",
  }, rng);
}

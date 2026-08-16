// Pure "what did that selection just do" narration — the artificial-selection
// feedback the spec asks for. Compares two Statistics snapshots (the
// generation just replaced, and the one that replaced it) and phrases the
// single most notable shift. No DOM, no simulation state — just a string.
import { NUMERIC_TRAITS, PERSONALITIES, type NumericTrait, type Statistics } from "./sim/simulation";

const TRAIT_DESCRIPTORS: Record<NumericTrait, { rising: string; falling: string }> = {
  bodySize: { rising: "larger", falling: "smaller" },
  bodyRoundness: { rising: "rounder", falling: "leaner" },
  docility: { rising: "calmer around people", falling: "more independent-minded" },
  skittishness: { rising: "quicker to startle", falling: "more relaxed" },
  curiosity: { rising: "more curious", falling: "less curious" },
};

export function describeGenerationChange(previous: Statistics | null, current: Statistics): string {
  if (!previous) {
    return "This is the founding generation: wild-caught, wary, and uniform.";
  }

  let bestLabel = "";
  let bestMagnitude = 0;

  for (const trait of NUMERIC_TRAITS) {
    const delta = current.averages[trait] - previous.averages[trait];
    const magnitude = Math.abs(delta) / 100;
    if (magnitude > bestMagnitude) {
      const descriptor = TRAIT_DESCRIPTORS[trait];
      bestLabel = delta >= 0 ? descriptor.rising : descriptor.falling;
      bestMagnitude = magnitude;
    }
  }

  for (const personality of PERSONALITIES) {
    const delta = (current.personalityCounts[personality] - previous.personalityCounts[personality]) / current.population;
    if (personality === "friendly" && delta > bestMagnitude) {
      bestLabel = "more comfortable around people";
      bestMagnitude = delta;
    } else if (personality === "shy" && delta > bestMagnitude) {
      bestLabel = "more likely to keep their distance";
      bestMagnitude = delta;
    }
  }

  if (bestMagnitude < 0.01) {
    return "The population held steady this generation — no strong trend yet.";
  }

  return `Your selection is shaping the population: it's becoming ${bestLabel}.`;
}

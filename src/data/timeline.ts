// Historical eras shown on the timeline. Progression through eras is driven
// primarily by generation count (an era "unlocks" once the population
// reaches its minGeneration) — the player can revisit an already-unlocked
// era's historical content at any time without touching simulation state,
// but cannot jump ahead to an era the population hasn't reached yet.

export interface Era {
  id: string;
  label: string;
  minGeneration: number;
  years: string;
}

export const TIMELINE_SPAN_GENERATIONS = 16;

export const ERAS: Era[] = [
  { id: "wild", label: "Wild Cavies", minGeneration: 1, years: "~6000 years ago" },
  { id: "early-interaction", label: "Early Human Interaction", minGeneration: 2, years: "~5000 years ago" },
  { id: "andean-domestication", label: "Andean Domestication", minGeneration: 5, years: "~3000 years ago" },
  { id: "european-history", label: "Cavies in European History", minGeneration: 9, years: "16th century" },
  { id: "pets", label: "Guinea Pigs as Pets", minGeneration: 12, years: "19th–20th century" },
  { id: "modern-breeds", label: "Modern Breeds", minGeneration: 16, years: "Today" },
];

export function currentEra(generation: number): Era {
  let match = ERAS[0];
  for (const era of ERAS) {
    if (generation >= era.minGeneration) match = era;
  }
  return match;
}

export function isEraUnlocked(era: Era, generation: number): boolean {
  return generation >= era.minGeneration;
}

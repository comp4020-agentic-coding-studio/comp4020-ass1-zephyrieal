// Short, deliberately conservative historical notes for each era on the
// timeline. General-knowledge summaries, not researched specifics — the
// point is scene-setting for the simulation, not a history lesson.

export interface HistoricalEvent {
  eraId: string;
  title: string;
  body: string;
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  {
    eraId: "wild",
    title: "Wild cavies",
    body: "Wild Andean cavies were uniform: agouti-brown, short-coated, and quick to bolt. No individual was ever friendly.",
  },
  {
    eraId: "early-interaction",
    title: "Early human interaction",
    body: "Early Andean communities bred from the cavies that tolerated people best. Wariness began to vary between individuals for the first time.",
  },
  {
    eraId: "andean-domestication",
    title: "Andean domestication",
    body: "Cavies were domesticated in the Andes millennia ago, prized for food and companionship. Deliberate breeding for calmer animals reshaped the population, the same process you're driving here.",
  },
  {
    eraId: "european-history",
    title: "Cavies in European history",
    body: "Guinea pigs reached Europe in the 16th century, prized as novel pets among the wealthy and bred for appearance over practicality.",
  },
  {
    eraId: "pets",
    title: "Guinea pigs as pets",
    body: "Through the 19th–20th centuries, breeders competed over coat, colour, and disposition — selection pressure shifted almost entirely toward what people found appealing.",
  },
  {
    eraId: "modern-breeds",
    title: "Modern breeds",
    body: "Today's breeds — Shorthairs, Abyssinians, Peruvians, Teddies, hairless lines, the larger Andean cuy — all descend from the same wary wild stock.",
  },
];

export function historicalEventForEra(eraId: string): HistoricalEvent | undefined {
  return HISTORICAL_EVENTS.find((event) => event.eraId === eraId);
}

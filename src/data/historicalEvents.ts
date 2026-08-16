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
    body: "Before any human involvement, wild cavies in the South American Andes were uniform: agouti-brown, short-coated, and quick to bolt from anything unfamiliar. There was no such thing as a friendly cavy — every individual's survival depended on staying wary.",
  },
  {
    eraId: "early-interaction",
    title: "Early human interaction",
    body: "As early Andean communities began keeping cavies close to home, the animals that tolerated people best were the ones people kept breeding from. Wariness didn't disappear — it started to vary from one individual to the next, for the first time in the population's history.",
  },
  {
    eraId: "andean-domestication",
    title: "Andean domestication",
    body: "Cavies were domesticated in the Andes several thousand years ago, valued for food and companionship long before they became pets elsewhere. Andean communities still call them cuy today, and continue to breed larger, meatier lines for that same purpose. Generations of deliberate breeding for calmer, more approachable animals began to reshape the population — the same process you're driving here through selection.",
  },
  {
    eraId: "european-history",
    title: "Cavies in European history",
    body: "Guinea pigs reached Europe in the 16th century, brought back on trading ships and quickly prized as novel, sociable pets among the wealthy. Removed from their original context, they were bred less for practicality and more for appearance and temperament.",
  },
  {
    eraId: "pets",
    title: "Guinea pigs as pets",
    body: "Through the 19th and 20th centuries, guinea pigs became common household pets and show animals, with breeders competing over coat, colour, and disposition. Selection pressure shifted almost entirely toward traits people found appealing to live with.",
  },
  {
    eraId: "modern-breeds",
    title: "Modern breeds",
    body: "Today's guinea pigs come in a striking range of recognised breeds — smooth-coated Shorthairs, rosetted Abyssinians, long-haired Peruvians, curly Teddies, hairless breeds, the larger Andean cuy, and more — all descended from the same wary Andean wild stock, reshaped one chosen generation at a time.",
  },
];

export function historicalEventForEra(eraId: string): HistoricalEvent | undefined {
  return HISTORICAL_EVENTS.find((event) => event.eraId === eraId);
}

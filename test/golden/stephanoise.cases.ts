import type { ScoringCase } from "./scoring-case";

// Règlement officiel de la coinche, E. Marquez, 2013 (« La marque »,
// « Coinche / surcoinche », capot, sans atout doublé) :
// https://coinche-stephanoise.com/mesdocuments/reglement_coinche.pdf
// Règles maison qui comblent ses silences : engine-design.md section 6.5.
const MARQUEZ = "https://coinche-stephanoise.com/mesdocuments/reglement_coinche.pdf";
const MAISON = "engine-design.md section 6.5 (règle maison)";
const preset = { id: "stephanoise-marquez", version: 1 } as const;

export const STEPHANOISE_CASES: readonly ScoringCase[] = [
  {
    name: "contrat simple réussi : contrat + points faits + annonces",
    source: MARQUEZ,
    preset,
    facts: { value: 90, cardPoints: [100, 62], declarations: [20, 0] },
    expected: { outcome: "made", marks: [210, 62] },
  },
  {
    name: "contrat simple réussi : la défense marque ses points et ses annonces",
    source: MAISON,
    preset,
    facts: { value: 90, cardPoints: [110, 52], declarations: [0, 20] },
    expected: { outcome: "made", marks: [200, 72] },
  },
  {
    name: "contrat chuté : 160 + contrat + annonces à la défense",
    source: MARQUEZ,
    preset,
    facts: { value: 90, cardPoints: [70, 92], declarations: [0, 50] },
    expected: { outcome: "failed", marks: [0, 300] },
  },
  {
    name: "coinché chuté : 160 + 2 × contrat au coincheur",
    source: MARQUEZ,
    preset,
    facts: { value: 90, doubling: 1, cardPoints: [70, 92] },
    expected: { outcome: "failed", marks: [0, 340] },
  },
  {
    name: "coinché réussi : 160 + 2 × contrat + annonces + belote",
    source: MARQUEZ,
    preset,
    facts: { value: 90, doubling: 1, cardPoints: [100, 62], declarations: [20, 0], belote: [20, 0] },
    expected: { outcome: "made", marks: [380, 0] },
  },
  {
    name: "surcoinché réussi : 160 + 4 × contrat",
    source: MAISON,
    preset,
    facts: { value: 90, doubling: 2, cardPoints: [100, 62] },
    expected: { outcome: "made", marks: [520, 0] },
  },
  {
    name: "sans atout : le contrat compte double (82 SA réussi)",
    source: MARQUEZ,
    preset,
    facts: { mode: "no-trump", value: 82, cardPoints: [100, 62] },
    expected: { outcome: "made", marks: [264, 62] },
  },
  {
    name: "capot demandé réussi : 250 + 250 + annonces",
    source: MARQUEZ,
    preset,
    facts: { value: "capot", cardPoints: [252, 0], tricks: [8, 0], declarations: [20, 0] },
    expected: { outcome: "made", marks: [520, 0] },
  },
  {
    name: "capot demandé à sans atout : 250 × 2 + 250",
    source: MARQUEZ,
    preset,
    facts: { mode: "no-trump", value: "capot", cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [750, 0] },
  },
  {
    name: "capot non demandé : 250 + contrat",
    source: MARQUEZ,
    preset,
    facts: { value: 90, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [340, 0] },
  },
  {
    name: "enchère au point près, sans arrondi",
    source: MAISON,
    preset,
    facts: { value: 87, cardPoints: [95, 67] },
    expected: { outcome: "made", marks: [182, 67] },
  },
  {
    name: "faire son contrat suffit, sans dépasser la défense",
    source: MARQUEZ,
    preset,
    facts: { value: 82, cardPoints: [82, 80], declarations: [0, 50] },
    expected: { outcome: "made", marks: [164, 130] },
  },
];

import type { ScoringCase } from "./scoring-case";

// coinche@1 et coinche-sa-ta-ffb2015@1 : formules de la section 8 de la spec
// SA/TA (règlement FFB 2015, section 10), exemples dorés 1 à 5.
const SPEC = "FFB 2015 coinche PDF, SA/TA annex, worked examples";
const coinche = { id: "coinche", version: 1 } as const;
const saTa = { id: "coinche-sa-ta-ffb2015", version: 1 } as const;
const BOTH = { cardPoints: [100, 62], declarations: [20, 50], belote: [40, 20] } as const;

export const COINCHE_CASES: readonly ScoringCase[] = [
  {
    name: "100 réussi : total de comparaison + contrat, arrondis",
    source: SPEC,
    preset: coinche,
    facts: { value: 100, cardPoints: [110, 52], belote: [20, 0] },
    expected: { outcome: "made", marks: [230, 50] },
  },
  {
    name: "100 chuté : 160 + contrat à la défense",
    source: SPEC,
    preset: coinche,
    facts: { value: 100, cardPoints: [90, 72] },
    expected: { outcome: "failed", marks: [0, 260] },
  },
  {
    name: "égalité de totaux : chute (il faut dépasser la défense)",
    source: SPEC,
    preset: coinche,
    facts: { value: 80, cardPoints: [81, 81] },
    expected: { outcome: "failed", marks: [0, 240] },
  },
  {
    name: "coinché réussi : (160 + C + annonces + belote) × 2",
    source: SPEC,
    preset: coinche,
    facts: { value: 100, doubling: 1, cardPoints: [110, 52], declarations: [20, 0], belote: [20, 0] },
    expected: { outcome: "made", marks: [600, 0] },
  },
  {
    name: "surcoinché chuté : (160 + C + belote défense) × 4",
    source: SPEC,
    preset: coinche,
    facts: { value: 100, doubling: 2, cardPoints: [80, 82], belote: [0, 20] },
    expected: { outcome: "failed", marks: [0, 1120] },
  },
  {
    name: "capot demandé réussi avec cinquante : 552 arrondi à 550",
    source: SPEC,
    preset: coinche,
    facts: { value: "capot", cardPoints: [252, 0], tricks: [8, 0], declarations: [50, 0] },
    expected: { outcome: "made", marks: [550, 0] },
  },
  {
    name: "capot demandé chuté : 160 + 250",
    source: SPEC,
    preset: coinche,
    facts: { value: "capot", cardPoints: [150, 12], tricks: [7, 1] },
    expected: { outcome: "failed", marks: [0, 410] },
  },
  {
    name: "exemple 1 : SA 90 réussi, plis 96/66",
    source: SPEC,
    preset: saTa,
    facts: { mode: "no-trump", value: 90, cardPoints: [96, 66] },
    expected: { outcome: "made", marks: [190, 70] },
  },
  {
    name: "exemple 2 : TA 100 coinché réussi",
    source: SPEC,
    preset: saTa,
    facts: { mode: "all-trump", value: 100, doubling: 1, ...BOTH },
    expected: { outcome: "made", marks: [740, 20] },
  },
  {
    name: "exemple 3 : TA 120 surcoinché chuté",
    source: SPEC,
    preset: saTa,
    facts: { mode: "all-trump", value: 120, doubling: 2, ...BOTH, cardPoints: [70, 92] },
    expected: { outcome: "failed", marks: [40, 1480] },
  },
  {
    name: "exemple 4 : TA 100 capot réalisé, les 50 d'annonces changent de camp (462 avant arrondi)",
    source: SPEC,
    preset: saTa,
    facts: { mode: "all-trump", value: 100, ...BOTH, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [460, 20] },
  },
  {
    name: "exemple 5 : le même capot coinché part de la base 250",
    source: SPEC,
    preset: saTa,
    facts: { mode: "all-trump", value: 100, doubling: 1, ...BOTH, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [920, 20] },
  },
];

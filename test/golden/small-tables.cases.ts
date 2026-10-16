import type { ScoringCase } from "./scoring-case";

// Belote à trois : Wikipédia FR « Belote » (battre chacun ; capot +50 à chacun
// des deux autres, dix de der annulé). Égalité avec un adversaire = dedans,
// règle maison (engine-design.md 7.4).
const WIKIPEDIA = "https://fr.wikipedia.org/wiki/Belote";
const MAISON = "engine-design.md section 7.4 (règle maison)";
// Belote à deux : pagat « Belote découverte » (le preneur chute à 81 ou moins).
const PAGAT = "https://www.pagat.com/jass/belote.html";
const trois = { id: "a-trois", version: 1 } as const;
const deux = { id: "a-deux", version: 1 } as const;

export const A_TROIS_CASES: readonly ScoringCase[] = [
  {
    name: "réussite : le preneur bat chacun, chacun marque ses points",
    source: WIKIPEDIA,
    preset: trois,
    facts: { cardPoints: [70, 50, 42], tricks: [4, 3, 3] },
    expected: { outcome: "made", marks: [70, 50, 42] },
  },
  {
    name: "preneur battu : l'adversaire marque ses points et ceux du preneur",
    source: WIKIPEDIA,
    preset: trois,
    facts: { cardPoints: [50, 70, 42], tricks: [3, 4, 3] },
    expected: { outcome: "failed", marks: [0, 120, 42] },
  },
  {
    name: "égalité avec un adversaire : dedans",
    source: MAISON,
    preset: trois,
    facts: { cardPoints: [60, 60, 42], tricks: [3, 4, 3] },
    expected: { outcome: "failed", marks: [0, 120, 42] },
  },
  {
    name: "un joueur capot : +50 à chacun des deux autres (dix de der déjà annulé)",
    source: WIKIPEDIA,
    preset: trois,
    facts: { cardPoints: [100, 52, 0], tricks: [6, 4, 0] },
    expected: { outcome: "made", marks: [150, 102, 0] },
  },
];

export const A_DEUX_CASES: readonly ScoringCase[] = [
  {
    name: "preneur à 81 : chute",
    source: PAGAT,
    preset: deux,
    facts: { cardPoints: [81, 81], tricks: [8, 8] },
    expected: { outcome: "failed", marks: [0, 162] },
  },
  {
    name: "preneur à 82 : réussi",
    source: PAGAT,
    preset: deux,
    facts: { cardPoints: [82, 80], tricks: [8, 8] },
    expected: { outcome: "made", marks: [82, 80] },
  },
];

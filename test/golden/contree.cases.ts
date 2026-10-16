import type { ScoringCase } from "./scoring-case";

// Wikipédia FR « Belote contrée » (points annoncés, capot 500 / 410) :
// https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e
const WIKIPEDIA = "https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e";
// Bogues 2.1 à 2.3 corrigés : engine-design.md section 1.4 et bible 3.4.
const BUGS = "engine-design.md section 1.4; belote-variants-bible.md section 3.4";
const preset = { id: "contree", version: 3 } as const;
const pointsFaits = { scoring: { method: "pointsFaits" } } as const;

export const CONTREE_CASES: readonly ScoringCase[] = [
  {
    name: "100 contré, chuté : la défense marque 100 × 2",
    source: WIKIPEDIA,
    preset,
    facts: { value: 100, doubling: 1, cardPoints: [70, 92] },
    expected: { outcome: "failed", marks: [0, 200] },
  },
  {
    name: "100 contré, chuté : le preneur garde sa belote seulement",
    source: WIKIPEDIA,
    preset,
    facts: { value: 100, doubling: 1, cardPoints: [70, 92], belote: [20, 0] },
    expected: { outcome: "failed", marks: [20, 200] },
  },
  {
    name: "capot demandé chuté : 410 à la défense",
    source: WIKIPEDIA,
    preset,
    facts: { value: "capot", cardPoints: [150, 12], tricks: [7, 1] },
    expected: { outcome: "failed", marks: [0, 410] },
  },
  {
    name: "capot demandé réussi : 500",
    source: WIKIPEDIA,
    preset,
    facts: { value: "capot", cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [500, 0] },
  },
  {
    name: "80 réussi avec belote preneur : contrat + belote",
    source: WIKIPEDIA,
    preset,
    facts: { value: 80, cardPoints: [90, 72], belote: [20, 0] },
    expected: { outcome: "made", marks: [100, 0] },
  },
  {
    name: "2.3 corrigé : 80 contré réussi, la défense ne garde pas ses points",
    source: BUGS,
    preset,
    facts: { value: 80, doubling: 1, cardPoints: [100, 62] },
    expected: { outcome: "made", marks: [160, 0] },
  },
  {
    name: "2.1 corrigé (points faits) : 80 chuté, belote défense",
    source: BUGS,
    preset,
    overrides: pointsFaits,
    facts: { value: 80, cardPoints: [70, 92], belote: [0, 20] },
    expected: { outcome: "failed", marks: [0, 260] },
  },
  {
    name: "2.2 corrigé (points faits) : 80 réussi en capot compte les 252",
    source: BUGS,
    preset,
    overrides: pointsFaits,
    facts: { value: 80, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [330, 0] },
  },
];

// Ancien noyau `scoreRound` (contree@2 figé, rejeu seulement) : bogues 2.1 à 2.3
// reproduits volontairement. Preuves chiffrées : engine-design.md section 1.4.
const LEGACY = "engine-design.md section 1.4 (shared/src/scoring.ts)";
const legacy = { id: "contree", version: 2 } as const;

export const CONTREE_LEGACY_CASES: readonly ScoringCase[] = [
  {
    name: "2.1 : 80 chuté, la défense perd sa belote",
    source: LEGACY,
    preset: legacy,
    facts: { value: 80, cardPoints: [70, 92], belote: [0, 20] },
    expected: { outcome: "failed", marks: [0, 240] },
  },
  {
    name: "2.2 : 80 réussi en capot marque 242",
    source: LEGACY,
    preset: legacy,
    facts: { value: 80, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [242, 0] },
  },
  {
    name: "2.2 : capot demandé réussi marque 412",
    source: LEGACY,
    preset: legacy,
    facts: { value: "capot", cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [412, 0] },
  },
  {
    name: "2.3 : 80 contré réussi en capot marque 322",
    source: LEGACY,
    preset: legacy,
    facts: { value: 80, doubling: 1, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [322, 0] },
  },
  {
    name: "2.3 : la défense garde ses points sur un contré réussi",
    source: LEGACY,
    preset: legacy,
    facts: { value: 80, doubling: 1, cardPoints: [100, 62] },
    expected: { outcome: "made", marks: [260, 62] },
  },
  {
    name: "atteindre l'enchère suffit, sans battre la défense",
    source: LEGACY,
    preset: legacy,
    facts: { value: 80, cardPoints: [81, 81] },
    expected: { outcome: "made", marks: [161, 81] },
  },
];

import type { ScoringCase } from "./scoring-case";

// Page FFB « Règles de la coinche » : https://www.ffbelote.org/regles-coinche/
// Égalité = chute : arbitrage 7.1 de engine-design.md.
const FFB = "https://www.ffbelote.org/regles-coinche/";
const ARBITRAGE = "engine-design.md section 7.1";
const preset = { id: "coinche-ffb", version: 2 } as const;

export const COINCHE_FFB_CASES: readonly ScoringCase[] = [
  {
    name: "100 demandé, 83 + tierce = 103 : réussi",
    source: FFB,
    preset,
    facts: { value: 100, cardPoints: [83, 79], declarations: [20, 0] },
    expected: { outcome: "made", marks: [200, 80] },
  },
  {
    name: "89 sur 90 : chute, l'arrondi ne fait jamais réussir",
    source: FFB,
    preset,
    facts: { value: 90, cardPoints: [89, 73] },
    expected: { outcome: "failed", marks: [0, 250] },
  },
  {
    name: "89 sur 90 quand l'arrondi décide (option) : réussi",
    source: FFB,
    preset,
    overrides: { scoring: { rounding: { neverDecidesContract: false } } },
    facts: { value: 90, cardPoints: [89, 73] },
    expected: { outcome: "made", marks: [180, 70] },
  },
  {
    name: "coinche réussie : (160 + C) × 2",
    source: FFB,
    preset,
    facts: { value: 100, doubling: 1, cardPoints: [110, 52] },
    expected: { outcome: "made", marks: [520, 0] },
  },
  {
    name: "coinche réussie : la belote reste hors multiplication",
    source: FFB,
    preset,
    facts: { value: 100, doubling: 1, cardPoints: [110, 52], belote: [20, 0] },
    expected: { outcome: "made", marks: [540, 0] },
  },
  {
    name: "capot coinché : 1 000",
    source: FFB,
    preset,
    facts: { value: "capot", doubling: 1, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [1000, 0] },
  },
  {
    name: "capot surcoinché : 2 000",
    source: FFB,
    preset,
    facts: { value: "capot", doubling: 2, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [2000, 0] },
  },
  {
    name: "capot annoncé chuté : 500 à la défense",
    source: FFB,
    preset,
    facts: { value: "capot", cardPoints: [150, 12], tricks: [7, 1] },
    expected: { outcome: "failed", marks: [0, 500] },
  },
  {
    name: "capot non annoncé : 250 + C",
    source: FFB,
    preset,
    facts: { value: 100, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [350, 0] },
  },
  {
    name: "égalité de totaux : chute",
    source: ARBITRAGE,
    preset,
    facts: { value: 80, cardPoints: [81, 81] },
    expected: { outcome: "failed", marks: [0, 240] },
  },
];

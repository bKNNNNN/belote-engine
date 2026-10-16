import type { ScoringCase } from "./scoring-case";

// pagat « Coinche » (seule la valeur du contrat est multipliée ; exemple chiffré
// 100 coinché chuté avec belote = 20 / 360) : https://www.pagat.com/jass/coinche.html
// Wikipédia FR « Coinche » (capot 500, capot non annoncé 250 + contrat,
// générale 800) : https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e
const PAGAT = "https://www.pagat.com/jass/coinche.html";
const WIKIPEDIA = "https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e";
const preset = { id: "bridgee", version: 1 } as const;

export const BRIDGEE_CASES: readonly ScoringCase[] = [
  {
    name: "100 coinché, chuté, belote preneur : 20 / 360",
    source: PAGAT,
    preset,
    facts: { value: 100, doubling: 1, cardPoints: [70, 92], belote: [20, 0] },
    expected: { outcome: "failed", marks: [20, 360] },
  },
  {
    name: "100 coinché réussi : seul le contrat double, la défense garde ses points",
    source: PAGAT,
    preset,
    facts: { value: 100, doubling: 1, cardPoints: [110, 52] },
    expected: { outcome: "made", marks: [310, 50] },
  },
  {
    name: "capot annoncé réussi : 500",
    source: WIKIPEDIA,
    preset,
    facts: { value: "capot", cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [500, 0] },
  },
  {
    name: "capot annoncé chuté : 500 à la défense",
    source: WIKIPEDIA,
    preset,
    facts: { value: "capot", cardPoints: [150, 12], tricks: [7, 1] },
    expected: { outcome: "failed", marks: [0, 500] },
  },
  {
    name: "capot non annoncé : 250 + contrat",
    source: WIKIPEDIA,
    preset,
    facts: { value: 100, cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [350, 0] },
  },
  {
    name: "générale réussie : 800",
    source: WIKIPEDIA,
    preset,
    facts: { value: "generale", cardPoints: [252, 0], tricks: [8, 0], takerTricks: 8 },
    expected: { outcome: "made", marks: [800, 0] },
  },
  {
    name: "générale chutée (le partenaire a pris un pli) : 800 à la défense",
    source: WIKIPEDIA,
    preset,
    facts: { value: "generale", cardPoints: [252, 0], tricks: [8, 0], takerTricks: 7 },
    expected: { outcome: "failed", marks: [0, 800] },
  },
];

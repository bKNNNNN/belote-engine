import type { ScoringCase } from "./scoring-case";

// Wikipédia FR « Belote » (décompte, litige, capot) :
// https://fr.wikipedia.org/wiki/Belote
const WIKIPEDIA = "https://fr.wikipedia.org/wiki/Belote";
// Litige reporté 81/91 : règle du profil historique belote-classique@1.
const LITIGE = "historical profile belote-classique@1 (litige carry-over)";
const preset = { id: "classique", version: 1 } as const;

export const CLASSIQUE_CASES: readonly ScoringCase[] = [
  {
    name: "contrat rempli 100/62 avec belote preneur",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [100, 62], belote: [20, 0] },
    expected: { outcome: "made", marks: [120, 62] },
  },
  {
    name: "dedans 80/82",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [80, 82] },
    expected: { outcome: "failed", marks: [0, 162] },
  },
  {
    name: "dedans 80/82 avec belote défense",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [80, 82], belote: [0, 20] },
    expected: { outcome: "failed", marks: [0, 182] },
  },
  {
    name: "dedans, le preneur garde sa belote",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [60, 102], belote: [20, 0] },
    expected: { outcome: "failed", marks: [20, 162] },
  },
  {
    name: "litige 81/81 : la défense marque, 81 en suspens",
    source: LITIGE,
    preset,
    facts: { cardPoints: [81, 81] },
    expected: { outcome: "litige", marks: [0, 81], litigePending: 81 },
  },
  {
    name: "donne suivante gagnée par le preneur : +81 au gagnant",
    source: LITIGE,
    preset,
    facts: { cardPoints: [100, 62] },
    pendingLitige: 81,
    expected: { outcome: "made", marks: [181, 62], litigePending: null },
  },
  {
    name: "donne suivante chutée : les 81 vont à la défense",
    source: LITIGE,
    preset,
    facts: { cardPoints: [70, 92] },
    pendingLitige: 81,
    expected: { outcome: "failed", marks: [0, 243], litigePending: null },
  },
  {
    name: "litige 91/91 avec belote : 91 en suspens",
    source: LITIGE,
    preset,
    facts: { cardPoints: [71, 91], belote: [20, 0] },
    expected: { outcome: "litige", marks: [0, 91], litigePending: 91 },
  },
  {
    name: "capot du preneur",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [252, 0], tricks: [8, 0] },
    expected: { outcome: "made", marks: [252, 0] },
  },
  {
    name: "capot du preneur avec belote : 272",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [252, 0], tricks: [8, 0], belote: [20, 0] },
    expected: { outcome: "made", marks: [272, 0] },
  },
  {
    name: "capot de la défense : 252",
    source: WIKIPEDIA,
    preset,
    facts: { cardPoints: [0, 252], tricks: [0, 8] },
    expected: { outcome: "failed", marks: [0, 252] },
  },
  {
    name: "preneur au siège 1 : les camps suivent le siège",
    source: WIKIPEDIA,
    preset,
    facts: { taker: 1, cardPoints: [62, 100] },
    expected: { outcome: "made", marks: [62, 100] },
  },
];

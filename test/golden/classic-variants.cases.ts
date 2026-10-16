import type { ScoringCase } from "./scoring-case";

// Variantes de la classique qui gardent le décompte « classicSplit » :
// vache (Ludi, belote.tv), concours (règlement FD 33), moderne (SA/TA ramenés à
// 162, regles-du-jeu.net), classique avec annonces (regles-du-jeu.net : une
// équipe capotée perd ses annonces, qui reviennent aux preneurs).
const REGLES = "https://www.regles-du-jeu.net/regles-de-la-belote/";
const FD33 = "https://lotetgaronne.generations-mouvement.org/wp-content/uploads/2023/09/Reglement-belote-FD-33-1.pdf";
const VACHE = "engine-design.md introduction (belote à la vache : Ludi, belote.tv)";

export const CLASSIC_VARIANT_CASES: readonly ScoringCase[] = [
  {
    name: "vache : le décompte reste celui de la classique",
    source: VACHE,
    preset: { id: "vache", version: 1 },
    facts: { cardPoints: [100, 62], belote: [0, 20] },
    expected: { outcome: "made", marks: [100, 82] },
  },
  {
    name: "concours : chute à 162, belote seule",
    source: FD33,
    preset: { id: "concours", version: 1 },
    facts: { cardPoints: [75, 87], belote: [0, 20] },
    expected: { outcome: "failed", marks: [0, 182] },
  },
  {
    name: "moderne : sans atout ramené à 162",
    source: REGLES,
    preset: { id: "moderne", version: 1 },
    facts: { mode: "no-trump", cardPoints: [96, 66] },
    expected: { outcome: "made", marks: [96, 66] },
  },
  {
    name: "moderne : tout atout avec deux belotes",
    source: REGLES,
    preset: { id: "moderne", version: 1 },
    facts: { mode: "all-trump", cardPoints: [90, 72], belote: [40, 0] },
    expected: { outcome: "made", marks: [130, 72] },
  },
  {
    name: "annonces : chute, la défense prend 162 et toutes les annonces",
    source: REGLES,
    preset: { id: "classique-annonces", version: 1 },
    facts: { cardPoints: [70, 92], declarations: [20, 0] },
    expected: { outcome: "failed", marks: [0, 182] },
  },
  {
    name: "annonces : capot des preneurs, les annonces adverses leur reviennent",
    source: REGLES,
    preset: { id: "classique-annonces", version: 1 },
    facts: { cardPoints: [252, 0], tricks: [8, 0], declarations: [0, 50] },
    expected: { outcome: "made", marks: [302, 0] },
  },
  {
    name: "annonces : les annonces comptent pour remplir le contrat",
    source: REGLES,
    preset: { id: "classique-annonces", version: 1 },
    facts: { cardPoints: [75, 87], declarations: [20, 0] },
    expected: { outcome: "made", marks: [95, 87] },
  },
];

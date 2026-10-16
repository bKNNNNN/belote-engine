import type { VariantConfig } from "../variant-config";

/**
 * Turn-up family presets (engine-design.md section 2.3), declared as data.
 * Shared blocks are plain constants; each preset spells out what differs.
 */

const WIKIPEDIA_BELOTE = "https://fr.wikipedia.org/wiki/Belote";
const PAGAT_BELOTE = "https://www.pagat.com/jass/belote.html";

export const FOUR_SEAT_TABLE = {
  seats: 4,
  sides: { kind: "fixedPairs" },
  direction: "counterclockwise",
  tableau: null,
  trickHistory: "full",
} as const satisfies VariantConfig["table"];

export const STANDARD_CARDS = {
  noTrump: "scaled152",
  allTrump: "ffb2015",
  lastTrickBonus: 10,
  capotLastTrickBonus: 100,
  invertedRanks: false,
} as const satisfies VariantConfig["cards"];

export const CLASSIC_PLAY = {
  undertrump: "required",
  partnerMaster: "free",
  allTrumpMustClimb: true,
  firstLead: "rightOfDealer",
} as const satisfies VariantConfig["play"];

export const AUTOMATIC_BELOTE = {
  points: 20,
  holder: "anyone",
  declaration: "automatic",
  order: "any",
  onFailedContract: "keep",
  allTrump: "none",
  golden: null,
} as const satisfies NonNullable<VariantConfig["belote"]>;

export const FFB_DECLARATIONS = {
  table: "ffb",
  tierce: 20,
  noTrumpSquares: "ffb",
  folklore: { eightsCancel: false },
  tieBreak: "highCardThenTrumpThenNone",
  countTowardContract: true,
  allowOverlap: false,
  timing: "announceFirstTrickShowSecond",
  capotTransfersOpponents: true,
} as const satisfies NonNullable<VariantConfig["declarations"]>;

/** The cut of every live table: the left-hand player leaves at least three cards each side (legacy tables, 3..29). */
export const TABLE_CUT = { by: "leftOfDealer", minPacket: 3 } as const satisfies NonNullable<VariantConfig["deal"]["cut"]>;

export const TURNUP_DEAL_STEPS = [
  { kind: "packets", sizes: [3, 2], zone: "hand" },
  { kind: "turnup", source: "deck" },
  { kind: "trumpSelection" },
  { kind: "completeAfterTaking", takerReceivesTurnup: true, takerCount: 2, othersCount: 3 },
] as const satisfies VariantConfig["deal"]["steps"];

export const CLASSIC_TURNUP = {
  kind: "turnup",
  secondRound: "otherSuits",
  forcedJack: false,
  dealerForcedAfterRound2: false,
  overbid: null,
} as const satisfies VariantConfig["trump"];

export const CLASSIC_SPLIT = {
  kind: "classicSplit",
  success: "beatDefence",
  tie: "litigeCarryOver",
  failure: { defenceBase: 162, takerKeepsBelote: true },
  capot: { points: 252 },
  rounding: 1,
} as const satisfies VariantConfig["scoring"];

/** No weak-hand redeal: every preset's default; tables switch them on as options. */
export const NO_REDEALS = {
  mainNulle: null,
  misere: null,
  carreDeSept: false,
} as const satisfies VariantConfig["redeals"];

export const POINT_FORMATS_1000 = [
  { id: "short", target: 500, isDefault: false },
  { id: "standard", target: 1000, isDefault: true },
  { id: "long", target: 1500, isDefault: false },
] as const;

export const CLASSIQUE_1: VariantConfig = {
  id: "classique",
  version: 1,
  confidence: "canonique",
  sources: [
    WIKIPEDIA_BELOTE,
    PAGAT_BELOTE,
    "historical profile belote-classique@1",
  ],
  table: FOUR_SEAT_TABLE,
  deck: { removed: [] },
  deal: { shuffle: "everyDeal", cut: TABLE_CUT, firstDealer: "random", steps: TURNUP_DEAL_STEPS },
  trump: CLASSIC_TURNUP,
  cards: STANDARD_CARDS,
  play: CLASSIC_PLAY,
  belote: AUTOMATIC_BELOTE,
  declarations: null,
  scoring: CLASSIC_SPLIT,
  match: {
    end: { kind: "target", points: 1000, tie: "extraDeal" },
    finishLock: "none",
    formats: POINT_FORMATS_1000,
  },
  redeals: NO_REDEALS,
};

export const CLASSIQUE_ANNONCES_1: VariantConfig = {
  ...CLASSIQUE_1,
  id: "classique-annonces",
  sources: [
    WIKIPEDIA_BELOTE,
    "https://www.regles-du-jeu.net/regles-de-la-belote/",
    "historical profile belote-annonces@1",
  ],
  belote: { ...AUTOMATIC_BELOTE, declaration: "spoken" },
  declarations: FFB_DECLARATIONS,
};

export const CONCOURS_1: VariantConfig = {
  ...CLASSIQUE_1,
  id: "concours",
  confidence: "candidate",
  sources: [
    "https://lotetgaronne.generations-mouvement.org/wp-content/uploads/2023/09/Reglement-belote-FD-33-1.pdf",
    "engine-design.md section 7.3 (12 deals, extra deal on a tie)",
  ],
  table: { ...FOUR_SEAT_TABLE, trickHistory: "lastTrickOnly" },
  deal: { ...CLASSIQUE_1.deal, shuffle: "cutOnly" },
  match: { end: { kind: "deals", count: 12, tie: "extraDeal" }, finishLock: "none", formats: [] },
};

export const VACHE_1: VariantConfig = {
  ...CLASSIQUE_1,
  id: "vache",
  confidence: "candidate",
  sources: ["engine-design.md introduction: belote à la vache (Ludi, belote.tv)"],
  deal: {
    shuffle: "everyDeal",
    cut: TABLE_CUT,
    firstDealer: "random",
    steps: [
      { kind: "packets", sizes: [3, 2], zone: "hand" },
      { kind: "trumpSelection" },
      { kind: "packetsAfterSelection", sizes: [3] },
    ],
  },
  trump: { kind: "freeChoice", modes: ["suit"], allPassed: "dealerMustChoose" },
  match: {
    end: { kind: "target", points: 3000, tie: "extraDeal" },
    finishLock: "none",
    formats: [{ id: "standard", target: 3000, isDefault: true }],
  },
};

export const VACHE_RETOURNE_1: VariantConfig = {
  ...VACHE_1,
  id: "vache-retourne",
  sources: ["engine-design.md introduction: vache option with a turn-up (jeudebelote.org)"],
  deal: { shuffle: "everyDeal", cut: TABLE_CUT, firstDealer: "random", steps: TURNUP_DEAL_STEPS },
  trump: { kind: "freeChoice", modes: ["suit"], allPassed: "dealerTakesTurnupSuit" },
};

export const MODERNE_1: VariantConfig = {
  ...CLASSIQUE_1,
  id: "moderne",
  confidence: "candidate",
  sources: ["https://www.regles-du-jeu.net/regles-de-la-belote/", WIKIPEDIA_BELOTE],
  trump: { ...CLASSIC_TURNUP, overbid: ["no-trump", "all-trump"] },
  belote: { ...AUTOMATIC_BELOTE, allTrump: "perSuit" },
};

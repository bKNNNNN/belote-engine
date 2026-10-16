import type { VariantConfig } from "../variant-config";
import {
  AUTOMATIC_BELOTE,
  CLASSIC_PLAY,
  FFB_DECLARATIONS,
  FOUR_SEAT_TABLE,
  NO_REDEALS,
  POINT_FORMATS_1000,
  STANDARD_CARDS,
  TABLE_CUT,
} from "./classic-family";

/**
 * Auction family presets (engine-design.md section 2.3), declared as data.
 * The frozen legacy profiles (contree@2, coinche@1, coinche SA/TA) keep the
 * parameters their code implements, so later steps can replay them.
 */

const WIKIPEDIA_CONTREE = "https://fr.wikipedia.org/wiki/Belote_contr%C3%A9e";
const WIKIPEDIA_COINCHE = "https://fr.wikipedia.org/wiki/Belote_bridg%C3%A9e";
const PAGAT_COINCHE = "https://www.pagat.com/jass/coinche.html";
const FFB_COINCHE = "https://www.ffbelote.org/regles-coinche/";

const FULL_DEAL = {
  shuffle: "everyDeal",
  cut: TABLE_CUT,
  firstDealer: "random",
  steps: [{ kind: "packets", sizes: [3, 2, 3], zone: "hand" }, { kind: "trumpSelection" }],
} as const satisfies VariantConfig["deal"];

/** Frozen replay presets: their logged decks are already cut. */
const REPLAYED_DEAL = { ...FULL_DEAL, cut: null } as const satisfies VariantConfig["deal"];

const IN_TURN_DOUBLING = {
  labels: "coinche",
  timing: "inTurn",
  closesAuction: true,
  redouble: true,
  minDoublableBid: null,
  capotDoublable: true,
  responders: "everyone",
} as const;

const LADDER_160 = { min: 80, step: 10, max: 160, specials: ["capot"] } as const;

const SUIT_AUCTION = {
  kind: "auction",
  ladder: LADDER_160,
  modes: ["suit"],
  modeHierarchy: "none",
  overbidSelf: false,
  capotClosesAuction: false,
  maxSpeechesPerPlayer: null,
  doubling: IN_TURN_DOUBLING,
  allPassed: "redeal",
} as const satisfies VariantConfig["trump"];

const POINTS_FAITS_FFB2015 = {
  kind: "contract",
  method: "pointsFaits",
  success: { reachBid: true, versusDefence: "strictlyMore", margin: 0 },
  failureBase: 160,
  capot: { unbidBonus: "none", bidMade: 500, bidFailed: 410 },
  generale: null,
  doubling: {
    scope: "contractPlusBase",
    multipliers: [2, 4],
    multipliedIncludes: "declarationsAndTakerBelote",
  },
  noTrumpDoublesContract: false,
  rounding: { to: 10, half: "up", neverDecidesContract: true },
} as const satisfies VariantConfig["scoring"];

const POINTS_ANNONCES = {
  kind: "contract",
  method: "pointsAnnonces",
  success: { reachBid: true, versusDefence: "strictlyMore", margin: 0 },
  failureBase: 160,
  capot: { unbidBonus: "none", bidMade: 500, bidFailed: 410 },
  generale: null,
  doubling: { scope: "contract", multipliers: [2, 4], multipliedIncludes: "nothingElse" },
  noTrumpDoublesContract: false,
  rounding: { to: 10, half: "up", neverDecidesContract: true },
} as const satisfies VariantConfig["scoring"];

const MATCH_1000 = {
  end: { kind: "target", points: 1000, tie: "extraDeal" },
  finishLock: "none",
  formats: POINT_FORMATS_1000,
} as const satisfies VariantConfig["match"];

const MATCH_2000_LOCKED = {
  end: { kind: "target", points: 2000, tie: "extraDeal" },
  finishLock: "beloteOnlyAfterFailOrCapot",
  formats: [
    { id: "short", target: 1000, isDefault: false },
    { id: "standard", target: 2000, isDefault: true },
  ],
} as const satisfies VariantConfig["match"];

export const CONTREE_3: VariantConfig = {
  id: "contree",
  version: 3,
  confidence: "canonique",
  sources: [WIKIPEDIA_CONTREE, "belote-variants-bible.md section 3.4"],
  table: FOUR_SEAT_TABLE,
  deck: { removed: [] },
  deal: FULL_DEAL,
  trump: {
    ...SUIT_AUCTION,
    doubling: { ...IN_TURN_DOUBLING, labels: "contre", responders: "takerSide" },
  },
  cards: STANDARD_CARDS,
  play: CLASSIC_PLAY,
  belote: AUTOMATIC_BELOTE,
  declarations: null,
  scoring: POINTS_ANNONCES,
  match: MATCH_1000,
  redeals: NO_REDEALS,
};

export const CONTREE_2: VariantConfig = {
  ...CONTREE_3,
  version: 2,
  deal: REPLAYED_DEAL,
  trump: { ...CONTREE_3.trump, overbidSelf: true } as VariantConfig["trump"],
  sources: ["historical profile contree@2, frozen for replay"],
  scoring: { ...POINTS_ANNONCES, method: "legacyContree2", rounding: { to: 1, half: "up", neverDecidesContract: true } },
  match: { ...MATCH_1000, end: { kind: "target", points: 1000, tie: "draw" } },
};

export const COINCHE_1: VariantConfig = {
  id: "coinche",
  version: 1,
  confidence: "canonique",
  sources: [
    "REGLES-DE-LA-BELOTE-COINCHEE.pdf (FFB 2015)",
    "historical profile coinche@1, frozen for replay",
  ],
  table: FOUR_SEAT_TABLE,
  deck: { removed: [] },
  deal: REPLAYED_DEAL,
  trump: SUIT_AUCTION,
  cards: STANDARD_CARDS,
  play: { ...CLASSIC_PLAY, undertrump: "optional" },
  belote: AUTOMATIC_BELOTE,
  declarations: FFB_DECLARATIONS,
  scoring: POINTS_FAITS_FFB2015,
  match: { ...MATCH_1000, finishLock: "beloteOnlyAfterFailOrCapot" },
  redeals: NO_REDEALS,
};

export const COINCHE_SA_TA_FFB2015_1: VariantConfig = {
  ...COINCHE_1,
  id: "coinche-sa-ta-ffb2015",
  sources: [
    "REGLES-DE-LA-BELOTE-COINCHEE.pdf (FFB 2015, SA/TA annex)",
    "historical profile coinche-sa-ta-ffb2015@1 (FFB 2015 PDF, SA/TA annex), frozen for replay",
  ],
  trump: { ...SUIT_AUCTION, modes: ["suit", "no-trump", "all-trump"] },
  belote: { ...AUTOMATIC_BELOTE, allTrump: "perSuit" },
};

export const COINCHE_FFB_2: VariantConfig = {
  ...COINCHE_1,
  id: "coinche-ffb",
  version: 2,
  deal: FULL_DEAL,
  sources: [FFB_COINCHE, "engine-design.md sections 1.6 and 7.1-7.2"],
  trump: { ...SUIT_AUCTION, ladder: { min: 80, step: 10, max: 650, specials: ["capot"] } },
  scoring: {
    ...POINTS_FAITS_FFB2015,
    capot: { unbidBonus: "250PlusContract", bidMade: 500, bidFailed: 500 },
    doubling: { scope: "contractPlusBase", multipliers: [2, 4], multipliedIncludes: "nothingElse" },
    rounding: { to: 10, half: "up", neverDecidesContract: true },
  },
  match: MATCH_2000_LOCKED,
};

export const BRIDGEE_1: VariantConfig = {
  ...COINCHE_1,
  id: "bridgee",
  confidence: "candidate",
  sources: [PAGAT_COINCHE, WIKIPEDIA_COINCHE],
  trump: {
    ...SUIT_AUCTION,
    ladder: { min: 80, step: 10, max: 160, specials: ["capot", "generale"] },
    modes: ["suit", "no-trump", "all-trump"],
  },
  cards: { ...STANDARD_CARDS, allTrump: "tableA" },
  belote: { ...AUTOMATIC_BELOTE, allTrump: "perSuit" },
  declarations: { ...FFB_DECLARATIONS, noTrumpSquares: "sa-aces-200" },
  scoring: {
    ...POINTS_FAITS_FFB2015,
    capot: { unbidBonus: "250PlusContract", bidMade: 500, bidFailed: 500 },
    generale: { made: 800, failed: 800 },
    doubling: { scope: "contract", multipliers: [2, 4], multipliedIncludes: "nothingElse" },
  },
  match: { ...MATCH_2000_LOCKED, finishLock: "none" },
};

export const STEPHANOISE_MARQUEZ_1: VariantConfig = {
  ...COINCHE_1,
  id: "stephanoise-marquez",
  confidence: "candidate",
  sources: [
    "https://coinche-stephanoise.com/mesdocuments/reglement_coinche.pdf",
    "engine-design.md sections 6.5 and 7.5 (house rules fill its silences)",
  ],
  deal: {
    shuffle: "everyDeal",
    cut: TABLE_CUT,
    firstDealer: "random",
    steps: [
      { kind: "packets", sizes: [3, 3], zone: "hand" },
      { kind: "trumpSelection" },
      { kind: "packetsAfterSelection", sizes: [2] },
    ],
  },
  trump: {
    ...SUIT_AUCTION,
    ladder: { min: 82, step: 1, max: 160, specials: ["capot"] },
    modes: ["suit", "no-trump"],
    capotClosesAuction: true,
    doubling: { ...IN_TURN_DOUBLING, closesAuction: false },
  },
  declarations: { ...FFB_DECLARATIONS, noTrumpSquares: "sa-aces-200", allowOverlap: true },
  scoring: {
    ...POINTS_FAITS_FFB2015,
    success: { reachBid: true, versusDefence: "none", margin: 0 },
    capot: { unbidBonus: "250PlusContract", bidMade: 500, bidFailed: 500 },
    doubling: {
      scope: "fixedBasePlusMultipliedContract",
      multipliers: [2, 4],
      multipliedIncludes: "nothingElse",
    },
    noTrumpDoublesContract: true,
    rounding: { to: 1, half: "up", neverDecidesContract: true },
  },
  match: { ...MATCH_2000_LOCKED, finishLock: "announceUnderCapot" },
};

export const CAVAILLON_1: VariantConfig = {
  ...COINCHE_FFB_2,
  id: "cavaillon",
  version: 1,
  confidence: "campagne",
  sources: [WIKIPEDIA_COINCHE, "belote-variants-bible.md section 3.10"],
  cards: { ...STANDARD_CARDS, invertedRanks: true },
  match: { end: { kind: "singleDeal" }, finishLock: "none", formats: [] },
};

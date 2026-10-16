import type { VariantConfig } from "../variant-config";
import {
  AUTOMATIC_BELOTE,
  CLASSIC_PLAY,
  CLASSIC_SPLIT,
  CLASSIC_TURNUP,
  NO_REDEALS,
  STANDARD_CARDS,
  TABLE_CUT,
} from "./classic-family";

/** Two- and three-seat presets (engine-design.md section 2.3). */

const WIKIPEDIA_BELOTE = "https://fr.wikipedia.org/wiki/Belote";
const PAGAT_BELOTE = "https://www.pagat.com/jass/belote.html";

const SHORT_AND_STANDARD = [
  { id: "short", target: 500, isDefault: false },
  { id: "standard", target: 1000, isDefault: true },
] as const;

export const A_DEUX_1: VariantConfig = {
  id: "a-deux",
  version: 1,
  confidence: "candidate",
  sources: [`${WIKIPEDIA_BELOTE} (belote à deux, forme « bis »)`, PAGAT_BELOTE],
  table: {
    seats: 2,
    sides: { kind: "headsUp" },
    direction: "counterclockwise",
    tableau: { columns: 4, layers: 2, reveal: "endOfTrick" },
    trickHistory: "full",
  },
  deck: { removed: [] },
  deal: {
    shuffle: "everyDeal",
    cut: TABLE_CUT,
    firstDealer: "random",
    steps: [
      { kind: "packets", sizes: [4], zone: "tableauHidden" },
      { kind: "packets", sizes: [4], zone: "tableauVisible" },
      { kind: "packets", sizes: [3, 3], zone: "hand" },
      { kind: "turnup", source: "dealerTableauLast" },
      { kind: "trumpSelection" },
      { kind: "packetsAfterSelection", sizes: [2] },
    ],
  },
  trump: CLASSIC_TURNUP,
  cards: STANDARD_CARDS,
  play: CLASSIC_PLAY,
  belote: AUTOMATIC_BELOTE,
  declarations: null,
  scoring: { ...CLASSIC_SPLIT, tie: "defenceWins" },
  match: {
    end: { kind: "target", points: 1000, tie: "extraDeal" },
    finishLock: "none",
    formats: SHORT_AND_STANDARD,
  },
  redeals: NO_REDEALS,
};

export const A_TROIS_1: VariantConfig = {
  id: "a-trois",
  version: 1,
  confidence: "maison",
  sources: [
    `${WIKIPEDIA_BELOTE} (belote à trois, 3 × 10)`,
    "engine-design.md section 7.4 (completion scheme is a house rule)",
  ],
  table: {
    seats: 3,
    sides: { kind: "takerVsRest" },
    direction: "counterclockwise",
    tableau: null,
    trickHistory: "full",
  },
  deck: { removed: [{ suit: "spades", rank: "7" }, { suit: "clubs", rank: "7" }] },
  deal: {
    shuffle: "everyDeal",
    cut: TABLE_CUT,
    firstDealer: "random",
    steps: [
      { kind: "packets", sizes: [3, 3], zone: "hand" },
      { kind: "turnup", source: "deck" },
      { kind: "trumpSelection" },
      { kind: "completeAfterTaking", takerReceivesTurnup: true, takerCount: 3, othersCount: 4 },
    ],
  },
  trump: CLASSIC_TURNUP,
  cards: STANDARD_CARDS,
  play: CLASSIC_PLAY,
  belote: AUTOMATIC_BELOTE,
  declarations: null,
  scoring: { kind: "takerVsEach", capotBonusPerOpponent: 50, cancelLastTrickOnCapot: true },
  match: {
    end: { kind: "target", points: 1000, tie: "extraDeal" },
    finishLock: "none",
    formats: SHORT_AND_STANDARD,
  },
  redeals: NO_REDEALS,
};

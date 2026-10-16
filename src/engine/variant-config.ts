import { z } from "zod";
import { RANKS, SUITS, type Rank, type Suit } from "../card-primitives";

/**
 * A variant is a complete, frozen, versioned value. The engine reads these
 * parameters and never the name of a variant (engine-design.md, section 2.2).
 * Every object is strict: an unknown field is a schema error.
 */

const modeKindSchema = z.enum(["suit", "no-trump", "all-trump"]);
const cardSchema = z.strictObject({
  suit: z.enum(SUITS as readonly Suit[] as [Suit, ...Suit[]]),
  rank: z.enum(RANKS as readonly Rank[] as [Rank, ...Rank[]]),
});
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

const tableSchema = z.strictObject({
  seats: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  sides: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("fixedPairs") }),
    z.strictObject({ kind: z.literal("takerVsRest") }),
    z.strictObject({ kind: z.literal("headsUp") }),
  ]),
  direction: z.enum(["counterclockwise", "clockwise"]),
  tableau: z.strictObject({
    columns: positiveInt,
    layers: z.literal(2),
    reveal: z.enum(["immediate", "endOfTrick"]),
  }).nullable(),
  trickHistory: z.enum(["full", "lastTrickOnly"]),
});

const dealStepSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("packets"),
    sizes: z.array(positiveInt).min(1),
    zone: z.enum(["hand", "tableauHidden", "tableauVisible"]),
  }),
  z.strictObject({
    kind: z.literal("turnup"),
    source: z.enum(["deck", "dealerTableauLast"]),
  }),
  z.strictObject({ kind: z.literal("trumpSelection") }),
  z.strictObject({
    kind: z.literal("completeAfterTaking"),
    takerReceivesTurnup: z.boolean(),
    takerCount: nonNegativeInt,
    othersCount: nonNegativeInt,
  }),
  z.strictObject({
    kind: z.literal("packetsAfterSelection"),
    sizes: z.array(positiveInt).min(1),
  }),
]);

const dealSchema = z.strictObject({
  shuffle: z.enum(["everyDeal", "cutOnly"]),
  /**
   * The cut before each deal: the player at the dealer's left lifts at least
   * `minPacket` cards and leaves as many. null: no cut step (frozen replay
   * presets, whose logged decks are already cut).
   */
  cut: z.strictObject({
    by: z.literal("leftOfDealer"),
    minPacket: positiveInt,
  }).nullable(),
  firstDealer: z.literal("random"),
  steps: z.array(dealStepSchema).min(1),
});

const doublingSchema = z.strictObject({
  labels: z.enum(["coinche", "contre"]),
  timing: z.enum(["inTurn", "anytime"]),
  closesAuction: z.boolean(),
  redouble: z.boolean(),
  minDoublableBid: positiveInt.nullable(),
  capotDoublable: z.boolean(),
  /** Who may still speak once a closing double stands: taker side only (contrée) or everyone. */
  responders: z.enum(["takerSide", "everyone"]),
});

const trumpSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("turnup"),
    secondRound: z.enum(["otherSuits", "anySuit", "none"]),
    forcedJack: z.boolean(),
    dealerForcedAfterRound2: z.boolean(),
    overbid: z.array(z.enum(["no-trump", "all-trump"])).min(1).nullable(),
  }),
  z.strictObject({
    kind: z.literal("freeChoice"),
    modes: z.array(modeKindSchema).min(1),
    allPassed: z.enum(["dealerMustChoose", "dealerTakesTurnupSuit"]),
  }),
  z.strictObject({
    kind: z.literal("auction"),
    ladder: z.strictObject({
      min: positiveInt,
      step: positiveInt,
      max: positiveInt,
      specials: z.array(z.enum(["capot", "generale"])),
    }),
    modes: z.array(modeKindSchema).min(1),
    modeHierarchy: z.enum(["none", "suitOrderBreaksTies"]),
    overbidSelf: z.boolean(),
    capotClosesAuction: z.boolean(),
    maxSpeechesPerPlayer: positiveInt.nullable(),
    doubling: doublingSchema.nullable(),
    allPassed: z.literal("redeal"),
  }),
]);

const cardScaleSchema = z.strictObject({
  noTrump: z.enum(["scaled152", "raw120"]),
  allTrump: z.enum(["ffb2015", "tableA", "raw248"]),
  lastTrickBonus: z.literal(10),
  capotLastTrickBonus: z.literal(100),
  invertedRanks: z.boolean(),
});

const playSchema = z.strictObject({
  undertrump: z.enum(["required", "optional"]),
  partnerMaster: z.enum(["free", "mustTrump", "mustOvertrumpOnly"]),
  allTrumpMustClimb: z.boolean(),
  firstLead: z.enum(["rightOfDealer", "generaleDeclarer"]),
});

const beloteSchema = z.strictObject({
  points: z.literal(20),
  holder: z.enum(["anyone", "takerSideOnly"]),
  declaration: z.enum(["automatic", "spoken"]),
  order: z.enum(["any", "kingFirst"]),
  onFailedContract: z.enum(["keep", "toDefence"]),
  allTrump: z.enum(["perSuit", "none"]),
  golden: positiveInt.nullable(),
});

const declarationsSchema = z.strictObject({
  table: z.literal("ffb"),
  tierce: z.union([z.literal(20), z.literal(30)]),
  noTrumpSquares: z.enum(["ffb", "sa-aces-200"]),
  /** The carré of sevens that cancels the deal lives in `redeals.carreDeSept`. */
  folklore: z.strictObject({ eightsCancel: z.boolean() }),
  tieBreak: z.enum(["highCardThenTrumpThenNone", "firstInOrder"]),
  countTowardContract: z.boolean(),
  /** Marquez: one card may serve several announcements (tierce-belote, carré and run). */
  allowOverlap: z.boolean(),
  timing: z.literal("announceFirstTrickShowSecond"),
  capotTransfersOpponents: z.boolean(),
});

const scoringSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("classicSplit"),
    success: z.literal("beatDefence"),
    tie: z.enum(["litigeCarryOver", "defenceWins", "takerWins"]),
    failure: z.strictObject({ defenceBase: z.literal(162), takerKeepsBelote: z.boolean() }),
    capot: z.strictObject({ points: z.union([z.literal(252), z.literal(250)]) }),
    rounding: z.union([z.literal(1), z.literal(5), z.literal(10)]),
  }),
  z.strictObject({
    kind: z.literal("contract"),
    /** `legacyContree2` replays the frozen `scoreRound` of contree@2 (bugs 2.1-2.3 included). */
    method: z.enum(["pointsFaits", "pointsAnnonces", "legacyContree2"]),
    success: z.strictObject({
      reachBid: z.literal(true),
      versusDefence: z.enum(["strictlyMore", "notLess", "none"]),
      margin: z.union([z.literal(0), z.literal(2)]),
    }),
    failureBase: z.literal(160),
    capot: z.strictObject({
      unbidBonus: z.enum(["250PlusContract", "none"]),
      bidMade: positiveInt,
      bidFailed: positiveInt,
    }),
    generale: z.strictObject({ made: positiveInt, failed: positiveInt }).nullable(),
    doubling: z.strictObject({
      /** `fixedBasePlusMultipliedContract`: 160 + M × contract (Marquez). */
      scope: z.enum([
        "contract",
        "contractPlusBase",
        "wholeScore",
        "fixedBasePlusMultipliedContract",
      ]),
      multipliers: z.union([
        z.tuple([z.literal(2), z.literal(4)]),
        z.tuple([z.literal(2), z.literal(3)]),
      ]),
      multipliedIncludes: z.enum(["declarationsAndTakerBelote", "nothingElse"]),
    }),
    /** Marquez: a contract at no trump counts double. */
    noTrumpDoublesContract: z.boolean(),
    rounding: z.strictObject({
      to: z.union([z.literal(1), z.literal(10)]),
      half: z.literal("up"),
      neverDecidesContract: z.boolean(),
    }),
  }),
  z.strictObject({
    kind: z.literal("takerVsEach"),
    capotBonusPerOpponent: z.literal(50),
    cancelLastTrickOnCapot: z.boolean(),
  }),
]);

const matchSchema = z.strictObject({
  end: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("target"),
      points: positiveInt,
      /** `draw` only replays contree@2 (bug 2.6). */
      tie: z.enum(["extraDeal", "lastDealWinner", "draw"]),
    }),
    z.strictObject({
      kind: z.literal("deals"),
      count: positiveInt,
      tie: z.enum(["extraDeal", "draw"]),
    }),
    z.strictObject({ kind: z.literal("singleDeal") }),
  ]),
  /**
   * `beloteOnlyAfterFailOrCapot`: FFB lock, kept until the side wins a trick.
   * `announceUnderCapot`: Marquez, no finish on a capot suffered by a side that
   * crosses the target only thanks to its belote or announcements.
   */
  finishLock: z.enum(["none", "beloteOnlyAfterFailOrCapot", "announceUnderCapot"]),
  formats: z.array(z.strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    target: positiveInt,
    isDefault: z.boolean(),
  })),
});

/**
 * Weak-hand house rules: a seat may have the deal cancelled at its first
 * speech, and the next dealer deals again. Card points are counted at plain
 * values (A 11, 10 10, K 4, Q 3, J 2), the trump being unknown or not held.
 */
const redealsSchema = z.strictObject({
  /** Turn-up family: no card of the turned suit and fewer than `below` points (Wikipédia Belote: 11). */
  mainNulle: z.strictObject({ below: positiveInt }).nullable(),
  /** Auction family: fewer than `below` points in hand (bible 3.3 and 3.4: 10 or 11). */
  misere: z.strictObject({ below: positiveInt }).nullable(),
  /** The four sevens in hand (Wikipédia Belote, « le carré de Sept annule la donne »). */
  carreDeSept: z.boolean(),
});

export const variantConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: positiveInt,
  confidence: z.enum(["canonique", "candidate", "maison", "campagne"]),
  sources: z.array(z.string().min(1)).min(1),
  table: tableSchema,
  deck: z.strictObject({ removed: z.array(cardSchema) }),
  deal: dealSchema,
  trump: trumpSchema,
  cards: cardScaleSchema,
  play: playSchema,
  belote: beloteSchema.nullable(),
  declarations: declarationsSchema.nullable(),
  scoring: scoringSchema,
  match: matchSchema,
  redeals: redealsSchema,
});

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

export type VariantConfig = DeepReadonly<z.infer<typeof variantConfigSchema>>;
export type SeatCount = VariantConfig["table"]["seats"];
export type ModeKind = z.infer<typeof modeKindSchema>;
export type TableConfig = VariantConfig["table"];
export type DealConfig = VariantConfig["deal"];
export type DealStep = DealConfig["steps"][number];
export type TrumpSelection = VariantConfig["trump"];
export type CardScaleConfig = VariantConfig["cards"];
export type PlayRules = VariantConfig["play"];
export type BeloteRules = NonNullable<VariantConfig["belote"]>;
export type DeclarationRules = NonNullable<VariantConfig["declarations"]>;
export type ScoringRules = VariantConfig["scoring"];
export type MatchRules = VariantConfig["match"];
export type RedealRules = VariantConfig["redeals"];
export type VariantRef = Readonly<{ id: string; version: number }>;

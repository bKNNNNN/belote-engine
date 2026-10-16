import { SUITS, type Card, type Suit } from "../card-primitives";
import type { ContractMode } from "../rules/contract-mode";
import { sideOf, type Seat } from "./seats";
import type { VariantConfig } from "./variant-config";

/**
 * Belote and rebelote, generalised from `contract-belote-registry.ts`: one
 * entry per trump suit whose king and queen a single seat holds when play
 * starts. The entry scores once that seat plays both honours. Options: belote
 * spoken on the first honour, king first, taker side only, per-suit belotes in
 * all trump, golden belote.
 */

type Honour = "K" | "Q";

export type BeloteEntry = Readonly<{
  suit: Suit;
  owner: Seat;
  status: "eligible" | "announced" | "confirmed" | "lost";
  firstHonour: Honour | null;
}>;

export type BeloteState = Readonly<{ entries: readonly BeloteEntry[] }>;

export type BeloteEvent = Readonly<{
  type: "belote";
  seat: Seat;
  suit: Suit;
  stage: "belote" | "rebelote";
}>;

const isHonour = (rank: Card["rank"]): rank is Honour => rank === "K" || rank === "Q";

function beloteSuits(config: VariantConfig, mode: ContractMode): readonly Suit[] {
  const rules = config.belote;
  if (rules === null) return [];
  if (mode.kind === "suit") return [mode.suit];
  return mode.kind === "all-trump" && rules.allTrump === "perSuit" ? SUITS : [];
}

function holdsMarriage(cards: readonly Readonly<Card>[], suit: Suit): boolean {
  return cards.some((card) => card.suit === suit && card.rank === "K")
    && cards.some((card) => card.suit === suit && card.rank === "Q");
}

/** `holdings` lists every card each seat will play this deal (hand and tableau). */
export function createBeloteState(
  config: VariantConfig,
  mode: ContractMode,
  holdings: readonly (readonly Readonly<Card>[])[],
  taker: Seat,
): BeloteState {
  const takerSideOnly = config.belote?.holder === "takerSideOnly";
  const entries = beloteSuits(config, mode).flatMap((suit): BeloteEntry[] => {
    const owner = holdings.findIndex((cards) => holdsMarriage(cards, suit));
    if (owner < 0) return [];
    if (takerSideOnly && sideOf(config.table, owner) !== sideOf(config.table, taker)) return [];
    return [Object.freeze({ suit, owner, status: "eligible", firstHonour: null })];
  });
  return Object.freeze({ entries: Object.freeze(entries) });
}

function entryFor(state: BeloteState, seat: Seat, card: Readonly<Card>): BeloteEntry | null {
  if (!isHonour(card.rank)) return null;
  return state.entries.find((entry) => entry.suit === card.suit && entry.owner === seat) ?? null;
}

/** True when this play may carry the spoken « belote » (spoken declaration only). */
export function beloteAnnouncementAllowed(
  config: VariantConfig,
  state: BeloteState,
  seat: Seat,
  card: Readonly<Card>,
): boolean {
  if (config.belote?.declaration !== "spoken") return false;
  const entry = entryFor(state, seat, card);
  if (entry === null || entry.status !== "eligible") return false;
  return config.belote.order !== "kingFirst" || card.rank === "K";
}

function nextEntry(
  config: VariantConfig,
  entry: BeloteEntry,
  rank: Honour,
  announced: boolean,
): BeloteEntry {
  const rules = config.belote!;
  if (entry.status === "eligible") {
    const refused = (rules.order === "kingFirst" && rank !== "K")
      || (rules.declaration === "spoken" && !announced);
    return Object.freeze({
      ...entry,
      status: refused ? "lost" : "announced",
      firstHonour: rank,
    });
  }
  if (entry.status === "announced" && entry.firstHonour !== rank) {
    return Object.freeze({ ...entry, status: "confirmed" });
  }
  return entry;
}

export function recordBelotePlay(
  config: VariantConfig,
  state: BeloteState,
  seat: Seat,
  card: Readonly<Card>,
  announced: boolean,
): Readonly<{ state: BeloteState; events: readonly BeloteEvent[] }> {
  const entry = entryFor(state, seat, card);
  if (entry === null) return Object.freeze({ state, events: Object.freeze([]) });
  const next = nextEntry(config, entry, card.rank as Honour, announced);
  if (next === entry) return Object.freeze({ state, events: Object.freeze([]) });
  const events: readonly BeloteEvent[] = next.status === "lost"
    ? []
    : [Object.freeze({
      type: "belote",
      seat,
      suit: card.suit,
      stage: next.status === "confirmed" ? "rebelote" : "belote",
    })];
  return Object.freeze({
    state: Object.freeze({
      entries: Object.freeze(state.entries.map((candidate) =>
        candidate === entry ? next : candidate)),
    }),
    events: Object.freeze(events),
  });
}

/** Belote points earned by each seat; a golden belote replaces four belotes. */
export function belotePointsBySeat(config: VariantConfig, state: BeloteState): readonly number[] {
  const rules = config.belote;
  return Object.freeze(Array.from({ length: config.table.seats }, (_, seat) => {
    if (rules === null) return 0;
    const confirmed = state.entries
      .filter((entry) => entry.owner === seat && entry.status === "confirmed").length;
    if (confirmed === SUITS.length && rules.golden !== null) return rules.golden;
    return confirmed * rules.points;
  }));
}

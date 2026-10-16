import { SUITS, type Suit } from "../card-primitives";
import { cardStrengthForMode } from "../rules/contract-card-policy";
import type { ContractMode } from "../rules/contract-mode";
import { cardPoints, virtualCard } from "./card-scale";
import { cardKey, createVariantDeck } from "./deck";
import {
  exclusionsFromPlays,
  locateByElimination,
  type Located,
  type SeatHolding,
} from "./knowledge-inference";
import type { Seat } from "./seats";
import type { VariantConfig } from "./variant-config";
import type { CardView, CompletedTrickView, PlayedCardView, SeatView } from "./view-types";

/**
 * What an attentive player can deduce from a seat view alone (engine-design.md
 * section 3): pure, it reads nothing but the view and an optional memory of
 * tricks. Every claim is true of the real deal; some truths stay unknown.
 * With `trickHistory: lastTrickOnly` the caller keeps the earlier tricks with
 * `rememberTricks`, as a human would; without that memory the history is
 * incomplete and counts become upper bounds.
 */

export type TrickMemory = Readonly<{ dealNumber: number; tricks: readonly CompletedTrickView[] }>;

export type SeatKnowledge = Readonly<{
  seat: Seat;
  handCount: number;
  /** Suits proven absent from this seat's hand. */
  voidSuits: readonly Suit[];
  /** Unseen cards proven absent from this seat's hand. */
  excluded: readonly CardView[];
  /** Unseen cards this seat may still hold in hand. */
  possible: readonly CardView[];
}>;

export type MasterCard = Readonly<{ suit: Suit; card: CardView; holder: "me" | "unseen" | Seat }>;

export type Knowledge = Readonly<{
  /** False when some completed tricks are neither in the view nor in the memory. */
  historyComplete: boolean;
  /** Cards whose holder this view does not prove: other hands, face-down cards, undealt cards. */
  unseen: readonly CardView[];
  /** Cards proven in another seat's hand (the taken turn-up, eliminations). */
  located: readonly Located[];
  /** Every seat but the viewer, in seat order. */
  seats: readonly SeatKnowledge[];
  trumps: Readonly<{ suits: readonly Suit[]; remaining: number; mine: number; others: number }> | null;
  /** The strongest card not yet played in each suit, and who holds it if known. */
  masters: readonly MasterCard[];
  /** Card points still to be played (without the last-trick bonus). */
  pointsRemaining: number | null;
}>;

function byIndex(tricks: readonly CompletedTrickView[]): readonly CompletedTrickView[] {
  const merged = new Map<number, CompletedTrickView>();
  tricks.forEach((trick) => merged.set(trick.index, trick));
  return Object.freeze([...merged.values()].sort((left, right) => left.index - right.index));
}

/** Adds the tricks this view shows to the memory; a memory of another deal is dropped. */
export function rememberTricks(memory: TrickMemory | null, view: SeatView): TrickMemory {
  const kept = memory !== null && memory.dealNumber === view.dealNumber ? memory.tricks : [];
  return Object.freeze({ dealNumber: view.dealNumber, tricks: byIndex([...kept, ...view.completedTricks]) });
}

function receivesTurnup(rules: VariantConfig): boolean {
  return rules.deal.steps.some((step) => step.kind === "completeAfterTaking" && step.takerReceivesTurnup);
}

function trumpSuits(mode: ContractMode): readonly Suit[] {
  if (mode.kind === "suit") return [mode.suit];
  return mode.kind === "all-trump" ? SUITS : [];
}

const keysOf = (cards: readonly CardView[]) => new Set(cards.map(cardKey));
const freezeCards = (cards: readonly CardView[]) => Object.freeze(cards.map((card) => Object.freeze({ ...card })));

type Sighting = Readonly<{
  mine: readonly CardView[];
  played: ReadonlySet<string>;
  /** Face-up cards: in a seat's tableau, or on the table (the turn-up before anyone takes it). */
  faceUp: ReadonlyMap<string, Seat | null>;
  located: readonly Located[];
}>;

function sightings(view: SeatView, tricks: readonly (readonly PlayedCardView[])[]): Sighting {
  const viewer = view.me?.seat ?? null;
  const played = new Set(tricks.flat().map(({ card }) => cardKey(card)));
  const faceUp = new Map<string, Seat | null>();
  view.seats.forEach(({ seat, tableau }) => tableau?.forEach(({ visible }) => {
    if (visible !== null) faceUp.set(cardKey(visible), seat);
  }));
  const turnup = view.turnup;
  const located: Located[] = [];
  if (turnup !== null && !played.has(cardKey(turnup.card)) && !faceUp.has(cardKey(turnup.card))) {
    if (turnup.taker === null || !receivesTurnup(view.rules)) faceUp.set(cardKey(turnup.card), null);
    else if (turnup.taker !== viewer) located.push(Object.freeze({ seat: turnup.taker, card: turnup.card }));
  }
  return { mine: view.me?.hand ?? [], played, faceUp, located };
}

function mastersOf(view: SeatView, mode: ContractMode, sight: Sighting, located: readonly Located[]): readonly MasterCard[] {
  const deck = createVariantDeck(view.rules.deck.removed);
  const viewer = view.me?.seat ?? null;
  const mine = keysOf(sight.mine);
  const strength = (card: CardView) => cardStrengthForMode(virtualCard(view.rules.cards, mode, card), mode);
  return Object.freeze(SUITS.flatMap((suit): MasterCard[] => {
    const left = deck.filter((card) => card.suit === suit && !sight.played.has(cardKey(card)));
    if (left.length === 0) return [];
    const best = left.reduce((top, card) => strength(card) > strength(top) ? card : top);
    const key = cardKey(best);
    const holder = sight.faceUp.get(key) ?? located.find(({ card }) => cardKey(card) === key)?.seat ?? null;
    const owner = mine.has(key) || (holder !== null && holder === viewer) ? "me" : holder ?? "unseen";
    return [Object.freeze({ suit, card: Object.freeze({ ...best }), holder: owner })];
  }));
}

function trumpsOf(view: SeatView, mode: ContractMode, sight: Sighting): Knowledge["trumps"] {
  const suits = trumpSuits(mode);
  if (suits.length === 0) return null;
  const deck = createVariantDeck(view.rules.deck.removed);
  const remaining = deck.filter((card) => suits.includes(card.suit) && !sight.played.has(cardKey(card))).length;
  const mine = sight.mine.filter((card) => suits.includes(card.suit)).length;
  return Object.freeze({ suits: Object.freeze([...suits]), remaining, mine, others: remaining - mine });
}

function pointsOf(view: SeatView, mode: ContractMode, sight: Sighting): number {
  return createVariantDeck(view.rules.deck.removed)
    .filter((card) => !sight.played.has(cardKey(card)))
    .reduce((total, card) => total + cardPoints(view.rules, mode, card), 0);
}

export function deduce(view: SeatView, memory: TrickMemory | null = null): Knowledge {
  const completed = memory === null ? byIndex(view.completedTricks) : rememberTricks(memory, view).tricks;
  const tricks = [...completed.map(({ cards }) => cards), ...(view.trick === null ? [] : [view.trick.cards])];
  const historyComplete = completed.length === view.tricksPlayed;
  const sight = sightings(view, tricks);
  const mine = keysOf(sight.mine);
  const locatedKeys = keysOf(sight.located.map(({ card }) => card));
  const unseen = createVariantDeck(view.rules.deck.removed).filter((card) => {
    const key = cardKey(card);
    return !mine.has(key) && !sight.played.has(key) && !sight.faceUp.has(key) && !locatedKeys.has(key);
  });
  const viewer = view.me?.seat ?? null;
  const contract = view.contract;
  const exclusions = contract === null
    ? new Map<Seat, ReadonlySet<string>>()
    : exclusionsFromPlays({ config: view.rules, mode: contract.mode, taker: contract.taker, viewer }, tricks, unseen);
  const holdings: SeatHolding[] = view.seats
    .filter(({ seat }) => seat !== viewer)
    .map(({ seat, handCount }) => ({ seat, handCount, excluded: exclusions.get(seat) ?? new Set<string>() }));
  const faceDown = view.seats.reduce((total, { tableau }) =>
    total + (tableau ?? []).reduce((count, { hiddenCount }) => count + hiddenCount, 0), 0);
  const placed = locateByElimination(holdings, unseen, sight.located, historyComplete && faceDown + view.undealtCount === 0);
  const seats = holdings.map((holding): SeatKnowledge => {
    const possible = placed.unseen.filter((card) => !holding.excluded.has(cardKey(card)));
    const held = placed.located.filter(({ seat }) => seat === holding.seat).map(({ card }) => card);
    const present = new Set([...possible, ...held].map(({ suit }) => suit));
    return Object.freeze({
      seat: holding.seat,
      handCount: holding.handCount,
      voidSuits: Object.freeze(SUITS.filter((suit) => !present.has(suit))),
      excluded: freezeCards(placed.unseen.filter((card) => holding.excluded.has(cardKey(card)))),
      possible: freezeCards(possible),
    });
  });
  return Object.freeze({
    historyComplete,
    unseen: freezeCards(placed.unseen),
    located: Object.freeze(placed.located.map(({ seat, card }) => Object.freeze({ seat, card: Object.freeze({ ...card }) }))),
    seats: Object.freeze(seats),
    trumps: contract === null ? null : trumpsOf(view, contract.mode, sight),
    masters: contract === null ? Object.freeze([]) : mastersOf(view, contract.mode, sight, placed.located),
    pointsRemaining: contract === null ? null : pointsOf(view, contract.mode, sight),
  });
}

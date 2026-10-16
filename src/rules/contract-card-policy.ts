import type { Card, Rank, Suit } from "../cards";
import type { PlayedCard } from "../trick";
import type { ContractMode } from "./contract-mode";

export type UndertrumpPolicy = "required" | "optional";

const PLAIN_ORDER = Object.freeze(["A", "10", "K", "Q", "J", "9", "8", "7"] as const);
const TRUMP_ORDER = Object.freeze(["J", "9", "A", "10", "K", "Q", "8", "7"] as const);
const PLAIN_POINTS = Object.freeze({ A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 });
const TRUMP_POINTS = Object.freeze({ J: 20, "9": 14, A: 11, "10": 10, K: 4, Q: 3, "8": 0, "7": 0 });
const NO_TRUMP_POINTS = Object.freeze({ A: 19, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 });
const ALL_TRUMP_POINTS = Object.freeze({ J: 13, "9": 9, A: 6, "10": 5, K: 3, Q: 2, "8": 0, "7": 0 });

export function cardPointsForMode(
  card: Readonly<Card>,
  mode: ContractMode,
): number {
  if (mode.kind === "no-trump") return NO_TRUMP_POINTS[card.rank];
  if (mode.kind === "all-trump") return ALL_TRUMP_POINTS[card.rank];
  return card.suit === mode.suit
    ? TRUMP_POINTS[card.rank]
    : PLAIN_POINTS[card.rank];
}

export function cardStrengthForMode(
  card: Readonly<Card>,
  mode: ContractMode,
): number {
  const order = mode.kind === "all-trump"
    || (mode.kind === "suit" && card.suit === mode.suit)
    ? TRUMP_ORDER
    : PLAIN_ORDER;
  return strength(card.rank, order);
}

export function trickWinnerForMode(
  trick: readonly Readonly<PlayedCard>[],
  mode: ContractMode,
): number {
  const first = trick[0];
  if (first === undefined) throw new TypeError("Un pli vide n'a pas de gagnant.");
  const relevantSuit = winningSuit(trick, mode, first.card.suit);
  const relevant = trick.filter(({ card }) => card.suit === relevantSuit);
  return relevant.slice(1)
    .reduce((best, candidate) => stronger(candidate, best, mode), relevant[0]!)
    .player;
}

export function trickPointsForMode(
  trick: readonly Readonly<PlayedCard>[],
  mode: ContractMode,
): number {
  return trick.reduce(
    (total, { card }) => total + cardPointsForMode(card, mode),
    0,
  );
}

export function legalMovesForMode(
  hand: readonly Readonly<Card>[],
  trick: readonly Readonly<PlayedCard>[],
  mode: ContractMode,
  player: number,
  undertrump: UndertrumpPolicy,
): readonly Readonly<Card>[] {
  const first = trick[0];
  if (first === undefined) return Object.freeze([...hand]);
  const matching = hand.filter(({ suit }) => suit === first.card.suit);
  if (mode.kind === "all-trump") {
    return matching.length === 0
      ? Object.freeze([...hand])
      : allTrumpMatches(matching, trick, mode);
  }
  if (mode.kind === "no-trump") return frozenSelection(matching, hand);
  return suitModeMoves(hand, trick, matching, mode, player, undertrump);
}

function allTrumpMatches(
  matching: readonly Readonly<Card>[],
  trick: readonly Readonly<PlayedCard>[],
  mode: Extract<ContractMode, { kind: "all-trump" }>,
): readonly Readonly<Card>[] {
  const led = trick[0]!.card.suit;
  const strongest = Math.max(...trick
    .filter(({ card }) => card.suit === led)
    .map(({ card }) => cardStrengthForMode(card, mode)));
  const higher = matching.filter((card) =>
    cardStrengthForMode(card, mode) > strongest);
  return frozenSelection(higher, matching);
}

function suitModeMoves(
  hand: readonly Readonly<Card>[],
  trick: readonly Readonly<PlayedCard>[],
  matching: readonly Readonly<Card>[],
  mode: Extract<ContractMode, { kind: "suit" }>,
  player: number,
  undertrump: UndertrumpPolicy,
): readonly Readonly<Card>[] {
  const trumpsDown = trick.filter(({ card }) => card.suit === mode.suit);
  const handTrumps = hand.filter(({ suit }) => suit === mode.suit);
  const overtrumps = strongerThanTrick(handTrumps, trumpsDown, mode);
  if (matching.length > 0) {
    return mode.suit === trick[0]!.card.suit
      ? frozenSelection(overtrumps, matching)
      : Object.freeze([...matching]);
  }
  if (sameTeam(trickWinnerForMode(trick, mode), player)) {
    return Object.freeze([...hand]);
  }
  if (handTrumps.length === 0) return Object.freeze([...hand]);
  if (trumpsDown.length === 0) return Object.freeze([...handTrumps]);
  if (overtrumps.length > 0) return Object.freeze([...overtrumps]);
  return undertrump === "required"
    ? Object.freeze([...handTrumps])
    : Object.freeze([...hand]);
}

function strongerThanTrick(
  cards: readonly Readonly<Card>[],
  trick: readonly Readonly<PlayedCard>[],
  mode: ContractMode,
): readonly Readonly<Card>[] {
  const strongest = trick.reduce(
    (current, { card }) => Math.max(current, cardStrengthForMode(card, mode)),
    -Infinity,
  );
  return cards.filter((card) => cardStrengthForMode(card, mode) > strongest);
}

function frozenSelection(
  preferred: readonly Readonly<Card>[],
  fallback: readonly Readonly<Card>[],
): readonly Readonly<Card>[] {
  return Object.freeze([...(preferred.length > 0 ? preferred : fallback)]);
}

function winningSuit(
  trick: readonly Readonly<PlayedCard>[],
  mode: ContractMode,
  led: Suit,
): Suit {
  return mode.kind === "suit" && trick.some(({ card }) => card.suit === mode.suit)
    ? mode.suit
    : led;
}

function stronger(
  candidate: Readonly<PlayedCard>,
  best: Readonly<PlayedCard>,
  mode: ContractMode,
): Readonly<PlayedCard> {
  return cardStrengthForMode(candidate.card, mode)
    > cardStrengthForMode(best.card, mode) ? candidate : best;
}

function strength(rank: Rank, order: readonly Rank[]): number {
  return order.length - order.indexOf(rank);
}

function sameTeam(first: number, second: number): boolean {
  return first % 2 === second % 2;
}

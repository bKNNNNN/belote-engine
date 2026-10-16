import type { Card, Rank } from "../card-primitives";
import type { ContractMode } from "../rules/contract-mode";
import type { CardScaleConfig, VariantConfig } from "./variant-config";

/**
 * Card values per scale (belote-variants-bible.md 2.2) and the Cavaillon
 * inversion. Inverted ranks are handled by mapping each card to the "virtual"
 * rank that holds its place in the normal order: the verified legality and
 * trick-winner policy then runs unchanged on virtual cards.
 */

type PointTable = Readonly<Record<Rank, number>>;

const PLAIN: PointTable = Object.freeze({ A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 });
const TRUMP: PointTable = Object.freeze({ J: 20, "9": 14, A: 11, "10": 10, K: 4, Q: 3, "8": 0, "7": 0 });
const NO_TRUMP_SCALED: PointTable = Object.freeze({ A: 19, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 });
const ALL_TRUMP_FFB2015: PointTable = Object.freeze({ J: 13, "9": 9, A: 6, "10": 5, K: 3, Q: 2, "8": 0, "7": 0 });
const ALL_TRUMP_TABLE_A: PointTable = Object.freeze({ J: 14, "9": 9, A: 6, "10": 5, K: 3, Q: 1, "8": 0, "7": 0 });

/** Inverted trump order 7 8 Q K 10 A 9 J maps onto J 9 A 10 K Q 8 7. */
const INVERTED_TRUMP: Readonly<Record<Rank, Rank>> = Object.freeze({
  "7": "J", "8": "9", Q: "A", K: "10", "10": "K", A: "Q", "9": "8", J: "7",
});
/** Inverted plain order 7 8 9 J Q K 10 A maps onto A 10 K Q J 9 8 7. */
const INVERTED_PLAIN: Readonly<Record<Rank, Rank>> = Object.freeze({
  "7": "A", "8": "10", "9": "K", J: "Q", Q: "J", K: "9", "10": "8", A: "7",
});

function isTrumpCard(mode: ContractMode, card: Readonly<Card>): boolean {
  return mode.kind === "all-trump" || (mode.kind === "suit" && card.suit === mode.suit);
}

/** The card the normal-order policy should see for this card. */
export function virtualCard(
  cards: CardScaleConfig,
  mode: ContractMode,
  card: Readonly<Card>,
): Readonly<Card> {
  if (!cards.invertedRanks) return card;
  const table = isTrumpCard(mode, card) ? INVERTED_TRUMP : INVERTED_PLAIN;
  return { suit: card.suit, rank: table[card.rank] };
}

function allTrumpTable(cards: CardScaleConfig): PointTable {
  if (cards.allTrump === "tableA") return ALL_TRUMP_TABLE_A;
  return cards.allTrump === "raw248" ? TRUMP : ALL_TRUMP_FFB2015;
}

function tableFor(cards: CardScaleConfig, mode: ContractMode, card: Readonly<Card>): PointTable {
  if (mode.kind === "all-trump") return allTrumpTable(cards);
  if (mode.kind === "no-trump") return cards.noTrump === "raw120" ? PLAIN : NO_TRUMP_SCALED;
  return card.suit === mode.suit ? TRUMP : PLAIN;
}

export function cardPoints(config: VariantConfig, mode: ContractMode, card: Readonly<Card>): number {
  const virtual = virtualCard(config.cards, mode, card);
  return tableFor(config.cards, mode, virtual)[virtual.rank];
}

export function trickCardPoints(
  config: VariantConfig,
  mode: ContractMode,
  cards: readonly Readonly<Card>[],
): number {
  return cards.reduce((total, card) => total + cardPoints(config, mode, card), 0);
}

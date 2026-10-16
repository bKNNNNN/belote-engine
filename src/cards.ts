import {
  cardPointsForMode,
  cardStrengthForMode,
} from "./rules/contract-card-policy";
import { suitContractMode } from "./rules/contract-mode";
import type { Card, Suit } from "./card-primitives";

export { RANKS, SUITS } from "./card-primitives";
export type { Card, Rank, Suit } from "./card-primitives";

export function cardPoints(card: Card, trump: Suit): number {
  return cardPointsForMode(card, suitContractMode(trump));
}

export function cardStrength(card: Card, trump: Suit): number {
  return cardStrengthForMode(card, suitContractMode(trump));
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

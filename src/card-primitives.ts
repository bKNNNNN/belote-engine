export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUITS: readonly Suit[] = Object.freeze([
  "spades",
  "hearts",
  "diamonds",
  "clubs",
]);

export const RANKS: readonly Rank[] = Object.freeze([
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
]);

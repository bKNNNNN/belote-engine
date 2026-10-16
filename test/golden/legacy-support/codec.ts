import { RANKS, SUITS, type Card, type Rank, type Suit } from "../../../src/cards";
import {
  contractModeKey,
  parseContractMode,
  type ContractMode,
} from "../../../src/rules/contract-mode";

/**
 * Compact, human-readable encodings used by the legacy golden fixtures.
 * A card is `<rank><suit initial>` (`10h`, `Js`); a deck is 32 cards joined by
 * spaces; an intent is a space-separated tuple whose first field is its kind.
 */

const SUIT_CODES: Readonly<Record<Suit, string>> = Object.freeze({
  spades: "s",
  hearts: "h",
  diamonds: "d",
  clubs: "c",
});

export function encodeCard(card: Readonly<Card>): string {
  return `${card.rank}${SUIT_CODES[card.suit]}`;
}

export function decodeCard(code: string): Card {
  const suit = SUITS.find((candidate) => SUIT_CODES[candidate] === code.slice(-1));
  const rank = code.slice(0, -1) as Rank;
  if (suit === undefined || !RANKS.includes(rank)) {
    throw new TypeError(`Invalid card code: ${code}`);
  }
  return { suit, rank };
}

export function encodeDeck(deck: readonly Readonly<Card>[]): string {
  return deck.map(encodeCard).join(" ");
}

export function decodeDeck(code: string): Card[] {
  return code.split(" ").map(decodeCard);
}

export function encodeMode(mode: ContractMode): string {
  return contractModeKey(mode);
}

export function decodeMode(code: string): ContractMode {
  if (code.startsWith("suit:")) {
    return parseContractMode({ kind: "suit", suit: code.slice(5) });
  }
  return parseContractMode({ kind: code });
}

export function decodeSuit(code: string): Suit {
  if (!SUITS.includes(code as Suit)) throw new TypeError(`Invalid suit: ${code}`);
  return code as Suit;
}

export function fields(code: string, expectedLength: number): readonly string[] {
  const parts = code.split(" ");
  if (parts.length !== expectedLength) {
    throw new TypeError(`Invalid intent code: ${code}`);
  }
  return parts;
}

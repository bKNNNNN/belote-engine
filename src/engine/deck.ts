import { RANKS, SUITS, type Card } from "../card-primitives";
import { nextInt, type RngState } from "./rng";

export type EngineCard = Readonly<Card>;
export type EngineDeck = readonly EngineCard[];

export class InvalidVariantDeckError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVariantDeckError";
  }
}

export function cardKey(card: Readonly<Card>): string {
  return `${card.suit}:${card.rank}`;
}

function isCanonicalCard(card: Readonly<Card>): boolean {
  return SUITS.includes(card.suit) && RANKS.includes(card.rank);
}

/** The 32-card deck in canonical order, minus the cards a variant removes. */
export function createVariantDeck(removed: readonly Readonly<Card>[]): EngineDeck {
  if (!removed.every(isCanonicalCard)) {
    throw new InvalidVariantDeckError("Removed cards must be canonical cards");
  }
  const removedKeys = new Set(removed.map(cardKey));
  if (removedKeys.size !== removed.length) {
    throw new InvalidVariantDeckError("A card cannot be removed twice");
  }
  return Object.freeze(SUITS.flatMap((suit) => RANKS
    .filter((rank) => !removedKeys.has(cardKey({ suit, rank })))
    .map((rank) => Object.freeze({ suit, rank }))));
}

/** Fisher-Yates shuffle driven by the engine RNG; returns the advanced state. */
export function shuffleDeck(
  deck: EngineDeck,
  state: RngState,
): Readonly<{ deck: EngineDeck; state: RngState }> {
  const cards = [...deck];
  let rng = state;
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const draw = nextInt(rng, index + 1);
    rng = draw.state;
    const swap = cards[draw.value]!;
    cards[draw.value] = cards[index]!;
    cards[index] = swap;
  }
  return Object.freeze({ deck: Object.freeze(cards), state: rng });
}

export type CutRange = Readonly<{ min: number; max: number }>;

/** The cut positions that leave at least `minPacket` cards on each side. */
export function legalCutRange(deckSize: number, minPacket: number): CutRange {
  return Object.freeze({ min: minPacket, max: deckSize - minPacket });
}

/** The top `position` cards go under the rest; the deck is otherwise untouched. */
export function cutDeck(deck: EngineDeck, position: number): EngineDeck {
  if (!Number.isInteger(position) || position < 0 || position > deck.length) {
    throw new RangeError(`Cut position ${position} is outside a deck of ${deck.length}`);
  }
  return Object.freeze([...deck.slice(position), ...deck.slice(0, position)]);
}

/**
 * The deck to lay down so that a cut at `position` gives `deck`: a scripted
 * deal (a puzzle or a tutorial) designs the dealt deck, then lets its cut be played.
 */
export function uncutDeck(deck: EngineDeck, position: number): EngineDeck {
  return cutDeck(deck, deck.length - position);
}

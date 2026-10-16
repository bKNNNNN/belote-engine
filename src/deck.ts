import { RANKS, SUITS, type Card } from "./cards";

export type Rng = () => number;

export class InvalidRandomValueError extends RangeError {
  constructor() {
    super("Random values must be finite numbers in the interval [0, 1)");
    this.name = "InvalidRandomValueError";
  }
}

export class InvalidCutIndexError extends RangeError {
  constructor() {
    super("Cut index must be an integer within the deck bounds");
    this.name = "InvalidCutIndexError";
  }
}

export class InvalidDeckError extends TypeError {
  constructor(
    message = "A belote deal requires the 32 unique canonical cards",
  ) {
    super(message);
    this.name = "InvalidDeckError";
  }
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

function checkedRandom(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new InvalidRandomValueError();
  }
  return value;
}

function swapped<T>(items: readonly T[], first: number, second: number): T[] {
  if (first === second) return [...items];
  return items.map((item, index) => {
    if (index === first) return items[second]!;
    if (index === second) return items[first]!;
    return item;
  });
}

export function shuffle(deck: readonly Card[], rng: Rng): Card[] {
  const randomValues = Array.from(
    { length: Math.max(0, deck.length - 1) },
    () => checkedRandom(rng),
  );
  return randomValues.reduce(
    (current, value, drawIndex) => {
      const lastIndex = deck.length - 1 - drawIndex;
      return swapped(current, lastIndex, Math.floor(value * (lastIndex + 1)));
    },
    [...deck],
  );
}

export function cutDeck(deck: readonly Card[], index: number): Card[] {
  if (!Number.isInteger(index) || index < 0 || index > deck.length) {
    throw new InvalidCutIndexError();
  }
  return [...deck.slice(index), ...deck.slice(0, index)];
}

function isBeloteCard(value: unknown): value is Card {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Card>;
  return SUITS.includes(candidate.suit as Card["suit"])
    && RANKS.includes(candidate.rank as Card["rank"]);
}

function cardKey(card: Card): string {
  return `${card.suit}:${card.rank}`;
}

export function assertCanonicalDeck(deck: readonly Card[]): void {
  if (
    deck.length !== 32
    || !deck.every(isBeloteCard)
    || new Set(deck.map(cardKey)).size !== 32
  ) {
    throw new InvalidDeckError();
  }
}

export function dealHands(deck: readonly Card[]): [Card[], Card[], Card[], Card[]] {
  assertCanonicalDeck(deck);
  return [deck.slice(0, 8), deck.slice(8, 16), deck.slice(16, 24), deck.slice(24, 32)];
}

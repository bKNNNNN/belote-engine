import { describe, expect, it } from "vitest";
import { createDeck } from "../../src/deck";
import {
  InvalidVariantDeckError,
  createVariantDeck,
  shuffleDeck,
} from "../../src/engine/deck";
import { createRng, seedFromNumber } from "../../src/engine/rng";

const key = (card: { suit: string; rank: string }) => `${card.rank}${card.suit}`;

describe("engine deck", () => {
  it("builds the 32-card deck in canonical order when nothing is removed", () => {
    expect(createVariantDeck([])).toEqual(createDeck());
  });

  it("removes the configured cards for reduced decks", () => {
    const deck = createVariantDeck([
      { suit: "spades", rank: "7" },
      { suit: "clubs", rank: "7" },
    ]);
    expect(deck).toHaveLength(30);
    expect(deck.map(key)).not.toContain("7spades");
    expect(deck.map(key)).not.toContain("7clubs");
    expect(Object.isFrozen(deck)).toBe(true);
  });

  it("rejects removing unknown or duplicate cards", () => {
    expect(() => createVariantDeck([{ suit: "spades", rank: "6" as never }]))
      .toThrow(InvalidVariantDeckError);
    expect(() => createVariantDeck([
      { suit: "spades", rank: "7" },
      { suit: "spades", rank: "7" },
    ])).toThrow(InvalidVariantDeckError);
  });

  it("shuffles deterministically and keeps every card once", () => {
    const deck = createVariantDeck([]);
    const rng = createRng(seedFromNumber(5));
    const first = shuffleDeck(deck, rng);
    const second = shuffleDeck(deck, rng);
    expect(first).toEqual(second);
    expect(first.deck.map(key).sort()).toEqual(deck.map(key).sort());
    expect(first.deck).not.toEqual(deck);
    expect(first.state).not.toEqual(rng);
    expect(Object.isFrozen(first.deck)).toBe(true);
  });

  it("shuffles a reduced deck", () => {
    const deck = createVariantDeck([
      { suit: "spades", rank: "7" },
      { suit: "clubs", rank: "7" },
    ]);
    const shuffled = shuffleDeck(deck, createRng(seedFromNumber(9))).deck;
    expect(shuffled.map(key).sort()).toEqual(deck.map(key).sort());
  });

  it("produces every position for the first card over many seeds", () => {
    const deck = createVariantDeck([]);
    const firsts = new Set<string>();
    for (let seed = 0; seed < 2_000; seed += 1) {
      firsts.add(key(shuffleDeck(deck, createRng(seedFromNumber(seed))).deck[0]!));
    }
    expect(firsts.size).toBe(32);
  });
});

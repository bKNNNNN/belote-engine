import { describe, expect, it } from "vitest";
import type { Card } from "../../src/cards";
import {
  InvalidDealError,
  completeDeal,
  dealUntilSelection,
  type CompletedDeal,
} from "../../src/engine/deal-interpreter";
import { cardKey, createVariantDeck, shuffleDeck, type EngineDeck } from "../../src/engine/deck";
import { PRESET_REGISTRY, findPreset, variantKey } from "../../src/engine/presets";
import { createRng, seedFromNumber } from "../../src/engine/rng";
import type { VariantConfig } from "../../src/engine/variant-config";

const preset = (id: string, version = 1): VariantConfig => findPreset({ id, version })!.config;
const CLASSIQUE = preset("classique");
const SEEDS = Array.from({ length: 25 }, (_, index) => index);

function shuffledFor(config: VariantConfig, seed: number): EngineDeck {
  return shuffleDeck(createVariantDeck(config.deck.removed), createRng(seedFromNumber(seed))).deck;
}

function allCards(deal: CompletedDeal): string[] {
  return deal.seats.flatMap((seat) => [
    ...seat.hand,
    ...seat.tableau.flatMap(({ hidden, visible }) => [hidden, visible]),
  ]).filter((card): card is Readonly<Card> => card !== null).map(cardKey);
}

describe("deal interpreter: two and three seats", () => {
  it.each(SEEDS)("belote à trois gives ten cards to everyone, whoever takes (seed %i)", (seed) => {
    const config = preset("a-trois");
    const deck = shuffledFor(config, seed);
    const partial = dealUntilSelection(config, deck, seed % 3);
    expect(partial.seats.map(({ hand }) => hand.length)).toEqual([6, 6, 6]);
    for (const taker of [0, 1, 2]) {
      const complete = completeDeal(config, partial, taker);
      expect(complete.seats.map(({ hand }) => hand.length)).toEqual([10, 10, 10]);
      expect(complete.seats[taker]!.hand[6]).toEqual(partial.turnup);
      expect(allCards(complete).sort()).toEqual(deck.map(cardKey).sort());
    }
  });

  it.each(SEEDS)("belote à deux deals 8 in hand and a 4-column tableau (seed %i)", (seed) => {
    const config = preset("a-deux");
    const deck = shuffledFor(config, seed);
    const dealer = seed % 2;
    const partial = dealUntilSelection(config, deck, dealer);
    const dealerColumns = partial.seats[dealer]!.tableau;
    expect(partial.turnup).toEqual(dealerColumns.at(-1)!.visible);
    const complete = completeDeal(config, partial, 1 - dealer);
    complete.seats.forEach((seat) => {
      expect(seat.hand).toHaveLength(8);
      expect(seat.tableau).toHaveLength(4);
      seat.tableau.forEach((column) => {
        expect(column.hidden).not.toBeNull();
        expect(column.visible).not.toBeNull();
      });
    });
    expect(allCards(complete).sort()).toEqual(deck.map(cardKey).sort());
  });
});

describe("deal interpreter: every preset", () => {
  it.each(PRESET_REGISTRY.map((entry) => [variantKey(entry.config), entry.config] as const))(
    "%s deals the whole deck into equal hands",
    (_key, config) => {
      const deck = shuffledFor(config, 3);
      const partial = dealUntilSelection(config, deck, 0);
      const complete = completeDeal(config, partial, 1);
      const sizes = complete.seats.map((seat) => seat.hand.length + seat.tableau.length * 2);
      expect(new Set(sizes).size).toBe(1);
      expect(sizes[0]! * config.table.seats).toBe(deck.length);
      expect(allCards(complete).sort()).toEqual(deck.map(cardKey).sort());
      expect(Object.isFrozen(complete.seats[0]!.hand)).toBe(true);
    },
  );
});

describe("deal interpreter: validation", () => {
  it("rejects a deck that is not the variant deck", () => {
    const deck = shuffledFor(CLASSIQUE, 1);
    expect(() => dealUntilSelection(CLASSIQUE, deck.slice(1), 0)).toThrow(InvalidDealError);
    expect(() => dealUntilSelection(CLASSIQUE, [deck[0]!, ...deck.slice(0, 31)], 0))
      .toThrow(InvalidDealError);
    expect(() => dealUntilSelection(preset("a-trois"), deck.slice(2), 0))
      .toThrow(InvalidDealError);
  });

  it("rejects an invalid dealer or taker", () => {
    const deck = shuffledFor(CLASSIQUE, 1);
    expect(() => dealUntilSelection(CLASSIQUE, deck, 4)).toThrow(RangeError);
    const partial = dealUntilSelection(CLASSIQUE, deck, 0);
    expect(() => completeDeal(CLASSIQUE, partial, null)).toThrow(InvalidDealError);
    expect(() => completeDeal(CLASSIQUE, partial, 9)).toThrow(RangeError);
  });

  it("does not mutate its inputs", () => {
    const deck = shuffledFor(CLASSIQUE, 2);
    const snapshot = JSON.stringify(deck);
    const partial = dealUntilSelection(CLASSIQUE, deck, 0);
    const partialSnapshot = JSON.stringify(partial);
    completeDeal(CLASSIQUE, partial, 2);
    expect(JSON.stringify(deck)).toBe(snapshot);
    expect(JSON.stringify(partial)).toBe(partialSnapshot);
  });
});

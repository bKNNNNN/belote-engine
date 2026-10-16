import { describe, expect, it } from "vitest";
import { RANKS, SUITS, type Card } from "../../src/card-primitives";
import { cardPoints, trickCardPoints, virtualCard } from "../../src/engine/card-scale";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import type { VariantConfig } from "../../src/engine/variant-config";
import { cardPointsForMode } from "../../src/rules/contract-card-policy";
import {
  allTrumpMode,
  noTrumpMode,
  suitContractMode,
  type ContractMode,
} from "../../src/rules/contract-mode";

const COINCHE = findPreset({ id: "coinche-sa-ta-ffb2015", version: 1 })!.config;
const DECK = SUITS.flatMap((suit) => RANKS.map((rank): Card => ({ suit, rank })));
const MODES: readonly ContractMode[] = [suitContractMode("hearts"), noTrumpMode(), allTrumpMode()];

function variant(overrides: VariantOverrides): VariantConfig {
  const resolved = resolveVariant(COINCHE, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

const total = (config: VariantConfig, mode: ContractMode) => trickCardPoints(config, mode, DECK);

describe("card scales", () => {
  it("matches the legacy FFB 2015 values in every mode", () => {
    for (const mode of MODES) {
      for (const card of DECK) expect(cardPoints(COINCHE, mode, card)).toBe(cardPointsForMode(card, mode));
    }
  });

  it("totals 152 card points in every mode with the scaled tables", () => {
    for (const mode of MODES) expect(total(COINCHE, mode)).toBe(152);
    expect(total(variant({ cards: { allTrump: "tableA" } }), allTrumpMode())).toBe(152);
  });

  it("keeps the raw totals of 120 at no trump and 248 at all trump", () => {
    expect(total(variant({ cards: { noTrump: "raw120" } }), noTrumpMode())).toBe(120);
    expect(total(variant({ cards: { allTrump: "raw248" } }), allTrumpMode())).toBe(248);
  });

  it("uses table A (jack 14, queen 1) for the pagat all trump", () => {
    const config = variant({ cards: { allTrump: "tableA" } });
    expect(cardPoints(config, allTrumpMode(), { suit: "clubs", rank: "J" })).toBe(14);
    expect(cardPoints(config, allTrumpMode(), { suit: "clubs", rank: "Q" })).toBe(1);
  });

  it("inverts the order and the values at Cavaillon (7 of trump = 20)", () => {
    const config = variant({ cards: { invertedRanks: true } });
    const hearts = suitContractMode("hearts");
    expect(cardPoints(config, hearts, { suit: "hearts", rank: "7" })).toBe(20);
    expect(cardPoints(config, hearts, { suit: "hearts", rank: "8" })).toBe(14);
    expect(cardPoints(config, hearts, { suit: "hearts", rank: "Q" })).toBe(11);
    expect(cardPoints(config, hearts, { suit: "hearts", rank: "J" })).toBe(0);
    expect(cardPoints(config, hearts, { suit: "clubs", rank: "7" })).toBe(11);
    expect(total(config, hearts)).toBe(152);
    expect(virtualCard(COINCHE.cards, hearts, { suit: "hearts", rank: "7" }))
      .toEqual({ suit: "hearts", rank: "7" });
  });
});

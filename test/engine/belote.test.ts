import { describe, expect, it } from "vitest";
import { SUITS, type Card, type Suit } from "../../src/card-primitives";
import {
  beloteAnnouncementAllowed,
  belotePointsBySeat,
  createBeloteState,
  recordBelotePlay,
  type BeloteState,
} from "../../src/engine/belote";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import type { VariantConfig } from "../../src/engine/variant-config";
import {
  allTrumpMode,
  noTrumpMode,
  suitContractMode,
} from "../../src/rules/contract-mode";

const CLASSIQUE = findPreset({ id: "classique", version: 1 })!.config;
const COINCHE_SA_TA = findPreset({ id: "coinche-sa-ta-ffb2015", version: 1 })!.config;
const HEARTS = suitContractMode("hearts");
const card = (rank: Card["rank"], suit: Suit): Card => ({ suit, rank });

function variant(base: VariantConfig, overrides: VariantOverrides): VariantConfig {
  const resolved = resolveVariant(base, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

const HOLDINGS: readonly (readonly Card[])[] = [
  [card("K", "hearts"), card("Q", "hearts")],
  [card("K", "spades")],
  [card("Q", "spades")],
  [],
];

function play(
  config: VariantConfig,
  state: BeloteState,
  plays: readonly [number, Card, boolean?][],
): Readonly<{ state: BeloteState; events: readonly unknown[] }> {
  return plays.reduce<{ state: BeloteState; events: readonly unknown[] }>((current, [seat, played, say]) => {
    const step = recordBelotePlay(config, current.state, seat, played, say ?? false);
    return { state: step.state, events: [...current.events, ...step.events] };
  }, { state, events: [] });
}

describe("belote", () => {
  it("scores 20 for the seat that plays both trump honours it held", () => {
    const state = createBeloteState(CLASSIQUE, HEARTS, HOLDINGS, 1);
    const result = play(CLASSIQUE, state, [[0, card("Q", "hearts")], [0, card("K", "hearts")]]);
    expect(belotePointsBySeat(CLASSIQUE, result.state)).toEqual([20, 0, 0, 0]);
    expect(result.events).toEqual([
      { type: "belote", seat: 0, suit: "hearts", stage: "belote" },
      { type: "belote", seat: 0, suit: "hearts", stage: "rebelote" },
    ]);
  });

  it("gives nothing for a king and a queen split between partners", () => {
    const state = createBeloteState(CLASSIQUE, suitContractMode("spades"), HOLDINGS, 1);
    const result = play(CLASSIQUE, state, [[1, card("K", "spades")], [2, card("Q", "spades")]]);
    expect(belotePointsBySeat(CLASSIQUE, result.state)).toEqual([0, 0, 0, 0]);
  });

  it("needs the spoken announcement on the first honour when declaration is spoken", () => {
    const config = variant(CLASSIQUE, { belote: { declaration: "spoken" } });
    const state = createBeloteState(config, HEARTS, HOLDINGS, 1);
    expect(beloteAnnouncementAllowed(config, state, 0, card("K", "hearts"))).toBe(true);
    expect(beloteAnnouncementAllowed(config, state, 1, card("K", "hearts"))).toBe(false);
    expect(beloteAnnouncementAllowed(CLASSIQUE, state, 0, card("K", "hearts"))).toBe(false);
    const silent = play(config, state, [[0, card("K", "hearts")], [0, card("Q", "hearts")]]);
    expect(belotePointsBySeat(config, silent.state)).toEqual([0, 0, 0, 0]);
    const spoken = play(config, state, [[0, card("K", "hearts"), true], [0, card("Q", "hearts")]]);
    expect(belotePointsBySeat(config, spoken.state)).toEqual([20, 0, 0, 0]);
  });

  it("counts only a king played first with the kingFirst order", () => {
    const config = variant(CLASSIQUE, { belote: { order: "kingFirst" } });
    const state = createBeloteState(config, HEARTS, HOLDINGS, 1);
    const queenFirst = play(config, state, [[0, card("Q", "hearts")], [0, card("K", "hearts")]]);
    expect(belotePointsBySeat(config, queenFirst.state)).toEqual([0, 0, 0, 0]);
    const kingFirst = play(config, state, [[0, card("K", "hearts")], [0, card("Q", "hearts")]]);
    expect(belotePointsBySeat(config, kingFirst.state)).toEqual([20, 0, 0, 0]);
  });

  it("ignores a defender's belote when only the taker side may hold it", () => {
    const config = variant(CLASSIQUE, { belote: { holder: "takerSideOnly" } });
    const defence = createBeloteState(config, HEARTS, HOLDINGS, 1);
    expect(play(config, defence, [[0, card("K", "hearts")], [0, card("Q", "hearts")]]).state)
      .toEqual(createBeloteState(config, HEARTS, [[], [], [], []], 1));
    const taker = createBeloteState(config, HEARTS, HOLDINGS, 2);
    const result = play(config, taker, [[0, card("K", "hearts")], [0, card("Q", "hearts")]]);
    expect(belotePointsBySeat(config, result.state)).toEqual([20, 0, 0, 0]);
  });

  it("has one belote per suit in all trump, none in no trump, and a golden option", () => {
    const allHonours = [SUITS.flatMap((suit) => [card("K", suit), card("Q", suit)]), [], [], []];
    const plays = SUITS.flatMap((suit) => [[0, card("K", suit)], [0, card("Q", suit)]] as [number, Card][]);
    const ta = play(COINCHE_SA_TA, createBeloteState(COINCHE_SA_TA, allTrumpMode(), allHonours, 0), plays);
    expect(belotePointsBySeat(COINCHE_SA_TA, ta.state)).toEqual([80, 0, 0, 0]);
    const golden = variant(COINCHE_SA_TA, { belote: { golden: 100 } });
    const gold = play(golden, createBeloteState(golden, allTrumpMode(), allHonours, 0), plays);
    expect(belotePointsBySeat(golden, gold.state)).toEqual([100, 0, 0, 0]);
    const sa = play(COINCHE_SA_TA, createBeloteState(COINCHE_SA_TA, noTrumpMode(), allHonours, 0), plays);
    expect(belotePointsBySeat(COINCHE_SA_TA, sa.state)).toEqual([0, 0, 0, 0]);
  });

  it("has no belote when the variant disables it", () => {
    const config = variant(CLASSIQUE, { belote: null });
    const result = play(config, createBeloteState(config, HEARTS, HOLDINGS, 1), [
      [0, card("K", "hearts")], [0, card("Q", "hearts")],
    ]);
    expect(belotePointsBySeat(config, result.state)).toEqual([0, 0, 0, 0]);
  });
});

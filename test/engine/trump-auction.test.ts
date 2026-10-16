import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import {
  applySelection,
  legalSelectionIntents,
  selectionToAct,
  startSelection,
  type TrumpSelectionState,
} from "../../src/engine/trump-selection";
import { auctionValues } from "../../src/engine/trump-auction";
import type { ContractValue, SelectionIntent } from "../../src/engine/contract";
import type { VariantConfig } from "../../src/engine/variant-config";
import { noTrumpMode, suitContractMode, type ContractMode } from "../../src/rules/contract-mode";

const COINCHE = findPreset({ id: "coinche", version: 1 })!.config;
const CONTREE = findPreset({ id: "contree", version: 3 })!.config;
const BRIDGEE = findPreset({ id: "bridgee", version: 1 })!.config;
const STEPHANOISE = findPreset({ id: "stephanoise-marquez", version: 1 })!.config;
const SPADES = suitContractMode("spades");
const HEARTS = suitContractMode("hearts");
const CLUBS = suitContractMode("clubs");

const pass = (seat: number): SelectionIntent => ({ kind: "pass", seat });
const double = (seat: number): SelectionIntent => ({ kind: "double", seat });
const redouble = (seat: number): SelectionIntent => ({ kind: "redouble", seat });
const bid = (seat: number, value: ContractValue, mode: ContractMode = SPADES): SelectionIntent =>
  ({ kind: "bid", seat, value, mode });

function variant(base: VariantConfig, overrides: VariantOverrides): VariantConfig {
  const resolved = resolveVariant(base, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

function run(config: VariantConfig, intents: readonly SelectionIntent[], dealer = 3): TrumpSelectionState {
  return intents.reduce((state, intent) => {
    const step = applySelection(config, state, intent);
    if (!step.ok) throw new Error(`rejected ${JSON.stringify(intent)}: ${step.reason}`);
    return step.state;
  }, startSelection(config, dealer, null));
}

function contractOf(state: TrumpSelectionState) {
  if (state.status.kind !== "contract") throw new Error(`no contract: ${state.status.kind}`);
  return state.status.contract;
}

describe("auction ladder", () => {
  it("lists the ladder values then the specials", () => {
    expect(auctionValues(COINCHE)).toEqual([80, 90, 100, 110, 120, 130, 140, 150, 160, "capot"]);
    expect(auctionValues(BRIDGEE).slice(-2)).toEqual(["capot", "generale"]);
    expect(auctionValues(STEPHANOISE).slice(0, 3)).toEqual([82, 83, 84]);
    expect(auctionValues(STEPHANOISE)).toHaveLength(160 - 82 + 1 + 1);
  });

  it("requires a strictly higher value and refuses an unknown one", () => {
    const state = run(COINCHE, [bid(0, 100)]);
    expect(applySelection(COINCHE, state, bid(1, 100, HEARTS))).toEqual({ ok: false, reason: "illegalBid" });
    expect(applySelection(COINCHE, state, bid(1, 105, HEARTS))).toEqual({ ok: false, reason: "illegalBid" });
    expect(applySelection(COINCHE, state, bid(1, 110, HEARTS)).ok).toBe(true);
  });

  it("refuses a mode the variant does not offer", () => {
    const state = startSelection(COINCHE, 3, null);
    expect(applySelection(COINCHE, state, bid(0, 80, noTrumpMode())))
      .toEqual({ ok: false, reason: "illegalBid" });
  });

  it("ends after three passes following a bid, and redeals after four passes", () => {
    expect(contractOf(run(COINCHE, [bid(0, 80), pass(1), pass(2), pass(3)])))
      .toEqual({ taker: 0, mode: SPADES, value: 80, doubling: 0, doubledBy: null });
    expect(run(COINCHE, [0, 1, 2, 3].map(pass)).status).toEqual({ kind: "allPassed" });
  });

  it("lets the partner of the holder overbid", () => {
    const around = run(COINCHE, [bid(0, 80), pass(1), bid(2, 90), pass(3)]);
    expect(applySelection(COINCHE, around, bid(0, 100)).ok).toBe(true);
  });

  it("breaks equal values by mode order when the hierarchy is enabled", () => {
    const config = variant(BRIDGEE, { trump: { modeHierarchy: "suitOrderBreaksTies" } });
    const state = run(config, [bid(0, 90, HEARTS)]);
    expect(applySelection(config, state, bid(1, 90, noTrumpMode())).ok).toBe(true);
    expect(applySelection(config, state, bid(1, 90, CLUBS))).toEqual({ ok: false, reason: "illegalBid" });
    expect(applySelection(BRIDGEE, state, bid(1, 90, noTrumpMode())))
      .toEqual({ ok: false, reason: "illegalBid" });
  });

  it("caps the bids of each player when maxSpeechesPerPlayer is set", () => {
    const config = variant(COINCHE, { trump: { maxSpeechesPerPlayer: 1 } });
    const state = run(config, [bid(0, 80), bid(1, 90), pass(2), pass(3)]);
    expect(applySelection(config, state, bid(0, 100))).toEqual({ ok: false, reason: "illegalBid" });
    expect(legalSelectionIntents(config, state, 0).every((intent) => intent.kind !== "bid")).toBe(true);
  });
});

describe("auction doubling", () => {
  it("lets only an opponent of the holder double, in turn", () => {
    const state = run(COINCHE, [bid(0, 80)]);
    expect(applySelection(COINCHE, state, double(2))).toEqual({ ok: false, reason: "notYourTurn" });
    const partner = run(COINCHE, [bid(0, 80), pass(1)]);
    expect(applySelection(COINCHE, partner, double(2))).toEqual({ ok: false, reason: "illegalDouble" });
    expect(contractOf(run(COINCHE, [bid(0, 80), double(1), pass(2), pass(3), pass(0)])).doubling).toBe(1);
  });

  it("closes the bidding after a coinche; the taker side may redouble in turn", () => {
    const state = run(COINCHE, [bid(0, 80), double(1)]);
    expect(legalSelectionIntents(COINCHE, state, 2)).toEqual([pass(2), redouble(2)]);
    expect(applySelection(COINCHE, state, bid(2, 90))).toEqual({ ok: false, reason: "illegalBid" });
    const defender = run(COINCHE, [bid(0, 80), double(1), pass(2)]);
    expect(legalSelectionIntents(COINCHE, defender, 3)).toEqual([pass(3)]);
    const redoubled = run(COINCHE, [bid(0, 80), double(1), pass(2), pass(3), redouble(0)]);
    expect(contractOf(redoubled)).toEqual({ taker: 0, mode: SPADES, value: 80, doubling: 2, doubledBy: 1 });
  });

  it("lets only the taker side answer a contre in contrée (responders takerSide)", () => {
    const state = run(CONTREE, [bid(0, 80), double(1)]);
    expect(selectionToAct(state)).toBe(2);
    const answered = run(CONTREE, [bid(0, 80), double(1), pass(2)]);
    expect(selectionToAct(answered)).toBe(0);
    expect(contractOf(run(CONTREE, [bid(0, 80), double(1), pass(2), pass(0)])).doubling).toBe(1);
  });

  it("respects minDoublableBid and capotDoublable", () => {
    const config = variant(COINCHE, { trump: { doubling: { minDoublableBid: 90, capotDoublable: false } } });
    expect(applySelection(config, run(config, [bid(0, 80)]), double(1)))
      .toEqual({ ok: false, reason: "illegalDouble" });
    expect(applySelection(config, run(config, [bid(0, 90)]), double(1)).ok).toBe(true);
    expect(applySelection(config, run(config, [bid(0, "capot")]), double(1)))
      .toEqual({ ok: false, reason: "illegalDouble" });
  });

  it("accepts a double out of turn when the timing is anytime", () => {
    const config = variant(COINCHE, { trump: { doubling: { timing: "anytime" } } });
    const state = run(config, [bid(0, 80), pass(1)]);
    expect(legalSelectionIntents(config, state, 3)).toEqual([double(3)]);
    const doubled = applySelection(config, state, double(3));
    expect(doubled.ok && selectionToAct(doubled.state)).toBe(0);
  });

  it("refuses doubling when the variant has none", () => {
    const config = variant(COINCHE, { trump: { doubling: null } });
    expect(applySelection(config, run(config, [bid(0, 80)]), double(1)))
      .toEqual({ ok: false, reason: "illegalDouble" });
  });
});

describe("auction specials and the stéphanoise décoinche", () => {
  it("offers a générale above the capot", () => {
    const state = run(BRIDGEE, [bid(0, "capot")]);
    expect(applySelection(BRIDGEE, state, bid(1, "generale", HEARTS)).ok).toBe(true);
    expect(contractOf(run(BRIDGEE, [bid(0, "generale"), pass(1), pass(2), pass(3)])).value)
      .toBe("generale");
  });

  it("closes the auction on a capot bid when capotClosesAuction is set", () => {
    expect(contractOf(run(STEPHANOISE, [bid(0, "capot")])).value).toBe("capot");
    expect(run(COINCHE, [bid(0, "capot")]).status.kind).toBe("open");
  });

  it("bids point by point from 82 and allows no trump", () => {
    const state = run(STEPHANOISE, [bid(0, 82), bid(1, 83, noTrumpMode())]);
    expect(applySelection(STEPHANOISE, state, bid(2, 84)).ok).toBe(true);
    expect(applySelection(STEPHANOISE, startSelection(STEPHANOISE, 3, null), bid(0, 81)))
      .toEqual({ ok: false, reason: "illegalBid" });
  });

  it("keeps the auction open after a coinche: a higher bid décoinche", () => {
    const coinched = run(STEPHANOISE, [bid(0, 90), double(1)]);
    expect(coinched.status.kind).toBe("open");
    expect(legalSelectionIntents(STEPHANOISE, coinched, 2)).toContainEqual(bid(2, 95));
    const decoinched = run(STEPHANOISE, [bid(0, 90), double(1), bid(2, 95), pass(3), pass(0), pass(1)]);
    expect(contractOf(decoinched)).toEqual({ taker: 2, mode: SPADES, value: 95, doubling: 0, doubledBy: null });
  });

  it("lets the coinched holder décoincher himself, and seals the coinche after three passes", () => {
    const holder = run(STEPHANOISE, [bid(0, 90), double(1), pass(2), pass(3)]);
    expect(applySelection(STEPHANOISE, holder, bid(0, 100))).toMatchObject({ ok: true });
    const sealed = run(STEPHANOISE, [bid(0, 90), double(1), pass(2), pass(3), pass(0)]);
    expect(contractOf(sealed)).toEqual({ taker: 0, mode: SPADES, value: 90, doubling: 1, doubledBy: 1 });
    const surcoinched = run(STEPHANOISE, [bid(0, 90), double(1), redouble(2)]);
    expect(contractOf(surcoinched).doubling).toBe(2);
  });

});

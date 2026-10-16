import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant } from "../../src/engine/resolve-variant";
import {
  applySelection,
  legalSelectionIntents,
  selectionToAct,
  startSelection,
  type TrumpSelectionState,
} from "../../src/engine/trump-selection";
import type { SelectionIntent } from "../../src/engine/contract";
import type { VariantConfig } from "../../src/engine/variant-config";
import {
  allTrumpMode,
  noTrumpMode,
  suitContractMode,
  type ContractMode,
} from "../../src/rules/contract-mode";

const CLASSIQUE = findPreset({ id: "classique", version: 1 })!.config;
const MODERNE = findPreset({ id: "moderne", version: 1 })!.config;
const HEARTS = suitContractMode("hearts");
const SPADES = suitContractMode("spades");
const TURNUP_HEART_TEN = { suit: "hearts", rank: "10" } as const;
const TURNUP_HEART_JACK = { suit: "hearts", rank: "J" } as const;

function variant(overrides: Parameters<typeof resolveVariant>[1]): VariantConfig {
  const resolved = resolveVariant(CLASSIQUE, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

function run(
  config: VariantConfig,
  intents: readonly SelectionIntent[],
  turnup: Parameters<typeof startSelection>[2] = TURNUP_HEART_TEN,
  dealer = 3,
): TrumpSelectionState {
  return intents.reduce((state, intent) => {
    const step = applySelection(config, state, intent);
    if (!step.ok) throw new Error(`rejected ${JSON.stringify(intent)}: ${step.reason}`);
    return step.state;
  }, startSelection(config, dealer, turnup));
}

const pass = (seat: number): SelectionIntent => ({ kind: "pass", seat });
const take = (seat: number, mode: ContractMode = HEARTS): SelectionIntent => ({ kind: "take", seat, mode });

describe("turn-up selection", () => {
  it("starts with the seat after the dealer and offers pass or the turned suit", () => {
    const state = startSelection(CLASSIQUE, 3, TURNUP_HEART_TEN);
    expect(selectionToAct(state)).toBe(0);
    expect(legalSelectionIntents(CLASSIQUE, state, 0)).toEqual([pass(0), take(0)]);
    expect(legalSelectionIntents(CLASSIQUE, state, 1)).toEqual([]);
  });

  it("rejects a speaker out of turn and a second-round suit in round one", () => {
    const state = startSelection(CLASSIQUE, 3, TURNUP_HEART_TEN);
    expect(applySelection(CLASSIQUE, state, pass(1))).toEqual({ ok: false, reason: "notYourTurn" });
    expect(applySelection(CLASSIQUE, state, take(0, SPADES)))
      .toEqual({ ok: false, reason: "illegalTake" });
  });

  it("closes on the first take with the turn-up suit", () => {
    const state = run(CLASSIQUE, [pass(0), take(1)]);
    expect(state.status).toEqual({
      kind: "contract",
      contract: { taker: 1, mode: HEARTS, value: null, doubling: 0, doubledBy: null },
    });
  });

  it("opens a second round on other suits after four passes, then redeals", () => {
    const round2 = run(CLASSIQUE, [pass(0), pass(1), pass(2), pass(3)]);
    expect(round2.status).toEqual({ kind: "open" });
    expect(legalSelectionIntents(CLASSIQUE, round2, 0).map((intent) => intent.kind === "take"
      ? intent.mode : intent.kind)).toEqual([
      "pass",
      suitContractMode("spades"),
      suitContractMode("diamonds"),
      suitContractMode("clubs"),
    ]);
    const allPassed = run(CLASSIQUE, [0, 1, 2, 3, 0, 1, 2, 3].map(pass));
    expect(allPassed.status).toEqual({ kind: "allPassed" });
  });

  it("lets the second round name any suit when secondRound is anySuit", () => {
    const config = variant({ trump: { secondRound: "anySuit" } });
    const round2 = run(config, [0, 1, 2, 3].map(pass));
    expect(legalSelectionIntents(config, round2, 0)).toContainEqual(take(0, HEARTS));
  });

  it("redeals after one round when secondRound is none", () => {
    const config = variant({ trump: { secondRound: "none" } });
    expect(run(config, [0, 1, 2, 3].map(pass)).status).toEqual({ kind: "allPassed" });
  });

  it("forces the first speaker to take a turned jack (valet forcé)", () => {
    const config = variant({ trump: { forcedJack: true } });
    const state = startSelection(config, 3, TURNUP_HEART_JACK);
    expect(legalSelectionIntents(config, state, 0)).toEqual([take(0)]);
    expect(applySelection(config, state, pass(0))).toEqual({ ok: false, reason: "illegalPass" });
    const ten = startSelection(config, 3, TURNUP_HEART_TEN);
    expect(legalSelectionIntents(config, ten, 0)).toEqual([pass(0), take(0)]);
  });

  it("forces the dealer to name a suit at the end of round two (donneur forcé)", () => {
    const config = variant({ trump: { dealerForcedAfterRound2: true } });
    const state = run(config, [0, 1, 2, 3, 0, 1, 2].map(pass));
    const legal = legalSelectionIntents(config, state, 3);
    expect(legal.some((intent) => intent.kind === "pass")).toBe(false);
    expect(legal).toHaveLength(3);
    expect(applySelection(config, state, pass(3))).toEqual({ ok: false, reason: "illegalPass" });
  });
});

describe("turn-up selection with the moderne overbid", () => {
  it("keeps the round open after a take and accepts higher modes from others", () => {
    const state = run(MODERNE, [take(0)]);
    expect(state.status).toEqual({ kind: "open" });
    expect(legalSelectionIntents(MODERNE, state, 1)).toEqual([
      pass(1),
      take(1, noTrumpMode()),
      take(1, allTrumpMode()),
    ]);
  });

  it("ends when a take is followed by three passes", () => {
    const state = run(MODERNE, [take(0), pass(1), take(2, noTrumpMode()), pass(3), pass(0), pass(1)]);
    expect(state.status).toEqual({
      kind: "contract",
      contract: { taker: 2, mode: noTrumpMode(), value: null, doubling: 0, doubledBy: null },
    });
  });

  it("ends at once on all trump, which nothing covers", () => {
    const state = run(MODERNE, [take(0), take(1, allTrumpMode())]);
    expect(state.status.kind).toBe("contract");
  });

  it("never lets a holder overbid himself", () => {
    const state = run(MODERNE, [take(0), pass(1), pass(2), take(3, noTrumpMode())]);
    expect(legalSelectionIntents(MODERNE, state, 0)).toEqual([pass(0), take(0, allTrumpMode())]);
    const round = run(MODERNE, [take(0), pass(1), pass(2), pass(3)]);
    expect(round.status.kind).toBe("contract");
  });

  it("offers no trump and all trump directly in round one", () => {
    const state = startSelection(MODERNE, 3, TURNUP_HEART_TEN);
    expect(legalSelectionIntents(MODERNE, state, 0)).toEqual([
      pass(0),
      take(0),
      take(0, noTrumpMode()),
      take(0, allTrumpMode()),
    ]);
  });
});

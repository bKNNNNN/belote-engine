import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import {
  applySelection,
  legalSelectionIntents,
  selectionToAct,
  startSelection,
  type TrumpSelectionState,
} from "../../src/engine/trump-selection";
import type { SelectionIntent } from "../../src/engine/contract";
import type { VariantConfig } from "../../src/engine/variant-config";
import { SUITS } from "../../src/card-primitives";
import { suitContractMode } from "../../src/rules/contract-mode";

const VACHE = findPreset({ id: "vache", version: 1 })!.config;
const VACHE_RETOURNE = findPreset({ id: "vache-retourne", version: 1 })!.config;
const pass = (seat: number): SelectionIntent => ({ kind: "pass", seat });
const take = (seat: number, suit: (typeof SUITS)[number]): SelectionIntent =>
  ({ kind: "take", seat, mode: suitContractMode(suit) });

function run(
  config: VariantConfig,
  intents: readonly SelectionIntent[],
  turnup: Parameters<typeof startSelection>[2] = null,
): TrumpSelectionState {
  return intents.reduce((state, intent) => {
    const step = applySelection(config, state, intent);
    if (!step.ok) throw new Error(`rejected ${JSON.stringify(intent)}: ${step.reason}`);
    return step.state;
  }, startSelection(config, 1, turnup));
}

describe("free choice selection (belote à la vache)", () => {
  it("lets each speaker name any suit in a single round", () => {
    const state = startSelection(VACHE, 1, null);
    expect(selectionToAct(state)).toBe(2);
    expect(legalSelectionIntents(VACHE, state, 2))
      .toEqual([pass(2), ...SUITS.map((suit) => take(2, suit))]);
  });

  it("closes on the first take", () => {
    const state = run(VACHE, [pass(2), take(3, "clubs")]);
    expect(state.status).toEqual({
      kind: "contract",
      contract: { taker: 3, mode: suitContractMode("clubs"), value: null, doubling: 0, doubledBy: null },
    });
  });

  it("never redeals: the dealer must choose when everybody else passed", () => {
    const state = run(VACHE, [pass(2), pass(3), pass(0)]);
    expect(selectionToAct(state)).toBe(1);
    expect(legalSelectionIntents(VACHE, state, 1)).toEqual(SUITS.map((suit) => take(1, suit)));
    expect(applySelection(VACHE, state, pass(1))).toEqual({ ok: false, reason: "illegalPass" });
  });

  it("forces the dealer to take the turned suit in the turn-up option", () => {
    const turnup = { suit: "diamonds", rank: "8" } as const;
    const open = startSelection(VACHE_RETOURNE, 1, turnup);
    expect(legalSelectionIntents(VACHE_RETOURNE, open, 2))
      .toEqual([pass(2), ...SUITS.map((suit) => take(2, suit))]);
    const state = run(VACHE_RETOURNE, [pass(2), pass(3), pass(0)], turnup);
    expect(legalSelectionIntents(VACHE_RETOURNE, state, 1)).toEqual([take(1, "diamonds")]);
    expect(applySelection(VACHE_RETOURNE, state, take(1, "spades")))
      .toEqual({ ok: false, reason: "illegalTake" });
  });
});

import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import {
  resolveVariant,
  type VariantOverrides,
} from "../../src/engine/resolve-variant";
import type { VariantConfig } from "../../src/engine/variant-config";

const preset = (id: string, version: number): VariantConfig =>
  findPreset({ id, version })!.config;

const CLASSIQUE = preset("classique", 1);
const COINCHE_FFB = preset("coinche-ffb", 2);
const A_TROIS = preset("a-trois", 1);
const A_DEUX = preset("a-deux", 1);
const VACHE = preset("vache", 1);

function errorsOf(base: VariantConfig, overrides: unknown): readonly string[] {
  const result = resolveVariant(base, overrides as VariantOverrides);
  return result.ok ? [] : result.errors;
}

function rejectsWith(base: VariantConfig, overrides: unknown, code: string): void {
  expect(errorsOf(base, overrides).some((error) => error.startsWith(code))).toBe(true);
}

describe("resolveVariant", () => {
  it("applies valid overrides and returns a new frozen config", () => {
    const result = resolveVariant(COINCHE_FFB, {
      trump: { modes: ["suit", "no-trump", "all-trump"] },
      belote: { allTrump: "perSuit" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.trump.kind === "auction" && result.config.trump.modes)
      .toEqual(["suit", "no-trump", "all-trump"]);
    expect(Object.isFrozen(result.config.trump)).toBe(true);
    expect(COINCHE_FFB.trump.kind === "auction" && COINCHE_FFB.trump.modes).toEqual(["suit"]);
  });

  it("rejects unknown fields at any depth", () => {
    rejectsWith(CLASSIQUE, { surprise: true }, "schema");
    rejectsWith(CLASSIQUE, { play: { partnerMasterTrump: "free" } }, "schema");
    rejectsWith(CLASSIQUE, { deal: { steps: [{ kind: "packets", sizes: [8], zone: "hand", x: 1 }] } }, "schema");
  });

  it("rejects stale fields left by an override that changes a union kind", () => {
    rejectsWith(CLASSIQUE, { trump: { kind: "freeChoice" } }, "schema");
  });

  it("rejects out-of-range scalar values", () => {
    rejectsWith(CLASSIQUE, { table: { seats: 5 } }, "schema");
    rejectsWith(CLASSIQUE, { version: 0 }, "schema");
    rejectsWith(CLASSIQUE, { deck: { removed: [{ suit: "stars", rank: "7" }] } }, "schema");
  });

  it("rule tableau: a tableau exists exactly at two seats", () => {
    rejectsWith(CLASSIQUE, {
      table: { tableau: { columns: 4, layers: 2, reveal: "immediate" } },
    }, "tableau");
    rejectsWith(A_DEUX, { table: { tableau: null } }, "tableau");
  });

  it("rule sides: sides match the seat count", () => {
    rejectsWith(CLASSIQUE, { table: { sides: { kind: "headsUp" } } }, "sides");
    rejectsWith(A_TROIS, { table: { sides: { kind: "fixedPairs" } } }, "sides");
  });

  it("rule takerVsRest: three seats score taker against each opponent", () => {
    rejectsWith(A_TROIS, {
      scoring: {
        kind: "classicSplit",
        capotBonusPerOpponent: undefined,
        cancelLastTrickOnCapot: undefined,
        success: "beatDefence",
        tie: "defenceWins",
        failure: { defenceBase: 162, takerKeepsBelote: true },
        capot: { points: 252 },
        rounding: 1,
      },
    }, "takerVsRest");
  });

  it("rule contract scoring: contract scoring needs an auction", () => {
    const errors = resolveVariant({ ...CLASSIQUE, scoring: COINCHE_FFB.scoring });
    expect(!errors.ok && errors.errors.some((error) => error.startsWith("contract-scoring")))
      .toBe(true);
  });

  it("rule hands: every seat ends with the same number of cards and the deck is used up", () => {
    rejectsWith(CLASSIQUE, {
      deal: { steps: [
        { kind: "packets", sizes: [3, 2], zone: "hand" },
        { kind: "turnup", source: "deck" },
        { kind: "trumpSelection" },
        { kind: "completeAfterTaking", takerReceivesTurnup: true, takerCount: 3, othersCount: 3 },
      ] },
    }, "hands");
    rejectsWith(CLASSIQUE, { deck: { removed: [{ suit: "spades", rank: "7" }] } }, "hands");
  });

  it("rule belote: per-suit belotes need the all-trump mode", () => {
    rejectsWith(COINCHE_FFB, { belote: { allTrump: "perSuit" } }, "belote");
  });

  it("rule turnup: a turn-up selection needs exactly one turn-up step before selection", () => {
    rejectsWith(CLASSIQUE, {
      deal: { steps: [
        { kind: "packets", sizes: [3, 2], zone: "hand" },
        { kind: "trumpSelection" },
        { kind: "packetsAfterSelection", sizes: [3] },
      ] },
    }, "turnup");
    rejectsWith(VACHE, {
      trump: { allPassed: "dealerTakesTurnupSuit" },
    }, "turnup");
  });

  it("rule steps: one selection point, completion only after it", () => {
    rejectsWith(COINCHE_FFB, {
      deal: { steps: [
        { kind: "packets", sizes: [3, 2, 3], zone: "hand" },
      ] },
    }, "steps");
    rejectsWith(COINCHE_FFB, {
      deal: { steps: [
        { kind: "packetsAfterSelection", sizes: [2] },
        { kind: "trumpSelection" },
        { kind: "packets", sizes: [3, 3], zone: "hand" },
      ] },
    }, "steps");
  });

  it("rule ladder: the auction ladder is a whole number of steps", () => {
    rejectsWith(COINCHE_FFB, {
      trump: { ladder: { min: 80, step: 25, max: 650, specials: ["capot"] } },
    }, "ladder");
    rejectsWith(COINCHE_FFB, {
      trump: { ladder: { min: 170, step: 10, max: 160, specials: ["capot"] } },
    }, "ladder");
  });

  it("rule formats: exactly one default format that matches the target", () => {
    rejectsWith(CLASSIQUE, {
      match: { formats: [{ id: "standard", target: 1000, isDefault: false }] },
    }, "formats");
    rejectsWith(CLASSIQUE, {
      match: { formats: [{ id: "standard", target: 900, isDefault: true }] },
    }, "formats");
  });

  it("rule generale: the declarer can lead only if a generale can be bid", () => {
    rejectsWith(COINCHE_FFB, { play: { firstLead: "generaleDeclarer" } }, "generale");
  });

  it("rule tableau zones: tableau packets fill each column once per layer", () => {
    rejectsWith(CLASSIQUE, {
      deal: { steps: [
        { kind: "packets", sizes: [3, 2], zone: "tableauHidden" },
        { kind: "turnup", source: "deck" },
        { kind: "trumpSelection" },
        { kind: "completeAfterTaking", takerReceivesTurnup: true, takerCount: 2, othersCount: 3 },
      ] },
    }, "tableau");
  });
  it("rule folklore: the eights folklore is not implemented, so it is refused; the sevens moved to redeals", () => {
    rejectsWith(COINCHE_FFB, { declarations: { folklore: { eightsCancel: true } } }, "folklore");
    rejectsWith(COINCHE_FFB, { declarations: { folklore: { sevensCancelDeal: true } } }, "schema");
  });
  it("rule redeals: each weak-hand redeal needs its family", () => {
    rejectsWith(COINCHE_FFB, { redeals: { mainNulle: { below: 11 } } }, "redeals");
    rejectsWith(CLASSIQUE, { redeals: { misere: { below: 10 } } }, "redeals");
  });
});

import { describe, expect, it } from "vitest";
import { playMatch } from "../../examples/play-match";
import { NoLegalIntentError, chooseRandomLegalIntent } from "../../src/bots/random-legal";
import { createMatch, seatToAct } from "../../src/engine/step";
import { viewFor } from "../../src/engine/view";
import { findPreset } from "../../src/engine/presets";
import { seedFromNumber } from "../../src/engine/rng";

const CLASSIQUE = findPreset({ id: "classique", version: 1 })!.config;

describe("random legal bot", () => {
  it("only returns an intent from the seat's legal list", () => {
    const state = createMatch(CLASSIQUE, seedFromNumber(3)).state;
    const seat = seatToAct(state)!;
    const view = viewFor(state, seat);
    for (const value of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(view.legal).toContain(chooseRandomLegalIntent(view, () => value));
    }
  });

  it("refuses a view with no legal intent", () => {
    const state = createMatch(CLASSIQUE, seedFromNumber(3)).state;
    expect(() => chooseRandomLegalIntent(viewFor(state, "spectator"), () => 0)).toThrow(NoLegalIntentError);
  });

  it.each(["classique", "coinche", "a-trois", "a-deux"])("plays a full %s match to the end", (id) => {
    const result = playMatch(11, id);
    expect(result.deals).toBeGreaterThan(0);
    expect(result.scores.length).toBeGreaterThan(0);
  });

  it("is deterministic for a given seed", () => {
    expect(playMatch(42)).toEqual(playMatch(42));
  });
});

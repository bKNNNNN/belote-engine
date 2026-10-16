import { describe, expect, it } from "vitest";
import { cardKey } from "../../src/engine/deck";
import { PRESET_REGISTRY, findPreset, variantKey } from "../../src/engine/presets";
import type { EngineState } from "../../src/engine/state";
import { dealtMatch } from "./support/cut";
import { viewFor } from "../../src/engine/view";
import { testRng } from "../golden/legacy-support/runner";
import { leakedCards, mentionedCards, scrambleHidden, secrecyBreach } from "./support/view-secrecy";
import { VIEW_PRESET_GROUPS } from "./support/view-suite";

const config = (id: string, version: number) => findPreset({ id, version })!.config;

function handsOf(state: EngineState): readonly (readonly string[])[] {
  return state.deal.phase === "trumpSelection" ? state.deal.dealt.seats.map(({ hand }) => hand.map(cardKey)) : [];
}

describe("seat view secrecy oracles", () => {
  it("covers every playable preset", () => {
    const covered = Object.values(VIEW_PRESET_GROUPS).flat().map(variantKey).sort();
    const playable = PRESET_REGISTRY.filter(({ playable }) => playable).map(({ config }) => variantKey(config)).sort();
    expect(covered).toEqual(playable);
  });

  it("finds cards written as objects and inside strings", () => {
    const found = mentionedCards(JSON.stringify({ a: { suit: "hearts", rank: "10" }, b: ["clubs:J,spades:7"] }));
    expect([...found].sort()).toEqual(["clubs:J", "hearts:10", "spades:7"]);
  });

  it("flags another seat's card in a view, and accepts the viewer's own", () => {
    const state = dealtMatch(config("classique", 1), [1, 2, 3, 4]);
    const hands = handsOf(state);
    const view = viewFor(state, 0);
    expect(leakedCards(state, 0, JSON.stringify(view))).toEqual([]);
    const [suit, rank] = hands[1]![0]!.split(":");
    const leaking = JSON.stringify({ ...view, extra: { suit, rank } });
    expect(leakedCards(state, 0, leaking)).toEqual([hands[1]![0]]);
  });

  it("moves hidden cards but keeps the viewer's hand and every count", () => {
    const state = dealtMatch(config("stephanoise-marquez", 1), [9, 8, 7, 6]);
    const rng = testRng(3);
    const scrambled = scrambleHidden(state, 2, rng);
    const before = handsOf(state);
    const after = handsOf(scrambled);
    expect(after[2]).toEqual(before[2]);
    expect(after.map((hand) => hand.length)).toEqual(before.map((hand) => hand.length));
    expect(after).not.toEqual(before);
    expect(scrambled.rng).not.toEqual(state.rng);
    expect(secrecyBreach(state, 2, rng)).toBeNull();
  });

  it("would catch a view that reads the face-down tableau", () => {
    const state = dealtMatch(config("a-deux", 1), [4, 4, 4, 4]);
    const hiddenOf = (current: EngineState) => current.deal.phase === "trumpSelection"
      ? current.deal.dealt.seats[0]!.tableau.map(({ hidden }) => hidden && cardKey(hidden))
      : [];
    expect(hiddenOf(scrambleHidden(state, 0, testRng(5)))).not.toEqual(hiddenOf(state));
  });
});

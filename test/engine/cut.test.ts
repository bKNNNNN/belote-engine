import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import { createVariantDeck, cutDeck, legalCutRange, uncutDeck } from "../../src/engine/deck";
import { previousSeat } from "../../src/engine/seats";
import type { EngineState, Intent } from "../../src/engine/state";
import {
  createMatch,
  createMatchWithDeal,
  legalIntents,
  nextDealWithDeck,
  replay,
  seatToAct,
  step,
} from "../../src/engine/step";
import type { VariantConfig } from "../../src/engine/variant-config";
import { viewFor } from "../../src/engine/view";
import { leakedCards, secrecyBreach } from "./support/view-secrecy";

const preset = (id: string, version: number): VariantConfig => findPreset({ id, version })!.config;
const CLASSIQUE = preset("classique", 1);
const SEED = [11, 22, 33, 44] as const;

type Cutting = Extract<EngineState["deal"], { phase: "cutting" }>;

function cutting(state: EngineState): Cutting {
  if (state.deal.phase !== "cutting") throw new Error(`expected the cut, got ${state.deal.phase}`);
  return state.deal;
}

function accepted(state: EngineState, intent: Intent) {
  const result = step(state, intent);
  if (!result.ok) throw new Error(`${JSON.stringify(intent)}: ${result.reason}`);
  return result;
}

function playOutDeal(state: EngineState): EngineState {
  let current = state;
  while (current.deal.phase === "trumpSelection" || current.deal.phase === "playing") {
    const seat = seatToAct(current)!;
    const legal = legalIntents(current, seat);
    const take = legal.find(({ kind }) => kind === "take" || kind === "bid");
    current = accepted(current, take ?? legal[0]!).state;
  }
  return current;
}

describe("deck cut", () => {
  it("bounds a cut to at least three cards on each side", () => {
    expect(legalCutRange(32, 3)).toEqual({ min: 3, max: 29 });
    expect(legalCutRange(30, 3)).toEqual({ min: 3, max: 27 });
    const deck = createVariantDeck([]);
    expect(cutDeck(deck, 5)).toEqual([...deck.slice(5), ...deck.slice(0, 5)]);
    expect(() => cutDeck(deck, 2.5)).toThrow(RangeError);
  });

  it("waits for the player at the dealer's left before dealing", () => {
    const created = createMatch(CLASSIQUE, SEED);
    const state = created.state;
    const cut = cutting(state);
    expect(cut.cutter).toBe(previousSeat(CLASSIQUE.table, state.dealer));
    expect(created.events).toEqual([
      { type: "deal.cutRequested", dealNumber: 1, dealer: state.dealer, cutter: cut.cutter },
    ]);
    expect(state.dealNumber).toBe(1);
    expect(seatToAct(state)).toBe(cut.cutter);
    const legal = legalIntents(state, cut.cutter);
    expect(legal.map((intent) => intent.kind === "cut" ? intent.position : null))
      .toEqual(Array.from({ length: 27 }, (_, index) => index + 3));
    for (const other of [0, 1, 2, 3].filter((seat) => seat !== cut.cutter)) {
      expect(legalIntents(state, other)).toEqual([]);
    }
  });

  it("deals the deck as cut, exactly as a logged deal of that deck", () => {
    const state = createMatch(CLASSIQUE, SEED).state;
    const cut = cutting(state);
    const result = accepted(state, { kind: "cut", seat: cut.cutter, position: 11 });
    expect(result.events).toEqual([
      { type: "deal.cut", seat: cut.cutter, position: 11 },
      { type: "deal.started", dealNumber: 1, dealer: state.dealer },
    ]);
    const logged = createMatchWithDeal(CLASSIQUE, SEED, { dealer: state.dealer, deck: cutDeck(cut.deck, 11) }).state;
    expect(result.state.deal).toEqual(logged.deal);
    expect(result.state.lastCut).toEqual({ dealNumber: 1, seat: cut.cutter, position: 11 });
  });

  it("refuses a cut out of bounds, out of turn or out of phase", () => {
    const state = createMatch(CLASSIQUE, SEED).state;
    const { cutter } = cutting(state);
    const other = (cutter + 1) % 4;
    expect(step(state, { kind: "cut", seat: cutter, position: 2 })).toEqual({ ok: false, reason: "illegalCut" });
    expect(step(state, { kind: "cut", seat: cutter, position: 30 })).toEqual({ ok: false, reason: "illegalCut" });
    expect(step(state, { kind: "cut", seat: cutter, position: 4.5 })).toEqual({ ok: false, reason: "illegalCut" });
    expect(step(state, { kind: "cut", seat: other, position: 10 })).toEqual({ ok: false, reason: "notYourTurn" });
    expect(step(state, { kind: "pass", seat: cutter })).toEqual({ ok: false, reason: "wrongPhase" });
    const dealt = accepted(state, { kind: "cut", seat: cutter, position: 10 }).state;
    expect(step(dealt, { kind: "cut", seat: cutter, position: 10 })).toEqual({ ok: false, reason: "wrongPhase" });
  });

  it("asks the next dealer's left-hand player to cut every following deal", () => {
    const first = createMatch(CLASSIQUE, SEED).state;
    const dealt = accepted(first, { kind: "cut", seat: cutting(first).cutter, position: 16 }).state;
    const between = playOutDeal(dealt);
    expect(between.deal.phase).toBe("betweenDeals");
    const next = accepted(between, { kind: "nextDeal" });
    const cut = cutting(next.state);
    expect(next.state.dealNumber).toBe(2);
    expect(cut.cutter).toBe(previousSeat(CLASSIQUE.table, next.state.dealer));
    expect(next.events).toEqual([
      { type: "deal.cutRequested", dealNumber: 2, dealer: next.state.dealer, cutter: cut.cutter },
    ]);
  });

  it("lets the other player cut at two, within a 30-card deck at three", () => {
    const deux = createMatch(preset("a-deux", 1), SEED).state;
    expect(cutting(deux).cutter).toBe(1 - deux.dealer);
    const trois = createMatch(preset("a-trois", 1), SEED).state;
    expect(cutting(trois).deck).toHaveLength(30);
    expect(legalIntents(trois, cutting(trois).cutter)).toHaveLength(25);
  });

  it("cuts the gathered cards in a concours without shuffling them", () => {
    const concours = preset("concours", 1);
    const first = createMatch(concours, SEED).state;
    const between = playOutDeal(accepted(first, { kind: "cut", seat: cutting(first).cutter, position: 16 }).state);
    if (between.deal.phase !== "betweenDeals") throw new Error("deal not scored");
    const pile = between.deal.pile;
    const deck = cutting(accepted(between, { kind: "nextDeal" }).state).deck;
    // The dealer squares the pile with a cut of their own, then the player cuts.
    const at = pile.findIndex((card) => card === deck[0]);
    expect(at).toBeGreaterThan(0);
    expect(deck).toEqual(cutDeck(pile, at));
  });

  it("keeps frozen replay presets and logged deals free of the cut", () => {
    for (const ref of [{ id: "coinche", version: 1 }, { id: "contree", version: 2 }]) {
      const config = findPreset(ref)!.config;
      expect(config.deal.cut).toBeNull();
      expect(createMatch(config, SEED).state.deal.phase).toBe("trumpSelection");
    }
    const logged = createMatchWithDeal(CLASSIQUE, SEED, { dealer: 2, deck: createVariantDeck([]) }).state;
    expect(logged.deal.phase).toBe("trumpSelection");
    const between = playOutDeal(logged);
    expect(nextDealWithDeck(between, createVariantDeck([])).ok && "dealt").toBe("dealt");
  });

  it("lets a scripted deal wait for a scripted cut that lands on the designed deck", () => {
    const designed = createVariantDeck([]);
    const position = 9;
    const waiting = createMatchWithDeal(CLASSIQUE, SEED, {
      dealer: 1,
      deck: uncutDeck(designed, position),
      awaitCut: true,
    }).state;
    expect(cutting(waiting).cutter).toBe(0);
    const dealt = accepted(waiting, { kind: "cut", seat: 0, position }).state;
    expect(dealt.deal).toEqual(createMatchWithDeal(CLASSIQUE, SEED, { dealer: 1, deck: designed }).state.deal);
    const between = playOutDeal(dealt);
    const next = nextDealWithDeck(between, uncutDeck(designed, 20), { awaitCut: true });
    if (!next.ok) throw new Error(next.reason);
    expect(cutting(next.state).deck).toEqual(uncutDeck(designed, 20));
  });

  it("replays a match whose intents include the cut", () => {
    const state = createMatch(CLASSIQUE, SEED).state;
    const intent: Intent = { kind: "cut", seat: cutting(state).cutter, position: 7 };
    expect(replay(CLASSIQUE, SEED, [intent])).toEqual(accepted(state, intent).state);
  });

  it("shows who cuts and where, never the order of the deck", () => {
    const state = createMatch(CLASSIQUE, SEED).state;
    const { cutter } = cutting(state);
    for (const viewer of [0, 1, 2, 3, "spectator"] as const) {
      const view = viewFor(state, viewer);
      expect(view.phase).toBe("cutting");
      expect(view.cut).toEqual({ cutter, deckSize: 32, min: 3, max: 29, position: null });
      expect(view.me).toBeNull();
      expect(leakedCards(state, viewer, JSON.stringify(view))).toEqual([]);
      expect(secrecyBreach(state, viewer, () => 0.37)).toBeNull();
    }
    expect(viewFor(state, cutter).legal).toHaveLength(27);
    const dealt = accepted(state, { kind: "cut", seat: cutter, position: 12 }).state;
    expect(viewFor(dealt, 0).cut).toEqual({ cutter, deckSize: 32, min: 3, max: 29, position: 12 });
    expect(viewFor(playOutDeal(dealt), 0).cut).toBeNull();
  });
});

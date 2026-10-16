import { describe, expect, it } from "vitest";
import type { Card } from "../../src/card-primitives";
import { cardKey, createVariantDeck } from "../../src/engine/deck";
import { deduce, rememberTricks, type TrickMemory } from "../../src/engine/knowledge";
import { findPreset } from "../../src/engine/presets";
import type { EngineState, Intent } from "../../src/engine/state";
import { createMatchWithDeal, legalIntents, seatToAct, step } from "../../src/engine/step";
import type { VariantConfig } from "../../src/engine/variant-config";
import { viewFor } from "../../src/engine/view";
import { suitContractMode } from "../../src/rules/contract-mode";

/*
 * Canonical deck, dealer 3, seat 0 takes the turned diamond J:
 *   seat 0: ♠7 ♠8 ♠9 ♥J ♥Q ♦J ♦Q ♦K   seat 1: ♠10 ♠J ♠Q ♥K ♥A ♦A ♣7 ♣8
 *   seat 2: ♠K ♠A ♥7 ♦7 ♦8 ♣9 ♣10 ♣J  seat 3: ♥8 ♥9 ♥10 ♦9 ♦10 ♣Q ♣K ♣A
 */

const preset = (id: string, version: number): VariantConfig => findPreset({ id, version })!.config;
const SEED = [5, 6, 7, 8] as const;
const DECK = createVariantDeck([]);
const card = (key: string): Readonly<Card> => {
  const [suit, rank] = key.split(":") as [Card["suit"], Card["rank"]];
  return { suit, rank };
};
const play = (seat: number, key: string): Intent => ({ kind: "play", seat, card: card(key) });
const keys = (cards: readonly Readonly<Card>[]) => cards.map(cardKey).sort();

function run(state: EngineState, intents: readonly Intent[]): EngineState {
  return intents.reduce((current, intent) => {
    const result = step(current, intent);
    if (!result.ok) throw new Error(`${JSON.stringify(intent)}: ${result.reason}`);
    return result.state;
  }, state);
}

function taken(config = preset("classique", 1)): EngineState {
  const start = createMatchWithDeal(config, SEED, { dealer: 3, deck: DECK }).state;
  return run(start, [{ kind: "take", seat: 0, mode: suitContractMode("diamonds") }]);
}

const FIRST_TRICK = [play(0, "spades:7"), play(1, "spades:10"), play(2, "spades:A"), play(3, "diamonds:9")];

describe("knowledge from a seat view", () => {
  it("knows nothing about the others before a card is played, except the taken turn-up", () => {
    const knowledge = deduce(viewFor(taken(), 1));
    expect(knowledge.historyComplete).toBe(true);
    expect(knowledge.located).toEqual([{ seat: 0, card: { suit: "diamonds", rank: "J" } }]);
    expect(knowledge.unseen).toHaveLength(32 - 8 - 1);
    expect(knowledge.unseen.map(cardKey)).not.toContain("diamonds:J");
    expect(knowledge.seats.map(({ seat }) => seat)).toEqual([0, 2, 3]);
    expect(knowledge.seats.every(({ voidSuits, excluded }) => voidSuits.length === 0 && excluded.length === 0)).toBe(true);
  });

  it("proves a void when a seat does not follow, and drops played cards from the unseen", () => {
    const knowledge = deduce(viewFor(run(taken(), FIRST_TRICK), 0));
    const seat3 = knowledge.seats.find(({ seat }) => seat === 3)!;
    expect(seat3.voidSuits).toEqual(["spades"]);
    expect(keys(seat3.excluded)).toEqual(["spades:J", "spades:K", "spades:Q"]);
    expect(seat3.possible.map(cardKey)).not.toContain("spades:K");
    expect(knowledge.unseen.map(cardKey)).not.toContain("spades:A");
    expect(knowledge.unseen).toHaveLength(32 - 7 - 4);
  });

  it("counts trumps and points still out, and names the master card of each suit", () => {
    const knowledge = deduce(viewFor(run(taken(), FIRST_TRICK), 0));
    expect(knowledge.trumps).toEqual({ suits: ["diamonds"], remaining: 7, mine: 3, others: 4 });
    const masters = Object.fromEntries(knowledge.masters.map(({ suit, card: master, holder }) => [suit, [cardKey(master), holder]]));
    expect(masters).toEqual({
      spades: ["spades:K", "unseen"],
      hearts: ["hearts:A", "unseen"],
      diamonds: ["diamonds:J", "me"],
      clubs: ["clubs:A", "unseen"],
    });
    expect(knowledge.pointsRemaining).toBe(162 - 10 - (10 + 11 + 14));
  });

  it("proves a trump void when a seat cannot follow a trump lead", () => {
    const start = createMatchWithDeal(preset("classique", 1), SEED, { dealer: 3, deck: DECK }).state;
    const passes: Intent[] = [0, 1, 2, 3].map((seat) => ({ kind: "pass", seat }));
    const clubs = run(start, [...passes, { kind: "take", seat: 0, mode: suitContractMode("clubs") }]);
    const state = run(clubs, [
      play(0, "spades:7"), play(1, "spades:10"), play(2, "spades:A"), play(3, "clubs:Q"),
      play(3, "hearts:8"), play(0, "hearts:J"), play(1, "hearts:A"), play(2, "hearts:7"),
      play(1, "clubs:7"), play(2, "clubs:J"), play(3, "clubs:A"), play(0, "diamonds:Q"),
    ]);
    const knowledge = deduce(viewFor(state, 1));
    expect(knowledge.seats.find(({ seat }) => seat === 0)!.voidSuits).toEqual(["clubs"]);
    expect(knowledge.seats.find(({ seat }) => seat === 3)!.voidSuits).toEqual(["spades"]);
    expect(knowledge.trumps).toEqual({ suits: ["clubs"], remaining: 4, mine: 1, others: 3 });
  });

  it("is never more than a guess about cards a seat could still hold", () => {
    const state = run(taken(), FIRST_TRICK);
    const truth = state.deal.phase === "playing" ? state.deal.play.seats : [];
    const knowledge = deduce(viewFor(state, 2));
    for (const seat of knowledge.seats) {
      const hand = new Set(truth[seat.seat]!.hand.map(cardKey));
      expect(seat.excluded.map(cardKey).filter((key) => hand.has(key))).toEqual([]);
      expect([...hand].filter((key) => !seat.possible.map(cardKey).includes(key)
        && !knowledge.located.some(({ card: located }) => cardKey(located) === key))).toEqual([]);
    }
  });

  it("keeps earlier tricks in a memory when the table shows only the last one (concours)", () => {
    let state = taken(preset("concours", 1));
    let memory: TrickMemory | null = null;
    for (let index = 0; index < 8; index += 1) {
      memory = rememberTricks(memory, viewFor(state, 1));
      state = run(state, [legalIntents(state, seatToAct(state)!)[0]!]);
    }
    const view = viewFor(state, 1);
    expect(deduce(view).historyComplete).toBe(false);
    memory = rememberTricks(memory, view);
    const remembered = deduce(view, memory);
    expect(remembered.historyComplete).toBe(true);
    expect(remembered.unseen).toHaveLength(32 - 6 - 8 - 1);
  });

  it("forgets a memory from another deal", () => {
    const view = viewFor(taken(), 1);
    const stale: TrickMemory = { dealNumber: view.dealNumber + 1, tricks: [] };
    expect(rememberTricks(stale, view)).toEqual({ dealNumber: view.dealNumber, tricks: [] });
  });

  it("returns no trump nor master before a contract", () => {
    const start = createMatchWithDeal(preset("classique", 1), SEED, { dealer: 3, deck: DECK }).state;
    const knowledge = deduce(viewFor(start, 0));
    expect(knowledge.trumps).toBeNull();
    expect(knowledge.masters).toEqual([]);
    expect(knowledge.pointsRemaining).toBeNull();
    expect(knowledge.unseen).toHaveLength(32 - 5 - 1);
  });
});

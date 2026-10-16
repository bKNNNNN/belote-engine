import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import type { EngineState, Intent } from "../../src/engine/state";
import {
  createMatch,
  createMatchWithDeal,
  legalIntents,
  nextDealWithDeck,
  replay,
  seatToAct,
  step,
  systemIntents,
} from "../../src/engine/step";
import { createVariantDeck } from "../../src/engine/deck";
import type { VariantConfig } from "../../src/engine/variant-config";
import { suitContractMode } from "../../src/rules/contract-mode";
import { cutInMiddle } from "./support/cut";
import { simulateMatch } from "./support/simulate";

const preset = (id: string, version: number): VariantConfig => findPreset({ id, version })!.config;
const CLASSIQUE = preset("classique", 1);
const SEED = [11, 22, 33, 44] as const;
const DECK = createVariantDeck([]);

function variant(base: VariantConfig, overrides: VariantOverrides): VariantConfig {
  const resolved = resolveVariant(base, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

function run(state: EngineState, intents: readonly Intent[]): EngineState {
  return intents.reduce((current, intent) => {
    const result = step(current, intent);
    if (!result.ok) throw new Error(`${JSON.stringify(intent)}: ${result.reason}`);
    return result.state;
  }, state);
}

function unfrozenPaths(value: unknown, path = "state", seen = new Set<unknown>()): string[] {
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  if (!Object.isFrozen(value)) return [path];
  return Object.entries(value).flatMap(([key, child]) => unfrozenPaths(child, `${path}.${key}`, seen));
}

function playOut(state: EngineState): EngineState {
  let current = state;
  while (current.deal.phase === "playing") {
    const seat = seatToAct(current)!;
    current = run(current, [legalIntents(current, seat)[0]!]);
  }
  return current;
}

describe("engine step", () => {
  it("is deterministic: same seed, same first deal; replay gives the same state", () => {
    const first = createMatch(CLASSIQUE, SEED);
    expect(createMatch(CLASSIQUE, SEED)).toEqual(first);
    const cutter = seatToAct(first.state)!;
    expect(first.events).toEqual([
      { type: "deal.cutRequested", dealNumber: 1, dealer: first.state.dealer, cutter },
    ]);
    const cut: Intent = { kind: "cut", seat: cutter, position: 16 };
    const intents: Intent[] = [cut, { kind: "pass", seat: seatToAct(run(first.state, [cut]))! }];
    expect(replay(CLASSIQUE, SEED, intents)).toEqual(run(first.state, intents));
  });

  it("rejects with typed reasons and leaves the state untouched", () => {
    const state = createMatchWithDeal(CLASSIQUE, SEED, { dealer: 3, deck: DECK }).state;
    expect(step(state, { kind: "pass", seat: 1 })).toEqual({ ok: false, reason: "notYourTurn" });
    expect(step(state, { kind: "pass", seat: 7 })).toEqual({ ok: false, reason: "unknownSeat" });
    expect(step(state, { kind: "nextDeal" })).toEqual({ ok: false, reason: "wrongPhase" });
    expect(step(state, { kind: "play", seat: 0, card: DECK[0]! })).toEqual({ ok: false, reason: "wrongPhase" });
    expect(step(state, { kind: "bid", seat: 0, value: 80, mode: suitContractMode("spades") }))
      .toEqual({ ok: false, reason: "illegalBid" });
  });

  it("deals, takes, plays out, scores and waits for the next deal", () => {
    const start = createMatchWithDeal(CLASSIQUE, SEED, { dealer: 3, deck: DECK }).state;
    const taken = run(start, [{ kind: "take", seat: 0, mode: suitContractMode(DECK[20]!.suit) }]);
    expect(taken.deal.phase).toBe("playing");
    const illegal = step(taken, { kind: "play", seat: 0, card: { suit: "clubs", rank: "A" } });
    expect(illegal.ok === false && illegal.reason).toMatch(/illegalCard|notYourTurn/);
    const scored = playOut(taken);
    expect(scored.deal.phase).toBe("betweenDeals");
    expect(scored.match.scoredDeals).toBe(1);
    expect(systemIntents(scored)).toEqual([{ kind: "nextDeal" }]);
    expect(seatToAct(scored)).toBeNull();
    const next = step(scored, { kind: "nextDeal" });
    expect(next.ok && next.state.dealer).toBe(0);
    expect(next.ok && next.state.dealNumber).toBe(2);
  });

  it("redeals with the next dealer after everybody passed twice", () => {
    const start = createMatchWithDeal(CLASSIQUE, SEED, { dealer: 3, deck: DECK }).state;
    const passed = run(start, [0, 1, 2, 3, 0, 1, 2, 3].map((seat) => ({ kind: "pass" as const, seat })));
    expect(passed.deal).toMatchObject({ phase: "betweenDeals", reason: "allPassed", nextDealer: 0 });
    expect(passed.match.scoredDeals).toBe(0);
    const again = nextDealWithDeck(passed, DECK);
    expect(again.ok && again.state.dealer).toBe(0);
  });

  it("asks for announcements before each first card when the variant has them", () => {
    const coinche = preset("coinche", 1);
    const start = createMatchWithDeal(coinche, SEED, { dealer: 3, deck: DECK }).state;
    const playing = run(start, [
      { kind: "bid", seat: 0, value: 80, mode: suitContractMode("hearts") },
      { kind: "pass", seat: 1 }, { kind: "pass", seat: 2 }, { kind: "pass", seat: 3 },
    ]);
    expect(legalIntents(playing, 0).every((intent) => intent.kind === "declare")).toBe(true);
    const hand = playing.deal.phase === "playing" ? playing.deal.play.seats[0]!.hand : [];
    expect(step(playing, { kind: "play", seat: 0, card: hand[0]! })).toEqual({ ok: false, reason: "mustDeclare" });
    expect(step(playing, { kind: "declare", seat: 0, combinationIds: ["nope"] }))
      .toEqual({ ok: false, reason: "illegalDeclaration" });
    const declared = run(playing, [{ kind: "declare", seat: 0, combinationIds: [] }]);
    expect(legalIntents(declared, 0).every((intent) => intent.kind === "play")).toBe(true);
  });

  it("refuses a spoken belote on a card that does not open one", () => {
    const annonces = preset("classique-annonces", 1);
    const start = createMatchWithDeal(annonces, SEED, { dealer: 3, deck: DECK }).state;
    const taken = run(start, [{ kind: "take", seat: 0, mode: suitContractMode(DECK[20]!.suit) }]);
    const declared = run(taken, [{ kind: "declare", seat: 0, combinationIds: [] }]);
    const plain = legalIntents(declared, 0)
      .find((intent) => intent.kind === "play" && intent.card.rank !== "K" && intent.card.rank !== "Q");
    if (plain?.kind !== "play") throw new Error("no plain card to play");
    expect(step(declared, { ...plain, belote: true })).toEqual({ ok: false, reason: "illegalBelote" });
  });

  it("lets the générale declarer lead when the variant says so", () => {
    const config = variant(preset("bridgee", 1), { play: { firstLead: "generaleDeclarer" } });
    const start = createMatchWithDeal(config, SEED, { dealer: 3, deck: DECK }).state;
    const playing = run(start, [
      { kind: "pass", seat: 0 },
      { kind: "bid", seat: 1, value: "generale", mode: suitContractMode("hearts") },
      { kind: "pass", seat: 2 }, { kind: "pass", seat: 3 }, { kind: "pass", seat: 0 },
    ]);
    expect(seatToAct(playing)).toBe(1);
  });

  it("cuts the gathered cards instead of shuffling in a concours", () => {
    const concours = preset("concours", 1);
    const start = createMatchWithDeal(concours, SEED, { dealer: 3, deck: DECK }).state;
    const scored = playOut(run(start, [{ kind: "take", seat: 0, mode: suitContractMode(DECK[20]!.suit) }]));
    if (scored.deal.phase !== "betweenDeals") throw new Error("not between deals");
    const pile = scored.deal.pile;
    const next = step(scored, { kind: "nextDeal" });
    if (!next.ok) throw new Error("no next deal");
    const cutState = cutInMiddle(next.state);
    if (cutState.deal.phase !== "trumpSelection") throw new Error("not dealt after the cut");
    const dealt = cutState.deal.dealt;
    const deck = [...pile.slice(1), pile[0]!].map((card) => `${card.suit}${card.rank}`);
    const first = `${dealt.seats[1]!.hand[0]!.suit}${dealt.seats[1]!.hand[0]!.rank}`;
    const cut = pile.findIndex((card) => `${card.suit}${card.rank}` === first);
    expect(cut).toBeGreaterThan(0);
    const cutDeck = [...pile.slice(cut), ...pile.slice(0, cut)];
    expect(dealt.seats[1]!.hand.slice(0, 3)).toEqual(cutDeck.slice(0, 3));
    expect(deck).toHaveLength(32);
  });

  it("refuses everything once the match is over", () => {
    const finished = simulateMatch(CLASSIQUE, 5).state;
    expect(step(finished, { kind: "nextDeal" })).toEqual({ ok: false, reason: "matchFinished" });
    expect(legalIntents(finished, 0)).toEqual([]);
  });

  it("keeps every reachable state deeply frozen", () => {
    for (const config of [CLASSIQUE, preset("coinche", 1), preset("a-deux", 1), preset("a-trois", 1)]) {
      const result = simulateMatch(config, 3);
      const states = result.intents.reduce<EngineState[]>((all, intent) => {
        const current = all.at(-1)!;
        const next = step(current, intent);
        return next.ok ? [...all, next.state] : all;
      }, [createMatch(config, [3, 22, 0x9e3779b9, (3 ^ 0x5bd1e995) >>> 0]).state]);
      expect(states.flatMap((state) => unfrozenPaths(state)).slice(0, 5)).toEqual([]);
    }
  });
});

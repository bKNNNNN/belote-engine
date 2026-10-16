import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "../../src/card-primitives";
import { cardKey, createVariantDeck } from "../../src/engine/deck";
import { PRESET_REGISTRY, findPreset } from "../../src/engine/presets";
import { plainHandPoints } from "../../src/engine/redeal-request";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import { seatsAfterDealer, type Seat } from "../../src/engine/seats";
import type { EngineState, Intent } from "../../src/engine/state";
import { createMatchWithDeal, legalIntents, seatToAct, step, systemIntents } from "../../src/engine/step";
import type { VariantConfig } from "../../src/engine/variant-config";
import { viewFor } from "../../src/engine/view";

const preset = (id: string, version: number): VariantConfig => findPreset({ id, version })!.config;

function withRedeals(base: VariantConfig, redeals: VariantOverrides["redeals"]): VariantConfig {
  const resolution = resolveVariant(base, { redeals });
  if (!resolution.ok) throw new Error(resolution.errors.join("; "));
  return resolution.config;
}

const CLASSIQUE = withRedeals(preset("classique", 1), { mainNulle: { below: 11 }, carreDeSept: true });
const CONTREE = withRedeals(preset("contree", 3), { misere: { below: 11 }, carreDeSept: true });
const DEALER: Seat = 3;

const SUIT_OF: Readonly<Record<string, Suit>> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };

/** "7s Jh 10d" → cards. */
function cards(text: string): readonly Card[] {
  return text.split(" ").map((token) => ({ rank: token.slice(0, -1) as Rank, suit: SUIT_OF[token.slice(-1)]! }));
}

/**
 * A deck that gives each seat (in deal order, the seat after the dealer
 * first) the cards listed for it, packet by packet, then the turn-up, then
 * the rest in canonical order.
 */
function arrangedDeck(
  config: VariantConfig,
  packets: readonly number[],
  hands: Readonly<Partial<Record<Seat, readonly Card[]>>>,
  turnup: Card | null,
): readonly Card[] {
  const dealtCards = Object.values(hands).flatMap((hand) => hand ?? []);
  const taken = new Set([...dealtCards, ...(turnup === null ? [] : [turnup])].map(cardKey));
  const spare = createVariantDeck(config.deck.removed).filter((card) => !taken.has(cardKey(card)));
  const order = seatsAfterDealer(config.table, DEALER);
  const queues = new Map(order.map((seat) => [seat, [...(hands[seat] ?? [])]]));
  const deck: Card[] = [];
  for (const size of packets) {
    for (const seat of order) {
      for (let index = 0; index < size; index += 1) deck.push(queues.get(seat)!.shift() ?? spare.shift()!);
    }
  }
  if (turnup !== null) deck.push(turnup);
  return [...deck, ...spare];
}

function dealt(config: VariantConfig, deck: readonly Card[]): EngineState {
  return createMatchWithDeal(config, [1, 2, 3, 4], { dealer: DEALER, deck }).state;
}

function accepted(state: EngineState, intent: Intent) {
  const result = step(state, intent);
  if (!result.ok) throw new Error(`${JSON.stringify(intent)}: ${result.reason}`);
  return result;
}

const redealsOf = (state: EngineState, seat: Seat) =>
  legalIntents(state, seat).filter(({ kind }) => kind === "requestRedeal");

const FIRST = seatsAfterDealer(CLASSIQUE.table, DEALER)[0]!;
const SECOND = seatsAfterDealer(CLASSIQUE.table, DEALER)[1]!;

describe("weak-hand redeal options", () => {
  it("are off in every preset, frozen ones included", () => {
    for (const { config } of PRESET_REGISTRY) {
      expect(config.redeals).toEqual({ mainNulle: null, misere: null, carreDeSept: false });
    }
  });

  it("are refused where they cannot apply", () => {
    const errors = (base: VariantConfig, redeals: VariantOverrides["redeals"]) => {
      const resolution = resolveVariant(base, { redeals });
      return resolution.ok ? [] : resolution.errors;
    };
    expect(errors(preset("contree", 3), { mainNulle: { below: 11 } })).toEqual(["redeals: mainNulle needs a turn-up selection"]);
    expect(errors(preset("classique", 1), { misere: { below: 10 } })).toEqual(["redeals: misere needs an auction"]);
    expect(errors(preset("a-trois", 1), { carreDeSept: true })).toEqual(["redeals: carreDeSept needs the four sevens in the deck"]);
    expect(errors(preset("a-deux", 1), { carreDeSept: true })).toEqual(["redeals: weak-hand redeals need tables without a tableau"]);
  });

  it("counts card points at plain values, trump unknown", () => {
    expect(plainHandPoints(cards("As 10h Kd Qc Js 9s 8h 7d"))).toBe(30);
  });
});

describe("main nulle (turn-up family)", () => {
  const TURNUP = cards("Jh")[0]!;
  const weak = cards("7s 8s 9c Kd Qd");

  it("is offered at the first speech to a hand under 11 points without the turned suit", () => {
    const state = dealt(CLASSIQUE, arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: weak }, TURNUP));
    expect(seatToAct(state)).toBe(FIRST);
    expect(redealsOf(state, FIRST)).toEqual([{ kind: "requestRedeal", seat: FIRST, reason: "mainNulle" }]);
    expect(viewFor(state, FIRST).legal).toContainEqual({ kind: "requestRedeal", seat: FIRST, reason: "mainNulle" });
    for (const seat of [0, 1, 2, 3].filter((other) => other !== FIRST)) {
      expect(viewFor(state, seat).legal).toEqual([]);
    }
  });

  it.each([
    ["an ace (11 points)", "As 7s 8s 9c 7d"],
    ["exactly 11 points", "Ks Kc Qd 7d 8d"],
    ["a card of the turned suit", "7h 8s 9c 7d 8d"],
  ])("is refused with %s", (_label, hand) => {
    const state = dealt(CLASSIQUE, arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: cards(hand) }, TURNUP));
    expect(redealsOf(state, FIRST)).toEqual([]);
    expect(step(state, { kind: "requestRedeal", seat: FIRST, reason: "mainNulle" })).toEqual({ ok: false, reason: "illegalRedeal" });
  });

  it("is offered only once, at the seat's first speech", () => {
    const deck = arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: weak }, TURNUP);
    let state = dealt(CLASSIQUE, deck);
    for (let count = 0; count < 4; count += 1) state = accepted(state, { kind: "pass", seat: seatToAct(state)! }).state;
    expect(seatToAct(state)).toBe(FIRST);
    expect(redealsOf(state, FIRST)).toEqual([]);
  });

  it("is refused while the option is off", () => {
    const state = dealt(preset("classique", 1), arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: weak }, TURNUP));
    expect(redealsOf(state, FIRST)).toEqual([]);
    expect(step(state, { kind: "requestRedeal", seat: FIRST, reason: "mainNulle" }).ok).toBe(false);
  });

  it("cancels the deal: no score, the next dealer deals after a new cut, and everyone is told", () => {
    const state = dealt(CLASSIQUE, arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: weak }, TURNUP));
    const result = accepted(state, { kind: "requestRedeal", seat: FIRST, reason: "mainNulle" });
    expect(result.events).toEqual([
      { type: "deal.redealRequested", seat: FIRST, reason: "mainNulle" },
      { type: "deal.redealt", previousDealer: DEALER, nextDealer: 0 },
    ]);
    const voided = result.state;
    expect(voided.deal).toMatchObject({ phase: "betweenDeals", reason: "redealRequested", nextDealer: 0, lastDeal: null });
    expect(voided.match.scores).toEqual(state.match.scores);
    expect(voided.match.scoredDeals).toBe(0);
    for (const viewer of [0, 1, 2, 3, "spectator"] as const) {
      const view = viewFor(voided, viewer);
      expect(view.redealRequest).toEqual({ seat: FIRST, reason: "mainNulle" });
      expect(view.me).toBeNull();
    }
    const next = accepted(voided, systemIntents(voided)[0]!).state;
    expect(next.deal.phase).toBe("cutting");
    expect(next.dealer).toBe(0);
    expect(seatToAct(next)).toBe(DEALER);
    expect(viewFor(next, 0).redealRequest).toBeNull();
  });

  it("keeps the cards of the voided deal hidden: the pile is all 32, never shown", () => {
    const state = dealt(CLASSIQUE, arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: weak }, TURNUP));
    const voided = accepted(state, { kind: "requestRedeal", seat: FIRST, reason: "mainNulle" }).state;
    if (voided.deal.phase !== "betweenDeals") throw new Error("expected betweenDeals");
    expect(voided.deal.pile).toHaveLength(32);
    const serialized = JSON.stringify(viewFor(voided, SECOND));
    expect(serialized).not.toContain("\"rank\"");
  });
});

describe("misère (auction family)", () => {
  const weak = cards("7s 8s 9s Kc 7c 8c 9d 8h");

  it("is offered at the first speech to a hand under the threshold, before any bid of its own", () => {
    const state = dealt(CONTREE, arrangedDeck(CONTREE, [3, 2, 3], { [FIRST]: weak }, null));
    expect(redealsOf(state, FIRST)).toEqual([{ kind: "requestRedeal", seat: FIRST, reason: "misere" }]);
    const after = accepted(state, { kind: "pass", seat: FIRST }).state;
    expect(redealsOf(after, SECOND)).toEqual([]);
  });

  it("follows its threshold: 10 points pass under 11, not under 10", () => {
    const ten = cards("10s 7s 8s 9s 7c 8c 9c 7d");
    const under11 = dealt(CONTREE, arrangedDeck(CONTREE, [3, 2, 3], { [FIRST]: ten }, null));
    expect(redealsOf(under11, FIRST)).toHaveLength(1);
    const strict = withRedeals(preset("contree", 3), { misere: { below: 10 } });
    const under10 = dealt(strict, arrangedDeck(strict, [3, 2, 3], { [FIRST]: ten }, null));
    expect(redealsOf(under10, FIRST)).toEqual([]);
  });

  it("is not offered on a later speech, once the seat has spoken", () => {
    const deck = arrangedDeck(CONTREE, [3, 2, 3], { [SECOND]: weak }, null);
    let state = dealt(CONTREE, deck);
    state = accepted(state, { kind: "bid", seat: FIRST, value: 80, mode: { kind: "suit", suit: "hearts" } }).state;
    expect(redealsOf(state, SECOND)).toEqual([{ kind: "requestRedeal", seat: SECOND, reason: "misere" }]);
    const voided = accepted(state, { kind: "requestRedeal", seat: SECOND, reason: "misere" }).state;
    expect(voided.deal.phase).toBe("betweenDeals");
  });
});

describe("carré de 7", () => {
  it("lets the holder of the four sevens cancel the deal, with or without a weak hand", () => {
    const sevens = cards("7s 7h 7d 7c As 10s Ks Qs");
    const state = dealt(CONTREE, arrangedDeck(CONTREE, [3, 2, 3], { [FIRST]: sevens }, null));
    expect(redealsOf(state, FIRST)).toEqual([{ kind: "requestRedeal", seat: FIRST, reason: "carreDeSept" }]);
    const result = accepted(state, { kind: "requestRedeal", seat: FIRST, reason: "carreDeSept" });
    expect(result.events[0]).toEqual({ type: "deal.redealRequested", seat: FIRST, reason: "carreDeSept" });
  });

  it("offers both reasons to a weak hand holding the four sevens", () => {
    const state = dealt(CONTREE, arrangedDeck(CONTREE, [3, 2, 3], { [FIRST]: cards("7s 7h 7d 7c 8s 8h 9d Qc") }, null));
    expect(redealsOf(state, FIRST).map((intent) => intent.kind === "requestRedeal" ? intent.reason : null))
      .toEqual(["misere", "carreDeSept"]);
  });

  it("counts the five cards held at the first speech of a turn-up deal", () => {
    const state = dealt(CLASSIQUE, arrangedDeck(CLASSIQUE, [3, 2], { [FIRST]: cards("7s 7h 7d 7c As") }, cards("Jh")[0]!));
    expect(redealsOf(state, FIRST)).toEqual([{ kind: "requestRedeal", seat: FIRST, reason: "carreDeSept" }]);
  });
});

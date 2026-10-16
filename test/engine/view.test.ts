import { describe, expect, it } from "vitest";
import { cardKey, createVariantDeck } from "../../src/engine/deck";
import { findPreset } from "../../src/engine/presets";
import type { EngineState, Intent } from "../../src/engine/state";
import { createMatchWithDeal, legalIntents, seatToAct, step } from "../../src/engine/step";
import type { VariantConfig } from "../../src/engine/variant-config";
import { viewFor, type SeatView } from "../../src/engine/view";
import { suitContractMode } from "../../src/rules/contract-mode";

const preset = (id: string, version: number): VariantConfig => findPreset({ id, version })!.config;
const SEED = [5, 6, 7, 8] as const;
const DECK = createVariantDeck([]);

function run(state: EngineState, intents: readonly Intent[]): EngineState {
  return intents.reduce((current, intent) => {
    const result = step(current, intent);
    if (!result.ok) throw new Error(`${JSON.stringify(intent)}: ${result.reason}`);
    return result.state;
  }, state);
}

/** Plays the first legal intent of whoever acts, `count` times. */
function advance(state: EngineState, count: number): EngineState {
  let current = state;
  for (let index = 0; index < count; index += 1) {
    current = run(current, [legalIntents(current, seatToAct(current)!)[0]!]);
  }
  return current;
}

function start(config: VariantConfig, dealer = 3): EngineState {
  return createMatchWithDeal(config, SEED, { dealer, deck: DECK }).state;
}

function cardsIn(view: SeatView): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (typeof record.suit === "string" && typeof record.rank === "string") found.add(`${record.suit}:${record.rank}`);
    Object.entries(record).forEach(([key, child]) => { if (key !== "rules") walk(child); });
  };
  walk(view);
  return found;
}

function unfrozen(value: unknown, path = "view"): string[] {
  if (typeof value !== "object" || value === null) return [];
  if (!Object.isFrozen(value)) return [path];
  return Object.entries(value).flatMap(([key, child]) => unfrozen(child, `${path}.${key}`));
}

const SEAT_VIEW_KEYS = [
  "auction", "belotes", "completedTricks", "contract", "cut", "dealNumber", "dealer", "declarations",
  "legal", "me", "phase", "redealRequest", "rules", "score", "seats", "selection", "seq", "toAct", "trick",
  "tricksPlayed", "turnup", "undealtCount", "variant", "viewer",
];

describe("seat view", () => {
  it("is built from a fixed whitelist of fields, deeply frozen", () => {
    const view = viewFor(start(preset("classique", 1)), 0);
    expect(Object.keys(view).sort()).toEqual(SEAT_VIEW_KEYS);
    expect(unfrozen(view)).toEqual([]);
    const serialized = JSON.stringify(view);
    for (const secret of ["\"rng\"", "\"stock\"", "\"pile\"", "\"seed\"", "\"hidden\"", "\"dealt\""]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("shows the own hand, the turn-up and counts during the turn-up selection", () => {
    const state = start(preset("classique", 1));
    const view = viewFor(state, 0);
    expect(view.phase).toBe("trumpSelection");
    expect(view.viewer).toBe(0);
    expect(view.me!.hand.map(cardKey)).toEqual(["spades:7", "spades:8", "spades:9", "hearts:J", "hearts:Q"]);
    expect(view.seats.map(({ handCount }) => handCount)).toEqual([5, 5, 5, 5]);
    expect(view.seats.map(({ side }) => side)).toEqual([0, 1, 0, 1]);
    expect(view.seats[0]!.dealAllies).toEqual([2]);
    expect(view.turnup).toEqual({ card: { suit: "diamonds", rank: "J" }, taker: null });
    expect(view.undealtCount).toBe(11);
    expect(view.selection).toEqual({ kind: "turnup", round: 1, highest: null, doubledBy: null });
    expect(view.toAct).toBe(0);
    expect(view.legal).toEqual(legalIntents(state, 0));
    expect(viewFor(state, 1).legal).toEqual([]);
    expect([...cardsIn(view)].sort()).toEqual(
      ["diamonds:J", "hearts:J", "hearts:Q", "spades:7", "spades:8", "spades:9"],
    );
  });

  it("keeps the auction history, the contract and the turn-up's taker once play starts", () => {
    const state = run(start(preset("classique", 1)), [
      { kind: "pass", seat: 0 },
      { kind: "take", seat: 1, mode: suitContractMode("diamonds") },
    ]);
    const view = viewFor(state, 2);
    expect(view.phase).toBe("playing");
    expect(view.auction).toEqual([
      { seat: 0, kind: "pass", round: 1 },
      { seat: 1, kind: "take", mode: { kind: "suit", suit: "diamonds" }, round: 1 },
    ]);
    expect(view.contract).toEqual({
      taker: 1, side: 1, mode: { kind: "suit", suit: "diamonds" }, value: null, doubling: 0, doubledBy: null,
    });
    expect(view.turnup).toEqual({ card: { suit: "diamonds", rank: "J" }, taker: 1 });
    expect(view.selection).toBeNull();
    expect(view.me!.hand).toHaveLength(8);
    expect(view.seats.map(({ handCount }) => handCount)).toEqual([8, 8, 8, 8]);
    expect(view.undealtCount).toBe(0);
  });

  it("shows who played what: the current trick and every completed trick", () => {
    const taken = run(start(preset("classique", 1)), [{ kind: "take", seat: 0, mode: suitContractMode("diamonds") }]);
    const midTrick = advance(taken, 2);
    const view = viewFor(midTrick, 3);
    expect(view.trick!.cards.map(({ seat }) => seat)).toEqual([0, 1]);
    expect(view.seats.map(({ handCount }) => handCount)).toEqual([7, 7, 8, 8]);
    const afterTwo = advance(midTrick, 6);
    const later = viewFor(afterTwo, 3);
    expect(later.tricksPlayed).toBe(2);
    expect(later.completedTricks.map(({ index }) => index)).toEqual([0, 1]);
    expect(later.completedTricks[0]!.cards).toHaveLength(4);
    expect(later.seats.reduce((total, { tricksWon }) => total + tricksWon, 0)).toBe(2);
    const played = afterTwo.deal.phase === "playing" ? afterTwo.deal.play.completed : [];
    expect(later.completedTricks.map(({ winner, points }) => ({ winner, points })))
      .toEqual(played.map(({ winner, points }) => ({ winner, points })));
  });

  it("keeps only the last completed trick when the variant hides the history (concours)", () => {
    const taken = run(start(preset("concours", 1)), [{ kind: "take", seat: 0, mode: suitContractMode("diamonds") }]);
    const view = viewFor(advance(taken, 8), 1);
    expect(view.tricksPlayed).toBe(2);
    expect(view.completedTricks.map(({ index }) => index)).toEqual([1]);
    expect(view.seats.reduce((total, { tricksWon }) => total + tricksWon, 0)).toBe(2);
  });

  it("shows the tableau's top layer and only counts the hidden one (belote à deux)", () => {
    const state = start(preset("a-deux", 1), 1);
    const view = viewFor(state, 0);
    const table = state.deal.phase === "trumpSelection" ? state.deal.dealt.seats : [];
    for (const seat of [0, 1]) {
      expect(view.seats[seat]!.tableau!.map(({ visible }) => visible && cardKey(visible)))
        .toEqual(table[seat]!.tableau.map(({ visible }) => visible && cardKey(visible)));
      expect(view.seats[seat]!.tableau!.map(({ hiddenCount }) => hiddenCount)).toEqual([1, 1, 1, 1]);
    }
    const hidden = table.flatMap((seat) => seat.tableau.map(({ hidden }) => cardKey(hidden!)));
    const visible = cardsIn(view);
    expect(hidden.filter((key) => visible.has(key))).toEqual([]);
    expect(view.me!.hand).toHaveLength(6);
  });

  it("reveals nothing of the stéphanoise reserve before the auction ends", () => {
    const state = start(preset("stephanoise-marquez", 1));
    const view = viewFor(state, 0);
    expect(view.me!.hand).toHaveLength(6);
    expect(view.undealtCount).toBe(8);
    expect(cardsIn(view).size).toBe(6);
  });

  it("gives announcements as kinds first, and the winners' cards after the first trick", () => {
    const config = preset("classique-annonces", 1);
    const taken = run(start(config), [{ kind: "take", seat: 0, mode: suitContractMode("diamonds") }]);
    const declared = run(taken, [{ kind: "declare", seat: 0, combinationIds: legalIntents(taken, 0).flatMap((intent) =>
      intent.kind === "declare" ? [intent.combinationIds] : []).at(-1)! }]);
    const before = viewFor(declared, 1);
    expect(before.declarations!.bySeat[0]!.announced).toEqual([{ kind: "tierce", points: 20 }, { kind: "tierce", points: 20 }]);
    expect(before.declarations!.bySeat[1]!.announced).toBeNull();
    expect(before.declarations!.shown).toEqual([]);
    expect(before.declarations!.resolved).toBe(false);
    expect(cardsIn(before).has("spades:7")).toBe(false);
    let state = declared;
    while (state.deal.phase === "playing" && state.deal.play.completed.length === 0) state = advance(state, 1);
    const after = viewFor(state, 1).declarations!;
    expect(after.resolved).toBe(true);
    expect(after.winningSide).toBe(0);
    expect(after.shown.map(({ seat, kind, points }) => ({ seat, kind, points })))
      .toEqual([{ seat: 0, kind: "tierce", points: 20 }, { seat: 0, kind: "tierce", points: 20 }]);
    expect(after.shown.flatMap(({ cards }) => cards.map(cardKey)).sort())
      .toEqual(["diamonds:J", "diamonds:K", "diamonds:Q", "spades:7", "spades:8", "spades:9"]);
  });

  it("shows a belote only once its first honour is down", () => {
    const config = preset("classique", 1);
    const suits = ["spades", "hearts", "diamonds", "clubs"] as const;
    const seen = suits.flatMap((suit) => {
      const passes: Intent[] = suit === "diamonds" ? [] : [0, 1, 2, 3].map((seat) => ({ kind: "pass", seat }));
      let state = run(start(config), [...passes, { kind: "take", seat: 0, mode: suitContractMode(suit) }]);
      const steps: Array<Readonly<{ shown: number; announced: number }>> = [];
      while (state.deal.phase === "playing") {
        const entries = state.deal.play.belote.entries;
        steps.push({
          shown: viewFor(state, 0).belotes.length,
          announced: entries.filter(({ status }) => status === "announced" || status === "confirmed").length,
        });
        state = advance(state, 1);
      }
      return steps;
    });
    expect(seen.every(({ shown, announced }) => shown === announced)).toBe(true);
    expect(seen.some(({ announced }) => announced > 0)).toBe(true);
    expect(seen[0]!.shown).toBe(0);
  });

  it("shows no card at all after four passes, nor the gathered pile", () => {
    const passed = run(start(preset("classique", 1)), [0, 1, 2, 3, 0, 1, 2, 3].map((seat) => ({ kind: "pass", seat }) as Intent));
    const view = viewFor(passed, 0);
    expect(view.phase).toBe("betweenDeals");
    expect(view.me).toBeNull();
    expect(cardsIn(view).size).toBe(0);
    expect(view.score.lastDeal).toBeNull();
    expect(view.legal).toEqual([]);
  });

  it("gives the score of the match and the detail of the last deal", () => {
    let state = run(start(preset("classique", 1)), [{ kind: "take", seat: 0, mode: suitContractMode("diamonds") }]);
    state = advance(state, 32);
    const view = viewFor(state, 2);
    expect(view.phase).toBe("betweenDeals");
    expect(view.score.match).toEqual(state.match.scores);
    expect(view.score.target).toBe(1000);
    expect(view.score.scoredDeals).toBe(1);
    expect(view.score.lastDeal!.tricks).toHaveLength(8);
    expect(view.score.lastDeal!.score.marks).toEqual(
      state.deal.phase === "betweenDeals" ? state.deal.lastDeal!.score.marks : [],
    );
  });

  it("serves a spectator without a hand nor legal intents", () => {
    const view = viewFor(start(preset("classique", 1)), "spectator");
    expect(view.viewer).toBe("spectator");
    expect(view.me).toBeNull();
    expect(view.legal).toEqual([]);
    expect(cardsIn(view)).toEqual(new Set(["diamonds:J"]));
  });

  it("rejects a seat that is not at the table", () => {
    expect(() => viewFor(start(preset("classique", 1)), 4)).toThrow(RangeError);
  });
});

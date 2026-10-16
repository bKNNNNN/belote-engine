import { describe, expect, it } from "vitest";
import type { Card, Suit } from "../../src/cards";
import { legalCards, type EnginePlayedCard, type LegalContext } from "../../src/engine/legal";
import { findPreset } from "../../src/engine/presets";
import {
  allTrumpMode,
  noTrumpMode,
  suitContractMode,
} from "../../src/rules/contract-mode";
import type { PlayRules, TableConfig } from "../../src/engine/variant-config";

const config = (id: string) => findPreset({ id, version: 1 })!.config;
const FOUR = config("classique").table;
const THREE = config("a-trois").table;
const TWO = config("a-deux").table;
const FREE: PlayRules = config("classique").play;

const c = (code: string): Card => {
  const suits: Record<string, Suit> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
  return { rank: code.slice(0, -1) as Card["rank"], suit: suits[code.slice(-1)]! };
};
const cards = (codes: string): Card[] => codes.split(" ").map(c);
const trick = (...plays: [number, string][]): EnginePlayedCard[] =>
  plays.map(([seat, code]) => ({ seat, card: c(code) }));
const codes = (result: readonly Readonly<Card>[]): string[] =>
  result.map((card) => `${card.rank}${card.suit[0]}`);

function context(overrides: Partial<LegalContext>): LegalContext {
  return {
    table: FOUR,
    play: FREE,
    mode: suitContractMode("spades"),
    hand: [],
    tableauVisible: [],
    trick: [],
    seat: 0,
    taker: 0,
    ...overrides,
  };
}

describe("engine legal cards: hand-written cases", () => {
  const voidInHearts = cards("Js 7s Ad Kc");

  it("leaves the player free when the partner is master (default)", () => {
    const result = legalCards(context({
      seat: 2,
      hand: voidInHearts,
      trick: trick([0, "Ah"], [1, "7h"]),
    }));
    expect(codes(result)).toEqual(["Js", "7s", "Ad", "Kc"]);
  });

  it("partnerMaster mustTrump: trumps even on a master partner", () => {
    const result = legalCards(context({
      seat: 2,
      play: { ...FREE, partnerMaster: "mustTrump" },
      hand: voidInHearts,
      trick: trick([0, "Ah"], [1, "7h"]),
    }));
    expect(codes(result)).toEqual(["Js", "7s"]);
  });

  it("partnerMaster mustOvertrumpOnly: discard or overtrump, never undertrump the partner", () => {
    const base = context({
      seat: 2,
      hand: cards("9s 7s Ad Kc"),
      trick: trick([3, "Ah"], [0, "10s"], [1, "Kh"]),
    });
    expect(codes(legalCards(base))).toEqual(["9s", "7s", "Ad", "Kc"]);
    expect(codes(legalCards({ ...base, play: { ...FREE, partnerMaster: "mustOvertrumpOnly" } })))
      .toEqual(["9s", "Ad", "Kc"]);
  });

  it("partnerMaster mustOvertrumpOnly: plays anything when only undertrumps are held", () => {
    const result = legalCards(context({
      seat: 2,
      play: { ...FREE, partnerMaster: "mustOvertrumpOnly" },
      hand: cards("8s 7s"),
      trick: trick([3, "Ah"], [0, "Js"], [1, "Kh"]),
    }));
    expect(codes(result)).toEqual(["8s", "7s"]);
  });

  it("undertrump optional passes through to the card policy", () => {
    const base = context({
      seat: 1,
      hand: cards("7s Ad"),
      trick: trick([3, "Ah"], [0, "9s"]),
    });
    expect(codes(legalCards(base))).toEqual(["7s"]);
    expect(codes(legalCards({ ...base, play: { ...FREE, undertrump: "optional" } })))
      .toEqual(["7s", "Ad"]);
  });

  it("all-trump: must climb by default, may follow freely without the climb rule", () => {
    const base = context({
      mode: allTrumpMode(),
      seat: 1,
      hand: cards("9h 7h Kc"),
      trick: trick([0, "Ah"]),
    });
    expect(codes(legalCards(base))).toEqual(["9h"]);
    expect(codes(legalCards({ ...base, play: { ...FREE, allTrumpMustClimb: false } })))
      .toEqual(["9h", "7h"]);
  });

  it("no-trump: follow suit, otherwise free", () => {
    const base = context({ mode: noTrumpMode(), seat: 1, trick: trick([0, "Ah"]) });
    expect(codes(legalCards({ ...base, hand: cards("7h Kc") }))).toEqual(["7h"]);
    expect(codes(legalCards({ ...base, hand: cards("Js Kc") }))).toEqual(["Js", "Kc"]);
  });

  it("three seats: the co-defender is a partner once someone has taken", () => {
    const base = context({ table: THREE, seat: 2, taker: 0, hand: voidInHearts });
    expect(codes(legalCards({ ...base, trick: trick([1, "Ah"]) })))
      .toEqual(["Js", "7s", "Ad", "Kc"]);
    expect(codes(legalCards({ ...base, trick: trick([0, "Ah"], [1, "7h"]) })))
      .toEqual(["Js", "7s"]);
  });

  it("three seats: the taker has no partner", () => {
    const result = legalCards(context({
      table: THREE,
      seat: 0,
      taker: 0,
      hand: voidInHearts,
      trick: trick([1, "Ah"], [2, "7h"]),
    }));
    expect(codes(result)).toEqual(["Js", "7s"]);
  });

  it("two seats: visible tableau cards are playable and nobody is a partner", () => {
    const result = legalCards(context({
      table: TWO,
      seat: 1,
      taker: 0,
      hand: cards("Ad Kc"),
      tableauVisible: cards("7s 10h"),
      trick: trick([0, "Ah"]),
    }));
    expect(codes(result)).toEqual(["10h"]);
    const leading = legalCards(context({
      table: TWO,
      seat: 0,
      hand: cards("Ad"),
      tableauVisible: cards("7s"),
    }));
    expect(codes(leading)).toEqual(["Ad", "7s"]);
  });

  it("returns a frozen list", () => {
    expect(Object.isFrozen(legalCards(context({ hand: cards("Ad") })))).toBe(true);
  });

  it("rejects a trick played by an unknown seat", () => {
    expect(() => legalCards(context({ table: THREE, seat: 1, trick: trick([5, "Ah"]) })))
      .toThrow(RangeError);
  });

  it("is typed against table configs", () => {
    const table: TableConfig = FOUR;
    expect(table.seats).toBe(4);
  });
});

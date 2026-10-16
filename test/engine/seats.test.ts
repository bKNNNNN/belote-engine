import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import {
  InvalidEngineSeatError,
  areDealAllies,
  assertSeat,
  dealAllies,
  nextSeat,
  playOrderFrom,
  previousSeat,
  seatsAfterDealer,
  seatsOf,
  sideOf,
  sidesOf,
} from "../../src/engine/seats";
import type { TableConfig } from "../../src/engine/variant-config";

const tableOf = (id: string): TableConfig => findPreset({ id, version: 1 })!.config.table;
const FOUR = tableOf("classique");
const THREE = tableOf("a-trois");
const TWO = tableOf("a-deux");
const FOUR_CLOCKWISE: TableConfig = { ...FOUR, direction: "clockwise" };

describe("engine seats", () => {
  it("lists the seats of each table size", () => {
    expect(seatsOf(FOUR)).toEqual([0, 1, 2, 3]);
    expect(seatsOf(THREE)).toEqual([0, 1, 2]);
    expect(seatsOf(TWO)).toEqual([0, 1]);
  });

  it("walks a four-seat table counterclockwise", () => {
    for (const seat of [0, 1, 2, 3] as const) {
      const next = (seat + 1) % 4;
      expect(nextSeat(FOUR, seat)).toBe(next);
      expect(previousSeat(FOUR, seat)).toBe((seat + 3) % 4);
      expect(seatsAfterDealer(FOUR, seat)).toEqual([next, (seat + 2) % 4, (seat + 3) % 4, seat]);
      expect(sideOf(FOUR, seat)).toBe(seat % 2);
    }
  });

  it("reverses the order for a clockwise table", () => {
    expect(nextSeat(FOUR_CLOCKWISE, 0)).toBe(3);
    expect(previousSeat(FOUR_CLOCKWISE, 0)).toBe(1);
    expect(seatsAfterDealer(FOUR_CLOCKWISE, 1)).toEqual([0, 3, 2, 1]);
  });

  it("walks the table from a leader", () => {
    expect(playOrderFrom(THREE, 2)).toEqual([2, 0, 1]);
    expect(seatsAfterDealer(THREE, 2)).toEqual([0, 1, 2]);
    expect(seatsAfterDealer(TWO, 0)).toEqual([1, 0]);
  });

  it("gives scoring sides: pairs at four, one side per player otherwise", () => {
    expect(sidesOf(FOUR)).toEqual([0, 1]);
    expect(sidesOf(THREE)).toEqual([0, 1, 2]);
    expect(sidesOf(TWO)).toEqual([0, 1]);
    expect(seatsOf(THREE).map((seat) => sideOf(THREE, seat))).toEqual([0, 1, 2]);
    expect(seatsOf(TWO).map((seat) => sideOf(TWO, seat))).toEqual([0, 1]);
  });

  it("keeps fixed partners at four whoever takes", () => {
    expect(dealAllies(FOUR, 0, null)).toEqual([2]);
    expect(dealAllies(FOUR, 3, 1)).toEqual([1]);
    expect(areDealAllies(FOUR, 1, 3, null)).toBe(true);
    expect(areDealAllies(FOUR, 1, 2, null)).toBe(false);
  });

  it("allies the two defenders at three once a taker exists", () => {
    expect(dealAllies(THREE, 0, null)).toEqual([]);
    expect(dealAllies(THREE, 1, 1)).toEqual([]);
    expect(dealAllies(THREE, 0, 1)).toEqual([2]);
    expect(dealAllies(THREE, 2, 1)).toEqual([0]);
    expect(areDealAllies(THREE, 0, 2, 1)).toBe(true);
    expect(areDealAllies(THREE, 0, 1, 1)).toBe(false);
  });

  it("never allies anyone at two seats", () => {
    expect(dealAllies(TWO, 0, 0)).toEqual([]);
    expect(dealAllies(TWO, 1, 0)).toEqual([]);
    expect(areDealAllies(TWO, 0, 1, 0)).toBe(false);
  });

  it("counts a seat as its own ally", () => {
    expect(areDealAllies(THREE, 1, 1, 1)).toBe(true);
    expect(areDealAllies(TWO, 0, 0, null)).toBe(true);
  });

  it("rejects seats outside the table", () => {
    expect(() => assertSeat(THREE, 3)).toThrow(InvalidEngineSeatError);
    expect(() => nextSeat(TWO, 2)).toThrow(InvalidEngineSeatError);
    expect(() => dealAllies(FOUR, -1, null)).toThrow(InvalidEngineSeatError);
    expect(() => dealAllies(THREE, 0, 7)).toThrow(InvalidEngineSeatError);
    expect(() => sideOf(FOUR, 1.5)).toThrow(InvalidEngineSeatError);
  });

  it("returns frozen lists", () => {
    expect(Object.isFrozen(seatsAfterDealer(FOUR, 0))).toBe(true);
    expect(Object.isFrozen(dealAllies(THREE, 0, 1))).toBe(true);
  });
});

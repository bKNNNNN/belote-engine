import { describe, expect, it } from "vitest";
import {
  InvalidSeedError,
  createRng,
  nextFloat,
  nextInt,
  nextUint32,
  seedFromNumber,
  type RngState,
} from "../../src/engine/rng";

function draws(state: RngState, count: number): number[] {
  const values: number[] = [];
  let current = state;
  for (let index = 0; index < count; index += 1) {
    const draw = nextUint32(current);
    values.push(draw.value);
    current = draw.state;
  }
  return values;
}

describe("xoshiro128** rng", () => {
  it("matches the reference output for the seed [1, 2, 3, 4]", () => {
    expect(draws(createRng([1, 2, 3, 4]), 10)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883,
      1637235492, 1287239034, 3734860849, 3729100597, 4258142804,
    ]);
  });

  it("is a pure function of its state", () => {
    const state = createRng([9, 8, 7, 6]);
    const snapshot = [...state];
    expect(nextUint32(state)).toEqual(nextUint32(state));
    expect([...state]).toEqual(snapshot);
    expect(Object.isFrozen(nextUint32(state).state)).toBe(true);
  });

  it("rejects seeds that are not four uint32 words or are all zero", () => {
    expect(() => createRng([0, 0, 0, 0])).toThrow(InvalidSeedError);
    expect(() => createRng([1, 2, 3] as never)).toThrow(InvalidSeedError);
    expect(() => createRng([1, 2, 3, 2 ** 32])).toThrow(InvalidSeedError);
    expect(() => createRng([1, 2, 3, -1])).toThrow(InvalidSeedError);
    expect(() => createRng([1, 2, 3, 0.5])).toThrow(InvalidSeedError);
  });

  it("expands a single number into a valid deterministic seed", () => {
    expect(seedFromNumber(42)).toEqual(seedFromNumber(42));
    expect(seedFromNumber(42)).not.toEqual(seedFromNumber(43));
    expect(() => createRng(seedFromNumber(0))).not.toThrow();
    expect(() => seedFromNumber(-1)).toThrow(InvalidSeedError);
  });

  it("draws unbiased integers inside the bound", () => {
    let state = createRng(seedFromNumber(7));
    const counts = [0, 0, 0];
    for (let index = 0; index < 30_000; index += 1) {
      const draw = nextInt(state, 3);
      counts[draw.value] = counts[draw.value]! + 1;
      state = draw.state;
    }
    counts.forEach((count) => {
      expect(count).toBeGreaterThan(9_500);
      expect(count).toBeLessThan(10_500);
    });
    expect(() => nextInt(state, 0)).toThrow(RangeError);
    expect(() => nextInt(state, 2 ** 32 + 1)).toThrow(RangeError);
  });

  it("draws floats in [0, 1)", () => {
    let state = createRng(seedFromNumber(11));
    for (let index = 0; index < 1_000; index += 1) {
      const draw = nextFloat(state);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(1);
      state = draw.state;
    }
  });
});

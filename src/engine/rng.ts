/**
 * xoshiro128** (Blackman & Vigna), pure TypeScript, identical in the browser
 * and on the server. The whole generator state is four uint32 words kept in
 * the engine state, so a match is reproducible from its seed alone.
 */

export type Seed = readonly [number, number, number, number];
export type RngState = Readonly<Seed>;
export type Draw<T> = Readonly<{ value: T; state: RngState }>;

const UINT32_RANGE = 2 ** 32;

export class InvalidSeedError extends RangeError {
  constructor(message = "A seed is four uint32 words, not all zero") {
    super(message);
    this.name = "InvalidSeedError";
  }
}

function isUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value < UINT32_RANGE;
}

export function createRng(seed: Seed): RngState {
  if (
    !Array.isArray(seed)
    || seed.length !== 4
    || !seed.every(isUint32)
    || seed.every((word) => word === 0)
  ) {
    throw new InvalidSeedError();
  }
  return Object.freeze([seed[0], seed[1], seed[2], seed[3]]) as RngState;
}

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

export function nextUint32(state: RngState): Draw<number> {
  const [s0, s1, s2, s3] = state;
  const value = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  const n1 = (s1 ^ n2) >>> 0;
  const n0 = (s0 ^ n3) >>> 0;
  const next = Object.freeze([
    n0,
    n1,
    (n2 ^ t) >>> 0,
    rotl(n3, 11),
  ]) as RngState;
  return Object.freeze({ value, state: next });
}

/** Uniform integer in [0, bound), without modulo bias (rejection sampling). */
export function nextInt(state: RngState, bound: number): Draw<number> {
  if (!Number.isInteger(bound) || bound < 1 || bound > UINT32_RANGE) {
    throw new RangeError("The bound must be an integer in [1, 2^32]");
  }
  const threshold = UINT32_RANGE % bound;
  let draw = nextUint32(state);
  while (draw.value < threshold) draw = nextUint32(draw.state);
  return Object.freeze({ value: draw.value % bound, state: draw.state });
}

/** Uniform float in [0, 1) with 32 bits of precision. */
export function nextFloat(state: RngState): Draw<number> {
  const draw = nextUint32(state);
  return Object.freeze({ value: draw.value / UINT32_RANGE, state: draw.state });
}

function splitmix32(input: number): Readonly<{ next: number; output: number }> {
  const next = (input + 0x9e3779b9) >>> 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return Object.freeze({ next, output: (z ^ (z >>> 16)) >>> 0 });
}

/**
 * Expands a non-negative safe integer into a full seed with splitmix32. Meant
 * for tests, fixtures and solo games; production callers should draw a full 128-bit seed.
 */
export function seedFromNumber(value: number): Seed {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidSeedError("A numeric seed is a non-negative safe integer");
  }
  const high = Math.floor(value / UINT32_RANGE);
  let cursor = ((value >>> 0) ^ Math.imul(high, 0x9e3779b9)) >>> 0;
  const words: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const step = splitmix32(cursor);
    cursor = step.next;
    words.push(step.output);
  }
  return createRng(words as unknown as Seed);
}

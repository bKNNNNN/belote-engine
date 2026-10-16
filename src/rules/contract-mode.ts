import { SUITS, type Suit } from "../card-primitives";

export type SuitContractMode = Readonly<{
  kind: "suit";
  suit: Suit;
}>;

export type NoTrumpContractMode = Readonly<{ kind: "no-trump" }>;
export type AllTrumpContractMode = Readonly<{ kind: "all-trump" }>;

export type ContractMode =
  | SuitContractMode
  | NoTrumpContractMode
  | AllTrumpContractMode;

export type ContractModeKey = `suit:${Suit}` | "no-trump" | "all-trump";

export function suitContractMode(suit: Suit): SuitContractMode {
  if (!SUITS.includes(suit)) throw invalidMode();
  return Object.freeze({ kind: "suit", suit });
}

export function noTrumpMode(): NoTrumpContractMode {
  return Object.freeze({ kind: "no-trump" });
}

export function allTrumpMode(): AllTrumpContractMode {
  return Object.freeze({ kind: "all-trump" });
}

export function parseContractMode(input: unknown): ContractMode {
  if (!isRecord(input) || typeof input.kind !== "string") throw invalidMode();
  if (input.kind === "suit" && hasExactKeys(input, ["kind", "suit"])) {
    return suitContractMode(input.suit as Suit);
  }
  if (input.kind === "no-trump" && hasExactKeys(input, ["kind"])) {
    return noTrumpMode();
  }
  if (input.kind === "all-trump" && hasExactKeys(input, ["kind"])) {
    return allTrumpMode();
  }
  throw invalidMode();
}

export function contractModeKey(mode: ContractMode): ContractModeKey {
  const parsed = parseContractMode(mode);
  return parsed.kind === "suit" ? `suit:${parsed.suit}` : parsed.kind;
}

export function contractModeEquals(
  first: ContractMode,
  second: ContractMode,
): boolean {
  return contractModeKey(first) === contractModeKey(second);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasExactKeys(
  input: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(input).sort();
  return keys.length === expected.length
    && [...expected].sort().every((key, index) => keys[index] === key);
}

function invalidMode(): TypeError {
  return new TypeError("Le mode de contrat est invalide.");
}

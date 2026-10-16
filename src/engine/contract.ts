import type { Card } from "../card-primitives";
import {
  contractModeKey,
  noTrumpMode,
  allTrumpMode,
  suitContractMode,
  type ContractMode,
} from "../rules/contract-mode";
import { SUITS } from "../card-primitives";
import type { Seat } from "./seats";
import type { ModeKind } from "./variant-config";

/**
 * Vocabulary shared by the three trump selection machines (turn-up, free
 * choice, auction) and by everything that runs after them.
 */

export type ContractValue = number | "capot" | "generale";

/** 0 = plain, 1 = doubled (coinche, contre), 2 = redoubled. */
export type DoublingLevel = 0 | 1 | 2;

export type Contract = Readonly<{
  taker: Seat;
  mode: ContractMode;
  /** null for turn-up and free-choice selections, which bid no value. */
  value: ContractValue | null;
  doubling: DoublingLevel;
  doubledBy: Seat | null;
}>;

export type SelectionIntent =
  | Readonly<{ kind: "pass"; seat: Seat }>
  | Readonly<{ kind: "take"; seat: Seat; mode: ContractMode }>
  | Readonly<{ kind: "bid"; seat: Seat; value: ContractValue; mode: ContractMode }>
  | Readonly<{ kind: "double"; seat: Seat }>
  | Readonly<{ kind: "redouble"; seat: Seat }>;

export type AuctionAction = Readonly<{
  seat: Seat;
  kind: SelectionIntent["kind"];
  value?: ContractValue;
  mode?: ContractMode;
  round?: 1 | 2;
}>;

export type SelectionEvent =
  | Readonly<{ type: "trump.passed"; seat: Seat; round: 1 | 2 | null }>
  | Readonly<{ type: "trump.taken"; seat: Seat; mode: ContractMode; round: 1 | 2 | null }>
  | Readonly<{ type: "trump.roundAdvanced"; round: 2 }>
  | Readonly<{ type: "auction.bid"; seat: Seat; value: ContractValue; mode: ContractMode }>
  | Readonly<{ type: "auction.doubled"; seat: Seat }>
  | Readonly<{ type: "auction.redoubled"; seat: Seat }>
  | Readonly<{ type: "contract.set"; contract: Contract }>
  | Readonly<{ type: "deal.allPassed" }>;

export type SelectionRejection =
  | "notYourTurn"
  | "illegalPass"
  | "illegalTake"
  | "illegalBid"
  | "illegalDouble"
  | "illegalRedouble"
  | "wrongPhase";

export type SelectionStatus =
  | Readonly<{ kind: "open" }>
  | Readonly<{ kind: "contract"; contract: Contract }>
  | Readonly<{ kind: "allPassed" }>;

export type SelectionStep<TState> =
  | Readonly<{ ok: true; state: TState; events: readonly SelectionEvent[] }>
  | Readonly<{ ok: false; reason: SelectionRejection }>;

export type TurnupCard = Readonly<Card> | null;

const MODE_RANK: Readonly<Record<ModeKind, number>> = Object.freeze({
  suit: 0,
  "no-trump": 1,
  "all-trump": 2,
});

/** Mode ladder of the belote moderne: suit < no trump < all trump. */
export function modeRank(mode: ContractMode): number {
  return MODE_RANK[mode.kind];
}

const MODES = new WeakMap<readonly ModeKind[], readonly ContractMode[]>();

/** Every concrete mode a list of mode kinds allows, suits first. */
export function modesOf(kinds: readonly ModeKind[]): readonly ContractMode[] {
  const cached = MODES.get(kinds);
  if (cached !== undefined) return cached;
  const modes = Object.freeze(kinds.flatMap((kind): ContractMode[] => {
    if (kind === "suit") return SUITS.map(suitContractMode);
    return [kind === "no-trump" ? noTrumpMode() : allTrumpMode()];
  }));
  MODES.set(kinds, modes);
  return modes;
}

export function sameMode(first: ContractMode, second: ContractMode): boolean {
  return contractModeKey(first) === contractModeKey(second);
}

export function includesMode(
  modes: readonly ContractMode[],
  mode: ContractMode,
): boolean {
  return modes.some((candidate) => sameMode(candidate, mode));
}

export function plainContract(taker: Seat, mode: ContractMode): Contract {
  return Object.freeze({ taker, mode, value: null, doubling: 0, doubledBy: null });
}

export function rejected<TState>(reason: SelectionRejection): SelectionStep<TState> {
  return Object.freeze({ ok: false as const, reason });
}

export function accepted<TState>(
  state: TState,
  events: readonly SelectionEvent[],
): SelectionStep<TState> {
  return Object.freeze({ ok: true as const, state, events: Object.freeze([...events]) });
}

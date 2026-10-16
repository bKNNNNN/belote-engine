import { SUITS, type Card } from "../card-primitives";
import { suitContractMode, type ContractMode } from "../rules/contract-mode";
import {
  accepted,
  includesMode,
  modeRank,
  modesOf,
  plainContract,
  rejected,
  type AuctionAction,
  type SelectionEvent,
  type SelectionIntent,
  type SelectionStatus,
  type SelectionStep,
} from "./contract";
import { nextSeat, seatsAfterDealer, type Seat } from "./seats";
import type { TrumpSelection, VariantConfig } from "./variant-config";

/**
 * Taking at the turn-up (port of `belote-classic/taking.ts`), with the
 * regional options: second round on other or any suit, forced jack, dealer
 * forced at the end of round two, and the moderne no-trump / all-trump
 * overbid that keeps the round open until a take meets three passes.
 */

type TurnupRules = Extract<TrumpSelection, { kind: "turnup" }>;

export type TurnupSelectionState = Readonly<{
  kind: "turnup";
  dealer: Seat;
  turnup: Readonly<Card>;
  round: 1 | 2;
  toAct: Seat | null;
  /** Consecutive passes since the round opened or since the last take. */
  passes: number;
  holder: Readonly<{ seat: Seat; mode: ContractMode }> | null;
  history: readonly AuctionAction[];
  status: SelectionStatus;
}>;

type TurnupIntent = Extract<SelectionIntent, { kind: "pass" | "take" }>;

function rulesOf(config: VariantConfig): TurnupRules {
  if (config.trump.kind !== "turnup") throw new TypeError("Not a turn-up variant");
  return config.trump;
}

export function startTurnupSelection(
  config: VariantConfig,
  dealer: Seat,
  turnup: Readonly<Card>,
): TurnupSelectionState {
  return Object.freeze({
    kind: "turnup",
    dealer,
    turnup,
    round: 1,
    toAct: seatsAfterDealer(config.table, dealer)[0]!,
    passes: 0,
    holder: null,
    history: Object.freeze([]),
    status: Object.freeze({ kind: "open" }),
  });
}

function overbidModes(rules: TurnupRules): readonly ContractMode[] {
  return modesOf(rules.overbid ?? []);
}

function roundSuits(rules: TurnupRules, state: TurnupSelectionState): readonly ContractMode[] {
  if (state.round === 1) return [suitContractMode(state.turnup.suit)];
  const suits = rules.secondRound === "anySuit"
    ? SUITS
    : SUITS.filter((suit) => suit !== state.turnup.suit);
  return suits.map(suitContractMode);
}

function takeableModes(
  rules: TurnupRules,
  state: TurnupSelectionState,
  seat: Seat,
): readonly ContractMode[] {
  const holder = state.holder;
  if (holder === null) return [...roundSuits(rules, state), ...overbidModes(rules)];
  if (holder.seat === seat) return [];
  return overbidModes(rules).filter((mode) => modeRank(mode) > modeRank(holder.mode));
}

function passForbidden(config: VariantConfig, state: TurnupSelectionState): boolean {
  const rules = rulesOf(config);
  if (state.holder !== null) return false;
  const firstSpeech = state.round === 1 && state.passes === 0;
  if (rules.forcedJack && firstSpeech && state.turnup.rank === "J") return true;
  return rules.dealerForcedAfterRound2
    && state.round === 2
    && state.toAct === state.dealer;
}

export function legalTurnupIntents(
  config: VariantConfig,
  state: TurnupSelectionState,
  seat: Seat,
): readonly SelectionIntent[] {
  if (state.status.kind !== "open" || state.toAct !== seat) return Object.freeze([]);
  const passes = passForbidden(config, state) ? [] : [{ kind: "pass" as const, seat }];
  const takes = takeableModes(rulesOf(config), state, seat)
    .map((mode) => ({ kind: "take" as const, seat, mode }));
  return Object.freeze([...passes, ...takes]);
}

function closed(
  state: TurnupSelectionState,
  status: SelectionStatus,
  extra: Partial<TurnupSelectionState>,
): TurnupSelectionState {
  return Object.freeze({ ...state, ...extra, toAct: null, status: Object.freeze(status) });
}

function applyPass(
  config: VariantConfig,
  state: TurnupSelectionState,
  seat: Seat,
): SelectionStep<TurnupSelectionState> {
  if (passForbidden(config, state)) return rejected("illegalPass");
  const rules = rulesOf(config);
  const passes = state.passes + 1;
  const history = Object.freeze([...state.history, Object.freeze({ seat, kind: "pass" as const, round: state.round })]);
  const passed: SelectionEvent = { type: "trump.passed", seat, round: state.round };
  if (state.holder !== null && passes === config.table.seats - 1) {
    const contract = plainContract(state.holder.seat, state.holder.mode);
    return accepted(closed(state, { kind: "contract", contract }, { passes, history }), [
      passed,
      { type: "contract.set", contract },
    ]);
  }
  if (state.holder === null && passes === config.table.seats) {
    if (state.round === 1 && rules.secondRound !== "none") {
      return accepted(Object.freeze({
        ...state,
        round: 2,
        passes: 0,
        history,
        toAct: seatsAfterDealer(config.table, state.dealer)[0]!,
      }), [passed, { type: "trump.roundAdvanced", round: 2 }]);
    }
    return accepted(closed(state, { kind: "allPassed" }, { passes, history }), [
      passed,
      { type: "deal.allPassed" },
    ]);
  }
  return accepted(
    Object.freeze({ ...state, passes, history, toAct: nextSeat(config.table, seat) }),
    [passed],
  );
}

function applyTake(
  config: VariantConfig,
  state: TurnupSelectionState,
  seat: Seat,
  mode: ContractMode,
): SelectionStep<TurnupSelectionState> {
  const rules = rulesOf(config);
  if (!includesMode(takeableModes(rules, state, seat), mode)) return rejected("illegalTake");
  const history = Object.freeze([
    ...state.history,
    Object.freeze({ seat, kind: "take" as const, mode, round: state.round }),
  ]);
  const taken: SelectionEvent = { type: "trump.taken", seat, mode, round: state.round };
  const higher = overbidModes(rules).some((candidate) => modeRank(candidate) > modeRank(mode));
  if (!higher) {
    const contract = plainContract(seat, mode);
    return accepted(closed(state, { kind: "contract", contract }, { history, holder: Object.freeze({ seat, mode }) }), [
      taken,
      { type: "contract.set", contract },
    ]);
  }
  return accepted(Object.freeze({
    ...state,
    history,
    passes: 0,
    holder: Object.freeze({ seat, mode }),
    toAct: nextSeat(config.table, seat),
  }), [taken]);
}

export function applyTurnupIntent(
  config: VariantConfig,
  state: TurnupSelectionState,
  intent: TurnupIntent,
): SelectionStep<TurnupSelectionState> {
  if (state.status.kind !== "open") return rejected("wrongPhase");
  if (intent.seat !== state.toAct) return rejected("notYourTurn");
  return intent.kind === "pass"
    ? applyPass(config, state, intent.seat)
    : applyTake(config, state, intent.seat, intent.mode);
}

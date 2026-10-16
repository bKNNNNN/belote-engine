import type { Card } from "../card-primitives";
import { suitContractMode, type ContractMode } from "../rules/contract-mode";
import {
  accepted,
  includesMode,
  modesOf,
  plainContract,
  rejected,
  type AuctionAction,
  type SelectionIntent,
  type SelectionStatus,
  type SelectionStep,
} from "./contract";
import { nextSeat, seatsAfterDealer, type Seat } from "./seats";
import type { TrumpSelection, VariantConfig } from "./variant-config";

/**
 * Belote à la vache: a single round in which each seat may name any mode it
 * allows. Nobody redeals: when the others all passed, the dealer must take,
 * either any mode or the turned suit (option with a turn-up).
 */

type FreeChoiceRules = Extract<TrumpSelection, { kind: "freeChoice" }>;

export type FreeChoiceSelectionState = Readonly<{
  kind: "freeChoice";
  dealer: Seat;
  turnup: Readonly<Card> | null;
  toAct: Seat | null;
  passes: number;
  history: readonly AuctionAction[];
  status: SelectionStatus;
}>;

type FreeChoiceIntent = Extract<SelectionIntent, { kind: "pass" | "take" }>;

function rulesOf(config: VariantConfig): FreeChoiceRules {
  if (config.trump.kind !== "freeChoice") throw new TypeError("Not a free-choice variant");
  return config.trump;
}

export function startFreeChoiceSelection(
  config: VariantConfig,
  dealer: Seat,
  turnup: Readonly<Card> | null,
): FreeChoiceSelectionState {
  const rules = rulesOf(config);
  if (rules.allPassed === "dealerTakesTurnupSuit" && turnup === null) {
    throw new TypeError("This free choice forces the turned suit: it needs a turn-up");
  }
  return Object.freeze({
    kind: "freeChoice",
    dealer,
    turnup,
    toAct: seatsAfterDealer(config.table, dealer)[0]!,
    passes: 0,
    history: Object.freeze([]),
    status: Object.freeze({ kind: "open" }),
  });
}

function dealerIsForced(config: VariantConfig, state: FreeChoiceSelectionState): boolean {
  return state.toAct === state.dealer && state.passes === config.table.seats - 1;
}

function takeableModes(
  config: VariantConfig,
  state: FreeChoiceSelectionState,
): readonly ContractMode[] {
  const rules = rulesOf(config);
  if (dealerIsForced(config, state) && rules.allPassed === "dealerTakesTurnupSuit") {
    return [suitContractMode(state.turnup!.suit)];
  }
  return modesOf(rules.modes);
}

export function legalFreeChoiceIntents(
  config: VariantConfig,
  state: FreeChoiceSelectionState,
  seat: Seat,
): readonly SelectionIntent[] {
  if (state.status.kind !== "open" || state.toAct !== seat) return Object.freeze([]);
  const passes = dealerIsForced(config, state) ? [] : [{ kind: "pass" as const, seat }];
  const takes = takeableModes(config, state).map((mode) => ({ kind: "take" as const, seat, mode }));
  return Object.freeze([...passes, ...takes]);
}

export function applyFreeChoiceIntent(
  config: VariantConfig,
  state: FreeChoiceSelectionState,
  intent: FreeChoiceIntent,
): SelectionStep<FreeChoiceSelectionState> {
  if (state.status.kind !== "open") return rejected("wrongPhase");
  if (intent.seat !== state.toAct) return rejected("notYourTurn");
  if (intent.kind === "pass") {
    if (dealerIsForced(config, state)) return rejected("illegalPass");
    return accepted(Object.freeze({
      ...state,
      passes: state.passes + 1,
      toAct: nextSeat(config.table, intent.seat),
      history: Object.freeze([...state.history, Object.freeze({ seat: intent.seat, kind: "pass" as const })]),
    }), [{ type: "trump.passed", seat: intent.seat, round: null }]);
  }
  if (!includesMode(takeableModes(config, state), intent.mode)) return rejected("illegalTake");
  const contract = plainContract(intent.seat, intent.mode);
  return accepted(Object.freeze({
    ...state,
    toAct: null,
    history: Object.freeze([
      ...state.history,
      Object.freeze({ seat: intent.seat, kind: "take" as const, mode: intent.mode }),
    ]),
    status: Object.freeze({ kind: "contract" as const, contract }),
  }), [
    { type: "trump.taken", seat: intent.seat, mode: intent.mode, round: null },
    { type: "contract.set", contract },
  ]);
}

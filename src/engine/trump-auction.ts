import type { ContractMode } from "../rules/contract-mode";
import {
  accepted,
  includesMode,
  modesOf,
  rejected,
  type AuctionAction,
  type Contract,
  type ContractValue,
  type SelectionEvent,
  type SelectionIntent,
  type SelectionStatus,
  type SelectionStep,
} from "./contract";
import { auctionValues, outbids, valueIndex } from "./auction-ladder";
import { nextSeat, playOrderFrom, seatsAfterDealer, sideOf, type Seat } from "./seats";
import type { TrumpSelection, VariantConfig } from "./variant-config";

export { auctionValues } from "./auction-ladder";

/**
 * Auction with values (port of `coinche-family-bidding.ts`, generalised):
 * ladder and specials (capot, générale), mode hierarchy, coinche or contre in
 * turn or at any time, closing or not (the stéphanoise décoinche), and who
 * may still answer a closing double.
 */

type AuctionRules = Extract<TrumpSelection, { kind: "auction" }>;

export type AuctionBid = Readonly<{ seat: Seat; value: ContractValue; mode: ContractMode }>;

export type AuctionSelectionState = Readonly<{
  kind: "auction";
  dealer: Seat;
  toAct: Seat | null;
  history: readonly AuctionAction[];
  highest: AuctionBid | null;
  passes: number;
  doubledBy: Seat | null;
  /** Seats still allowed to answer a closing double, in speaking order. */
  responders: readonly Seat[] | null;
  bidsBySeat: readonly number[];
  status: SelectionStatus;
}>;

function rulesOf(config: VariantConfig): AuctionRules {
  if (config.trump.kind !== "auction") throw new TypeError("Not an auction variant");
  return config.trump;
}

export function startAuctionSelection(
  config: VariantConfig,
  dealer: Seat,
): AuctionSelectionState {
  return Object.freeze({
    kind: "auction",
    dealer,
    toAct: seatsAfterDealer(config.table, dealer)[0]!,
    history: Object.freeze([]),
    highest: null,
    passes: 0,
    doubledBy: null,
    responders: null,
    bidsBySeat: Object.freeze(Array.from({ length: config.table.seats }, () => 0)),
    status: Object.freeze({ kind: "open" }),
  });
}

function closingDoubleStands(rules: AuctionRules, state: AuctionSelectionState): boolean {
  return state.doubledBy !== null && rules.doubling?.closesAuction !== false;
}

/** Seat-level conditions, whatever the value and the mode. */
function seatMayBid(config: VariantConfig, state: AuctionSelectionState, seat: Seat): boolean {
  const rules = rulesOf(config);
  if (closingDoubleStands(rules, state) || seat === state.doubledBy) return false;
  const decoinche = state.doubledBy !== null;
  if (!rules.overbidSelf && !decoinche && state.highest?.seat === seat) return false;
  const limit = rules.maxSpeechesPerPlayer;
  return limit === null || state.bidsBySeat[seat]! < limit;
}

function canBid(
  config: VariantConfig,
  state: AuctionSelectionState,
  bid: AuctionBid,
): boolean {
  return seatMayBid(config, state, bid.seat)
    && includesMode(modesOf(rulesOf(config).modes), bid.mode)
    && outbids(config, bid, state.highest);
}

function canDouble(config: VariantConfig, state: AuctionSelectionState, seat: Seat): boolean {
  const doubling = rulesOf(config).doubling;
  const highest = state.highest;
  if (doubling === null || highest === null || state.doubledBy !== null) return false;
  if (doubling.timing === "inTurn" && seat !== state.toAct) return false;
  if (sideOf(config.table, seat) === sideOf(config.table, highest.seat)) return false;
  if (typeof highest.value !== "number") return doubling.capotDoublable;
  return doubling.minDoublableBid === null || highest.value >= doubling.minDoublableBid;
}

function canRedouble(config: VariantConfig, state: AuctionSelectionState, seat: Seat): boolean {
  const doubling = rulesOf(config).doubling;
  return doubling !== null
    && doubling.redouble
    && state.doubledBy !== null
    && seat === state.toAct
    && state.highest !== null
    && sideOf(config.table, seat) === sideOf(config.table, state.highest.seat);
}

export function legalAuctionIntents(
  config: VariantConfig,
  state: AuctionSelectionState,
  seat: Seat,
): readonly SelectionIntent[] {
  if (state.status.kind !== "open") return Object.freeze([]);
  const double = canDouble(config, state, seat) ? [{ kind: "double" as const, seat }] : [];
  if (seat !== state.toAct) return Object.freeze(double);
  const bids = candidateBids(config, state, seat);
  const redouble = canRedouble(config, state, seat) ? [{ kind: "redouble" as const, seat }] : [];
  return Object.freeze([{ kind: "pass" as const, seat }, ...bids, ...double, ...redouble]);
}

function candidateBids(
  config: VariantConfig,
  state: AuctionSelectionState,
  seat: Seat,
): readonly SelectionIntent[] {
  if (!seatMayBid(config, state, seat)) return [];
  const modes = modesOf(rulesOf(config).modes);
  const from = state.highest === null ? 0 : valueIndex(config, state.highest.value);
  return auctionValues(config).slice(from).flatMap((value) => modes
    .filter((mode) => outbids(config, { seat, value, mode }, state.highest))
    .map((mode) => ({ kind: "bid" as const, seat, value, mode })));
}

function contractOf(state: AuctionSelectionState, doubling: 0 | 1 | 2): Contract {
  const highest = state.highest!;
  return Object.freeze({
    taker: highest.seat,
    mode: highest.mode,
    value: highest.value,
    doubling,
    doubledBy: state.doubledBy,
  });
}

function close(
  state: AuctionSelectionState,
  history: readonly AuctionAction[],
  events: readonly SelectionEvent[],
  doubling: 0 | 1 | 2,
): SelectionStep<AuctionSelectionState> {
  const contract = contractOf(state, doubling);
  return accepted(Object.freeze({
    ...state,
    history,
    toAct: null,
    responders: null,
    status: Object.freeze({ kind: "contract" as const, contract }),
  }), [...events, { type: "contract.set", contract }]);
}

function currentDoubling(state: AuctionSelectionState): 0 | 1 {
  return state.doubledBy === null ? 0 : 1;
}

function applyPass(
  config: VariantConfig,
  state: AuctionSelectionState,
  seat: Seat,
): SelectionStep<AuctionSelectionState> {
  const history = Object.freeze([...state.history, Object.freeze({ seat, kind: "pass" as const })]);
  const events: SelectionEvent[] = [{ type: "trump.passed", seat, round: null }];
  if (state.responders !== null) {
    const responders = Object.freeze(state.responders.slice(1));
    if (responders.length === 0) return close(state, history, events, 1);
    return accepted(Object.freeze({ ...state, history, responders, toAct: responders[0]! }), events);
  }
  const passes = state.passes + 1;
  if (state.highest === null && passes === config.table.seats) {
    return accepted(Object.freeze({
      ...state,
      history,
      passes,
      toAct: null,
      status: Object.freeze({ kind: "allPassed" as const }),
    }), [...events, { type: "deal.allPassed" }]);
  }
  if (state.highest !== null && passes === config.table.seats - 1) {
    return close(state, history, events, currentDoubling(state));
  }
  return accepted(
    Object.freeze({ ...state, history, passes, toAct: nextSeat(config.table, seat) }),
    events,
  );
}

function applyBid(
  config: VariantConfig,
  state: AuctionSelectionState,
  bid: AuctionBid,
): SelectionStep<AuctionSelectionState> {
  if (!canBid(config, state, bid)) return rejected("illegalBid");
  const history = Object.freeze([
    ...state.history,
    Object.freeze({ seat: bid.seat, kind: "bid" as const, value: bid.value, mode: bid.mode }),
  ]);
  const next: AuctionSelectionState = Object.freeze({
    ...state,
    highest: Object.freeze({ ...bid }),
    passes: 0,
    doubledBy: null,
    responders: null,
    bidsBySeat: Object.freeze(state.bidsBySeat.map((count, seat) =>
      seat === bid.seat ? count + 1 : count)),
    toAct: nextSeat(config.table, bid.seat),
  });
  const events: SelectionEvent[] = [
    { type: "auction.bid", seat: bid.seat, value: bid.value, mode: bid.mode },
  ];
  if (typeof bid.value !== "number" && rulesOf(config).capotClosesAuction) {
    return close(next, history, events, 0);
  }
  return accepted(Object.freeze({ ...next, history }), events);
}

function applyDouble(
  config: VariantConfig,
  state: AuctionSelectionState,
  seat: Seat,
): SelectionStep<AuctionSelectionState> {
  if (!canDouble(config, state, seat)) return rejected("illegalDouble");
  const doubling = rulesOf(config).doubling!;
  const history = Object.freeze([...state.history, Object.freeze({ seat, kind: "double" as const })]);
  const takerSide = sideOf(config.table, state.highest!.seat);
  const responders = doubling.closesAuction && doubling.responders === "takerSide"
    ? playOrderFrom(config.table, nextSeat(config.table, seat))
      .filter((other) => sideOf(config.table, other) === takerSide)
    : null;
  return accepted(Object.freeze({
    ...state,
    history,
    passes: 0,
    doubledBy: seat,
    responders: responders === null ? null : Object.freeze(responders),
    toAct: responders?.[0] ?? nextSeat(config.table, seat),
  }), [{ type: "auction.doubled", seat }]);
}

export function applyAuctionIntent(
  config: VariantConfig,
  state: AuctionSelectionState,
  intent: SelectionIntent,
): SelectionStep<AuctionSelectionState> {
  if (state.status.kind !== "open") return rejected("wrongPhase");
  const anytime = rulesOf(config).doubling?.timing === "anytime";
  if (intent.seat !== state.toAct && !(intent.kind === "double" && anytime)) {
    return rejected("notYourTurn");
  }
  if (intent.kind === "double") return applyDouble(config, state, intent.seat);
  switch (intent.kind) {
    case "pass":
      return applyPass(config, state, intent.seat);
    case "bid":
      return applyBid(config, state, intent);
    case "redouble": {
      if (!canRedouble(config, state, intent.seat)) return rejected("illegalRedouble");
      const history = Object.freeze([...state.history, Object.freeze({ seat: intent.seat, kind: "redouble" as const })]);
      return close(state, history, [{ type: "auction.redoubled", seat: intent.seat }], 2);
    }
    case "take":
      return rejected("illegalBid");
  }
}

import type { Card } from "../card-primitives";
import type { SeatDeal } from "./deal-interpreter";
import { assertSeat, dealAllies, seatsOf, sideOf, sidesOf, type Seat } from "./seats";
import type { DealState, EngineState, PlayState } from "./state";
import { legalIntents, seatToAct } from "./step";
import type { TrumpSelectionState } from "./trump-selection";
import type { VariantConfig } from "./variant-config";
import {
  auctionActionView,
  cardView,
  cardsView,
  completedTricksView,
  contractView,
  freezeList,
  intentView,
  lastDealView,
  modeView,
  playedCardsView,
} from "./view-copy";
import { cutRangeOf } from "./deal-flow";
import type {
  BeloteView,
  CutView,
  DeclarationsView,
  ScoreView,
  SeatPublicView,
  SeatView,
  SelectionView,
  TableauColumnView,
  TurnupView,
} from "./view-types";

/**
 * `viewFor(state, viewer)`: the seat view of engine-design.md section 3. It is
 * built by whitelist, field by field, from the engine state; it never starts
 * from the full state and removes things. Hidden from every seat: the other
 * hands, the face-down tableau layer (the viewer's own included), the stock
 * and the stéphanoise reserve, the gathered pile, the RNG, the seed.
 */

export type Viewer = Seat | "spectator";
export type * from "./view-types";

type DealTable = Readonly<{
  holdings: readonly SeatDeal[] | null;
  turnup: Readonly<Card> | null;
  taker: Seat | null;
  undealt: number;
}>;

function dealTable(deal: DealState): DealTable {
  if (deal.phase === "trumpSelection") {
    return { holdings: deal.dealt.seats, turnup: deal.dealt.turnup, taker: null, undealt: deal.dealt.stock.length };
  }
  if (deal.phase === "playing") {
    const play = deal.play;
    return { holdings: play.seats, turnup: play.turnup, taker: play.contract.taker, undealt: 0 };
  }
  return { holdings: null, turnup: null, taker: null, undealt: 0 };
}

function tableauView(holding: SeatDeal): readonly TableauColumnView[] {
  return Object.freeze(holding.tableau.map(({ hidden, visible }) => Object.freeze({
    visible: visible === null ? null : cardView(visible),
    hiddenCount: hidden === null ? 0 as const : 1 as const,
  })));
}

function seatsView(config: VariantConfig, table: DealTable, play: PlayState | null): readonly SeatPublicView[] {
  const taker = play?.contract.taker ?? null;
  return Object.freeze(seatsOf(config.table).map((seat) => {
    const holding = table.holdings?.[seat] ?? null;
    return Object.freeze({
      seat,
      side: sideOf(config.table, seat),
      dealAllies: freezeList(dealAllies(config.table, seat, taker)),
      handCount: holding?.hand.length ?? 0,
      tableau: holding === null || config.table.tableau === null ? null : tableauView(holding),
      tricksWon: play?.completed.filter(({ winner }) => winner === seat).length ?? 0,
    });
  }));
}

function selectionView(selection: TrumpSelectionState): SelectionView {
  const auction = selection.kind === "auction" ? selection : null;
  const highest = auction?.highest ?? null;
  return Object.freeze({
    kind: selection.kind,
    round: selection.kind === "turnup" ? selection.round : null,
    highest: highest === null
      ? null
      : Object.freeze({ seat: highest.seat, value: highest.value, mode: modeView(highest.mode) }),
    doubledBy: auction?.doubledBy ?? null,
  });
}

function belotesView(play: PlayState): readonly BeloteView[] {
  return Object.freeze(play.belote.entries.flatMap(({ owner, suit, status }): BeloteView[] => {
    if (status !== "announced" && status !== "confirmed") return [];
    return [Object.freeze({ seat: owner, suit, stage: status === "confirmed" ? "rebelote" : "belote" })];
  }));
}

function declarationsView(play: PlayState): DeclarationsView | null {
  const declarations = play.declarations;
  if (declarations === null) return null;
  const resolution = declarations.resolution;
  return Object.freeze({
    bySeat: Object.freeze(declarations.declared.map((combinations, seat) => Object.freeze({
      seat,
      announced: combinations === null
        ? null
        : Object.freeze(combinations.map(({ kind, points }) => Object.freeze({ kind, points }))),
    }))),
    resolved: resolution !== null,
    winningSide: resolution?.winningSide ?? null,
    pointsBySide: resolution === null ? null : freezeList(resolution.pointsBySide),
    shown: Object.freeze((resolution?.accepted ?? []).map(({ seat, combination }) => Object.freeze({
      seat,
      kind: combination.kind,
      points: combination.points,
      cards: cardsView(combination.cards),
    }))),
  });
}

function scoreView(state: EngineState): ScoreView {
  const { config, match, deal } = state;
  const end = config.match.end;
  const lastDeal = deal.phase === "betweenDeals" || deal.phase === "matchFinished" ? deal.lastDeal : null;
  return Object.freeze({
    sides: freezeList(sidesOf(config.table)),
    match: freezeList(match.scores),
    target: match.target,
    formatId: match.formatId,
    dealsLeft: end.kind === "deals" ? Math.max(0, end.count - match.scoredDeals) : null,
    scoredDeals: match.scoredDeals,
    litigePending: match.litigePending,
    locks: freezeList(match.locks),
    finished: match.finished,
    winner: match.winner,
    lastDeal: lastDealView(config.table, lastDeal),
  });
}

function cutView(state: EngineState): CutView | null {
  const range = cutRangeOf(state.config);
  if (range === null) return null;
  const deckSize = range.min + range.max;
  const deal = state.deal;
  if (deal.phase === "cutting") {
    return Object.freeze({ cutter: deal.cutter, deckSize, min: range.min, max: range.max, position: null });
  }
  const cut = state.lastCut;
  if (cut === null || cut.dealNumber !== state.dealNumber) return null;
  if (deal.phase !== "trumpSelection" && deal.phase !== "playing") return null;
  return Object.freeze({ cutter: cut.seat, deckSize, min: range.min, max: range.max, position: cut.position });
}

function turnupView(table: DealTable): TurnupView | null {
  return table.turnup === null ? null : Object.freeze({ card: cardView(table.turnup), taker: table.taker });
}

export function viewFor(state: EngineState, viewer: Viewer): SeatView {
  const config = state.config;
  if (viewer !== "spectator") assertSeat(config.table, viewer);
  const deal = state.deal;
  const table = dealTable(deal);
  const play = deal.phase === "playing" ? deal.play : null;
  const selection = deal.phase === "trumpSelection" ? deal.selection : null;
  const mine = viewer === "spectator" ? null : table.holdings?.[viewer] ?? null;
  const history = selection?.history ?? play?.auction ?? [];
  return Object.freeze({
    variant: Object.freeze({ id: config.id, version: config.version }),
    rules: config,
    viewer,
    seq: state.seq,
    phase: deal.phase,
    dealNumber: state.dealNumber,
    dealer: state.dealer,
    toAct: seatToAct(state),
    seats: seatsView(config, table, play),
    me: viewer === "spectator" || mine === null
      ? null
      : Object.freeze({ seat: viewer, hand: cardsView(mine.hand) }),
    undealtCount: table.undealt,
    cut: cutView(state),
    turnup: turnupView(table),
    selection: selection === null ? null : selectionView(selection),
    auction: Object.freeze(history.map(auctionActionView)),
    contract: play === null ? null : contractView(config.table, play.contract),
    belotes: play === null ? Object.freeze([]) : belotesView(play),
    declarations: play === null ? null : declarationsView(play),
    trick: play === null
      ? null
      : Object.freeze({ leader: play.trick.leader, cards: playedCardsView(play.trick.cards) }),
    tricksPlayed: play?.completed.length ?? 0,
    completedTricks: play === null ? Object.freeze([]) : completedTricksView(config.table, play.completed),
    score: scoreView(state),
    redealRequest: deal.phase === "betweenDeals" && deal.redealRequest !== null
      ? Object.freeze({ seat: deal.redealRequest.seat, reason: deal.redealRequest.reason })
      : null,
    legal: viewer === "spectator" ? Object.freeze([]) : Object.freeze(legalIntents(state, viewer).map(intentView)),
  });
}

import type { Card } from "../card-primitives";
import type { ContractMode } from "../rules/contract-mode";
import type { AuctionAction, Contract } from "./contract";
import type { EnginePlayedCard } from "./legal";
import type { DealScore } from "./scoring";
import { sideOf } from "./seats";
import type { CompletedTrickRecord, DealSummary, Intent } from "./state";
import type { TableConfig } from "./variant-config";
import type {
  CardView,
  CompletedTrickView,
  ContractView,
  DealScoreView,
  LastDealView,
  PlayedCardView,
} from "./view-types";

/**
 * Field-by-field copies used to build a seat view. Each copy names the fields
 * it keeps: a field added to the engine state never reaches a view by itself.
 */

export function freezeList<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]);
}

export function cardView(card: Readonly<Card>): CardView {
  return Object.freeze({ suit: card.suit, rank: card.rank });
}

export function cardsView(cards: readonly Readonly<Card>[]): readonly CardView[] {
  return Object.freeze(cards.map(cardView));
}

export function modeView(mode: ContractMode): ContractMode {
  return mode.kind === "suit"
    ? Object.freeze({ kind: "suit", suit: mode.suit })
    : Object.freeze({ kind: mode.kind });
}

export function auctionActionView(action: AuctionAction): AuctionAction {
  return Object.freeze({
    seat: action.seat,
    kind: action.kind,
    ...(action.value === undefined ? {} : { value: action.value }),
    ...(action.mode === undefined ? {} : { mode: modeView(action.mode) }),
    ...(action.round === undefined ? {} : { round: action.round }),
  });
}

export function contractView(table: TableConfig, contract: Contract): ContractView {
  return Object.freeze({
    taker: contract.taker,
    side: sideOf(table, contract.taker),
    mode: modeView(contract.mode),
    value: contract.value,
    doubling: contract.doubling,
    doubledBy: contract.doubledBy,
  });
}

export function playedCardsView(cards: readonly EnginePlayedCard[]): readonly PlayedCardView[] {
  return Object.freeze(cards.map(({ seat, card }) => Object.freeze({ seat, card: cardView(card) })));
}

function completedTrickView(record: CompletedTrickRecord, index: number): CompletedTrickView {
  return Object.freeze({
    index,
    leader: record.leader,
    cards: playedCardsView(record.cards),
    winner: record.winner,
    points: record.points,
  });
}

/** Completed tricks as the table shows them: all, or the last one only. */
export function completedTricksView(
  table: TableConfig,
  records: readonly CompletedTrickRecord[],
): readonly CompletedTrickView[] {
  const views = records.map(completedTrickView);
  return Object.freeze(table.trickHistory === "full" ? views : views.slice(-1));
}

function dealScoreView(score: DealScore): DealScoreView {
  return Object.freeze({
    outcome: score.outcome,
    winnerSide: score.winnerSide,
    capotSide: score.capotSide,
    totals: freezeList(score.totals),
    dealMarks: freezeList(score.dealMarks),
    litigeAwarded: score.litigeAwarded === null
      ? null
      : Object.freeze({ side: score.litigeAwarded.side, points: score.litigeAwarded.points }),
    marks: freezeList(score.marks),
    litigePending: score.litigePending,
  });
}

export function lastDealView(table: TableConfig, summary: DealSummary | null): LastDealView | null {
  if (summary === null) return null;
  return Object.freeze({
    contract: contractView(table, summary.contract),
    score: dealScoreView(summary.score),
    tricks: completedTricksView(table, summary.tricks),
  });
}

export function intentView(intent: Intent): Intent {
  switch (intent.kind) {
    case "cut":
      return Object.freeze({ kind: "cut", seat: intent.seat, position: intent.position });
    case "play":
      return Object.freeze({
        kind: "play",
        seat: intent.seat,
        card: cardView(intent.card),
        ...(intent.belote === undefined ? {} : { belote: intent.belote }),
      });
    case "declare":
      return Object.freeze({ kind: "declare", seat: intent.seat, combinationIds: freezeList(intent.combinationIds) });
    case "take":
      return Object.freeze({ kind: "take", seat: intent.seat, mode: modeView(intent.mode) });
    case "bid":
      return Object.freeze({ kind: "bid", seat: intent.seat, value: intent.value, mode: modeView(intent.mode) });
    case "pass":
    case "double":
    case "redouble":
      return Object.freeze({ kind: intent.kind, seat: intent.seat });
    case "requestRedeal":
      return Object.freeze({ kind: "requestRedeal", seat: intent.seat, reason: intent.reason });
    case "nextDeal":
      return Object.freeze({ kind: "nextDeal" });
  }
}

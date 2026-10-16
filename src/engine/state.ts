import type { Card } from "../card-primitives";
import type { BeloteEvent, BeloteState } from "./belote";
import type {
  AuctionAction,
  Contract,
  SelectionEvent,
  SelectionIntent,
  SelectionRejection,
} from "./contract";
import type { DeclarationCombination, DeclarationResolution } from "./declarations";
import type { EngineDeck } from "./deck";
import type { PreSelectionDeal, SeatDeal } from "./deal-interpreter";
import type { RedealIntent, RedealReason, RedealRequest } from "./redeal-request";
import type { EnginePlayedCard } from "./legal";
import type { MatchEvent, MatchState } from "./match";
import type { RngState } from "./rng";
import type { DealScore } from "./scoring";
import type { Seat, SideId } from "./seats";
import type { TrumpSelectionState } from "./trump-selection";
import type { VariantConfig } from "./variant-config";

/** The assembled engine state and its vocabulary (engine-design.md 2.4). */

export type PlayedTrick = Readonly<{
  leader: Seat;
  cards: readonly EnginePlayedCard[];
}>;

export type CompletedTrickRecord = PlayedTrick & Readonly<{ winner: Seat; points: number }>;

export type DeclarationsState = Readonly<{
  /** null until the seat declared (possibly nothing) before its first card. */
  declared: readonly (readonly DeclarationCombination[] | null)[];
  resolution: DeclarationResolution | null;
}>;

export type PlayState = Readonly<{
  contract: Contract;
  auction: readonly AuctionAction[];
  turnup: Readonly<Card> | null;
  seats: readonly SeatDeal[];
  toAct: Seat;
  firstLeader: Seat;
  trick: PlayedTrick;
  completed: readonly CompletedTrickRecord[];
  belote: BeloteState;
  declarations: DeclarationsState | null;
  /** Tableau columns whose hidden card turns over when the trick ends. */
  pendingReveals: readonly Readonly<{ seat: Seat; column: number }>[];
}>;

export type DealSummary = Readonly<{
  contract: Contract;
  score: DealScore;
  tricks: readonly CompletedTrickRecord[];
}>;

export type DealState =
  | Readonly<{
    phase: "cutting";
    /** The shuffled deck (or the gathered pile in a concours), face down: hidden from every seat. */
    deck: EngineDeck;
    cutter: Seat;
  }>
  | Readonly<{
    phase: "trumpSelection";
    dealt: PreSelectionDeal;
    selection: TrumpSelectionState;
  }>
  | Readonly<{ phase: "playing"; play: PlayState }>
  | Readonly<{
    phase: "betweenDeals";
    reason: "scored" | "allPassed" | "redealRequested";
    nextDealer: Seat;
    /** Who had the deal cancelled, and why (public: it was said aloud). */
    redealRequest: RedealRequest | null;
    /** The cards as gathered, kept for a cut-only redeal (concours). */
    pile: EngineDeck;
    lastDeal: DealSummary | null;
  }>
  | Readonly<{ phase: "matchFinished"; lastDeal: DealSummary | null }>;

export type DealPhase = DealState["phase"];

export type EngineState = Readonly<{
  config: VariantConfig;
  rng: RngState;
  /** Revision: +1 on every accepted intent, used by callers for idempotence. */
  seq: number;
  /** Deals started, redeals included. */
  dealNumber: number;
  dealer: Seat;
  /** The cut of the deal in hand (public); stale once `dealNumber` moves on. */
  lastCut: CutRecord | null;
  match: MatchState;
  deal: DealState;
}>;

export type CutRecord = Readonly<{ dealNumber: number; seat: Seat; position: number }>;

export type PlayIntent = Readonly<{
  kind: "play";
  seat: Seat;
  card: Readonly<Card>;
  /** Spoken belote: set on the first honour when the variant requires it. */
  belote?: boolean;
}>;

export type DeclareIntent = Readonly<{
  kind: "declare";
  seat: Seat;
  combinationIds: readonly string[];
}>;

/** Lift `position` cards from the top and put them under the rest. */
export type CutIntent = Readonly<{ kind: "cut"; seat: Seat; position: number }>;

export type { RedealIntent, RedealReason, RedealRequest };

export type Intent =
  | CutIntent
  | SelectionIntent
  | RedealIntent
  | DeclareIntent
  | PlayIntent
  | Readonly<{ kind: "nextDeal" }>;

export type EngineEvent =
  | SelectionEvent
  | BeloteEvent
  | MatchEvent
  | Readonly<{ type: "deal.cutRequested"; dealNumber: number; dealer: Seat; cutter: Seat }>
  | Readonly<{ type: "deal.cut"; seat: Seat; position: number }>
  | Readonly<{ type: "deal.started"; dealNumber: number; dealer: Seat }>
  | Readonly<{ type: "deal.redealRequested"; seat: Seat; reason: RedealReason }>
  | Readonly<{ type: "deal.redealt"; previousDealer: Seat; nextDealer: Seat }>
  | Readonly<{ type: "play.started"; leader: Seat }>
  | Readonly<{ type: "declarations.declared"; seat: Seat; combinationIds: readonly string[] }>
  | Readonly<{
    type: "declarations.resolved";
    winningSide: SideId | null;
    pointsBySide: readonly number[];
  }>
  | Readonly<{
    type: "card.played";
    seat: Seat;
    card: Readonly<Card>;
    trickIndex: number;
    fromTableau: boolean;
  }>
  | Readonly<{ type: "tableau.revealed"; seat: Seat; column: number; card: Readonly<Card> }>
  | Readonly<{ type: "trick.completed"; trickIndex: number; winner: Seat; points: number }>;

export type RejectionReason =
  | SelectionRejection
  | "unknownSeat"
  | "illegalCut"
  | "illegalRedeal"
  | "mustDeclare"
  | "illegalDeclaration"
  | "illegalCard"
  | "illegalBelote"
  | "matchFinished";

export type Transition = Readonly<{ ok: true; state: EngineState; events: readonly EngineEvent[] }>;
export type Rejection = Readonly<{ ok: false; reason: RejectionReason }>;
export type StepResult = Transition | Rejection;

export function reject(reason: RejectionReason): Rejection {
  return Object.freeze({ ok: false as const, reason });
}

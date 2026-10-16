import type { Rank, Suit } from "../card-primitives";
import type { AnnouncementKind } from "../rules/announcements";
import type { ContractMode } from "../rules/contract-mode";
import type { AuctionAction, ContractValue, DoublingLevel } from "./contract";
import type { DealOutcome } from "./scoring";
import type { Seat, SideId } from "./seats";
import type { DealPhase, Intent, RedealRequest } from "./state";
import type { VariantConfig, VariantRef } from "./variant-config";

/**
 * What one seat may know (engine-design.md section 3). Every field is public
 * at the table or private to the viewer; nothing else is ever copied in.
 */

export type CardView = Readonly<{ suit: Suit; rank: Rank }>;
export type PlayedCardView = Readonly<{ seat: Seat; card: CardView }>;

export type TableauColumnView = Readonly<{ visible: CardView | null; hiddenCount: 0 | 1 }>;

export type SeatPublicView = Readonly<{
  seat: Seat;
  /** Scoring side. */
  side: SideId;
  /** Seats on the same side this deal: the fixed partner, or the co-defender at three. */
  dealAllies: readonly Seat[];
  /** Cards in hand (the tableau is counted apart). */
  handCount: number;
  /** Belote à deux: the face-up layer, and whether a face-down card lies under it. */
  tableau: readonly TableauColumnView[] | null;
  tricksWon: number;
}>;

export type MyView = Readonly<{ seat: Seat; hand: readonly CardView[] }>;

/** The turned card; `taker` once someone took (it then sits in a known hand or tableau). */
export type TurnupView = Readonly<{ card: CardView; taker: Seat | null }>;

export type SelectionView = Readonly<{
  kind: "turnup" | "freeChoice" | "auction";
  /** Turn-up rounds; null for the other selections. */
  round: 1 | 2 | null;
  highest: Readonly<{ seat: Seat; value: ContractValue; mode: ContractMode }> | null;
  doubledBy: Seat | null;
}>;

export type ContractView = Readonly<{
  taker: Seat;
  side: SideId;
  mode: ContractMode;
  value: ContractValue | null;
  doubling: DoublingLevel;
  doubledBy: Seat | null;
}>;

export type BeloteView = Readonly<{ seat: Seat; suit: Suit; stage: "belote" | "rebelote" }>;

export type AnnouncementLabel = Readonly<{ kind: AnnouncementKind; points: number }>;

export type DeclarationsView = Readonly<{
  /** null while the seat has not spoken yet; the kinds it announced afterwards. */
  bySeat: readonly Readonly<{ seat: Seat; announced: readonly AnnouncementLabel[] | null }>[];
  resolved: boolean;
  winningSide: SideId | null;
  pointsBySide: readonly number[] | null;
  /** The winning side's combinations, shown card by card once resolved. */
  shown: readonly Readonly<{ seat: Seat; kind: AnnouncementKind; points: number; cards: readonly CardView[] }>[];
}>;

/**
 * The cut of the deal: who cuts, the deck size and the legal positions while
 * the deck waits (`position` null), then where it was cut. Never the cards.
 */
export type CutView = Readonly<{
  cutter: Seat;
  deckSize: number;
  min: number;
  max: number;
  position: number | null;
}>;

export type TrickView = Readonly<{ leader: Seat; cards: readonly PlayedCardView[] }>;

export type CompletedTrickView = Readonly<{
  /** 0-based order in the deal: with `trickHistory: lastTrickOnly` earlier tricks are left out. */
  index: number;
  leader: Seat;
  cards: readonly PlayedCardView[];
  winner: Seat;
  points: number;
}>;

export type DealScoreView = Readonly<{
  outcome: DealOutcome;
  winnerSide: SideId;
  capotSide: SideId | null;
  totals: readonly number[];
  dealMarks: readonly number[];
  litigeAwarded: Readonly<{ side: SideId; points: number }> | null;
  marks: readonly number[];
  litigePending: number | null;
}>;

export type LastDealView = Readonly<{
  contract: ContractView;
  score: DealScoreView;
  tricks: readonly CompletedTrickView[];
}>;

export type ScoreView = Readonly<{
  sides: readonly SideId[];
  match: readonly number[];
  target: number | null;
  formatId: string | null;
  dealsLeft: number | null;
  scoredDeals: number;
  litigePending: number | null;
  locks: readonly boolean[];
  finished: boolean;
  winner: SideId | null;
  lastDeal: LastDealView | null;
}>;

export type SeatView = Readonly<{
  variant: VariantRef;
  /** The resolved table rules: public, and what bots and `knowledge` read. */
  rules: VariantConfig;
  viewer: Seat | "spectator";
  seq: number;
  phase: DealPhase;
  dealNumber: number;
  dealer: Seat;
  toAct: Seat | null;
  seats: readonly SeatPublicView[];
  me: MyView | null;
  /** Cards still to be dealt (the stéphanoise reserve, the stock before completion). */
  undealtCount: number;
  /** The cut: asked while `phase` is `cutting`, then shown for the deal it opened. */
  cut: CutView | null;
  turnup: TurnupView | null;
  selection: SelectionView | null;
  /** Every selection speech of this deal, in order. */
  auction: readonly AuctionAction[];
  contract: ContractView | null;
  belotes: readonly BeloteView[];
  declarations: DeclarationsView | null;
  trick: TrickView | null;
  tricksPlayed: number;
  completedTricks: readonly CompletedTrickView[];
  score: ScoreView;
  /** Between deals: the seat that had the deal cancelled and why (main nulle, misère, carré de 7). */
  redealRequest: RedealRequest | null;
  /** The viewer's legal intents: empty for a spectator or out of turn. */
  legal: readonly Intent[];
}>;

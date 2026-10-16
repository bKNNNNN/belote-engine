import type { Contract } from "../contract";
import type { Seat, SideId } from "../seats";

/**
 * What a scoring kernel needs from a finished deal, by scoring side. Card
 * points include the last-trick bonus: 10 to the last trick, or 100 to a side
 * that won every trick (252 at a capot); at three seats the bonus disappears
 * when a player is capot (Wikipédia).
 */
export type DealFacts = Readonly<{
  taker: Seat;
  takerSide: SideId;
  contract: Contract;
  cardPoints: readonly number[];
  tricks: readonly number[];
  /** Tricks won by the taking seat alone (générale). */
  takerTricks: number;
  totalTricks: number;
  belote: readonly number[];
  declarations: readonly number[];
}>;

export type DealOutcome = "made" | "failed" | "litige";

export type DealScore = Readonly<{
  outcome: DealOutcome;
  /** The side that won the deal: it collects a pending litige. */
  winnerSide: SideId;
  capotSide: SideId | null;
  /** Totals that decided the contract (points, belote, counted announcements). */
  totals: readonly number[];
  /** Marks of this deal alone. */
  dealMarks: readonly number[];
  litigeAwarded: Readonly<{ side: SideId; points: number }> | null;
  /** Marks added to the match: deal marks plus any litige awarded. */
  marks: readonly number[];
  litigePending: number | null;
}>;

export function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function capotSideOf(facts: DealFacts): number | null {
  const side = facts.tricks.findIndex((count) => count === facts.totalTricks);
  return side < 0 ? null : side;
}

export function roundMark(points: number, to: 1 | 5 | 10): number {
  return to === 1 ? points : Math.floor((points + to / 2) / to) * to;
}

export function withoutLitige(
  facts: DealFacts,
  result: Omit<DealScore, "marks" | "litigeAwarded" | "litigePending">,
): DealScore {
  return Object.freeze({
    ...result,
    totals: Object.freeze([...result.totals]),
    dealMarks: Object.freeze([...result.dealMarks]),
    marks: Object.freeze([...result.dealMarks]),
    litigeAwarded: null,
    litigePending: null,
    capotSide: result.capotSide,
    winnerSide: result.winnerSide ?? facts.takerSide,
  });
}

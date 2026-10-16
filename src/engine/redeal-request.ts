import type { Card, Rank } from "../card-primitives";
import type { Seat } from "./seats";
import type { TrumpSelectionState } from "./trump-selection";
import type { VariantConfig } from "./variant-config";

/**
 * Weak-hand redeals (`config.redeals`): at its first speech of the deal, a
 * seat whose hand qualifies may have the deal cancelled. Legality reads the
 * seat's own hand only, so it says nothing about the other hands.
 *
 * - `mainNulle` (turn-up family): no card of the turned suit and fewer than
 *   `below` points among the cards held (5 in a classique deal).
 * - `misere` (auction family): fewer than `below` points among the cards held.
 * - `carreDeSept`: the four sevens among the cards held.
 *
 * Points are the plain card values (A 11, 10 10, K 4, Q 3, J 2), the trump
 * being unknown (auction) or not held (main nulle).
 */

export const REDEAL_REASONS = ["mainNulle", "misere", "carreDeSept"] as const;
export type RedealReason = (typeof REDEAL_REASONS)[number];

export type RedealRequest = Readonly<{ seat: Seat; reason: RedealReason }>;

export type RedealIntent = Readonly<{ kind: "requestRedeal"; seat: Seat; reason: RedealReason }>;

const PLAIN_POINTS: Readonly<Record<Rank, number>> = Object.freeze({
  A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0,
});

export function plainHandPoints(hand: readonly Readonly<Card>[]): number {
  return hand.reduce((total, card) => total + PLAIN_POINTS[card.rank], 0);
}

function isFirstSpeech(selection: TrumpSelectionState, seat: Seat): boolean {
  return selection.status.kind === "open"
    && selection.toAct === seat
    && !selection.history.some((action) => action.seat === seat);
}

function qualifies(
  config: VariantConfig,
  selection: TrumpSelectionState,
  hand: readonly Readonly<Card>[],
  reason: RedealReason,
): boolean {
  const rules = config.redeals;
  switch (reason) {
    case "mainNulle":
      return rules.mainNulle !== null
        && selection.kind === "turnup"
        && !hand.some(({ suit }) => suit === selection.turnup.suit)
        && plainHandPoints(hand) < rules.mainNulle.below;
    case "misere":
      return rules.misere !== null
        && selection.kind === "auction"
        && plainHandPoints(hand) < rules.misere.below;
    case "carreDeSept":
      return rules.carreDeSept && hand.filter(({ rank }) => rank === "7").length === 4;
  }
}

/** The redeal requests open to `seat`, in `REDEAL_REASONS` order. */
export function legalRedeals(
  config: VariantConfig,
  selection: TrumpSelectionState,
  hand: readonly Readonly<Card>[],
  seat: Seat,
): readonly RedealIntent[] {
  if (!isFirstSpeech(selection, seat)) return Object.freeze([]);
  return Object.freeze(REDEAL_REASONS
    .filter((reason) => qualifies(config, selection, hand, reason))
    .map((reason) => Object.freeze({ kind: "requestRedeal" as const, seat, reason })));
}

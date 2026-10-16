import type { Card } from "../card-primitives";
import {
  cardStrengthForMode,
  legalMovesForMode,
  trickWinnerForMode,
} from "../rules/contract-card-policy";
import type { ContractMode } from "../rules/contract-mode";
import { assertSeat, dealAllies, type Seat } from "./seats";
import type { PlayRules, TableConfig } from "./variant-config";

/**
 * Card legality for any table size. The verified `legalMovesForMode` policy is
 * called unchanged; three layers wrap it (engine-design.md section 2.5):
 * playable cards include the visible tableau, the partner is the deal ally,
 * and the partner-master and all-trump options filter the policy result.
 */

export type EnginePlayedCard = Readonly<{ seat: Seat; card: Readonly<Card> }>;

export type LegalContext = Readonly<{
  table: Pick<TableConfig, "seats" | "sides" | "direction">;
  play: PlayRules;
  mode: ContractMode;
  hand: readonly Readonly<Card>[];
  tableauVisible: readonly Readonly<Card>[];
  trick: readonly EnginePlayedCard[];
  seat: Seat;
  taker: Seat | null;
}>;

type PolicyCard = Readonly<{ player: number; card: Readonly<Card> }>;

/**
 * The policy decides "partner" by seat parity. Renumbering the trick around
 * the player (self 0, allies 2, everybody else odd) makes parity mean "deal
 * ally" at any table size, without touching the policy.
 */
function policyTrick(
  context: LegalContext,
  allies: readonly Seat[],
): readonly PolicyCard[] {
  return context.trick.map(({ seat, card }) => {
    assertSeat(context.table, seat);
    return { player: allies.includes(seat) ? 2 : 1, card };
  });
}

function partnerIsMaster(
  context: LegalContext,
  trick: readonly PolicyCard[],
): boolean {
  if (context.mode.kind !== "suit" || trick.length === 0) return false;
  const led = trick[0]!.card.suit;
  const playable = [...context.hand, ...context.tableauVisible];
  return !playable.some(({ suit }) => suit === led)
    && trickWinnerForMode(trick, context.mode) === 2;
}

function overtrumpsOnly(
  context: LegalContext,
  playable: readonly Readonly<Card>[],
  trick: readonly PolicyCard[],
): readonly Readonly<Card>[] {
  const mode = context.mode;
  if (mode.kind !== "suit") return playable;
  const strongest = Math.max(-Infinity, ...trick
    .filter(({ card }) => card.suit === mode.suit)
    .map(({ card }) => cardStrengthForMode(card, mode)));
  const allowed = playable.filter((card) =>
    card.suit !== mode.suit || cardStrengthForMode(card, mode) > strongest);
  return allowed.length > 0 ? allowed : playable;
}

function withoutClimb(
  context: LegalContext,
  playable: readonly Readonly<Card>[],
): readonly Readonly<Card>[] {
  const led = context.trick[0]?.card.suit;
  const matching = playable.filter(({ suit }) => suit === led);
  return matching.length > 0 ? matching : playable;
}

export function legalCards(context: LegalContext): readonly Readonly<Card>[] {
  assertSeat(context.table, context.seat);
  const playable = [...context.hand, ...context.tableauVisible];
  const allies = dealAllies(context.table, context.seat, context.taker);
  const trick = policyTrick(context, allies);
  if (context.mode.kind === "all-trump" && !context.play.allTrumpMustClimb) {
    return Object.freeze(withoutClimb(context, playable));
  }
  if (partnerIsMaster(context, trick)) {
    if (context.play.partnerMaster === "mustTrump") {
      const asOpponent = trick.map((played) => ({ ...played, player: 1 }));
      return legalMovesForMode(playable, asOpponent, context.mode, 0, context.play.undertrump);
    }
    if (context.play.partnerMaster === "mustOvertrumpOnly") {
      return Object.freeze(overtrumpsOnly(context, playable, trick));
    }
  }
  return legalMovesForMode(playable, trick, context.mode, 0, context.play.undertrump);
}

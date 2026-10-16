import type { Card } from "../card-primitives";
import { trickWinnerForMode } from "../rules/contract-card-policy";
import type { ContractMode } from "../rules/contract-mode";
import { virtualCard } from "./card-scale";
import { cardKey } from "./deck";
import type { SeatDeal } from "./deal-interpreter";
import { legalCards, type EnginePlayedCard } from "./legal";
import type { Seat } from "./seats";
import type { VariantConfig } from "./variant-config";

/**
 * Legality and trick winner for the assembled engine: the verified policy
 * (`legal.ts`, `trickWinnerForMode`) runs on virtual cards, so the Cavaillon
 * inversion changes nothing else.
 */

export function visibleTableau(seat: SeatDeal): readonly Readonly<Card>[] {
  return seat.tableau.flatMap(({ visible }) => visible === null ? [] : [visible]);
}

export function playableCards(seat: SeatDeal): readonly Readonly<Card>[] {
  return [...seat.hand, ...visibleTableau(seat)];
}

export function legalPlayCards(
  config: VariantConfig,
  mode: ContractMode,
  seats: readonly SeatDeal[],
  trick: readonly EnginePlayedCard[],
  seat: Seat,
  taker: Seat,
): readonly Readonly<Card>[] {
  const virtual = (card: Readonly<Card>) => virtualCard(config.cards, mode, card);
  const holding = seats[seat]!;
  const originals = new Map(playableCards(holding).map((card) => [cardKey(virtual(card)), card]));
  const legal = legalCards({
    table: config.table,
    play: config.play,
    mode,
    hand: holding.hand.map(virtual),
    tableauVisible: visibleTableau(holding).map(virtual),
    trick: trick.map((played) => ({ seat: played.seat, card: virtual(played.card) })),
    seat,
    taker,
  });
  return Object.freeze(legal.map((card) => originals.get(cardKey(card))!));
}

export function trickWinner(
  config: VariantConfig,
  mode: ContractMode,
  trick: readonly EnginePlayedCard[],
): Seat {
  return trickWinnerForMode(
    trick.map(({ seat, card }) => ({ player: seat, card: virtualCard(config.cards, mode, card) })),
    mode,
  );
}

/** Removes a played card from the hand or from the visible tableau layer. */
export function withoutCard(
  holding: SeatDeal,
  card: Readonly<Card>,
): Readonly<{ holding: SeatDeal; fromColumn: number | null }> {
  const key = cardKey(card);
  if (holding.hand.some((held) => cardKey(held) === key)) {
    return {
      holding: Object.freeze({
        ...holding,
        hand: Object.freeze(holding.hand.filter((held) => cardKey(held) !== key)),
      }),
      fromColumn: null,
    };
  }
  const column = holding.tableau.findIndex(({ visible }) => visible !== null && cardKey(visible) === key);
  if (column < 0) throw new RangeError("The card is not playable by this seat");
  return {
    holding: Object.freeze({
      ...holding,
      tableau: Object.freeze(holding.tableau.map((entry, index) =>
        index === column ? Object.freeze({ ...entry, visible: null }) : entry)),
    }),
    fromColumn: column,
  };
}

/** Turns the hidden card of a column face up once its visible card is gone. */
export function revealColumn(holding: SeatDeal, column: number): SeatDeal {
  const entry = holding.tableau[column]!;
  if (entry.visible !== null || entry.hidden === null) return holding;
  return Object.freeze({
    ...holding,
    tableau: Object.freeze(holding.tableau.map((current, index) =>
      index === column ? Object.freeze({ hidden: null, visible: current.hidden }) : current)),
  });
}

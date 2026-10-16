import type { ContractMode } from "../rules/contract-mode";
import { virtualCard } from "./card-scale";
import { cardKey } from "./deck";
import { legalCards } from "./legal";
import type { Seat } from "./seats";
import type { VariantConfig } from "./variant-config";
import type { CardView, PlayedCardView } from "./view-types";

/**
 * Deductions from the cards each seat played. Legality is monotone: holding
 * more cards never lifts an obligation (follow, trump, overtrump, climb). So
 * if card `p` would have been illegal for a hand holding only `p` and `x`, a
 * seat that played `p` did not hold `x` then, nor afterwards: hands only
 * shrink during play. With a tableau the same holds for hand plus face-up
 * layer, which the hypothetical hand does not need to know.
 */

export type PlayContext = Readonly<{
  config: VariantConfig;
  mode: ContractMode;
  taker: Seat;
  viewer: Seat | null;
}>;

export type Located = Readonly<{ seat: Seat; card: CardView }>;

export type SeatHolding = Readonly<{
  seat: Seat;
  handCount: number;
  excluded: ReadonlySet<string>;
}>;

function wouldBeLegal(
  context: PlayContext,
  prefix: readonly PlayedCardView[],
  seat: Seat,
  played: CardView,
  other: CardView,
): boolean {
  const { config, mode } = context;
  const virtual = (card: CardView) => virtualCard(config.cards, mode, card);
  const target = cardKey(virtual(played));
  const legal = legalCards({
    table: config.table,
    play: config.play,
    mode,
    hand: [virtual(played), virtual(other)],
    tableauVisible: [],
    trick: prefix.map((entry) => ({ seat: entry.seat, card: virtual(entry.card) })),
    seat,
    taker: context.taker,
  });
  return legal.some((card) => cardKey(card) === target);
}

/** For each other seat, the candidate cards its own plays prove it does not hold. */
export function exclusionsFromPlays(
  context: PlayContext,
  tricks: readonly (readonly PlayedCardView[])[],
  candidates: readonly CardView[],
): ReadonlyMap<Seat, ReadonlySet<string>> {
  const excluded = new Map<Seat, Set<string>>();
  for (const cards of tricks) {
    cards.forEach((entry, index) => {
      if (index === 0 || entry.seat === context.viewer) return;
      const prefix = cards.slice(0, index);
      const seen = excluded.get(entry.seat) ?? new Set<string>();
      excluded.set(entry.seat, seen);
      for (const candidate of candidates) {
        const key = cardKey(candidate);
        if (!seen.has(key) && !wouldBeLegal(context, prefix, entry.seat, entry.card, candidate)) seen.add(key);
      }
    });
  }
  return excluded;
}

function possibleFor(holding: SeatHolding, unseen: readonly CardView[]): readonly CardView[] {
  return unseen.filter((card) => !holding.excluded.has(cardKey(card)));
}

/**
 * Places unseen cards by elimination, to a fixpoint:
 * - a seat whose possible cards are exactly as many as its free hand slots
 *   holds all of them;
 * - with every card accounted for (full history, nothing face down or still
 *   to deal), a card that only one seat can hold is in that seat's hand.
 */
export function locateByElimination(
  holdings: readonly SeatHolding[],
  initialUnseen: readonly CardView[],
  initialLocated: readonly Located[],
  everyCardAccounted: boolean,
): Readonly<{ unseen: readonly CardView[]; located: readonly Located[] }> {
  let unseen = initialUnseen;
  let located = initialLocated;
  const free = (holding: SeatHolding) =>
    holding.handCount - located.filter(({ seat }) => seat === holding.seat).length;
  for (let pass = 0; pass < 64; pass += 1) {
    const found: Located[] = [];
    for (const holding of holdings) {
      const possible = possibleFor(holding, unseen);
      if (possible.length > 0 && possible.length === free(holding)) {
        found.push(...possible.map((card) => ({ seat: holding.seat, card })));
      }
    }
    if (found.length === 0 && everyCardAccounted) {
      for (const card of unseen) {
        const holders = holdings.filter((holding) => !holding.excluded.has(cardKey(card)) && free(holding) > 0);
        if (holders.length === 1) found.push({ seat: holders[0]!.seat, card });
      }
    }
    const fresh = found.filter((entry, index) =>
      found.findIndex(({ card }) => cardKey(card) === cardKey(entry.card)) === index);
    if (fresh.length === 0) break;
    const placed = new Set(fresh.map(({ card }) => cardKey(card)));
    unseen = unseen.filter((card) => !placed.has(cardKey(card)));
    located = [...located, ...fresh];
  }
  return { unseen, located };
}

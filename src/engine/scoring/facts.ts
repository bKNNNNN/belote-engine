import type { Card } from "../../card-primitives";
import { trickCardPoints } from "../card-scale";
import type { Contract } from "../contract";
import { sideOf, sidesOf, type Seat } from "../seats";
import type { VariantConfig } from "../variant-config";
import type { DealFacts } from "./types";

export type CompletedTrick = Readonly<{
  cards: readonly Readonly<{ seat: Seat; card: Readonly<Card> }>[];
  winner: Seat;
}>;

export type DealFactsInput = Readonly<{
  contract: Contract;
  tricks: readonly CompletedTrick[];
  beloteBySeat: readonly number[];
  declarationsBySide: readonly number[];
}>;

function lastTrickBonus(
  config: VariantConfig,
  tricksBySide: readonly number[],
  totalTricks: number,
): Readonly<{ points: number; capot: boolean }> {
  if (config.scoring.kind === "takerVsEach") {
    const someoneCapot = tricksBySide.some((count) => count === 0);
    return { points: someoneCapot && config.scoring.cancelLastTrickOnCapot ? 0 : config.cards.lastTrickBonus, capot: false };
  }
  const capot = tricksBySide.some((count) => count === totalTricks);
  return { points: capot ? config.cards.capotLastTrickBonus : config.cards.lastTrickBonus, capot };
}

/** Aggregates a finished deal into the facts every scoring kernel reads. */
export function dealFacts(config: VariantConfig, input: DealFactsInput): DealFacts {
  const sides = sidesOf(config.table);
  const mode = input.contract.mode;
  const sideTotal = (entries: readonly Readonly<{ seat: Seat; value: number }>[]) =>
    sides.map((side) => entries
      .filter(({ seat }) => sideOf(config.table, seat) === side)
      .reduce((total, { value }) => total + value, 0));
  const won = input.tricks.map(({ cards, winner }) => ({
    seat: winner,
    value: trickCardPoints(config, mode, cards.map(({ card }) => card)),
  }));
  const tricks = sideTotal(won.map(({ seat }) => ({ seat, value: 1 })));
  const totalTricks = input.tricks.length;
  const bonus = lastTrickBonus(config, tricks, totalTricks);
  const last = input.tricks.at(-1);
  const bonusEntry = last === undefined ? [] : [{ seat: last.winner, value: bonus.points }];
  const belote = sideTotal(input.beloteBySeat.map((value, seat) => ({ seat, value })));
  const taker = input.contract.taker;
  return Object.freeze({
    taker,
    takerSide: sideOf(config.table, taker),
    contract: input.contract,
    cardPoints: Object.freeze(sideTotal([...won, ...bonusEntry])),
    tricks: Object.freeze(tricks),
    takerTricks: input.tricks.filter(({ winner }) => winner === taker).length,
    totalTricks,
    belote: Object.freeze(belote),
    declarations: Object.freeze([...input.declarationsBySide]),
  });
}

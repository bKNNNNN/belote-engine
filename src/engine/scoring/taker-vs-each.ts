import type { VariantConfig } from "../variant-config";
import { withoutLitige, type DealFacts, type DealScore } from "./types";

/**
 * Belote à trois (Wikipédia « Belote »): the taker must beat each opponent.
 * An opponent who makes at least as much (equality is a règle maison) puts
 * him « dedans » and scores its points plus the taker's card points; the
 * third keeps its own. When both opponents beat him, the higher one collects;
 * equal opponents split, the odd point going to the first after the taker. A
 * seat without a trick is capot: each of the two others scores a bonus.
 */

function capotBonuses(config: VariantConfig, facts: DealFacts): readonly number[] {
  if (config.scoring.kind !== "takerVsEach") throw new TypeError("Not a taker-vs-each variant");
  const bonus = config.scoring.capotBonusPerOpponent;
  const capoted = facts.tricks.flatMap((count, seat) => count === 0 ? [seat] : []);
  return facts.tricks.map((_, seat) =>
    capoted.filter((other) => other !== seat).length * bonus);
}

function orderAfter(seats: number, taker: number): readonly number[] {
  return Array.from({ length: seats - 1 }, (_, offset) => (taker + 1 + offset) % seats);
}

export function scoreTakerVsEach(config: VariantConfig, facts: DealFacts): DealScore {
  const taker = facts.takerSide;
  const seats = facts.cardPoints.length;
  const totals = facts.cardPoints.map((points, seat) => points + facts.belote[seat]!);
  const opponents = orderAfter(seats, taker);
  const best = Math.max(...opponents.map((seat) => totals[seat]!));
  const made = best < totals[taker]!;
  const bonuses = capotBonuses(config, facts);
  if (made) {
    return withoutLitige(facts, {
      outcome: "made",
      winnerSide: taker,
      capotSide: null,
      totals,
      dealMarks: totals.map((total, seat) => total + bonuses[seat]!),
    });
  }
  const toDefence = config.belote?.onFailedContract === "toDefence";
  const transfer = facts.cardPoints[taker]! + (toDefence ? facts.belote[taker]! : 0);
  const collectors = opponents.filter((seat) => totals[seat] === best);
  const share = Math.floor(transfer / collectors.length);
  const remainder = transfer - share * collectors.length;
  const dealMarks = totals.map((total, seat) => {
    if (seat === taker) return (toDefence ? 0 : facts.belote[taker]!) + bonuses[seat]!;
    const index = collectors.indexOf(seat);
    const gained = index < 0 ? 0 : share + (index === 0 ? remainder : 0);
    return total + gained + bonuses[seat]!;
  });
  return withoutLitige(facts, {
    outcome: "failed",
    winnerSide: collectors[0]!,
    capotSide: null,
    totals,
    dealMarks,
  });
}

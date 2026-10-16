import type { ScoringRules, VariantConfig } from "../variant-config";
import {
  capotSideOf,
  roundMark,
  sumOf,
  type DealFacts,
  type DealOutcome,
  type DealScore,
} from "./types";

/**
 * Classic split (port of `belote-classic/scoring.ts`): each side marks what it
 * made when the takers beat the defence; on a failure the defence takes every
 * point and every announcement; on a tie the litige either carries the takers'
 * points to the winner of the next deal, or settles for one side.
 */

type ClassicSplitRules = Extract<ScoringRules, { kind: "classicSplit" }>;

function rulesOf(config: VariantConfig): ClassicSplitRules {
  if (config.scoring.kind !== "classicSplit") throw new TypeError("Not a classic split variant");
  return config.scoring;
}

/** A capoted side loses its announcements; with the transfer option the capot side takes them. */
function declarationsAfterCapot(
  config: VariantConfig,
  facts: DealFacts,
  capotSide: number | null,
): readonly number[] {
  if (capotSide === null) return facts.declarations;
  const transferred = config.declarations?.capotTransfersOpponents === true;
  const lost = sumOf(facts.declarations) - facts.declarations[capotSide]!;
  return facts.declarations.map((points, side) =>
    side === capotSide ? points + (transferred ? lost : 0) : 0);
}

function outcomeOf(rules: ClassicSplitRules, taker: number, defence: number): DealOutcome {
  if (taker > defence) return "made";
  if (taker < defence) return "failed";
  if (rules.tie === "takerWins") return "made";
  return rules.tie === "defenceWins" ? "failed" : "litige";
}

export function scoreClassicSplit(
  config: VariantConfig,
  facts: DealFacts,
  pendingLitige: number | null,
): DealScore {
  const rules = rulesOf(config);
  const taker = facts.takerSide;
  const defence = 1 - taker;
  const capotSide = capotSideOf(facts);
  const points = facts.cardPoints.map((value, side) =>
    capotSide === side ? rules.capot.points : value);
  const declarations = declarationsAfterCapot(config, facts, capotSide);
  const counted = config.declarations?.countTowardContract !== false;
  const totals = points.map((value, side) =>
    value + facts.belote[side]! + (counted ? declarations[side]! : 0));
  const outcome = outcomeOf(rules, totals[taker]!, totals[defence]!);
  const made = points.map((value, side) => value + facts.belote[side]! + declarations[side]!);
  const beloteToDefence = config.belote?.onFailedContract === "toDefence";
  const keepsBelote = rules.failure.takerKeepsBelote && !beloteToDefence;
  const byOutcome: Readonly<Record<DealOutcome, () => readonly number[]>> = {
    made: () => made,
    litige: () => made.map((value, side) => side === taker ? 0 : value),
    failed: () => made.map((_, side) => side === taker
      ? (keepsBelote ? facts.belote[taker]! : 0)
      : sumOf(points) + facts.belote[defence]! + sumOf(declarations)
        + (beloteToDefence ? facts.belote[taker]! : 0)),
  };
  const dealMarks = byOutcome[outcome]().map((value) => roundMark(value, rules.rounding));
  const winnerSide = outcome === "made" ? taker : defence;
  const award = pendingLitige === null ? null : Object.freeze({ side: winnerSide, points: pendingLitige });
  return Object.freeze({
    outcome,
    winnerSide,
    capotSide,
    totals: Object.freeze(totals),
    dealMarks: Object.freeze(dealMarks),
    litigeAwarded: award,
    marks: Object.freeze(dealMarks.map((value, side) =>
      value + (award?.side === side ? award.points : 0))),
    litigePending: outcome === "litige" ? totals[taker]! : null,
  });
}

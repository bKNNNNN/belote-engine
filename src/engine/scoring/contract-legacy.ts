import type { VariantConfig } from "../variant-config";
import { capotSideOf, withoutLitige, type DealFacts, type DealScore } from "./types";

/**
 * The frozen `scoreRound` of contree@2, kept only to replay its logs
 * (engine-design.md 1.4). It reproduces bugs 2.1 to 2.3 on purpose: the
 * defence loses its belote on a failure, a capot counts the last trick 10,
 * and a doubled contract leaves the defence its points. `contree@3` uses the
 * corrected kernel. Never use this method for a new preset.
 */

const LEGACY_CAPOT_VALUE = 250;
const LEGACY_FAILURE_BASE = 160;

export function scoreLegacyContree2(config: VariantConfig, facts: DealFacts): DealScore {
  const rules = config.scoring;
  if (rules.kind !== "contract") throw new TypeError("Not a contract variant");
  const taker = facts.takerSide;
  const defence = 1 - taker;
  const capotSide = capotSideOf(facts);
  const lastTrickExcess = config.cards.capotLastTrickBonus - config.cards.lastTrickBonus;
  const raw = facts.cardPoints.map((points, side) =>
    points - (side === capotSide ? lastTrickExcess : 0) + facts.belote[side]!);
  const capot = facts.contract.value === "capot";
  const value = capot ? LEGACY_CAPOT_VALUE : facts.contract.value as number;
  const multiplier = facts.contract.doubling === 0 ? 1 : rules.doubling.multipliers[facts.contract.doubling - 1]!;
  const made = capot ? facts.tricks[taker] === facts.totalTricks : raw[taker]! >= value;
  const dealMarks = made
    ? raw.map((points, side) => side === taker ? value * multiplier + points : points)
    : raw.map((_, side) => side === taker
      ? facts.belote[taker]!
      : (value + LEGACY_FAILURE_BASE) * multiplier);
  return withoutLitige(facts, {
    outcome: made ? "made" : "failed",
    winnerSide: made ? taker : defence,
    capotSide,
    totals: raw,
    dealMarks,
  });
}

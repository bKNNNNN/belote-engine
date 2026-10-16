import type { ScoringRules, VariantConfig } from "../variant-config";
import { scoreLegacyContree2 } from "./contract-legacy";
import {
  capotSideOf,
  roundMark,
  sumOf,
  withoutLitige,
  type DealFacts,
  type DealScore,
} from "./types";

/**
 * Contract scoring, parameterised (port of `coinche-scoring.ts`): points faits
 * or points annoncés, success rule, capot and générale, doubling scope, the
 * Marquez no-trump factor and rounding. `coinche@1` is the default reading;
 * every other preset changes one documented parameter.
 */

export type ContractRules = Extract<ScoringRules, { kind: "contract" }>;

type Sides = Readonly<{
  taker: number;
  defence: number;
  made: boolean;
  multiplier: number;
  factor: number;
  points: readonly number[];
  declarations: readonly number[];
  belote: readonly number[];
}>;

export function contractRulesOf(config: VariantConfig): ContractRules {
  if (config.scoring.kind !== "contract") throw new TypeError("Not a contract variant");
  return config.scoring;
}

export function multiplierOf(rules: ContractRules, doubling: 0 | 1 | 2): number {
  return doubling === 0 ? 1 : rules.doubling.multipliers[doubling - 1]!;
}

/** A capot made by the takers brings them the defence's announcements (FFB 2015). */
function declarationsAfterCapot(facts: DealFacts, capotSide: number | null): readonly number[] {
  if (capotSide === null || capotSide !== facts.takerSide) return facts.declarations;
  const total = sumOf(facts.declarations);
  return facts.declarations.map((_, side) => side === capotSide ? total : 0);
}

function reachesBid(rules: ContractRules, facts: DealFacts, totals: readonly number[]): boolean {
  const { contract, takerSide } = facts;
  if (contract.value === "capot") return facts.tricks[takerSide] === facts.totalTricks;
  if (contract.value === "generale") return facts.takerTricks === facts.totalTricks;
  const counted = rules.rounding.neverDecidesContract
    ? totals[takerSide]!
    : roundMark(totals[takerSide]!, rules.rounding.to);
  return counted >= (contract.value ?? 0) + rules.success.margin;
}

/**
 * The bid is reached on the takers' own totals (the no-trump factor only
 * scales the mark). Like `coinche-scoring.ts`, the comparison with the
 * defence uses the totals before a capot moves the announcements.
 */
function reachesContract(rules: ContractRules, facts: DealFacts, totals: readonly number[]): boolean {
  if (!reachesBid(rules, facts, totals)) return false;
  const taker = totals[facts.takerSide]!;
  const defence = totals[1 - facts.takerSide]!;
  if (rules.success.versusDefence === "strictlyMore") return taker > defence;
  if (rules.success.versusDefence === "notLess") return taker >= defence;
  return true;
}

function specialMarks(rules: ContractRules, facts: DealFacts, sides: Sides): readonly number[] {
  const winner = sides.made ? sides.taker : sides.defence;
  const generale = facts.contract.value === "generale";
  const base = generale
    ? (sides.made ? rules.generale!.made : rules.generale!.failed)
    : (sides.made ? rules.capot.bidMade : rules.capot.bidFailed);
  const special = generale ? rules.generale!.made / 2 : 250;
  const extras = sumOf(sides.declarations) + sides.belote[winner]!;
  const included = rules.doubling.multipliedIncludes === "declarationsAndTakerBelote";
  const scope = rules.doubling.scope;
  const won = rules.method === "pointsAnnonces" || scope === "contractPlusBase" || scope === "wholeScore"
    ? (base + (sides.factor - 1) * special + (included ? extras : 0)) * sides.multiplier
      + (included ? 0 : extras)
    : base + (sides.multiplier * sides.factor - 1) * special + extras;
  return sides.belote.map((value, side) => side === winner ? won : value);
}

function pointsAnnoncesMarks(rules: ContractRules, facts: DealFacts, sides: Sides): readonly number[] {
  const value = (facts.contract.value as number) * sides.factor;
  if (!sides.made) {
    return sides.belote.map((belote, side) => side === sides.defence
      ? value * sides.multiplier + belote + sumOf(sides.declarations)
      : belote);
  }
  const capotBonus = rules.capot.unbidBonus === "250PlusContract"
    && facts.tricks[sides.taker] === facts.totalTricks ? 250 : 0;
  return sides.belote.map((belote, side) => belote + sides.declarations[side]!
    + (side === sides.taker ? (value + capotBonus) * sides.multiplier : 0));
}

function madeMarks(rules: ContractRules, facts: DealFacts, sides: Sides, value: number): readonly number[] {
  const { taker, defence, multiplier, belote, declarations } = sides;
  const takerCapot = facts.tricks[taker] === facts.totalTricks;
  const takerPoints = takerCapot && rules.capot.unbidBonus === "250PlusContract"
    ? 250
    : sides.points[taker]!;
  const plain = [0, 1].map((side) => side === taker
    ? takerPoints + belote[taker]! + declarations[taker]! + value
    : sides.points[defence]! + belote[defence]! + declarations[defence]!);
  if (multiplier === 1) return plain;
  const base = takerCapot ? 250 : 160;
  const extras = sumOf(declarations) + belote[taker]!;
  const included = rules.doubling.multipliedIncludes === "declarationsAndTakerBelote";
  const winnerMark = {
    contractPlusBase: () => (base + value + (included ? extras : 0)) * multiplier + (included ? 0 : extras),
    wholeScore: () => plain[taker]! * multiplier,
    contract: () => plain[taker]! + (multiplier - 1) * value,
    fixedBasePlusMultipliedContract: () => base + multiplier * value + extras,
  }[rules.doubling.scope]();
  const defenceMark = rules.doubling.scope === "contract" ? plain[defence]! : belote[defence]!;
  return [0, 1].map((side) => side === taker ? winnerMark : defenceMark);
}

function failedMarks(rules: ContractRules, sides: Sides, value: number): readonly number[] {
  const { defence, multiplier, belote } = sides;
  const extras = sumOf(sides.declarations) + belote[defence]!;
  const included = rules.doubling.multipliedIncludes === "declarationsAndTakerBelote";
  const won = multiplier === 1
    ? 160 + value + extras
    : {
      contractPlusBase: () => (160 + value + (included ? extras : 0)) * multiplier + (included ? 0 : extras),
      wholeScore: () => (160 + value + extras) * multiplier,
      contract: () => 160 + multiplier * value + extras,
      fixedBasePlusMultipliedContract: () => 160 + multiplier * value + extras,
    }[rules.doubling.scope]();
  return belote.map((points, side) => side === defence ? won : points);
}

function sidesOf(config: VariantConfig, rules: ContractRules, facts: DealFacts): Sides & Readonly<{ totals: readonly number[] }> {
  const capotSide = capotSideOf(facts);
  const transfers = config.declarations?.capotTransfersOpponents !== false;
  const declarations = transfers ? declarationsAfterCapot(facts, capotSide) : facts.declarations;
  const counted = config.declarations?.countTowardContract !== false;
  const totals = facts.cardPoints.map((points, side) =>
    points + facts.belote[side]! + (counted ? facts.declarations[side]! : 0));
  const factor = rules.noTrumpDoublesContract && facts.contract.mode.kind === "no-trump" ? 2 : 1;
  const made = reachesContract(rules, facts, totals);
  const taker = facts.takerSide;
  const toDefence = !made && config.belote?.onFailedContract === "toDefence";
  const belote = facts.belote.map((points, side) => {
    if (!toDefence) return points;
    return side === taker ? 0 : points + facts.belote[taker]!;
  });
  return {
    taker,
    defence: 1 - taker,
    made,
    multiplier: multiplierOf(rules, facts.contract.doubling),
    factor,
    points: facts.cardPoints,
    declarations,
    belote,
    totals,
  };
}

export function scoreContract(config: VariantConfig, facts: DealFacts): DealScore {
  const rules = contractRulesOf(config);
  if (rules.method === "legacyContree2") return scoreLegacyContree2(config, facts);
  const sides = sidesOf(config, rules, facts);
  const value = typeof facts.contract.value === "number" ? facts.contract.value * sides.factor : 0;
  const marks = typeof facts.contract.value !== "number"
    ? specialMarks(rules, facts, sides)
    : rules.method === "pointsAnnonces"
      ? pointsAnnoncesMarks(rules, facts, sides)
      : sides.made ? madeMarks(rules, facts, sides, value) : failedMarks(rules, sides, value);
  return withoutLitige(facts, {
    outcome: sides.made ? "made" : "failed",
    winnerSide: sides.made ? sides.taker : sides.defence,
    capotSide: capotSideOf(facts),
    totals: sides.totals,
    dealMarks: marks.map((mark) => roundMark(mark, rules.rounding.to)),
  });
}

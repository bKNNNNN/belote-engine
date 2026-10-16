import { sidesOf, type SideId } from "./seats";
import type { DealFacts, DealOutcome, DealScore } from "./scoring";
import type { MatchRules, VariantConfig } from "./variant-config";

/**
 * Match bookkeeping (ports of `belote-classic/match.ts` and
 * `coinche-match-outcome.ts`): scores by side, litige carry-over, end by
 * target or by number of deals, ties settled by an extra deal, and the two
 * finish locks (FFB belote lock, Marquez capot-with-announcement rule).
 */

export type MatchState = Readonly<{
  scores: readonly number[];
  target: number | null;
  formatId: string | null;
  scoredDeals: number;
  litigePending: number | null;
  /** FFB lock: a side that crossed thanks to its belote after failing or suffering a capot. */
  locks: readonly boolean[];
  finished: boolean;
  winner: SideId | null;
}>;

export type MatchEvent =
  | Readonly<{
    type: "deal.scored";
    dealNumber: number;
    outcome: DealOutcome;
    marks: readonly number[];
    scores: readonly number[];
    litigeAwarded: DealScore["litigeAwarded"];
    litigePending: number | null;
  }>
  | Readonly<{ type: "match.locked"; side: SideId }>
  | Readonly<{ type: "match.unlocked"; side: SideId }>
  | Readonly<{ type: "match.extraDeal"; scores: readonly number[] }>
  | Readonly<{ type: "match.finished"; winner: SideId | null; scores: readonly number[] }>;

export class InvalidMatchFormatError extends RangeError {
  constructor(formatId: string, config: VariantConfig) {
    super(`Unknown format ${formatId} for ${config.id}@${config.version}`);
    this.name = "InvalidMatchFormatError";
  }
}

function targetOf(config: VariantConfig, formatId: string | undefined): Readonly<{ target: number | null; formatId: string | null }> {
  const { end, formats } = config.match;
  if (end.kind !== "target") {
    if (formatId !== undefined) throw new InvalidMatchFormatError(formatId, config);
    return { target: null, formatId: null };
  }
  const format = formatId === undefined
    ? formats.find(({ isDefault }) => isDefault)
    : formats.find(({ id }) => id === formatId);
  if (format === undefined) throw new InvalidMatchFormatError(formatId ?? "default", config);
  return { target: format.target, formatId: format.id };
}

export function startMatch(config: VariantConfig, formatId?: string): MatchState {
  const sides = sidesOf(config.table);
  return Object.freeze({
    scores: Object.freeze(sides.map(() => 0)),
    ...targetOf(config, formatId),
    scoredDeals: 0,
    litigePending: null,
    locks: Object.freeze(sides.map(() => false)),
    finished: false,
    winner: null,
  });
}

type Crossing = Readonly<{
  rules: MatchRules;
  target: number;
  before: readonly number[];
  after: readonly number[];
  facts: DealFacts;
  score: DealScore;
}>;

function ffbLocked(input: Crossing, side: SideId, wasLocked: boolean): boolean {
  if (wasLocked) return input.facts.tricks[side] === 0;
  const crossed = input.before[side]! < input.target && input.after[side]! >= input.target;
  const belote = input.facts.belote[side]!;
  const beloteNeeded = belote > 0 && input.after[side]! - belote < input.target;
  const fell = side === input.facts.takerSide && input.score.outcome !== "made";
  const sufferedCapot = input.score.capotSide !== null && input.score.capotSide !== side;
  return crossed && beloteNeeded && (fell || sufferedCapot);
}

function capotBlocked(input: Crossing, side: SideId): boolean {
  const crossed = input.before[side]! < input.target && input.after[side]! >= input.target;
  const bonus = input.facts.belote[side]! + input.facts.declarations[side]!;
  const sufferedCapot = input.score.capotSide !== null && input.score.capotSide !== side;
  return crossed && sufferedCapot && bonus > 0 && input.after[side]! - bonus < input.target;
}

function nextLocks(input: Crossing, locks: readonly boolean[]): readonly boolean[] {
  if (input.rules.finishLock !== "beloteOnlyAfterFailOrCapot") return locks;
  return locks.map((locked, side) => ffbLocked(input, side, locked));
}

function bestOf(scores: readonly number[], sides: readonly SideId[]): readonly SideId[] {
  const best = Math.max(...sides.map((side) => scores[side]!));
  return sides.filter((side) => scores[side] === best);
}

type Verdict = Readonly<{ finished: boolean; winner: SideId | null }>;

const CONTINUE: Verdict = Object.freeze({ finished: false, winner: null });

function settleTie(tie: "extraDeal" | "lastDealWinner" | "draw", leaders: readonly SideId[], score: DealScore): Verdict {
  if (leaders.length === 1) return { finished: true, winner: leaders[0]! };
  if (tie === "draw") return { finished: true, winner: null };
  if (tie === "lastDealWinner" && leaders.includes(score.winnerSide)) {
    return { finished: true, winner: score.winnerSide };
  }
  return CONTINUE;
}

function verdict(
  config: VariantConfig,
  match: MatchState,
  input: Crossing | null,
  scoredDeals: number,
  locks: readonly boolean[],
): Verdict {
  const end = config.match.end;
  const sides = sidesOf(config.table);
  const scores = input?.after ?? match.scores;
  if (end.kind === "singleDeal") return settleTie("draw", bestOf(scores, sides), input!.score);
  if (end.kind === "deals") {
    if (scoredDeals < end.count) return CONTINUE;
    return settleTie(end.tie, bestOf(scores, sides), input!.score);
  }
  const qualified = sides.filter((side) => scores[side]! >= match.target!
    && !locks[side]
    && !(config.match.finishLock === "announceUnderCapot" && capotBlocked(input!, side)));
  if (qualified.length === 0) return CONTINUE;
  return settleTie(end.tie, bestOf(scores, qualified), input!.score);
}

function lockEvents(before: readonly boolean[], after: readonly boolean[]): readonly MatchEvent[] {
  return after.flatMap((locked, side): MatchEvent[] => {
    if (locked === before[side]) return [];
    return [locked ? { type: "match.locked", side } : { type: "match.unlocked", side }];
  });
}

/** Adds a scored deal to the match and decides whether it ends. */
export function recordDeal(
  config: VariantConfig,
  match: MatchState,
  facts: DealFacts,
  score: DealScore,
): Readonly<{ match: MatchState; events: readonly MatchEvent[] }> {
  if (match.finished) throw new RangeError("Cannot record a deal on a finished match");
  const after = Object.freeze(match.scores.map((value, side) => value + score.marks[side]!));
  const input: Crossing = {
    rules: config.match,
    target: match.target ?? Number.POSITIVE_INFINITY,
    before: match.scores,
    after,
    facts,
    score,
  };
  const locks = Object.freeze(nextLocks(input, match.locks));
  const scoredDeals = match.scoredDeals + 1;
  const result = verdict(config, match, input, scoredDeals, locks);
  const next: MatchState = Object.freeze({
    ...match,
    scores: after,
    scoredDeals,
    litigePending: score.litigePending,
    locks,
    finished: result.finished,
    winner: result.winner,
  });
  const scored: MatchEvent = {
    type: "deal.scored",
    dealNumber: scoredDeals,
    outcome: score.outcome,
    marks: score.marks,
    scores: after,
    litigeAwarded: score.litigeAwarded,
    litigePending: score.litigePending,
  };
  const reachedTie = !result.finished && match.target !== null
    && bestOf(after, sidesOf(config.table)).length > 1 && Math.max(...after) >= match.target;
  const closing: readonly MatchEvent[] = result.finished
    ? [{ type: "match.finished", winner: result.winner, scores: after }]
    : reachedTie ? [{ type: "match.extraDeal", scores: after }] : [];
  return Object.freeze({
    match: next,
    events: Object.freeze([scored, ...lockEvents(match.locks, locks), ...closing]),
  });
}

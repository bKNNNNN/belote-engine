import { describe, expect, it } from "vitest";
import type { ContractValue } from "../../src/engine/contract";
import { recordDeal, startMatch, type MatchState } from "../../src/engine/match";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import { scoreDeal, type DealFacts } from "../../src/engine/scoring";
import type { VariantConfig } from "../../src/engine/variant-config";
import { suitContractMode } from "../../src/rules/contract-mode";

const preset = (id: string, version: number): VariantConfig => findPreset({ id, version })!.config;
const CLASSIQUE = preset("classique", 1);
const COINCHE = preset("coinche", 1);

function variant(base: VariantConfig, overrides: VariantOverrides): VariantConfig {
  const resolved = resolveVariant(base, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

type FactsInput = Readonly<{
  taker?: number;
  value?: ContractValue | null;
  cardPoints: readonly number[];
  tricks?: readonly number[];
  belote?: readonly number[];
  declarations?: readonly number[];
}>;

function facts(input: FactsInput): DealFacts {
  const taker = input.taker ?? 0;
  const tricks = input.tricks ?? [4, 4];
  return {
    taker,
    takerSide: taker % 2,
    contract: { taker, mode: suitContractMode("spades"), value: input.value ?? null, doubling: 0, doubledBy: null },
    cardPoints: input.cardPoints,
    tricks,
    takerTricks: tricks[taker % 2]!,
    totalTricks: 8,
    belote: input.belote ?? [0, 0],
    declarations: input.declarations ?? [0, 0],
  };
}

function deal(config: VariantConfig, match: MatchState, input: FactsInput): MatchState {
  const dealFacts = facts(input);
  return recordDeal(config, match, dealFacts, scoreDeal(config, dealFacts, match.litigePending)).match;
}

function withScores(match: MatchState, scores: readonly number[]): MatchState {
  return { ...match, scores };
}

describe("match", () => {
  it("starts at zero with the target of the chosen format", () => {
    expect(startMatch(CLASSIQUE, "short")).toMatchObject({ scores: [0, 0], target: 500, scoredDeals: 0 });
    expect(startMatch(CLASSIQUE)).toMatchObject({ target: 1000, finished: false, winner: null });
    expect(() => startMatch(CLASSIQUE, "marathon")).toThrow(/format/);
  });

  it("carries a classic litige to the winner of the next deal", () => {
    const litige = deal(CLASSIQUE, startMatch(CLASSIQUE), { cardPoints: [81, 81] });
    expect(litige).toMatchObject({ scores: [0, 81], litigePending: 81 });
    const next = deal(CLASSIQUE, litige, { taker: 1, cardPoints: [62, 100] });
    expect(next).toMatchObject({ scores: [62, 262], litigePending: null, scoredDeals: 2 });
  });

  it("finishes when one side reaches the target, highest score first", () => {
    const near = withScores(startMatch(CLASSIQUE, "short"), [450, 470]);
    const done = deal(CLASSIQUE, near, { cardPoints: [100, 62] });
    expect(done).toMatchObject({ finished: true, winner: 0, scores: [550, 532] });
  });

  it("plays an extra deal on a tie above the target (2.6 fixed)", () => {
    const tied = deal(CLASSIQUE, withScores(startMatch(CLASSIQUE, "short"), [400, 438]), { cardPoints: [100, 62] });
    expect(tied).toMatchObject({ finished: false, scores: [500, 500] });
    expect(deal(CLASSIQUE, tied, { cardPoints: [100, 62] })).toMatchObject({ finished: true, winner: 0 });
    const contree = preset("contree", 3);
    const even = deal(contree, withScores(startMatch(contree, "short"), [420, 500]), { value: 80, cardPoints: [100, 62] });
    expect(even).toMatchObject({ finished: false, scores: [500, 500] });
  });

  it("replays the contree@2 draw on a tie above the target (legacy 2.6, replay only)", () => {
    const legacy = preset("contree", 2);
    const even = deal(legacy, withScores(startMatch(legacy, "short"), [400, 518]), { value: 80, cardPoints: [100, 62] });
    expect(even).toMatchObject({ finished: true, winner: null, scores: [580, 580] });
  });

  it("gives the tie to the last deal winner with tie lastDealWinner", () => {
    const config = variant(CLASSIQUE, { match: { end: { tie: "lastDealWinner" } } });
    const even = deal(config, withScores(startMatch(config, "short"), [400, 438]), { cardPoints: [100, 62] });
    expect(even).toMatchObject({ finished: true, winner: 0, scores: [500, 500] });
  });

  it("locks a side that crosses only thanks to its belote after failing (FFB oracle)", () => {
    const config = variant(COINCHE, { match: { formats: [
      { id: "short", target: 500, isDefault: true },
    ], end: { points: 500 } } });
    const before = withScores(startMatch(config, "short"), [490, 490]);
    const failed = facts({ value: 100, cardPoints: [60, 102], tricks: [3, 5], belote: [40, 20] });
    const result = recordDeal(config, before, failed, {
      ...scoreDeal(config, failed, null),
      marks: [20, 210],
    });
    expect(result.match).toMatchObject({ scores: [510, 700], locks: [true, false], finished: true, winner: 1 });
  });

  it("keeps a lock until the side wins a trick, then lets it win", () => {
    const config = variant(COINCHE, { match: { formats: [
      { id: "short", target: 500, isDefault: true },
    ], end: { points: 500 } } });
    const locked: MatchState = { ...startMatch(config, "short"), scores: [510, 100], locks: [true, false] };
    const capoted = deal(config, locked, { taker: 1, value: 80, cardPoints: [0, 252], tricks: [0, 8] });
    expect(capoted).toMatchObject({ finished: false, locks: [true, false] });
    const trick = deal(config, locked, { taker: 1, value: 80, cardPoints: [20, 142], tricks: [1, 7] });
    expect(trick).toMatchObject({ finished: true, winner: 0, locks: [false, false] });
  });

  it("counts deals in a concours and plays an extra deal on a tie", () => {
    const concours = preset("concours", 1);
    const ten: MatchState = { ...startMatch(concours), scoredDeals: 10, scores: [900, 1000] };
    expect(deal(concours, ten, { cardPoints: [100, 62] }))
      .toMatchObject({ finished: false, scoredDeals: 11, scores: [1000, 1062] });
    const lead: MatchState = { ...startMatch(concours), scoredDeals: 11, scores: [900, 800] };
    expect(deal(concours, lead, { cardPoints: [100, 62] })).toMatchObject({ finished: true, winner: 0 });
    const tie: MatchState = { ...startMatch(concours), scoredDeals: 11, scores: [900, 938] };
    const tied = deal(concours, tie, { cardPoints: [100, 62] });
    expect(tied).toMatchObject({ finished: false, scores: [1000, 1000] });
    expect(deal(concours, tied, { cardPoints: [100, 62] })).toMatchObject({ finished: true, winner: 0 });
  });

  it("ends a single-deal match at once", () => {
    const cavaillon = preset("cavaillon", 1);
    expect(deal(cavaillon, startMatch(cavaillon), { value: 80, cardPoints: [100, 62] }))
      .toMatchObject({ finished: true, winner: 0, target: null });
  });

  it("does not end a stéphanoise on a capot suffered with an announcement (Marquez)", () => {
    const stephanoise = preset("stephanoise-marquez", 1);
    const near: MatchState = { ...startMatch(stephanoise), scores: [1990, 1500] };
    const capoted = deal(stephanoise, near, {
      taker: 1, value: 90, cardPoints: [0, 252], tricks: [0, 8], belote: [20, 0],
    });
    expect(capoted).toMatchObject({ finished: false, scores: [2010, 1840] });
    const plain = deal(stephanoise, near, { taker: 1, value: 90, cardPoints: [70, 92], belote: [20, 0] });
    expect(plain).toMatchObject({ finished: true, winner: 0 });
  });

  it("refuses to record a deal on a finished match", () => {
    const done: MatchState = { ...startMatch(CLASSIQUE), finished: true, winner: 0 };
    const input = facts({ cardPoints: [100, 62] });
    expect(() => recordDeal(CLASSIQUE, done, input, scoreDeal(CLASSIQUE, input, null))).toThrow(/finished/);
  });
});

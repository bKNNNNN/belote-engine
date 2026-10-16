import { describe, expect, it } from "vitest";
import { BRIDGEE_CASES } from "../golden/bridgee.cases";
import { CLASSIC_VARIANT_CASES } from "../golden/classic-variants.cases";
import { CLASSIQUE_CASES } from "../golden/classique.cases";
import { COINCHE_FFB_CASES } from "../golden/coinche-ffb.cases";
import { COINCHE_CASES } from "../golden/coinche.cases";
import { CONTREE_CASES, CONTREE_LEGACY_CASES } from "../golden/contree.cases";
import type { ScoringCase } from "../golden/scoring-case";
import { A_DEUX_CASES, A_TROIS_CASES } from "../golden/small-tables.cases";
import { STEPHANOISE_CASES } from "../golden/stephanoise.cases";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant } from "../../src/engine/resolve-variant";
import { scoreDeal, type DealFacts } from "../../src/engine/scoring";
import { sideOf, sidesOf } from "../../src/engine/seats";
import type { VariantConfig } from "../../src/engine/variant-config";
import { allTrumpMode, noTrumpMode, suitContractMode } from "../../src/rules/contract-mode";

const TABLES: Readonly<Record<string, readonly ScoringCase[]>> = {
  classique: CLASSIQUE_CASES,
  "classic variants": CLASSIC_VARIANT_CASES,
  "contree@3": CONTREE_CASES,
  "contree@2 (legacy bugs, replay only)": CONTREE_LEGACY_CASES,
  "coinche@1 and SA/TA": COINCHE_CASES,
  "coinche-ffb@2": COINCHE_FFB_CASES,
  bridgee: BRIDGEE_CASES,
  "stephanoise-marquez": STEPHANOISE_CASES,
  "a-trois": A_TROIS_CASES,
  "a-deux": A_DEUX_CASES,
};

function configOf(scoringCase: ScoringCase): VariantConfig {
  const preset = findPreset(scoringCase.preset);
  if (preset === null) throw new Error(`Unknown preset ${scoringCase.preset.id}`);
  const resolved = resolveVariant(preset.config, scoringCase.overrides ?? {});
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

function evenTricks(config: VariantConfig): readonly number[] {
  const total = (32 - config.deck.removed.length) / config.table.seats;
  const sides = sidesOf(config.table);
  const share = Math.floor(total / sides.length);
  return sides.map((_, index) => share + (index < total - share * sides.length ? 1 : 0));
}

export function factsOf(config: VariantConfig, scoringCase: ScoringCase): DealFacts {
  const facts = scoringCase.facts;
  const taker = facts.taker ?? 0;
  const takerSide = sideOf(config.table, taker);
  const sides = sidesOf(config.table);
  const mode = facts.mode === "no-trump"
    ? noTrumpMode()
    : facts.mode === "all-trump" ? allTrumpMode() : suitContractMode("spades");
  const doubling = facts.doubling ?? 0;
  const tricks = facts.tricks ?? evenTricks(config);
  return {
    taker,
    takerSide,
    contract: {
      taker,
      mode,
      value: facts.value ?? null,
      doubling,
      doubledBy: doubling === 0 ? null : (taker + 1) % config.table.seats,
    },
    cardPoints: facts.cardPoints,
    tricks,
    takerTricks: facts.takerTricks ?? tricks[takerSide]!,
    totalTricks: tricks.reduce((total, count) => total + count, 0),
    belote: facts.belote ?? sides.map(() => 0),
    declarations: facts.declarations ?? sides.map(() => 0),
  };
}

describe.each(Object.entries(TABLES))("golden scoring table: %s", (_name, cases) => {
  it.each(cases.map((scoringCase) => [scoringCase.name, scoringCase] as const))("%s", (_label, scoringCase) => {
    const config = configOf(scoringCase);
    const score = scoreDeal(config, factsOf(config, scoringCase), scoringCase.pendingLitige ?? null);
    expect(score.outcome).toBe(scoringCase.expected.outcome);
    expect(score.marks).toEqual(scoringCase.expected.marks);
    if (scoringCase.expected.litigePending !== undefined) {
      expect(score.litigePending).toBe(scoringCase.expected.litigePending);
    }
    expect(scoringCase.source.length).toBeGreaterThan(0);
  });
});

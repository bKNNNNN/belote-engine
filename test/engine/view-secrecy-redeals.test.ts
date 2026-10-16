import { describe, expect, it } from "vitest";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import { replay } from "../../src/engine/step";
import type { VariantConfig } from "../../src/engine/variant-config";
import { simulateMatch } from "./support/simulate";
import { VIEW_MATCHES, emptyStats, playViewMatch } from "./support/view-suite";

/**
 * Weak-hand redeals on: seat views stay secret and every invariant holds.
 * The thresholds are raised far above the table ones so that random players
 * meet the request often; legality reads only the requester's own hand.
 */

function config(id: string, version: number, redeals: VariantOverrides["redeals"]): VariantConfig {
  const resolution = resolveVariant(findPreset({ id, version })!.config, { redeals });
  if (!resolution.ok) throw new Error(resolution.errors.join("; "));
  return resolution.config;
}

const CASES = [
  ["classique, main nulle under 40 and carré de 7", config("classique", 1, { mainNulle: { below: 40 }, carreDeSept: true })],
  ["contrée, misère under 50 and carré de 7", config("contree", 3, { misere: { below: 50 }, carreDeSept: true })],
  ["coinche FFB, misère under 10", config("coinche-ffb", 2, { misere: { below: 10 } })],
] as const;

const MATCHES = Math.max(20, Math.round(VIEW_MATCHES / 5));

describe.each(CASES)("weak-hand redeals: %s", (_label, rules) => {
  it(`leaks no hidden card over ${MATCHES} matches`, { timeout: 900_000 }, () => {
    const stats = emptyStats();
    for (let index = 0; index < MATCHES; index += 1) playViewMatch(rules, 0x7ed1 + index, stats);
    expect(stats.decisions).toBeGreaterThan(MATCHES * 10);
  });

  it(`keeps every invariant and replays over ${MATCHES} matches`, { timeout: 900_000 }, () => {
    let requests = 0;
    for (let index = 0; index < MATCHES; index += 1) {
      const seed = 0x5eed + index;
      const result = simulateMatch(rules, seed);
      requests += result.intents.filter(({ kind }) => kind === "requestRedeal").length;
      if (index < 5) {
        const replayed = replay(rules, [seed >>> 0, (seed * 7 + 1) >>> 0, 0x9e3779b9, (seed ^ 0x5bd1e995) >>> 0], result.intents);
        expect(replayed).toEqual(result.state);
      }
    }
    if (rules.redeals.misere?.below !== 10) expect(requests).toBeGreaterThan(0);
  });
});

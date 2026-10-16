import { describe, expect, it } from "vitest";
import { findPreset, variantKey } from "../../../src/engine/presets";
import { replay } from "../../../src/engine/step";
import { simulateMatch } from "./simulate";

/**
 * Registers the invariant simulation for a list of presets: ENGINE_SIM_MATCHES
 * matches each (2 000 by default), fixed seeds. The first matches are also
 * replayed from their intents, which proves determinism.
 */

export const SIMULATED_MATCHES = Number(process.env.ENGINE_SIM_MATCHES ?? 2000);
const REPLAYED = 20;

export function simulationSuite(presets: readonly Readonly<{ id: string; version: number }>[]): void {
  describe.each(presets.map((ref) => [variantKey(ref), ref] as const))("random play invariants: %s", (_key, ref) => {
    const config = findPreset(ref)!.config;
    const seedBase = [...variantKey(ref)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);

    it(`holds every invariant over ${SIMULATED_MATCHES} matches`, { timeout: 900_000 }, () => {
      let deals = 0;
      for (let index = 0; index < SIMULATED_MATCHES; index += 1) {
        const seed = (seedBase + index) >>> 0;
        const result = simulateMatch(config, seed);
        deals += result.deals;
        if (index < REPLAYED) {
          const replayed = replay(config, [seed >>> 0, (seed * 7 + 1) >>> 0, 0x9e3779b9, (seed ^ 0x5bd1e995) >>> 0], result.intents);
          expect(replayed).toEqual(result.state);
        }
      }
      expect(deals).toBeGreaterThanOrEqual(SIMULATED_MATCHES);
    });
  });
}

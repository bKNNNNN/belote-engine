import { describe, expect, it } from "vitest";
import { findPreset, variantKey } from "../../../src/engine/presets";
import type { EngineState, Intent } from "../../../src/engine/state";
import { createMatch, legalIntents, seatToAct, step, systemIntents } from "../../../src/engine/step";
import type { VariantConfig } from "../../../src/engine/variant-config";
import { viewFor, type SeatView, type Viewer } from "../../../src/engine/view";
import { testRng } from "../../golden/legacy-support/runner";
import { deduce, rememberTricks, type TrickMemory } from "../../../src/engine/knowledge";
import { falseClaims, type KnowledgeStats } from "./knowledge-oracle";
import { leakedCards, leakedFromView, secrecyBreach } from "./view-secrecy";

/**
 * Seat views over random matches (engine-design.md 5.2, check 5). Every
 * decision is taken from the acting seat's view alone. After every accepted
 * intent, each seat and a spectator get a view that must mention no hidden
 * card; on a sample of steps, the view must survive a scramble of every
 * hidden card (secrecy oracle); on another sample, what a seat deduces from
 * its view must be true of the real deal. `ENGINE_VIEW_MATCHES` matches per
 * preset, 500 by default.
 */

/** The playable presets, split over five files that vitest runs in parallel. */
export const VIEW_PRESET_GROUPS = {
  classic: [
    { id: "classique", version: 1 },
    { id: "classique-annonces", version: 1 },
    { id: "concours", version: 1 },
  ],
  vache: [
    { id: "vache", version: 1 },
    { id: "coinche", version: 1 },
    { id: "coinche-sa-ta-ffb2015", version: 1 },
  ],
  vacheRetourne: [
    { id: "vache-retourne", version: 1 },
    { id: "coinche-ffb", version: 2 },
    { id: "bridgee", version: 1 },
  ],
  moderne: [
    { id: "moderne", version: 1 },
    { id: "cavaillon", version: 1 },
    { id: "contree", version: 3 },
  ],
  small: [
    { id: "a-deux", version: 1 },
    { id: "a-trois", version: 1 },
    { id: "stephanoise-marquez", version: 1 },
  ],
} as const;

export const VIEW_MATCHES = Number(process.env.ENGINE_VIEW_MATCHES ?? 500);
const SCRAMBLE_RATE = 0.1;
const SERIALIZED_RATE = 0.02;
const MAX_STEPS = 40_000;

const KNOWLEDGE_RATE = 0.1;

export type ViewMatchStats = {
  steps: number;
  views: number;
  scrambles: number;
  decisions: number;
  knowledge: KnowledgeStats;
};

export function emptyStats(): ViewMatchStats {
  return { steps: 0, views: 0, scrambles: 0, decisions: 0, knowledge: { deductions: 0, voids: 0, excluded: 0, located: 0 } };
}

function seedOf(seed: number): readonly [number, number, number, number] {
  return [seed >>> 0, (seed * 13 + 5) >>> 0, 0x85ebca6b, (seed ^ 0x27d4eb2f) >>> 0];
}

function viewersOf(config: VariantConfig): readonly Viewer[] {
  return [...Array.from({ length: config.table.seats }, (_, seat) => seat), "spectator"];
}

function decide(view: SeatView, state: EngineState, rng: () => number, fail: (message: string) => never): Intent {
  const expected = legalIntents(state, view.viewer as number);
  if (view.legal.length === 0) fail(`seat ${String(view.viewer)} to act without legal intents`);
  if (JSON.stringify(view.legal) !== JSON.stringify(expected)) fail("view.legal differs from legalIntents");
  return view.legal[Math.floor(rng() * view.legal.length)]!;
}

export function playViewMatch(
  config: VariantConfig,
  seed: number,
  stats: ViewMatchStats,
): EngineState {
  const fail = (message: string): never => {
    throw new Error(`${variantKey(config)} seed ${seed}: ${message}`);
  };
  const rng = testRng(seed ^ 0x51ed270b);
  const viewers = viewersOf(config);
  let state = createMatch(config, seedOf(seed)).state;
  let memories: readonly (TrickMemory | null)[] = Array.from({ length: config.table.seats }, () => null);
  for (let count = 0; count < MAX_STEPS && state.deal.phase !== "matchFinished"; count += 1) {
    const views = viewers.map((viewer) => {
      const view = viewFor(state, viewer);
      if (view.rules !== config) fail("the view carries other rules than the table's");
      const leaks = count === 0 || rng() < SERIALIZED_RATE
        ? leakedCards(state, viewer, JSON.stringify(view))
        : leakedFromView(state, view);
      if (leaks.length > 0) fail(`view of ${String(viewer)} leaks ${leaks.join(" ")} in ${state.deal.phase}`);
      return view;
    });
    stats.views += views.length;
    if (rng() < SCRAMBLE_RATE) {
      const viewer = viewers[Math.floor(rng() * viewers.length)]!;
      const breach = secrecyBreach(state, viewer, rng);
      if (breach !== null) fail(`view of ${String(viewer)} depends on hidden cards: ${breach}`);
      stats.scrambles += 1;
    }
    memories = memories.map((memory, seat) => rememberTricks(memory, views[seat]!));
    if (rng() < KNOWLEDGE_RATE) {
      const seat = Math.floor(rng() * config.table.seats);
      const errors = falseClaims(state, seat, deduce(views[seat]!, memories[seat]!), stats.knowledge);
      if (errors.length > 0) fail(`knowledge of seat ${seat} is false in ${state.deal.phase}: ${errors.join("; ")}`);
    }
    const acting = seatToAct(state);
    views.slice(0, -1).forEach((view) => {
      if (view.viewer !== acting && view.legal.length > 0) fail(`seat ${String(view.viewer)} has intents out of turn`);
    });
    const intent = acting === null ? systemIntents(state)[0]! : decide(views[acting]!, state, rng, fail);
    if (acting !== null) stats.decisions += 1;
    const result = step(state, intent);
    if (!result.ok) fail(`intent from the view rejected: ${result.reason}`);
    state = (result as Extract<typeof result, { ok: true }>).state;
    stats.steps += 1;
  }
  if (state.deal.phase !== "matchFinished") fail(`no end within ${MAX_STEPS} steps`);
  return state;
}

export function viewSuite(presets: readonly Readonly<{ id: string; version: number }>[]): void {
  describe.each(presets.map((ref) => [variantKey(ref), ref] as const))("seat view secrecy: %s", (_key, ref) => {
    const config = findPreset(ref)!.config;
    const seedBase = [...variantKey(ref)].reduce((hash, char) => (hash * 33 + char.charCodeAt(0)) >>> 0, 11);

    it(`leaks no hidden card and deduces nothing false over ${VIEW_MATCHES} matches`, { timeout: 900_000 }, () => {
      const stats = emptyStats();
      for (let index = 0; index < VIEW_MATCHES; index += 1) {
        playViewMatch(config, (seedBase + index) >>> 0, stats);
      }
      expect(stats.decisions).toBeGreaterThan(VIEW_MATCHES * 10);
      expect(stats.scrambles).toBeGreaterThan(VIEW_MATCHES);
      expect(stats.knowledge.deductions).toBeGreaterThan(VIEW_MATCHES);
      expect(stats.knowledge.voids).toBeGreaterThan(0);
      expect(stats.knowledge.excluded + stats.knowledge.located).toBeGreaterThan(0);
    });
  });
}

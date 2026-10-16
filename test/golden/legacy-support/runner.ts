import { createHash } from "node:crypto";
import type { Card } from "../../../src/cards";
import { createDeck, shuffle } from "../../../src/deck";
import { decodeDeck, encodeDeck } from "./codec";
import type {
  Candidate,
  LegacyAdapter,
  LegacyDeal,
  LegacyGame,
  LegacyProfile,
  TestRng,
} from "./types";

/** Number of games whose full event log is stored next to the digest. */
export const FULL_EVENT_GAMES = 3;
const MAX_STEPS = 50_000;

/** mulberry32: a tiny, well-known 32-bit PRNG, independent of the new engine RNG. */
export function testRng(seed: number): TestRng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Source<TState, TIntent> = Readonly<{
  firstDealer: () => number;
  deck: (dealOrdinal: number) => readonly Readonly<Card>[];
  intent: (
    state: TState,
    adapter: LegacyAdapter<TState, TIntent>,
    dealOrdinal: number,
    intentOrdinal: number,
  ) => TIntent;
}>;

function pick<T>(items: readonly T[], value: number): T {
  return items[Math.min(items.length - 1, Math.floor(value * items.length))]!;
}

function pickRaise<TIntent>(
  raises: readonly Candidate<TIntent>[],
  rng: TestRng,
): TIntent {
  const heights = [...new Set(raises.map(({ height }) => height ?? 0))]
    .sort((first, second) => first - second);
  const height = pick(heights, rng() ** 3);
  return pick(raises.filter((raise) => (raise.height ?? 0) === height), rng()).intent;
}

/**
 * Random but rule-abiding player: plays uniformly, passes often during the
 * auction, and prefers low bids so contracts of every size occur.
 */
export function chooseCandidate<TIntent>(
  candidates: readonly Candidate<TIntent>[],
  rng: TestRng,
): TIntent {
  if (candidates.length === 0) throw new Error("No legal intent to choose from");
  const byTag = (tag: Candidate<TIntent>["tag"]) =>
    candidates.filter((candidate) => candidate.tag === tag);
  const plays = byTag("play");
  if (plays.length > 0) return pick(plays, rng()).intent;
  const passes = byTag("pass");
  const doubles = byTag("double");
  const raises = candidates.filter(({ tag }) => tag === "bid" || tag === "take");
  if (passes.length > 0 && rng() < 0.7) return passes[0]!.intent;
  if (doubles.length > 0 && rng() < 0.1) return pick(doubles, rng()).intent;
  if (raises.length > 0) return pickRaise(raises, rng);
  if (doubles.length > 0) return pick(doubles, rng()).intent;
  return passes[0]!.intent;
}

function digest(events: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(events)).digest("hex");
}

function formatFor(profile: LegacyProfile, seed: number) {
  return profile.formats[seed % profile.formats.length]!;
}

function run<TState, TIntent>(
  profile: LegacyProfile,
  seed: number,
  source: Source<TState, TIntent>,
): LegacyGame {
  const adapter = profile.adapter as unknown as LegacyAdapter<TState, TIntent>;
  const format = formatFor(profile, seed);
  const events: unknown[] = [];
  const deals: { dealer: number; deck: string; intents: string[] }[] = [];
  const openDeal = (dealer: number) => {
    const deck = source.deck(deals.length);
    deals.push({ dealer, deck: encodeDeck(deck), intents: [] });
    return deck;
  };
  const firstDealer = source.firstDealer();
  let step = adapter.start(openDeal(firstDealer), firstDealer, format.id, 0);
  events.push(...step.events);
  for (let count = 0; count < MAX_STEPS; count += 1) {
    const status = adapter.status(step.state);
    if (status.kind === "finished") {
      return transcript(seed, format, deals, status, events);
    }
    if (status.kind === "settle") {
      step = adapter.settle(step.state);
    } else if (status.kind === "between") {
      const ordinal = deals.length;
      const deck = openDeal(status.nextDealer);
      step = adapter.nextDeal(step.state, deck, status.nextDealer, ordinal);
    } else {
      const current = deals.at(-1)!;
      const intent = source.intent(
        step.state, adapter, deals.length - 1, current.intents.length,
      );
      const next = adapter.apply(step.state, intent);
      if (next.state === step.state) {
        throw new Error(`Rejected intent ${adapter.encode(intent)} (seed ${seed})`);
      }
      current.intents.push(adapter.encode(intent));
      step = next;
    }
    events.push(...step.events);
  }
  throw new Error(`Match did not finish within ${MAX_STEPS} steps (seed ${seed})`);
}

function transcript(
  seed: number,
  format: Readonly<{ id: string; target: number }>,
  deals: readonly LegacyDeal[],
  final: LegacyGame["final"] & Readonly<{ kind: "finished" }>,
  events: readonly unknown[],
): LegacyGame {
  const plainEvents = JSON.parse(JSON.stringify(events)) as unknown[];
  const game: LegacyGame = {
    seed,
    formatId: format.id,
    target: format.target,
    deals: deals.map((deal) => ({ ...deal, intents: [...deal.intents] })),
    final: {
      scores: [final.scores[0], final.scores[1]],
      winner: final.winner,
      scoredDeals: final.scoredDeals,
    },
    eventCount: plainEvents.length,
    eventsDigest: digest(plainEvents),
  };
  return seed % 1000 < FULL_EVENT_GAMES ? { ...game, events: plainEvents } : game;
}

export function generateGame(profile: LegacyProfile, seed: number): LegacyGame {
  const rng = testRng(seed);
  return run<unknown, unknown>(profile, seed, {
    firstDealer: () => Math.floor(rng() * 4),
    deck: () => shuffle(createDeck(), rng),
    intent: (state, adapter) => chooseCandidate(adapter.candidates(state, rng), rng),
  });
}

export function replayGame(profile: LegacyProfile, game: LegacyGame): LegacyGame {
  return run<unknown, unknown>(profile, game.seed, {
    firstDealer: () => game.deals[0]!.dealer,
    deck: (ordinal) => decodeDeck(game.deals[ordinal]!.deck),
    intent: (state, adapter, dealOrdinal, intentOrdinal) =>
      adapter.decode(game.deals[dealOrdinal]!.intents[intentOrdinal]!, state),
  });
}

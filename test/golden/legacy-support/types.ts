import type { Card } from "../../../src/cards";

export type TestRng = () => number;

export type CandidateTag = "pass" | "double" | "bid" | "take" | "play";

export type Candidate<TIntent> = Readonly<{
  intent: TIntent;
  tag: CandidateTag;
  /** Bid height: the random player prefers low heights, then picks uniformly. */
  height?: number;
}>;

export type AdapterStep<TState> = Readonly<{
  state: TState;
  events: readonly unknown[];
}>;

export type MatchStatus =
  | Readonly<{ kind: "act" }>
  | Readonly<{ kind: "settle" }>
  | Readonly<{ kind: "between"; nextDealer: number }>
  | Readonly<{
    kind: "finished";
    scores: readonly [number, number];
    winner: 0 | 1 | null;
    scoredDeals: number;
  }>;

/**
 * Drives one legacy rule machine through its public match API, exactly as the
 * callers do: intents, automatic settlement, then the next deal.
 */
export type LegacyAdapter<TState, TIntent> = Readonly<{
  start: (
    deck: readonly Readonly<Card>[],
    dealer: number,
    formatId: string,
    dealOrdinal: number,
  ) => AdapterStep<TState>;
  nextDeal: (
    state: TState,
    deck: readonly Readonly<Card>[],
    dealer: number,
    dealOrdinal: number,
  ) => AdapterStep<TState>;
  status: (state: TState) => MatchStatus;
  settle: (state: TState) => AdapterStep<TState>;
  candidates: (state: TState, rng: TestRng) => readonly Candidate<TIntent>[];
  apply: (state: TState, intent: TIntent) => AdapterStep<TState>;
  encode: (intent: TIntent) => string;
  decode: (code: string, state: TState) => TIntent;
}>;

export type LegacyProfile = Readonly<{
  key: string;
  seedBase: number;
  formats: readonly Readonly<{ id: string; target: number }>[];
  adapter: LegacyAdapter<unknown, unknown>;
}>;

export type LegacyDeal = Readonly<{
  dealer: number;
  deck: string;
  intents: readonly string[];
}>;

export type LegacyGame = Readonly<{
  seed: number;
  formatId: string;
  target: number;
  deals: readonly LegacyDeal[];
  final: Readonly<{
    scores: readonly [number, number];
    winner: 0 | 1 | null;
    scoredDeals: number;
  }>;
  eventCount: number;
  eventsDigest: string;
  events?: readonly unknown[];
}>;

export type LegacyFixture = Readonly<{
  profile: string;
  generator: string;
  games: readonly LegacyGame[];
}>;

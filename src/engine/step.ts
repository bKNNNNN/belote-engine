import type { Card } from "../card-primitives";
import type { SelectionIntent } from "./contract";
import { cutAndDeal, cutRangeOf, isLegalCut, nextDeck, openPlay, prepareDeal, redeal, startDeal } from "./deal-flow";
import { createVariantDeck, shuffleDeck } from "./deck";
import { startMatch } from "./match";
import { applyDeclare, applyPlay, legalPlayIntents } from "./play";
import { legalRedeals } from "./redeal-request";
import { createRng, nextInt, type Seed } from "./rng";
import { isSeat, type Seat } from "./seats";
import {
  reject,
  type CutIntent,
  type EngineEvent,
  type EngineState,
  type Intent,
  type RedealIntent,
  type StepResult,
  type Transition,
} from "./state";
import { applySelection, legalSelectionIntents } from "./trump-selection";
import type { VariantConfig } from "./variant-config";

/**
 * `step(state, intent) → transition | rejection` (engine-design.md 2.4). An
 * accepted intent emits at least one event and bumps `seq` by one; automatic
 * follow-ups (trick, deal end, match end, redeal) come out in the same step.
 */

export type MatchOptions = Readonly<{ formatId?: string }>;

function accept(state: EngineState, events: readonly EngineEvent[]): Transition {
  return Object.freeze({
    ok: true as const,
    state: Object.freeze({ ...state, seq: state.seq + 1 }),
    events: Object.freeze([...events]),
  });
}

function baseState(config: VariantConfig, seed: Seed, options: MatchOptions): EngineState {
  return Object.freeze({
    config,
    rng: createRng(seed),
    seq: 0,
    dealNumber: 0,
    dealer: 0,
    lastCut: null,
    match: startMatch(config, options.formatId),
    deal: Object.freeze({ phase: "matchFinished" as const, lastDeal: null }),
  });
}

/**
 * Starts a match: random first dealer and first deck, both from the seed. The
 * deck then waits for the cut when the variant has one.
 */
export function createMatch(config: VariantConfig, seed: Seed, options: MatchOptions = {}): Transition {
  const base = baseState(config, seed, options);
  const dealer = nextInt(base.rng, config.table.seats);
  const shuffled = shuffleDeck(createVariantDeck(config.deck.removed), dealer.state);
  const started = prepareDeal({ ...base, rng: shuffled.state }, shuffled.deck, dealer.value);
  return Object.freeze({ ok: true as const, state: started.state, events: started.events });
}

/**
 * A given deck instead of the RNG's. By default it is the deck as dealt
 * (a replayed log, already cut) and no cut is asked. With `awaitCut`, a
 * scripted deal lays it down for the cut (see `uncutDeck`), which a script
 * plays as an ordinary `cut` intent at the position it chose.
 */
export type GivenDeck = Readonly<{ awaitCut?: boolean }>;

function dealGiven(state: EngineState, deck: readonly Readonly<Card>[], dealer: Seat, given: GivenDeck) {
  return given.awaitCut === true ? prepareDeal(state, deck, dealer) : startDeal(state, deck, dealer);
}

/** A match whose first dealer and deck come from a log or a script. */
export function createMatchWithDeal(
  config: VariantConfig,
  seed: Seed,
  deal: Readonly<{ dealer: Seat; deck: readonly Readonly<Card>[] }> & GivenDeck,
  options: MatchOptions = {},
): Transition {
  const started = dealGiven(baseState(config, seed, options), deal.deck, deal.dealer, deal);
  return Object.freeze({ ok: true as const, state: started.state, events: started.events });
}

/** The next deal from a logged or scripted deck instead of the RNG. */
export function nextDealWithDeck(
  state: EngineState,
  deck: readonly Readonly<Card>[],
  given: GivenDeck = {},
): StepResult {
  if (state.deal.phase !== "betweenDeals") return reject("wrongPhase");
  const started = dealGiven(state, deck, state.deal.nextDealer, given);
  return accept(started.state, started.events);
}

function applyTrumpIntent(state: EngineState, intent: SelectionIntent): StepResult {
  if (state.deal.phase !== "trumpSelection") return reject("wrongPhase");
  const { dealt, selection } = state.deal;
  const result = applySelection(state.config, selection, intent);
  if (!result.ok) return reject(result.reason);
  const selected = result.state;
  if (selected.status.kind === "allPassed") {
    const flow = redeal(state, dealt);
    return accept(flow.state, [...result.events, ...flow.events]);
  }
  if (selected.status.kind === "contract") {
    const play = openPlay(state.config, dealt, selected, selected.status.contract);
    return accept(
      { ...state, deal: Object.freeze({ phase: "playing" as const, play }) },
      [...result.events, { type: "play.started", leader: play.toAct }],
    );
  }
  return accept(
    { ...state, deal: Object.freeze({ ...state.deal, selection: selected }) },
    result.events,
  );
}

function applyRedealRequest(state: EngineState, intent: RedealIntent): StepResult {
  if (state.deal.phase !== "trumpSelection") return reject("wrongPhase");
  const { dealt, selection } = state.deal;
  if (selection.toAct !== intent.seat) return reject("notYourTurn");
  const legal = legalRedeals(state.config, selection, dealt.seats[intent.seat]!.hand, intent.seat);
  if (!legal.some(({ reason }) => reason === intent.reason)) return reject("illegalRedeal");
  const flow = redeal(state, dealt, Object.freeze({ seat: intent.seat, reason: intent.reason }));
  return accept(flow.state, flow.events);
}

function applyNextDeal(state: EngineState): StepResult {
  if (state.deal.phase !== "betweenDeals") return reject("wrongPhase");
  const drawn = nextDeck(state.config, state.rng, state.deal.pile);
  const started = prepareDeal({ ...state, rng: drawn.rng }, drawn.deck, state.deal.nextDealer);
  return accept(started.state, started.events);
}

function applyCut(state: EngineState, intent: CutIntent): StepResult {
  if (state.deal.phase !== "cutting") return reject("wrongPhase");
  if (intent.seat !== state.deal.cutter) return reject("notYourTurn");
  if (!isLegalCut(state.config, intent.position)) return reject("illegalCut");
  const dealt = cutAndDeal(state, state.deal.deck, intent.seat, intent.position);
  return accept(dealt.state, dealt.events);
}

export function step(state: EngineState, intent: Intent): StepResult {
  if (state.deal.phase === "matchFinished") return reject("matchFinished");
  if (intent.kind === "nextDeal") return applyNextDeal(state);
  if (!isSeat(state.config.table, intent.seat)) return reject("unknownSeat");
  if (intent.kind === "cut") return applyCut(state, intent);
  if (state.deal.phase === "cutting") return reject("wrongPhase");
  if (intent.kind === "declare" || intent.kind === "play") {
    if (state.deal.phase !== "playing") return reject("wrongPhase");
    const play = state.deal.play;
    if (intent.seat !== play.toAct) return reject("notYourTurn");
    const result = intent.kind === "declare"
      ? applyDeclare(state, play, intent)
      : applyPlay(state, play, intent);
    return result.ok ? accept(result.state, result.events) : result;
  }
  if (intent.kind === "requestRedeal") return applyRedealRequest(state, intent);
  return applyTrumpIntent(state, intent);
}

/** The seat expected to act, or null between deals and after the match. */
export function seatToAct(state: EngineState): Seat | null {
  if (state.deal.phase === "cutting") return state.deal.cutter;
  if (state.deal.phase === "trumpSelection") return state.deal.selection.toAct;
  if (state.deal.phase === "playing") return state.deal.play.toAct;
  return null;
}

export function legalIntents(state: EngineState, seat: Seat): readonly Intent[] {
  if (!isSeat(state.config.table, seat)) return Object.freeze([]);
  if (state.deal.phase === "cutting") return legalCuts(state.config, state.deal.cutter, seat);
  if (state.deal.phase === "trumpSelection") {
    const { dealt, selection } = state.deal;
    return Object.freeze([
      ...legalSelectionIntents(state.config, selection, seat),
      ...legalRedeals(state.config, selection, dealt.seats[seat]!.hand, seat),
    ]);
  }
  if (state.deal.phase === "playing") return legalPlayIntents(state, state.deal.play, seat);
  return Object.freeze([]);
}

function legalCuts(config: VariantConfig, cutter: Seat, seat: Seat): readonly Intent[] {
  const range = cutRangeOf(config);
  if (seat !== cutter || range === null) return Object.freeze([]);
  return Object.freeze(Array.from(
    { length: range.max - range.min + 1 },
    (_, index) => Object.freeze({ kind: "cut" as const, seat, position: range.min + index }),
  ));
}

/** System intents nobody owns: the next deal, between deals. */
export function systemIntents(state: EngineState): readonly Intent[] {
  return state.deal.phase === "betweenDeals" ? Object.freeze([{ kind: "nextDeal" as const }]) : Object.freeze([]);
}

/** Replays a match from its seed and accepted intents; throws on a rejection. */
export function replay(
  config: VariantConfig,
  seed: Seed,
  intents: readonly Intent[],
  options: MatchOptions = {},
): EngineState {
  return intents.reduce((state, intent, index) => {
    const result = step(state, intent);
    if (!result.ok) throw new RangeError(`Intent ${index} rejected: ${result.reason}`);
    return result.state;
  }, createMatch(config, seed, options).state);
}

import { createVariantDeck, cardKey } from "../../../src/engine/deck";
import { trickCardPoints } from "../../../src/engine/card-scale";
import type { EngineState, Intent, StepResult } from "../../../src/engine/state";
import { createMatch, legalIntents, seatToAct, step, systemIntents } from "../../../src/engine/step";
import type { VariantConfig } from "../../../src/engine/variant-config";
import { testRng } from "../../golden/legacy-support/runner";
import { checkScore } from "./score-invariants";

/**
 * Random but legal player and the invariants of engine-design.md 5.2,
 * checked after every accepted transition. Returns the intents played so a
 * caller can replay the match.
 */

export type SimulationResult = Readonly<{
  state: EngineState;
  intents: readonly Intent[];
  deals: number;
}>;

const MAX_DEALS = 200;
const MAX_STEPS = 40_000;

export class InvariantError extends Error {
  constructor(config: VariantConfig, seed: number, message: string) {
    super(`${config.id}@${config.version} seed ${seed}: ${message}`);
    this.name = "InvariantError";
  }
}

function seedOf(seed: number): readonly [number, number, number, number] {
  return [seed >>> 0, (seed * 7 + 1) >>> 0, 0x9e3779b9, (seed ^ 0x5bd1e995) >>> 0];
}

function choose(intents: readonly Intent[], rng: () => number, selecting: boolean): Intent {
  const pick = <T>(items: readonly T[]) => items[Math.floor(rng() * items.length)]!;
  if (!selecting) return pick(intents);
  const passes = intents.filter((intent) => intent.kind === "pass");
  const others = intents.filter((intent) => intent.kind !== "pass");
  if (passes.length > 0 && (others.length === 0 || rng() < 0.6)) return passes[0]!;
  const doubles = others.filter((intent) => intent.kind === "double" || intent.kind === "redouble");
  if (doubles.length > 0 && rng() < 0.15) return pick(doubles);
  const raises = others.filter((intent) => intent.kind !== "double" && intent.kind !== "redouble");
  if (raises.length === 0) return pick(others);
  return pick(raises.slice(0, Math.max(1, Math.ceil(raises.length * rng() ** 3))));
}

function heldCards(state: EngineState): readonly string[] {
  const deal = state.deal;
  const seatCards = (seats: EngineStateSeats) => seats.flatMap((seat) => [
    ...seat.hand,
    ...seat.tableau.flatMap(({ hidden, visible }) => [hidden, visible].flatMap((card) => card === null ? [] : [card])),
  ]);
  if (deal.phase === "trumpSelection") {
    const fromDeck = deal.dealt.turnup !== null && !deal.dealt.seats.some((seat) => seat.tableau.length > 0);
    return [
      ...seatCards(deal.dealt.seats),
      ...(fromDeck ? [deal.dealt.turnup!] : []),
      ...deal.dealt.stock,
    ].map(cardKey);
  }
  if (deal.phase === "playing") {
    const play = deal.play;
    return [
      ...seatCards(play.seats),
      ...play.trick.cards.map(({ card }) => card),
      ...play.completed.flatMap(({ cards }) => cards.map(({ card }) => card)),
    ].map(cardKey);
  }
  if (deal.phase === "betweenDeals") return deal.pile.map(cardKey);
  if (deal.phase === "cutting") return deal.deck.map(cardKey);
  return deal.lastDeal === null ? [] : deal.lastDeal.tricks.flatMap(({ cards }) => cards.map(({ card }) => cardKey(card)));
}

type EngineStateSeats = Extract<EngineState["deal"], { phase: "playing" }>["play"]["seats"];

function checkConservation(state: EngineState, deck: readonly string[], fail: (message: string) => never): void {
  const held = [...heldCards(state)].sort();
  if (held.length !== deck.length || held.some((key, index) => key !== deck[index])) {
    fail(`card conservation broken in phase ${state.deal.phase}`);
  }
}

function checkPlayStart(state: EngineState, fail: (message: string) => never): void {
  if (state.deal.phase !== "playing") return;
  const play = state.deal.play;
  if (play.completed.length !== 0 || play.trick.cards.length !== 0) return;
  const sizes = play.seats.map((seat) => seat.hand.length
    + seat.tableau.reduce((count, { hidden, visible }) => count + (hidden ? 1 : 0) + (visible ? 1 : 0), 0));
  const expected = (32 - state.config.deck.removed.length) / state.config.table.seats;
  if (sizes.some((size) => size !== expected)) fail(`unequal hands at play start: ${sizes.join(",")}`);
}

function checkRejection(state: EngineState, seat: number, legal: readonly Intent[], fail: (message: string) => never): void {
  const other = (seat + 1) % state.config.table.seats;
  const wrong = legal[0]!;
  if (wrong.kind !== "nextDeal" && legalIntents(state, other).length === 0) {
    const result = step(state, { ...wrong, seat: other } as Intent);
    if (result.ok) fail(`seat ${other} acted out of turn`);
  }
  if (state.deal.phase === "playing" && legal[0]!.kind === "play") {
    const keys = new Set(legal.map((intent) => intent.kind === "play" ? cardKey(intent.card) : ""));
    const play = state.deal.play;
    const illegal = play.seats[seat]!.hand.find((card) => !keys.has(cardKey(card)));
    if (illegal !== undefined && step(state, { kind: "play", seat, card: illegal }).ok) {
      fail(`illegal card ${cardKey(illegal)} accepted`);
    }
  }
}

function checkDealEnd(state: EngineState, result: StepResult & { ok: true }, fail: (message: string) => never): void {
  if (!result.events.some((event) => event.type === "deal.scored")) return;
  const deal = state.deal;
  const lastDeal = deal.phase === "betweenDeals" || deal.phase === "matchFinished" ? deal.lastDeal : null;
  if (lastDeal === null) fail("a scored deal left no summary");
  const config = state.config;
  const cards = createVariantDeck(config.deck.removed);
  const tricks = cards.length / config.table.seats;
  if (lastDeal!.tricks.length !== tricks) fail(`expected ${tricks} tricks, got ${lastDeal!.tricks.length}`);
  const points = lastDeal!.tricks.reduce((total, trick) => total + trick.points, 0);
  if (points !== trickCardPoints(config, lastDeal!.contract.mode, cards)) fail("trick points do not add up");
  checkScore(config, lastDeal!, fail);
}

function unfrozenPath(value: unknown, path: string, seen: Set<unknown>): string | null {
  if (typeof value !== "object" || value === null || seen.has(value)) return null;
  seen.add(value);
  if (!Object.isFrozen(value)) return path;
  for (const [key, child] of Object.entries(value)) {
    const found = unfrozenPath(child, `${path}.${key}`, seen);
    if (found !== null) return found;
  }
  return null;
}

export function simulateMatch(config: VariantConfig, seed: number): SimulationResult {
  const fail = (message: string): never => { throw new InvariantError(config, seed, message); };
  const rng = testRng(seed);
  const deck = createVariantDeck(config.deck.removed).map(cardKey).sort();
  let state = createMatch(config, seedOf(seed)).state;
  const intents: Intent[] = [];
  for (let count = 0; count < MAX_STEPS; count += 1) {
    if (state.deal.phase === "matchFinished") {
      const tie = config.match.end.kind === "singleDeal"
        || (config.match.end.kind !== "deals" && config.match.end.tie === "draw")
        || (config.match.end.kind === "deals" && config.match.end.tie === "draw");
      if (state.match.winner === null && !tie) fail("finished without a winner");
      return { state, intents, deals: state.dealNumber };
    }
    if (state.dealNumber > MAX_DEALS) fail(`no end after ${MAX_DEALS} deals`);
    checkConservation(state, deck, fail);
    checkPlayStart(state, fail);
    const seat = seatToAct(state);
    const legal = seat === null ? systemIntents(state) : legalIntents(state, seat);
    if (legal.length === 0) fail(`no legal intent in phase ${state.deal.phase}`);
    if (seat !== null && rng() < 0.05) checkRejection(state, seat, legal, fail);
    const intent = choose(legal, rng, state.deal.phase === "trumpSelection");
    const result = step(state, intent);
    if (!result.ok) fail(`legal intent ${JSON.stringify(intent)} rejected: ${result.reason}`);
    const accepted = result as StepResult & { ok: true };
    if (accepted.events.length === 0) fail("accepted intent without events");
    if (accepted.state.seq !== state.seq + 1) fail("seq did not grow by one");
    intents.push(intent);
    state = accepted.state;
    checkDealEnd(state, accepted, fail);
    if (rng() < 0.01) {
      const path = unfrozenPath(state, "state", new Set([config]));
      if (path !== null) fail(`mutable state at ${path}`);
    }
  }
  return fail(`no end within ${MAX_STEPS} steps`);
}

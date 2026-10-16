import type { Card } from "../../../src/card-primitives";
import { cardKey } from "../../../src/engine/deck";
import type { SeatDeal } from "../../../src/engine/deal-interpreter";
import { createRng } from "../../../src/engine/rng";
import type { EngineState } from "../../../src/engine/state";
import { viewFor, type SeatView, type Viewer } from "../../../src/engine/view";

/**
 * Secrecy oracles for seat views (engine-design.md 5.2, check 5). Written from
 * the full engine state, independently of `view.ts`:
 * - `leakedCards`: every card a serialized view mentions must be public for
 *   that viewer (own hand, face-up cards, played cards, shown announcements);
 * - `scrambleHidden`: deals the cards the viewer cannot see differently and
 *   changes the RNG; the view must not change.
 */

type TestRng = () => number;

const CARD_PATTERN = /(spades|hearts|diamonds|clubs):(10|[789JQKA])/g;

function keysOf(cards: readonly Readonly<Card>[]): string[] {
  return cards.map(cardKey);
}

function faceUp(seats: readonly SeatDeal[]): string[] {
  return seats.flatMap((seat) => seat.tableau.flatMap(({ visible }) => visible === null ? [] : [cardKey(visible)]));
}

/** The cards `viewer` is entitled to see in this state. */
export function publicCards(state: EngineState, viewer: Viewer): ReadonlySet<string> {
  const keys = new Set(keysOf(state.config.deck.removed));
  const add = (cards: readonly string[]) => cards.forEach((key) => keys.add(key));
  const deal = state.deal;
  if (deal.phase === "trumpSelection") {
    const seats = deal.dealt.seats;
    if (viewer !== "spectator") add(keysOf(seats[viewer]!.hand));
    add(faceUp(seats));
    if (deal.dealt.turnup !== null) add([cardKey(deal.dealt.turnup)]);
  } else if (deal.phase === "playing") {
    const play = deal.play;
    if (viewer !== "spectator") add(keysOf(play.seats[viewer]!.hand));
    add(faceUp(play.seats));
    if (play.turnup !== null) add([cardKey(play.turnup)]);
    add(keysOf(play.trick.cards.map(({ card }) => card)));
    add(keysOf(play.completed.flatMap(({ cards }) => cards.map(({ card }) => card))));
    add(keysOf((play.declarations?.resolution?.accepted ?? []).flatMap(({ combination }) => combination.cards)));
  } else if (deal.phase === "cutting") {
    // The deck lies face down: no card of it is public.
  } else if (deal.lastDeal !== null) {
    add(keysOf(deal.lastDeal.tricks.flatMap(({ cards }) => cards.map(({ card }) => card))));
  }
  return keys;
}

function collect(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (!value.includes(":")) return;
    for (const match of value.matchAll(CARD_PATTERN)) found.add(match[0]);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    for (const child of value) collect(child, found);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.suit === "string" && typeof record.rank === "string") found.add(`${record.suit}:${record.rank}`);
  for (const key in record) collect(record[key], found);
}

/** Every card a serialized view mentions, as an object or inside a string. */
export function mentionedCards(serialized: string): ReadonlySet<string> {
  const found = new Set<string>();
  collect(JSON.parse(serialized), found);
  for (const match of serialized.matchAll(CARD_PATTERN)) found.add(match[0]);
  return found;
}

export function leakedCards(state: EngineState, viewer: Viewer, serialized: string): readonly string[] {
  const allowed = publicCards(state, viewer);
  return [...mentionedCards(serialized)].filter((key) => !allowed.has(key));
}

/**
 * The same check on the view object, for every step of a simulation: the view
 * is plain JSON data, and `rules` is the table configuration, public by
 * construction (checked by the caller once per match).
 */
export function leakedFromView(state: EngineState, view: SeatView): readonly string[] {
  const found = new Set<string>();
  for (const [key, value] of Object.entries(view)) {
    if (key !== "rules") collect(value, found);
  }
  if (found.size === 0) return [];
  const allowed = publicCards(state, view.viewer);
  return [...found].filter((key) => !allowed.has(key));
}

function shuffled<T>(items: readonly T[], rng: TestRng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

type Pool = Readonly<{ take: () => Readonly<Card> }>;

function poolOf(cards: readonly Readonly<Card>[], rng: TestRng): Pool {
  const queue = shuffled(cards, rng);
  return { take: () => queue.shift()! };
}

function hiddenOf(seats: readonly SeatDeal[], viewer: Viewer): Readonly<Card>[] {
  return seats.flatMap((seat, index) => [
    ...(index === viewer ? [] : seat.hand),
    ...seat.tableau.flatMap(({ hidden }) => hidden === null ? [] : [hidden]),
  ]);
}

function redealt(seats: readonly SeatDeal[], viewer: Viewer, pool: Pool): readonly SeatDeal[] {
  return seats.map((seat, index) => ({
    hand: index === viewer ? seat.hand : seat.hand.map(() => pool.take()),
    tableau: seat.tableau.map((column) => ({ ...column, hidden: column.hidden === null ? null : pool.take() })),
  }));
}

/** The same public situation with every hidden card moved and another RNG. */
export function scrambleHidden(state: EngineState, viewer: Viewer, rng: TestRng): EngineState {
  const seed = [1, 2, 3, 4].map(() => Math.floor(rng() * 2 ** 32) >>> 0) as [number, number, number, number];
  const base = { ...state, rng: createRng(seed) };
  const deal = state.deal;
  if (deal.phase === "trumpSelection") {
    const dealt = deal.dealt;
    const pool = poolOf([...hiddenOf(dealt.seats, viewer), ...dealt.stock], rng);
    const seats = redealt(dealt.seats, viewer, pool);
    return { ...base, deal: { ...deal, dealt: { ...dealt, seats, stock: dealt.stock.map(() => pool.take()) } } };
  }
  if (deal.phase === "playing") {
    const play = deal.play;
    const seats = redealt(play.seats, viewer, poolOf(hiddenOf(play.seats, viewer), rng));
    return { ...base, deal: { ...deal, play: { ...play, seats } } };
  }
  if (deal.phase === "betweenDeals") return { ...base, deal: { ...deal, pile: shuffled(deal.pile, rng) } };
  if (deal.phase === "cutting") return { ...base, deal: { ...deal, deck: shuffled(deal.deck, rng) } };
  return base;
}

/** Null when the view survives the scramble unchanged, else the first difference. */
export function secrecyBreach(state: EngineState, viewer: Viewer, rng: TestRng): string | null {
  const original = JSON.stringify(viewFor(state, viewer));
  const scrambled = JSON.stringify(viewFor(scrambleHidden(state, viewer, rng), viewer));
  if (original === scrambled) return null;
  const at = [...original].findIndex((char, index) => scrambled[index] !== char);
  return `view changed at ${at}: ${original.slice(Math.max(0, at - 60), at + 60)}`;
}

import type { Card } from "../../../src/card-primitives";
import { cardPoints } from "../../../src/engine/card-scale";
import { cardKey, createVariantDeck } from "../../../src/engine/deck";
import type { Knowledge } from "../../../src/engine/knowledge";
import type { EngineState } from "../../../src/engine/state";
import { cardStrengthForMode } from "../../../src/rules/contract-card-policy";
import { virtualCard } from "../../../src/engine/card-scale";

/**
 * Compares a deduction with the full engine state (engine-design.md step 12:
 * « jamais faux, parfois incomplet »). Returns the false claims found.
 */

export type KnowledgeStats = { deductions: number; voids: number; excluded: number; located: number };

type Truth = Readonly<{
  hands: readonly ReadonlySet<string>[];
  elsewhere: ReadonlySet<string>;
  played: ReadonlySet<string>;
  faceUp: ReadonlyMap<string, number>;
}>;

const keys = (cards: readonly Readonly<Card>[]) => new Set(cards.map(cardKey));

function truthOf(state: EngineState, viewer: number): Truth | null {
  const deal = state.deal;
  if (deal.phase !== "playing" && deal.phase !== "trumpSelection") return null;
  const seats = deal.phase === "playing" ? deal.play.seats : deal.dealt.seats;
  const hands = seats.map(({ hand }) => keys(hand));
  const faceDown = seats.flatMap(({ tableau }) => tableau.flatMap(({ hidden }) => hidden === null ? [] : [hidden]));
  const stock = deal.phase === "trumpSelection" ? deal.dealt.stock : [];
  const others = seats.flatMap(({ hand }, seat) => seat === viewer ? [] : hand);
  const faceUp = new Map<string, number>();
  seats.forEach(({ tableau }, seat) => tableau.forEach(({ visible }) => {
    if (visible !== null) faceUp.set(cardKey(visible), seat);
  }));
  const played = deal.phase === "playing"
    ? [...deal.play.trick.cards, ...deal.play.completed.flatMap(({ cards }) => cards)].map(({ card }) => card)
    : [];
  return { hands, elsewhere: keys([...others, ...faceDown, ...stock]), played: keys(played), faceUp };
}

function checkSeats(knowledge: Knowledge, truth: Truth, errors: string[]): void {
  for (const { card, seat } of knowledge.located) {
    if (!truth.hands[seat]!.has(cardKey(card))) errors.push(`${cardKey(card)} located with ${seat}`);
  }
  for (const seat of knowledge.seats) {
    const hand = truth.hands[seat.seat]!;
    seat.excluded.filter((card) => hand.has(cardKey(card)))
      .forEach((card) => errors.push(`${cardKey(card)} excluded from ${seat.seat}`));
    const known = new Set([
      ...seat.possible.map(cardKey),
      ...knowledge.located.filter((entry) => entry.seat === seat.seat).map(({ card }) => cardKey(card)),
    ]);
    [...hand].filter((key) => !known.has(key)).forEach((key) => errors.push(`${key} of ${seat.seat} not possible`));
    seat.voidSuits.filter((suit) => [...hand].some((key) => key.startsWith(`${suit}:`)))
      .forEach((suit) => errors.push(`${seat.seat} void in ${suit}`));
  }
}

function checkCounts(state: EngineState, viewer: number, knowledge: Knowledge, truth: Truth, errors: string[]): void {
  const deal = state.deal;
  if (deal.phase !== "playing") return;
  const mode = deal.play.contract.mode;
  const config = state.config;
  const left = createVariantDeck(config.deck.removed).filter((card) => !truth.played.has(cardKey(card)));
  const points = left.reduce((total, card) => total + cardPoints(config, mode, card), 0);
  if (knowledge.pointsRemaining !== points) errors.push(`points ${knowledge.pointsRemaining} vs ${points}`);
  if (knowledge.trumps !== null) {
    const trumps = left.filter((card) => knowledge.trumps!.suits.includes(card.suit)).length;
    if (knowledge.trumps.remaining !== trumps) errors.push(`trumps ${knowledge.trumps.remaining} vs ${trumps}`);
  }
  const strength = (card: Readonly<Card>) => cardStrengthForMode(virtualCard(config.cards, mode, card), mode);
  for (const master of knowledge.masters) {
    const suit = left.filter((card) => card.suit === master.suit);
    if (suit.some((card) => strength(card) > strength(master.card))) errors.push(`${cardKey(master.card)} is not master`);
    const key = cardKey(master.card);
    const holder = master.holder === "me" ? viewer : master.holder;
    if (holder !== "unseen" && !truth.hands[holder]!.has(key) && truth.faceUp.get(key) !== holder) {
      errors.push(`${key} not held by ${String(master.holder)}`);
    }
  }
}

/** False claims of `knowledge` (deduced for `viewer`) about the real state. */
export function falseClaims(state: EngineState, viewer: number, knowledge: Knowledge, stats: KnowledgeStats): readonly string[] {
  const truth = truthOf(state, viewer);
  if (truth === null) return [];
  const errors: string[] = [];
  const unseen = knowledge.unseen.map(cardKey);
  const located = knowledge.located.map(({ card }) => cardKey(card));
  unseen.filter((key) => !truth.elsewhere.has(key) && !(truth.played.has(key) && !knowledge.historyComplete))
    .forEach((key) => errors.push(`${key} is not unseen`));
  if (knowledge.historyComplete) {
    const accounted = new Set([...unseen, ...located]);
    [...truth.elsewhere].filter((key) => !accounted.has(key)).forEach((key) => errors.push(`${key} missing from unseen`));
    checkCounts(state, viewer, knowledge, truth, errors);
  }
  checkSeats(knowledge, truth, errors);
  stats.deductions += 1;
  stats.voids += knowledge.seats.reduce((total, seat) => total + (seat.handCount > 0 ? seat.voidSuits.length : 0), 0);
  stats.excluded += knowledge.seats.reduce((total, seat) => total + seat.excluded.length, 0);
  stats.located += located.length;
  return errors;
}

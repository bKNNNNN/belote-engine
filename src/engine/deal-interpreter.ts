import type { Card } from "../card-primitives";
import { cardKey, createVariantDeck, type EngineCard, type EngineDeck } from "./deck";
import { assertSeat, seatsAfterDealer, type Seat } from "./seats";
import type { DealStep, VariantConfig } from "./variant-config";

/**
 * Interprets `deal.steps` (engine-design.md section 2.2). Dealing runs in two
 * halves around the `trumpSelection` stop: `dealUntilSelection` before the
 * trump is chosen, `completeDeal` once the taker is known. Cards leave the
 * deck in order; each packet goes to every seat in deal order (the seat after
 * the dealer first), exactly as the legacy deal functions do.
 */

export type TableauColumn = Readonly<{ hidden: EngineCard | null; visible: EngineCard | null }>;

export type SeatDeal = Readonly<{
  hand: EngineDeck;
  tableau: readonly TableauColumn[];
}>;

type DealSnapshot = Readonly<{
  dealer: Seat;
  seats: readonly SeatDeal[];
  turnup: EngineCard | null;
  stock: EngineDeck;
}>;

export type PreSelectionDeal = DealSnapshot & Readonly<{ phase: "awaitingSelection" }>;
export type CompletedDeal = DealSnapshot & Readonly<{ phase: "complete" }>;

type Zone = "hand" | "tableauHidden" | "tableauVisible";

export class InvalidDealError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDealError";
  }
}

function assertVariantDeck(config: VariantConfig, deck: readonly Readonly<Card>[]): void {
  const expected = createVariantDeck(config.deck.removed).map(cardKey).sort();
  const received = deck.map(cardKey).sort();
  if (
    received.length !== expected.length
    || received.some((key, index) => key !== expected[index])
  ) {
    throw new InvalidDealError(
      `A ${config.id}@${config.version} deal needs its ${expected.length}-card deck, each card once`,
    );
  }
}

function emptySeat(config: VariantConfig): SeatDeal {
  const columns = config.table.tableau?.columns ?? 0;
  return {
    hand: [],
    tableau: Array.from({ length: columns }, () => ({ hidden: null, visible: null })),
  };
}

function withCards(seat: SeatDeal, zone: Zone, cards: EngineDeck): SeatDeal {
  if (zone === "hand") return { ...seat, hand: [...seat.hand, ...cards] };
  const layer = zone === "tableauHidden" ? "hidden" : "visible";
  const firstFree = seat.tableau.findIndex((column) => column[layer] === null);
  if (firstFree < 0 || firstFree + cards.length > seat.tableau.length) {
    throw new InvalidDealError("The tableau has no free column for this packet");
  }
  return {
    ...seat,
    tableau: seat.tableau.map((column, index) =>
      index >= firstFree && index < firstFree + cards.length
        ? { ...column, [layer]: cards[index - firstFree]! }
        : column),
  };
}

function dealPackets(
  config: VariantConfig,
  snapshot: DealSnapshot,
  sizes: readonly number[],
  zone: Zone,
): DealSnapshot {
  const order = seatsAfterDealer(config.table, snapshot.dealer);
  return sizes.reduce((current, size) => order.reduce((inner, seat) => ({
    ...inner,
    seats: inner.seats.map((seatDeal, index) =>
      index === seat ? withCards(seatDeal, zone, inner.stock.slice(0, size)) : seatDeal),
    stock: inner.stock.slice(size),
  }), current), snapshot);
}

function turnUp(snapshot: DealSnapshot, source: "deck" | "dealerTableauLast"): DealSnapshot {
  if (source === "deck") {
    return { ...snapshot, turnup: snapshot.stock[0]!, stock: snapshot.stock.slice(1) };
  }
  const last = snapshot.seats[snapshot.dealer]!.tableau.at(-1)?.visible ?? null;
  if (last === null) throw new InvalidDealError("The dealer has no visible tableau card");
  return { ...snapshot, turnup: last };
}

function completeAfterTaking(
  config: VariantConfig,
  snapshot: DealSnapshot,
  step: Extract<DealStep, { kind: "completeAfterTaking" }>,
  taker: Seat | null,
): DealSnapshot {
  if (taker === null) throw new InvalidDealError("Completing this deal needs a taker");
  assertSeat(config.table, taker);
  return seatsAfterDealer(config.table, snapshot.dealer).reduce((current, seat) => {
    const isTaker = seat === taker;
    const count = isTaker ? step.takerCount : step.othersCount;
    const turnup = isTaker && step.takerReceivesTurnup && current.turnup !== null
      ? [current.turnup]
      : [];
    return {
      ...current,
      seats: current.seats.map((seatDeal, index) => index === seat
        ? withCards(seatDeal, "hand", [...turnup, ...current.stock.slice(0, count)])
        : seatDeal),
      stock: current.stock.slice(count),
    };
  }, snapshot);
}

function applyStep(
  config: VariantConfig,
  snapshot: DealSnapshot,
  step: DealStep,
  taker: Seat | null,
): DealSnapshot {
  switch (step.kind) {
    case "packets":
      return dealPackets(config, snapshot, step.sizes, step.zone);
    case "packetsAfterSelection":
      return dealPackets(config, snapshot, step.sizes, "hand");
    case "turnup":
      return turnUp(snapshot, step.source);
    case "completeAfterTaking":
      return completeAfterTaking(config, snapshot, step, taker);
    case "trumpSelection":
      return snapshot;
  }
}

function freezeSnapshot<TPhase extends "awaitingSelection" | "complete">(
  phase: TPhase,
  snapshot: DealSnapshot,
): DealSnapshot & Readonly<{ phase: TPhase }> {
  return Object.freeze({
    phase,
    dealer: snapshot.dealer,
    seats: Object.freeze(snapshot.seats.map((seat) => Object.freeze({
      hand: Object.freeze([...seat.hand]),
      tableau: Object.freeze(seat.tableau.map((column) => Object.freeze({ ...column }))),
    }))),
    turnup: snapshot.turnup,
    stock: Object.freeze([...snapshot.stock]),
  });
}

function selectionIndex(config: VariantConfig): number {
  return config.deal.steps.findIndex((step) => step.kind === "trumpSelection");
}

export function dealUntilSelection(
  config: VariantConfig,
  deck: readonly Readonly<Card>[],
  dealer: Seat,
): PreSelectionDeal {
  assertSeat(config.table, dealer);
  assertVariantDeck(config, deck);
  const initial: DealSnapshot = {
    dealer,
    seats: Array.from({ length: config.table.seats }, () => emptySeat(config)),
    turnup: null,
    stock: [...deck],
  };
  const dealt = config.deal.steps
    .slice(0, selectionIndex(config))
    .reduce((snapshot, step) => applyStep(config, snapshot, step, null), initial);
  return freezeSnapshot("awaitingSelection", dealt);
}

export function completeDeal(
  config: VariantConfig,
  deal: PreSelectionDeal,
  taker: Seat | null,
): CompletedDeal {
  if (taker !== null) assertSeat(config.table, taker);
  const completed = config.deal.steps
    .slice(selectionIndex(config) + 1)
    .reduce((snapshot, step) => applyStep(config, snapshot, step, taker), deal as DealSnapshot);
  if (completed.stock.length !== 0) {
    throw new InvalidDealError("The deal left cards in the stock");
  }
  return freezeSnapshot("complete", completed);
}

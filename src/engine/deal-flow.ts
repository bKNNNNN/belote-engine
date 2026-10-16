import type { Card } from "../card-primitives";
import { createBeloteState, belotePointsBySeat } from "./belote";
import type { Contract } from "./contract";
import { createVariantDeck, cutDeck, legalCutRange, shuffleDeck, type CutRange, type EngineDeck } from "./deck";
import { completeDeal, dealUntilSelection, type PreSelectionDeal } from "./deal-interpreter";
import { recordDeal } from "./match";
import type { RedealRequest } from "./redeal-request";
import { playableCards } from "./play-rules";
import { nextInt, type RngState } from "./rng";
import { dealFacts, scoreDeal } from "./scoring";
import { nextSeat, previousSeat, seatsAfterDealer, sidesOf, type Seat } from "./seats";
import type {
  DealState,
  EngineEvent,
  EngineState,
  PlayState,
} from "./state";
import { startSelection, type TrumpSelectionState } from "./trump-selection";
import type { VariantConfig } from "./variant-config";

/** Deal lifecycle: dealing, the switch to play, redeal, scoring, next deck. */

type Flow = Readonly<{ state: EngineState; events: readonly EngineEvent[] }>;

export function dealtState(
  config: VariantConfig,
  deck: readonly Readonly<Card>[],
  dealer: Seat,
): DealState {
  const frozen = deck.map((card) => Object.isFrozen(card) ? card : Object.freeze({ suit: card.suit, rank: card.rank }));
  const dealt = dealUntilSelection(config, frozen, dealer);
  return Object.freeze({
    phase: "trumpSelection",
    dealt,
    selection: startSelection(config, dealer, dealt.turnup),
  });
}

/** Deals `deck` at once, without a cut: a variant with no cut step, or a logged deck. */
export function startDeal(state: EngineState, deck: readonly Readonly<Card>[], dealer: Seat): Flow {
  return dealOut(Object.freeze({ ...state, dealer, dealNumber: state.dealNumber + 1 }), deck);
}

function dealOut(state: EngineState, deck: readonly Readonly<Card>[]): Flow {
  const { dealer, dealNumber } = state;
  return Object.freeze({
    state: Object.freeze({ ...state, deal: dealtState(state.config, deck, dealer) }),
    events: Object.freeze([{ type: "deal.started" as const, dealNumber, dealer }]),
  });
}

/** The legal cut positions of this table, or null when it has no cut step. */
export function cutRangeOf(config: VariantConfig): CutRange | null {
  const cut = config.deal.cut;
  if (cut === null) return null;
  return legalCutRange(createVariantDeck(config.deck.removed).length, cut.minPacket);
}

export function isLegalCut(config: VariantConfig, position: number): boolean {
  const range = cutRangeOf(config);
  return range !== null && Number.isInteger(position) && position >= range.min && position <= range.max;
}

/**
 * A new deal: the deck waits for the cut when the variant has one (the player
 * at the dealer's left, who plays last), else it is dealt at once.
 */
export function prepareDeal(state: EngineState, deck: readonly Readonly<Card>[], dealer: Seat): Flow {
  if (state.config.deal.cut === null) return startDeal(state, deck, dealer);
  const dealNumber = state.dealNumber + 1;
  const cutter = previousSeat(state.config.table, dealer);
  const frozen = Object.freeze(deck.map((card) => Object.isFrozen(card) ? card : Object.freeze({ ...card })));
  return Object.freeze({
    state: Object.freeze({
      ...state,
      dealer,
      dealNumber,
      deal: Object.freeze({ phase: "cutting" as const, deck: frozen, cutter }),
    }),
    events: Object.freeze([{ type: "deal.cutRequested" as const, dealNumber, dealer, cutter }]),
  });
}

/** The cutter lifted `position` cards: they go under the rest and the deck is dealt. */
export function cutAndDeal(state: EngineState, deck: EngineDeck, seat: Seat, position: number): Flow {
  const lastCut = Object.freeze({ dealNumber: state.dealNumber, seat, position });
  const dealt = dealOut(Object.freeze({ ...state, lastCut }), cutDeck(deck, position));
  return Object.freeze({
    state: dealt.state,
    events: Object.freeze([{ type: "deal.cut" as const, seat, position }, ...dealt.events]),
  });
}

function firstLeader(config: VariantConfig, dealer: Seat, contract: Contract): Seat {
  if (config.play.firstLead === "generaleDeclarer" && contract.value === "generale") return contract.taker;
  return seatsAfterDealer(config.table, dealer)[0]!;
}

export function openPlay(
  config: VariantConfig,
  dealt: PreSelectionDeal,
  selection: TrumpSelectionState,
  contract: Contract,
): PlayState {
  const completed = completeDeal(config, dealt, contract.taker);
  const leader = firstLeader(config, dealt.dealer, contract);
  const holdings = completed.seats.map((seat) => [
    ...playableCards(seat),
    ...seat.tableau.flatMap(({ hidden }) => hidden === null ? [] : [hidden]),
  ]);
  return Object.freeze({
    contract,
    auction: selection.history,
    turnup: dealt.turnup,
    seats: completed.seats,
    toAct: leader,
    firstLeader: leader,
    trick: Object.freeze({ leader, cards: Object.freeze([]) }),
    completed: Object.freeze([]),
    belote: createBeloteState(config, contract.mode, holdings, contract.taker),
    declarations: config.declarations === null ? null : Object.freeze({
      declared: Object.freeze(completed.seats.map(() => null)),
      resolution: null,
    }),
    pendingReveals: Object.freeze([]),
  });
}

/** Every dealt card in a fixed order: what a redeal after four passes gathers. */
function dealtPile(dealt: PreSelectionDeal): EngineDeck {
  return Object.freeze([
    ...dealt.seats.flatMap((seat) => [
      ...seat.hand,
      ...seat.tableau.flatMap(({ hidden, visible }) => [hidden, visible].flatMap((card) => card === null ? [] : [card])),
    ]),
    ...(dealt.turnup === null || dealt.seats.some((seat) => seat.tableau.length > 0) ? [] : [dealt.turnup]),
    ...dealt.stock,
  ]);
}

/**
 * The deal is gathered unscored and the next dealer deals again: after four
 * passes, or when a seat had it cancelled (`request`, weak-hand options).
 */
export function redeal(state: EngineState, dealt: PreSelectionDeal, request: RedealRequest | null = null): Flow {
  const nextDealer = nextSeat(state.config.table, state.dealer);
  return Object.freeze({
    state: Object.freeze({
      ...state,
      deal: Object.freeze({
        phase: "betweenDeals" as const,
        reason: request === null ? "allPassed" as const : "redealRequested" as const,
        nextDealer,
        redealRequest: request,
        pile: dealtPile(dealt),
        lastDeal: null,
      }),
    }),
    events: Object.freeze([
      ...(request === null ? [] : [{ type: "deal.redealRequested" as const, ...request }]),
      { type: "deal.redealt" as const, previousDealer: state.dealer, nextDealer },
    ]),
  });
}

export function finishDeal(state: EngineState, play: PlayState): Flow {
  const config = state.config;
  const declarations = play.declarations?.resolution?.pointsBySide
    ?? sidesOf(config.table).map(() => 0);
  const facts = dealFacts(config, {
    contract: play.contract,
    tricks: play.completed,
    beloteBySeat: belotePointsBySeat(config, play.belote),
    declarationsBySide: declarations,
  });
  const score = scoreDeal(config, facts, state.match.litigePending);
  const recorded = recordDeal(config, state.match, facts, score);
  const lastDeal = Object.freeze({ contract: play.contract, score, tricks: play.completed });
  const deal: DealState = recorded.match.finished
    ? Object.freeze({ phase: "matchFinished" as const, lastDeal })
    : Object.freeze({
      phase: "betweenDeals" as const,
      reason: "scored" as const,
      nextDealer: nextSeat(config.table, state.dealer),
      redealRequest: null,
      pile: Object.freeze(play.completed.flatMap(({ cards }) => cards.map(({ card }) => card))),
      lastDeal,
    });
  return Object.freeze({
    state: Object.freeze({ ...state, match: recorded.match, deal }),
    events: recorded.events,
  });
}

/**
 * Draws the next deck: a full shuffle, or in a concours the gathered pile
 * squared by a cut of the dealer's own (secret, so that a player who kept
 * every trick in mind cannot read the deck from the public cut that follows).
 */
export function nextDeck(
  config: VariantConfig,
  rng: RngState,
  pile: EngineDeck,
): Readonly<{ deck: EngineDeck; rng: RngState }> {
  if (config.deal.shuffle === "cutOnly" && pile.length > 1) {
    const cut = nextInt(rng, pile.length - 1);
    const at = cut.value + 1;
    return Object.freeze({ deck: Object.freeze([...pile.slice(at), ...pile.slice(0, at)]), rng: cut.state });
  }
  const shuffled = shuffleDeck(createVariantDeck(config.deck.removed), rng);
  return Object.freeze({ deck: shuffled.deck, rng: shuffled.state });
}

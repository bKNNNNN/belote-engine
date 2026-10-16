import { beloteAnnouncementAllowed, recordBelotePlay } from "./belote";
import { trickCardPoints } from "./card-scale";
import { cardKey } from "./deck";
import { finishDeal } from "./deal-flow";
import {
  declarationSelections,
  resolveDeclarations,
  validateDeclaration,
} from "./declarations";
import { legalPlayCards, revealColumn, trickWinner, withoutCard } from "./play-rules";
import { nextSeat, type Seat } from "./seats";
import {
  reject,
  type DeclareIntent,
  type EngineEvent,
  type EngineState,
  type Intent,
  type PlayIntent,
  type PlayState,
  type StepResult,
} from "./state";

/**
 * Play phase: announcements before each seat's first card, card play with
 * belote, trick completion (tableau reveals at two seats), and the hand-over
 * to scoring once every card is down.
 */

type PlayFlow = Readonly<{ state: EngineState; events: readonly EngineEvent[] }>;

export function mustDeclare(play: PlayState, seat: Seat): boolean {
  return play.declarations !== null
    && play.completed.length === 0
    && play.declarations.declared[seat] === null;
}

export function legalPlayIntents(state: EngineState, play: PlayState, seat: Seat): readonly Intent[] {
  if (play.toAct !== seat) return Object.freeze([]);
  const config = state.config;
  const hand = play.seats[seat]!.hand;
  if (mustDeclare(play, seat)) {
    return Object.freeze(declarationSelections(config, play.contract.mode, hand)
      .map((combinationIds) => ({ kind: "declare" as const, seat, combinationIds })));
  }
  const cards = legalPlayCards(config, play.contract.mode, play.seats, play.trick.cards, seat, play.contract.taker);
  return Object.freeze(cards.flatMap((card): PlayIntent[] => {
    const plain: PlayIntent = { kind: "play", seat, card };
    return beloteAnnouncementAllowed(config, play.belote, seat, card)
      ? [plain, { ...plain, belote: true }]
      : [plain];
  }));
}

function withPlay(state: EngineState, play: PlayState): EngineState {
  return Object.freeze({ ...state, deal: Object.freeze({ phase: "playing" as const, play }) });
}

export function applyDeclare(state: EngineState, play: PlayState, intent: DeclareIntent): StepResult {
  if (!mustDeclare(play, intent.seat)) return reject("illegalDeclaration");
  const hand = play.seats[intent.seat]!.hand;
  const combinations = validateDeclaration(state.config, play.contract.mode, hand, intent.combinationIds);
  if (combinations === null) return reject("illegalDeclaration");
  const declarations = play.declarations!;
  const next: PlayState = Object.freeze({
    ...play,
    declarations: Object.freeze({
      ...declarations,
      declared: Object.freeze(declarations.declared.map((current, seat) =>
        seat === intent.seat ? combinations : current)),
    }),
  });
  return Object.freeze({
    ok: true as const,
    state: withPlay(state, next),
    events: Object.freeze([{
      type: "declarations.declared" as const,
      seat: intent.seat,
      combinationIds: Object.freeze([...intent.combinationIds]),
    }]),
  });
}

function resolvedDeclarations(state: EngineState, play: PlayState): PlayFlow | null {
  const declarations = play.declarations;
  if (declarations === null || declarations.resolution !== null || play.completed.length !== 1) return null;
  const resolution = resolveDeclarations(
    state.config,
    play.contract.mode,
    declarations.declared.map((combinations) => combinations ?? []),
    play.firstLeader,
  );
  const next = Object.freeze({ ...play, declarations: Object.freeze({ ...declarations, resolution }) });
  return {
    state: withPlay(state, next),
    events: [{
      type: "declarations.resolved",
      winningSide: resolution.winningSide,
      pointsBySide: resolution.pointsBySide,
    }],
  };
}

function completeTrick(state: EngineState, play: PlayState): PlayFlow {
  const config = state.config;
  const mode = play.contract.mode;
  const cards = play.trick.cards;
  const winner = trickWinner(config, mode, cards);
  const points = trickCardPoints(config, mode, cards.map(({ card }) => card));
  const revealed = play.pendingReveals;
  const seats = play.seats.map((holding, seat) =>
    revealed.filter((entry) => entry.seat === seat)
      .reduce((current, { column }) => revealColumn(current, column), holding));
  const record = Object.freeze({ leader: play.trick.leader, cards, winner, points });
  const next: PlayState = Object.freeze({
    ...play,
    seats: Object.freeze(seats),
    toAct: winner,
    trick: Object.freeze({ leader: winner, cards: Object.freeze([]) }),
    completed: Object.freeze([...play.completed, record]),
    pendingReveals: Object.freeze([]),
  });
  const events: EngineEvent[] = [
    { type: "trick.completed", trickIndex: play.completed.length, winner, points },
    ...revealed.flatMap(({ seat, column }) => {
      const card = seats[seat]!.tableau[column]!.visible;
      return card === null ? [] : [{ type: "tableau.revealed" as const, seat, column, card }];
    }),
  ];
  const resolution = resolvedDeclarations(state, next);
  const afterResolution = resolution ?? { state: withPlay(state, next), events: [] };
  const finished = next.seats.every((holding) =>
    holding.hand.length === 0 && holding.tableau.every(({ hidden, visible }) => hidden === null && visible === null));
  if (!finished) return { state: afterResolution.state, events: [...events, ...afterResolution.events] };
  const scored = finishDeal(afterResolution.state, next);
  return { state: scored.state, events: [...events, ...afterResolution.events, ...scored.events] };
}

export function applyPlay(state: EngineState, play: PlayState, intent: PlayIntent): StepResult {
  if (mustDeclare(play, intent.seat)) return reject("mustDeclare");
  const config = state.config;
  const legal = legalPlayCards(config, play.contract.mode, play.seats, play.trick.cards, intent.seat, play.contract.taker);
  const key = cardKey(intent.card);
  const card = legal.find((candidate) => cardKey(candidate) === key);
  if (card === undefined) return reject("illegalCard");
  const announced = intent.belote === true;
  if (announced && !beloteAnnouncementAllowed(config, play.belote, intent.seat, card)) {
    return reject("illegalBelote");
  }
  const belote = recordBelotePlay(config, play.belote, intent.seat, card, announced);
  const removed = withoutCard(play.seats[intent.seat]!, card);
  const immediate = removed.fromColumn !== null && config.table.tableau?.reveal === "immediate";
  const holding = immediate ? revealColumn(removed.holding, removed.fromColumn!) : removed.holding;
  const pendingReveals = removed.fromColumn !== null && !immediate
    ? [...play.pendingReveals, Object.freeze({ seat: intent.seat, column: removed.fromColumn })]
    : play.pendingReveals;
  const next: PlayState = Object.freeze({
    ...play,
    seats: Object.freeze(play.seats.map((current, seat) => seat === intent.seat ? holding : current)),
    toAct: nextSeat(config.table, intent.seat),
    trick: Object.freeze({
      leader: play.trick.leader,
      cards: Object.freeze([...play.trick.cards, Object.freeze({ seat: intent.seat, card })]),
    }),
    belote: belote.state,
    pendingReveals: Object.freeze(pendingReveals),
  });
  const played: EngineEvent = {
    type: "card.played",
    seat: intent.seat,
    card,
    trickIndex: play.completed.length,
    fromTableau: removed.fromColumn !== null,
  };
  const reveal: EngineEvent[] = immediate && holding.tableau[removed.fromColumn!]!.visible !== null
    ? [{ type: "tableau.revealed", seat: intent.seat, column: removed.fromColumn!, card: holding.tableau[removed.fromColumn!]!.visible! }]
    : [];
  const flow = next.trick.cards.length === config.table.seats
    ? completeTrick(state, next)
    : { state: withPlay(state, next), events: [] };
  return Object.freeze({
    ok: true as const,
    state: flow.state,
    events: Object.freeze([played, ...belote.events, ...reveal, ...flow.events]),
  });
}

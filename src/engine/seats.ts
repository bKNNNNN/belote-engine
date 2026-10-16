import type { TableConfig } from "./variant-config";

/**
 * Seats, play direction, scoring sides and deal alliances for 2, 3 or 4 seats.
 * Seat numbers run 0..n-1. "counterclockwise" (the traditional direction)
 * walks seat + 1, the order of the legacy `rightOf`; "clockwise" walks seat - 1.
 */

export type Seat = number;
export type SideId = number;
type TableShape = Pick<TableConfig, "seats" | "sides" | "direction">;

export class InvalidEngineSeatError extends RangeError {
  constructor(seat: unknown, seats: number) {
    super(`Seat ${String(seat)} is not a seat of a ${seats}-seat table`);
    this.name = "InvalidEngineSeatError";
  }
}

export function isSeat(table: TableShape, seat: unknown): seat is Seat {
  return typeof seat === "number"
    && Number.isInteger(seat)
    && seat >= 0
    && seat < table.seats;
}

export function assertSeat(table: TableShape, seat: unknown): asserts seat is Seat {
  if (!isSeat(table, seat)) throw new InvalidEngineSeatError(seat, table.seats);
}

export function seatsOf(table: TableShape): readonly Seat[] {
  return Object.freeze(Array.from({ length: table.seats }, (_, seat) => seat));
}

function step(table: TableShape): number {
  return table.direction === "counterclockwise" ? 1 : table.seats - 1;
}

export function nextSeat(table: TableShape, seat: Seat): Seat {
  assertSeat(table, seat);
  return (seat + step(table)) % table.seats;
}

export function previousSeat(table: TableShape, seat: Seat): Seat {
  assertSeat(table, seat);
  return (seat + table.seats - step(table)) % table.seats;
}

/** Every seat once, starting with `leader`, in play direction. */
export function playOrderFrom(table: TableShape, leader: Seat): readonly Seat[] {
  assertSeat(table, leader);
  return Object.freeze(Array.from(
    { length: table.seats },
    (_, offset) => (leader + offset * step(table)) % table.seats,
  ));
}

/** Deal and speech order: the seat after the dealer first, the dealer last. */
export function seatsAfterDealer(table: TableShape, dealer: Seat): readonly Seat[] {
  return playOrderFrom(table, nextSeat(table, dealer));
}

/** Scoring sides: pairs at four seats, one side per player at two and three. */
export function sidesOf(table: TableShape): readonly SideId[] {
  return table.sides.kind === "fixedPairs"
    ? Object.freeze([0, 1])
    : seatsOf(table);
}

export function sideOf(table: TableShape, seat: Seat): SideId {
  assertSeat(table, seat);
  return table.sides.kind === "fixedPairs" ? seat % 2 : seat;
}

/**
 * Seats playing on the same side as `seat` during this deal: the fixed
 * partner at four, the co-defender at three once someone has taken, nobody
 * at two.
 */
export function dealAllies(
  table: TableShape,
  seat: Seat,
  taker: Seat | null,
): readonly Seat[] {
  assertSeat(table, seat);
  if (taker !== null) assertSeat(table, taker);
  const others = seatsOf(table).filter((other) => other !== seat);
  if (table.sides.kind === "fixedPairs") {
    return Object.freeze(others.filter((other) => other % 2 === seat % 2));
  }
  if (table.sides.kind === "headsUp" || taker === null || taker === seat) {
    return Object.freeze([]);
  }
  return Object.freeze(others.filter((other) => other !== taker));
}

export function areDealAllies(
  table: TableShape,
  first: Seat,
  second: Seat,
  taker: Seat | null,
): boolean {
  assertSeat(table, second);
  return first === second || dealAllies(table, first, taker).includes(second);
}

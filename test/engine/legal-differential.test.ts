import { describe, expect, it } from "vitest";
import { legalCards, type EnginePlayedCard } from "../../src/engine/legal";
import { createVariantDeck, shuffleDeck, type EngineDeck } from "../../src/engine/deck";
import { findPreset } from "../../src/engine/presets";
import { createRng, nextInt, seedFromNumber, type RngState } from "../../src/engine/rng";
import { legalMovesForMode } from "../../src/rules/contract-card-policy";
import {
  allTrumpMode,
  noTrumpMode,
  suitContractMode,
  type ContractMode,
} from "../../src/rules/contract-mode";
import { SUITS } from "../../src/cards";

const POSITIONS = 30_000;
const CLASSIQUE = findPreset({ id: "classique", version: 1 })!.config;

type Position = Readonly<{
  mode: ContractMode;
  hand: EngineDeck;
  trick: readonly EnginePlayedCard[];
  seat: number;
  undertrump: "required" | "optional";
}>;

function draw(state: RngState, bound: number): [number, RngState] {
  const result = nextInt(state, bound);
  return [result.value, result.state];
}

function randomPosition(seed: number): Position {
  let rng = createRng(seedFromNumber(seed));
  const shuffled = shuffleDeck(createVariantDeck([]), rng);
  rng = shuffled.state;
  const [modeIndex, afterMode] = draw(rng, 6);
  const [handSize, afterHand] = draw(afterMode, 8);
  const [trickSize, afterTrick] = draw(afterHand, 4);
  const [leader, afterLeader] = draw(afterTrick, 4);
  const [undertrump] = draw(afterLeader, 2);
  const modes = [...SUITS.map(suitContractMode), noTrumpMode(), allTrumpMode()];
  const trick = shuffled.deck.slice(8, 8 + trickSize).map((card, index) => ({
    seat: (leader + index) % 4,
    card,
  }));
  return {
    mode: modes[modeIndex]!,
    hand: shuffled.deck.slice(0, handSize + 1),
    trick,
    seat: (leader + trickSize) % 4,
    undertrump: undertrump === 0 ? "required" : "optional",
  };
}

describe("engine legal cards: differential against legalMovesForMode", () => {
  it(`agrees on ${POSITIONS} random four-seat positions with default options`, () => {
    const mismatches: number[] = [];
    for (let seed = 0; seed < POSITIONS; seed += 1) {
      const position = randomPosition(seed);
      const expected = legalMovesForMode(
        position.hand,
        position.trick.map(({ seat, card }) => ({ player: seat, card })),
        position.mode,
        position.seat,
        position.undertrump,
      );
      const actual = legalCards({
        table: CLASSIQUE.table,
        play: { ...CLASSIQUE.play, undertrump: position.undertrump },
        mode: position.mode,
        hand: position.hand,
        tableauVisible: [],
        trick: position.trick,
        seat: position.seat,
        taker: (seed % 4),
      });
      if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(seed);
    }
    expect(mismatches).toEqual([]);
  });
});

import type { Seed } from "../../../src/engine/rng";
import type { EngineState } from "../../../src/engine/state";
import { createMatch, step } from "../../../src/engine/step";
import type { VariantConfig } from "../../../src/engine/variant-config";

/** Cuts a waiting deck in the middle; any other state is returned as is. */
export function cutInMiddle(state: EngineState): EngineState {
  if (state.deal.phase !== "cutting") return state;
  const result = step(state, { kind: "cut", seat: state.deal.cutter, position: Math.floor(state.deal.deck.length / 2) });
  if (!result.ok) throw new Error(`cut refused: ${result.reason}`);
  return result.state;
}

/** A new match whose first deck is already cut and dealt. */
export function dealtMatch(config: VariantConfig, seed: Seed): EngineState {
  return cutInMiddle(createMatch(config, seed).state);
}

import type { Card } from "../card-primitives";
import {
  rejected,
  type SelectionIntent,
  type SelectionRejection,
  type SelectionStep,
} from "./contract";
import type { Seat } from "./seats";
import {
  applyAuctionIntent,
  legalAuctionIntents,
  startAuctionSelection,
  type AuctionSelectionState,
} from "./trump-auction";
import {
  applyFreeChoiceIntent,
  legalFreeChoiceIntents,
  startFreeChoiceSelection,
  type FreeChoiceSelectionState,
} from "./trump-free-choice";
import {
  applyTurnupIntent,
  legalTurnupIntents,
  startTurnupSelection,
  type TurnupSelectionState,
} from "./trump-turnup";
import type { VariantConfig } from "./variant-config";

/** One entry point over the three trump selection machines. */

export type TrumpSelectionState =
  | TurnupSelectionState
  | FreeChoiceSelectionState
  | AuctionSelectionState;

export function startSelection(
  config: VariantConfig,
  dealer: Seat,
  turnup: Readonly<Card> | null,
): TrumpSelectionState {
  switch (config.trump.kind) {
    case "turnup":
      if (turnup === null) throw new TypeError("A turn-up selection needs a turned card");
      return startTurnupSelection(config, dealer, turnup);
    case "freeChoice":
      return startFreeChoiceSelection(config, dealer, turnup);
    case "auction":
      return startAuctionSelection(config, dealer);
  }
}

/** An auction intent sent to a selection that has no auction. */
function withoutAuction(intent: SelectionIntent): SelectionRejection {
  if (intent.kind === "double") return "illegalDouble";
  return intent.kind === "redouble" ? "illegalRedouble" : "illegalBid";
}

export function applySelection(
  config: VariantConfig,
  state: TrumpSelectionState,
  intent: SelectionIntent,
): SelectionStep<TrumpSelectionState> {
  switch (state.kind) {
    case "auction":
      return applyAuctionIntent(config, state, intent);
    case "turnup":
      if (intent.kind !== "pass" && intent.kind !== "take") return rejected(withoutAuction(intent));
      return applyTurnupIntent(config, state, intent);
    case "freeChoice":
      if (intent.kind !== "pass" && intent.kind !== "take") return rejected(withoutAuction(intent));
      return applyFreeChoiceIntent(config, state, intent);
  }
}

export function legalSelectionIntents(
  config: VariantConfig,
  state: TrumpSelectionState,
  seat: Seat,
): readonly SelectionIntent[] {
  switch (state.kind) {
    case "auction":
      return legalAuctionIntents(config, state, seat);
    case "turnup":
      return legalTurnupIntents(config, state, seat);
    case "freeChoice":
      return legalFreeChoiceIntents(config, state, seat);
  }
}

export function selectionToAct(state: TrumpSelectionState): Seat | null {
  return state.toAct;
}

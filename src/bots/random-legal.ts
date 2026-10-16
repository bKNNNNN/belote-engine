import type { Intent } from "../engine/state";
import type { SeatView } from "../engine/view-types";

/** A source of floats in [0, 1). Inject a seeded one to keep games reproducible. */
export type RandomSource = () => number;

export class NoLegalIntentError extends Error {
  constructor() {
    super("The seat view has no legal intent: it is not this seat's turn");
    this.name = "NoLegalIntentError";
  }
}

const PASS_BIAS = 0.7;

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.floor(random() * items.length)]!;
}

/**
 * Baseline example bot. It reads only its seat view and picks one of
 * `view.legal`. During trump selection it passes most of the time, so random
 * play does not end every deal in a capot bid. Not a strong player.
 */
export function chooseRandomLegalIntent(view: SeatView, random: RandomSource): Intent {
  if (view.legal.length === 0) throw new NoLegalIntentError();
  if (view.phase === "trumpSelection") {
    const pass = view.legal.find((intent) => intent.kind === "pass");
    if (pass !== undefined && random() < PASS_BIAS) return pass;
  }
  return pick(view.legal, random);
}

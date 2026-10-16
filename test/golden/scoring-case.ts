import type { ContractValue, DoublingLevel } from "../../src/engine/contract";
import type { VariantOverrides } from "../../src/engine/resolve-variant";
import type { DealOutcome } from "../../src/engine/scoring";
import type { ModeKind, VariantRef } from "../../src/engine/variant-config";

/**
 * One line of a golden scoring table (engine-design.md section 5.1): deal
 * totals in, marks out, with the source of the expected numbers. The kernel
 * is tested alone, without playing a deal. Card points include the last-trick
 * bonus (10, or 100 to a side that won every trick: 252 at a capot).
 */
export type ScoringCase = Readonly<{
  name: string;
  source: string;
  preset: VariantRef;
  overrides?: VariantOverrides;
  facts: Readonly<{
    mode?: ModeKind;
    value?: ContractValue | null;
    doubling?: DoublingLevel;
    /** Taking seat (default 0). Sides are seat % 2 at four seats, the seat itself otherwise. */
    taker?: number;
    cardPoints: readonly number[];
    /** Tricks per side; default an even split with no capot. */
    tricks?: readonly number[];
    takerTricks?: number;
    belote?: readonly number[];
    declarations?: readonly number[];
  }>;
  pendingLitige?: number;
  expected: Readonly<{
    outcome: DealOutcome;
    marks: readonly number[];
    litigePending?: number | null;
  }>;
}>;

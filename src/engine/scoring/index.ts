import type { VariantConfig } from "../variant-config";
import { scoreClassicSplit } from "./classic-split";
import { scoreContract } from "./contract";
import { scoreTakerVsEach } from "./taker-vs-each";
import type { DealFacts, DealScore } from "./types";

export { dealFacts, type CompletedTrick, type DealFactsInput } from "./facts";
export { multiplierOf } from "./contract";
export type { DealFacts, DealOutcome, DealScore } from "./types";

/** Scores a finished deal with the kernel its variant names. */
export function scoreDeal(
  config: VariantConfig,
  facts: DealFacts,
  pendingLitige: number | null,
): DealScore {
  switch (config.scoring.kind) {
    case "classicSplit":
      return scoreClassicSplit(config, facts, pendingLitige);
    case "contract":
      return scoreContract(config, facts);
    case "takerVsEach":
      return scoreTakerVsEach(config, facts);
  }
}

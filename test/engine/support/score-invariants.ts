import type { DealSummary } from "../../../src/engine/state";
import type { VariantConfig } from "../../../src/engine/variant-config";

/**
 * Score coherence of engine-design.md 5.2 (9), per kernel. Classic split:
 * deal marks plus a new litige equal every point, belote and announcement in
 * play. Contract: the taker marks at least the contract when made, at most
 * its belote when it fails. Taker against each: marks equal points plus 50 to
 * each opponent of a capot player.
 */

type Fail = (message: string) => never;

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

function checkClassicSplit(summary: DealSummary, fail: Fail): void {
  const { score } = summary;
  const marked = sum(score.dealMarks) + (score.litigePending ?? 0);
  if (marked !== sum(score.totals)) fail(`classic split marks ${marked} for ${sum(score.totals)} in play`);
}

function checkContract(config: VariantConfig, summary: DealSummary, fail: Fail): void {
  const { score, contract } = summary;
  const scoring = config.scoring;
  if (scoring.kind !== "contract") return;
  const taker = contract.taker % 2;
  const takerMark = score.dealMarks[taker]!;
  if (score.dealMarks.some((mark) => mark < 0)) fail("negative mark");
  if (score.outcome === "failed" && takerMark > 80) fail(`failed taker marked ${takerMark}`);
  if (score.outcome === "failed" && score.dealMarks[1 - taker]! < 160 && scoring.method !== "pointsAnnonces") {
    fail("the defence of a failed contract marked less than 160");
  }
  if (score.outcome === "made" && typeof contract.value === "number" && takerMark < contract.value) {
    fail(`made contract ${contract.value} marked ${takerMark}`);
  }
}

function checkTakerVsEach(config: VariantConfig, summary: DealSummary, fail: Fail): void {
  if (config.scoring.kind !== "takerVsEach") return;
  const tricks = Array.from({ length: config.table.seats }, (_, seat) =>
    summary.tricks.filter(({ winner }) => winner === seat).length);
  const capots = tricks.filter((count) => count === 0).length;
  const expected = sum(summary.score.totals) + capots * 2 * config.scoring.capotBonusPerOpponent;
  if (sum(summary.score.dealMarks) !== expected) fail(`taker-vs-each marks do not add up to ${expected}`);
}

export function checkScore(config: VariantConfig, summary: DealSummary, fail: Fail): void {
  if (config.scoring.kind === "classicSplit") checkClassicSplit(summary, fail);
  else if (config.scoring.kind === "contract") checkContract(config, summary, fail);
  else checkTakerVsEach(config, summary, fail);
}

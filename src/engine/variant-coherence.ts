import type { DealStep, ModeKind, VariantConfig } from "./variant-config";

/**
 * Cross-field rules of engine-design.md section 2.2. Each returns error
 * strings prefixed by a stable rule code; an empty list means coherent.
 */

type Rule = (config: VariantConfig) => readonly string[];

const CANONICAL_DECK_SIZE = 32;

const when = (failed: boolean, message: string): readonly string[] =>
  failed ? [message] : [];

const tableauRule: Rule = (config) => [
  ...when(
    (config.table.tableau !== null) !== (config.table.seats === 2),
    "tableau: a tableau exists if and only if the table has two seats",
  ),
  ...tableauZoneErrors(config),
];

function tableauZoneErrors(config: VariantConfig): readonly string[] {
  const zoneTotal = (zone: string) => config.deal.steps
    .filter((step) => step.kind === "packets" && step.zone === zone)
    .reduce((total, step) => total + sum(step.kind === "packets" ? step.sizes : []), 0);
  const hidden = zoneTotal("tableauHidden");
  const visible = zoneTotal("tableauVisible");
  const columns = config.table.tableau?.columns ?? 0;
  return when(
    hidden !== columns || visible !== columns,
    "tableau: each seat receives one hidden and one visible card per column",
  );
}

const SIDES_BY_SEATS = Object.freeze({ 2: "headsUp", 3: "takerVsRest", 4: "fixedPairs" });

const sidesRule: Rule = (config) => when(
  config.table.sides.kind !== SIDES_BY_SEATS[config.table.seats],
  `sides: ${config.table.seats} seats require ${SIDES_BY_SEATS[config.table.seats]} sides`,
);

const takerVsRestRule: Rule = (config) => when(
  (config.table.sides.kind === "takerVsRest") !== (config.scoring.kind === "takerVsEach"),
  "takerVsRest: taker-against-the-rest sides and takerVsEach scoring go together",
);

const contractScoringRule: Rule = (config) => when(
  config.trump.kind !== "auction" && config.scoring.kind === "contract",
  "contract-scoring: contract scoring requires an auction",
);

function availableModes(config: VariantConfig): readonly ModeKind[] {
  const trump = config.trump;
  if (trump.kind === "turnup") return ["suit", ...(trump.overbid ?? [])];
  return trump.modes;
}

const beloteRule: Rule = (config) => when(
  config.belote?.allTrump === "perSuit" && !availableModes(config).includes("all-trump"),
  "belote: per-suit belotes require the all-trump mode",
);

function needsTurnupStep(config: VariantConfig): boolean {
  const trump = config.trump;
  if (trump.kind === "turnup") return true;
  return trump.kind === "freeChoice" && trump.allPassed === "dealerTakesTurnupSuit";
}

const turnupRule: Rule = (config) => {
  const steps = config.deal.steps;
  const turnups = steps.filter((step) => step.kind === "turnup").length;
  const selection = steps.findIndex((step) => step.kind === "trumpSelection");
  const turnupIndex = steps.findIndex((step) => step.kind === "turnup");
  if (!needsTurnupStep(config)) {
    return when(turnups !== 0, "turnup: this trump selection deals no turn-up card");
  }
  return when(
    turnups !== 1 || turnupIndex > selection,
    "turnup: exactly one turn-up step is required before the trump selection",
  );
};

const PRE_SELECTION = new Set<DealStep["kind"]>(["packets", "turnup"]);
const POST_SELECTION = new Set<DealStep["kind"]>(["completeAfterTaking", "packetsAfterSelection"]);

const stepsRule: Rule = (config) => {
  const steps = config.deal.steps;
  const selection = steps.findIndex((step) => step.kind === "trumpSelection");
  const selections = steps.filter((step) => step.kind === "trumpSelection").length;
  const misplaced = steps.some((step, index) =>
    (index < selection && !PRE_SELECTION.has(step.kind))
    || (index > selection && !POST_SELECTION.has(step.kind)));
  const completions = steps.filter((step) => step.kind === "completeAfterTaking").length;
  return [
    ...when(selections !== 1, "steps: exactly one trumpSelection step is required"),
    ...when(misplaced, "steps: packets and turn-up precede the selection, completions follow it"),
    ...when(completions > 1, "steps: at most one completeAfterTaking step"),
    ...when(
      completions === 1 && !needsTurnupStep(config),
      "steps: completeAfterTaking only follows a turn-up selection",
    ),
  ];
};

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

type HandCount = Readonly<{ taker: number; others: number; dealt: number }>;

function countHands(config: VariantConfig): HandCount {
  const seats = config.table.seats;
  return config.deal.steps.reduce<HandCount>((count, step) => {
    if (step.kind === "packets" || step.kind === "packetsAfterSelection") {
      const each = sum(step.sizes);
      return {
        taker: count.taker + each,
        others: count.others + each,
        dealt: count.dealt + each * seats,
      };
    }
    if (step.kind !== "completeAfterTaking") return count;
    const turnup = step.takerReceivesTurnup && turnupFromDeck(config) ? 1 : 0;
    return {
      taker: count.taker + step.takerCount + turnup,
      others: count.others + step.othersCount,
      dealt: count.dealt + step.takerCount + turnup + step.othersCount * (seats - 1),
    };
  }, { taker: 0, others: 0, dealt: 0 });
}

function turnupFromDeck(config: VariantConfig): boolean {
  return config.deal.steps.some((step) =>
    step.kind === "turnup" && step.source === "deck");
}

const handsRule: Rule = (config) => {
  const deckSize = CANONICAL_DECK_SIZE - config.deck.removed.length;
  const count = countHands(config);
  return [
    ...when(count.taker !== count.others, "hands: the taker and the others end with unequal hands"),
    ...when(count.dealt !== deckSize, `hands: the deal uses ${count.dealt} of ${deckSize} cards`),
    ...when(
      count.taker * config.table.seats !== deckSize,
      "hands: the deck does not split evenly between the seats",
    ),
  ];
};

const cutRule: Rule = (config) => {
  const cut = config.deal.cut;
  const deckSize = CANONICAL_DECK_SIZE - config.deck.removed.length;
  return when(
    cut !== null && cut.minPacket * 2 > deckSize,
    "cut: both packets of a cut must fit in the deck",
  );
};

const ladderRule: Rule = (config) => {
  if (config.trump.kind !== "auction") return [];
  const { min, step, max } = config.trump.ladder;
  return when(
    min > max || (max - min) % step !== 0,
    "ladder: the auction ladder must climb from min to max in whole steps",
  );
};

const formatsRule: Rule = (config) => {
  const { end, formats } = config.match;
  if (end.kind !== "target") {
    return when(formats.length !== 0, "formats: point formats require a target end");
  }
  const defaults = formats.filter(({ isDefault }) => isDefault);
  const ids = new Set(formats.map(({ id }) => id));
  return [
    ...when(defaults.length !== 1, "formats: exactly one default format is required"),
    ...when(
      defaults.length === 1 && defaults[0]!.target !== end.points,
      "formats: the default format target must equal the match target",
    ),
    ...when(ids.size !== formats.length, "formats: format ids must be unique"),
  ];
};

const generaleRule: Rule = (config) => when(
  config.play.firstLead === "generaleDeclarer"
    && !(config.trump.kind === "auction" && config.trump.ladder.specials.includes("generale")),
  "generale: the declarer can lead only when a generale can be bid",
);

const folkloreRule: Rule = (config) => when(
  config.declarations?.folklore.eightsCancel === true,
  "folklore: the carré of eights that cancels announcements is not implemented by the engine",
);

const redealsRule: Rule = (config) => {
  const { mainNulle, misere, carreDeSept } = config.redeals;
  const sevens = config.deck.removed.filter(({ rank }) => rank === "7").length;
  const any = mainNulle !== null || misere !== null || carreDeSept;
  return [
    ...when(mainNulle !== null && config.trump.kind !== "turnup", "redeals: mainNulle needs a turn-up selection"),
    ...when(misere !== null && config.trump.kind !== "auction", "redeals: misere needs an auction"),
    ...when(carreDeSept && sevens > 0, "redeals: carreDeSept needs the four sevens in the deck"),
    ...when(any && config.table.tableau !== null, "redeals: weak-hand redeals need tables without a tableau"),
  ];
};

const RULES: readonly Rule[] = Object.freeze([
  tableauRule,
  sidesRule,
  takerVsRestRule,
  contractScoringRule,
  beloteRule,
  turnupRule,
  stepsRule,
  handsRule,
  cutRule,
  ladderRule,
  formatsRule,
  generaleRule,
  folkloreRule,
  redealsRule,
]);

export function coherenceErrors(config: VariantConfig): readonly string[] {
  return Object.freeze(RULES.flatMap((rule) => rule(config)));
}

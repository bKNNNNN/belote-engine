import {
  RANKS,
  SUITS,
  type Card,
  type Rank,
  type Suit,
} from "../cards";
import {
  parseContractMode,
  type ContractMode,
} from "./contract-mode";

export type AnnouncementKind =
  | "square-jacks"
  | "square-nines"
  | "square-aces"
  | "square-tens"
  | "square-hundred"
  | "hundred"
  | "fifty"
  | "tierce";

export interface AnnouncementCombination {
  readonly id: string;
  readonly kind: AnnouncementKind;
  readonly cards: readonly Readonly<Card>[];
  readonly points: 20 | 50 | 100 | 150 | 200;
  readonly strength: 1 | 2 | 3 | 4 | 5 | 6;
  readonly suit: Suit | null;
  readonly topRank: Rank;
}

export interface AnnouncementRulesProfile {
  readonly id: string;
  readonly modeKind: ContractMode["kind"];
  readonly tieBreak: "contract-suit" | "none";
  readonly sequenceRankOrder: readonly Rank[];
  readonly sequenceRules: readonly Readonly<{
    minLength: number;
    kind: "tierce" | "fifty" | "hundred";
    points: 20 | 50 | 100;
    strength: 1 | 2 | 3;
  }>[];
  readonly squareRules: readonly Readonly<{
    rank: Rank;
    kind:
      | "square-jacks"
      | "square-nines"
      | "square-aces"
      | "square-tens"
      | "square-hundred";
    points: 100 | 150 | 200;
    strength: 4 | 5 | 6;
  }>[];
  readonly squareRankOrder: readonly Rank[];
}

export const COINCHE_FFB_ANNOUNCEMENTS_PROFILE: AnnouncementRulesProfile =
  Object.freeze({
    id: "coinche-ffb@1",
    modeKind: "suit",
    tieBreak: "contract-suit",
    sequenceRankOrder: Object.freeze([...RANKS]),
    sequenceRules: Object.freeze([
      Object.freeze({ minLength: 5, kind: "hundred", points: 100, strength: 3 }),
      Object.freeze({ minLength: 4, kind: "fifty", points: 50, strength: 2 }),
      Object.freeze({ minLength: 3, kind: "tierce", points: 20, strength: 1 }),
    ]),
    squareRules: Object.freeze([
      Object.freeze({ rank: "J", kind: "square-jacks", points: 200, strength: 6 }),
      Object.freeze({ rank: "9", kind: "square-nines", points: 150, strength: 5 }),
      Object.freeze({ rank: "A", kind: "square-hundred", points: 100, strength: 4 }),
      Object.freeze({ rank: "10", kind: "square-hundred", points: 100, strength: 4 }),
      Object.freeze({ rank: "K", kind: "square-hundred", points: 100, strength: 4 }),
      Object.freeze({ rank: "Q", kind: "square-hundred", points: 100, strength: 4 }),
    ]),
    squareRankOrder: Object.freeze(["Q", "K", "10", "A"] as const),
  });

export const BELOTE_FFB_ANNOUNCEMENTS_PROFILE: AnnouncementRulesProfile =
  Object.freeze({
    ...COINCHE_FFB_ANNOUNCEMENTS_PROFILE,
    id: "belote-ffb@1",
  });

const COINCHE_FFB_ALL_TRUMP_ANNOUNCEMENTS_PROFILE: AnnouncementRulesProfile =
  Object.freeze({
    ...COINCHE_FFB_ANNOUNCEMENTS_PROFILE,
    id: "coinche-ffb-all-trump@1",
    modeKind: "all-trump",
    tieBreak: "none",
  });

const COINCHE_FFB_NO_TRUMP_ANNOUNCEMENTS_PROFILE: AnnouncementRulesProfile =
  Object.freeze({
    id: "coinche-ffb-no-trump@1",
    modeKind: "no-trump",
    tieBreak: "none",
    sequenceRankOrder: Object.freeze([...RANKS]),
    sequenceRules: COINCHE_FFB_ANNOUNCEMENTS_PROFILE.sequenceRules,
    squareRules: Object.freeze([
      Object.freeze({ rank: "A", kind: "square-aces", points: 200, strength: 6 }),
      Object.freeze({ rank: "10", kind: "square-tens", points: 150, strength: 5 }),
      Object.freeze({ rank: "K", kind: "square-hundred", points: 100, strength: 4 }),
      Object.freeze({ rank: "Q", kind: "square-hundred", points: 100, strength: 4 }),
      Object.freeze({ rank: "J", kind: "square-jacks", points: 100, strength: 4 }),
      Object.freeze({ rank: "9", kind: "square-nines", points: 100, strength: 4 }),
    ]),
    squareRankOrder: Object.freeze(["9", "J", "Q", "K", "10", "A"] as const),
  });

const validatedSelectionBrand: unique symbol = Symbol("validated-announcement-selection");
const validatedSelectionProfile: unique symbol = Symbol("validated-announcement-profile");
const declarableHandBrand: unique symbol = Symbol("declarable-hand-snapshot");

export type DeclarableHandSnapshot = readonly Readonly<Card>[] & Readonly<{
  [declarableHandBrand]: true;
}>;

export interface ValidatedAnnouncementSelection {
  readonly announcements: readonly AnnouncementCombination[];
  readonly [validatedSelectionBrand]: true;
  readonly [validatedSelectionProfile]: AnnouncementRulesProfile;
}

export function announcementProfileForCoincheMode(
  mode: ContractMode,
): AnnouncementRulesProfile {
  const parsed = parseContractMode(mode);
  if (parsed.kind === "suit") return COINCHE_FFB_ANNOUNCEMENTS_PROFILE;
  return parsed.kind === "no-trump"
    ? COINCHE_FFB_NO_TRUMP_ANNOUNCEMENTS_PROFILE
    : COINCHE_FFB_ALL_TRUMP_ANNOUNCEMENTS_PROFILE;
}

export type AnnouncementValidation = Readonly<{
  valid: true;
  selection: ValidatedAnnouncementSelection;
}> | Readonly<{
  valid: false;
  code:
    | "unknown-combination"
    | "duplicate-combination"
    | "overlapping-cards";
}>;

export interface PlayerAnnouncements {
  readonly player: 0 | 1 | 2 | 3;
  readonly selection: ValidatedAnnouncementSelection;
}

export interface AnnouncementResolution {
  readonly winner: 0 | 1 | null;
  readonly reason: "winner" | "exact-tie" | "none";
  readonly points: readonly [number, number];
  readonly accepted: readonly Readonly<{
    player: 0 | 1 | 2 | 3;
    announcement: AnnouncementCombination;
  }>[];
}

export function createDeclarableHandSnapshot(
  hand: readonly Readonly<Card>[],
): DeclarableHandSnapshot {
  const validCards = hand.every(({ suit, rank }) =>
    SUITS.includes(suit) && RANKS.includes(rank));
  const uniqueCards = new Set(hand.map(cardKey)).size === hand.length;
  if (hand.length !== 8 || !uniqueCards || !validCards) {
    throw new TypeError("Une main déclarable doit contenir huit cartes uniques.");
  }
  const snapshot = hand.map((card) => Object.freeze({ ...card }));
  Object.defineProperty(snapshot, declarableHandBrand, {
    value: true,
    enumerable: false,
  });
  return Object.freeze(snapshot) as DeclarableHandSnapshot;
}

export function detectAnnouncementCandidates(
  profile: AnnouncementRulesProfile,
  hand: readonly Readonly<Card>[],
): readonly AnnouncementCombination[] {
  const candidates = [
    ...detectSquares(profile, hand),
    ...SUITS.flatMap((suit) => detectSuitSequences(profile, hand, suit)),
  ];
  return Object.freeze(candidates.sort(compareStableCandidates));
}

export function validateAnnouncementSelection(
  profile: AnnouncementRulesProfile,
  hand: DeclarableHandSnapshot,
  selectedIds: readonly string[],
): AnnouncementValidation {
  if (new Set(selectedIds).size !== selectedIds.length) {
    return invalidSelection("duplicate-combination");
  }
  const candidates = new Map(
    detectAnnouncementCandidates(profile, hand).map((candidate) => [candidate.id, candidate]),
  );
  const selected = selectedIds.map((id) => candidates.get(id));
  if (selected.some((candidate) => candidate === undefined)) {
    return invalidSelection("unknown-combination");
  }
  const announcements = selected as readonly AnnouncementCombination[];
  if (hasOverlappingCards(announcements)) {
    return invalidSelection("overlapping-cards");
  }
  const authenticSelection = {
    announcements: Object.freeze([...announcements]),
  } as unknown as ValidatedAnnouncementSelection;
  Object.defineProperties(authenticSelection, {
    [validatedSelectionBrand]: { value: true, enumerable: false },
    [validatedSelectionProfile]: { value: profile, enumerable: false },
  });
  const selection = Object.freeze(authenticSelection);
  return Object.freeze({
    valid: true as const,
    selection,
  });
}

export function resolveTeamAnnouncements(
  profile: AnnouncementRulesProfile,
  input: Readonly<{
  declarations: readonly PlayerAnnouncements[];
  trump: Suit;
}>,
): AnnouncementResolution {
  return resolveTeamAnnouncementsCore(profile, input.declarations, input.trump);
}

export function resolveTeamAnnouncementsForMode(
  profile: AnnouncementRulesProfile,
  input: Readonly<{
    declarations: readonly PlayerAnnouncements[];
    mode: ContractMode;
  }>,
): AnnouncementResolution {
  const mode = parseContractMode(input.mode);
  if (profile.modeKind !== mode.kind) {
    throw new TypeError("Le profil d'annonces ne correspond pas au mode du contrat.");
  }
  return resolveTeamAnnouncementsCore(
    profile,
    input.declarations,
    mode.kind === "suit" ? mode.suit : null,
  );
}

function resolveTeamAnnouncementsCore(
  profile: AnnouncementRulesProfile,
  declarations: readonly PlayerAnnouncements[],
  privilegedSuit: Suit | null,
): AnnouncementResolution {
  assertValidatedDeclarations(profile, declarations);
  const teams = Object.freeze([
    announcementsForTeam(declarations, 0),
    announcementsForTeam(declarations, 1),
  ] as const);
  if (teams[0].length === 0 && teams[1].length === 0) {
    return emptyResolution("none");
  }
  if (teams[0].length === 0) return winningResolution(1, declarations);
  if (teams[1].length === 0) return winningResolution(0, declarations);
  const comparison = compareAnnouncements(
    strongest(profile, teams[0], privilegedSuit),
    strongest(profile, teams[1], privilegedSuit),
    privilegedSuit,
    profile,
  );
  if (comparison === 0) return emptyResolution("exact-tie");
  return winningResolution(comparison > 0 ? 0 : 1, declarations);
}

function assertValidatedDeclarations(
  profile: AnnouncementRulesProfile,
  declarations: readonly PlayerAnnouncements[],
): void {
  const players = declarations.map(({ player }) => player);
  if (new Set(players).size !== players.length) {
    throw new TypeError("Une seule déclaration par siège est autorisée.");
  }
  if (declarations.some(({ selection }) =>
    selection[validatedSelectionBrand] !== true)) {
    throw new TypeError("La résolution exige une sélection validée.");
  }
  if (declarations.some(({ selection }) =>
    selection[validatedSelectionProfile] !== profile)) {
    throw new TypeError("La sélection a été validée avec un autre profil d'annonces.");
  }
}

function detectSquares(
  profile: AnnouncementRulesProfile,
  hand: readonly Readonly<Card>[],
): readonly AnnouncementCombination[] {
  return profile.squareRules.flatMap(({ rank, ...metadata }) => {
    const cards = SUITS.flatMap((suit) => hand.some(
      (candidate) => candidate.suit === suit && candidate.rank === rank,
    ) ? [Object.freeze({ suit, rank })] : []);
    if (cards.length !== 4) return [];
    return [createCombination({ ...metadata, cards, suit: null })];
  });
}

function detectSuitSequences(
  profile: AnnouncementRulesProfile,
  hand: readonly Readonly<Card>[],
  suit: Suit,
): readonly AnnouncementCombination[] {
  const owned = new Set(hand.filter((card) => card.suit === suit)
    .map(({ rank }) => rank));
  const runs: Rank[][] = [];
  let current: Rank[] = [];
  profile.sequenceRankOrder.forEach((rank) => {
    if (owned.has(rank)) {
      current = [...current, rank];
      return;
    }
    if (current.length >= 3) runs.push(current);
    current = [];
  });
  if (current.length >= 3) runs.push(current);
  return runs.map((ranks) => createSequence(profile, suit, ranks));
}

function createSequence(
  profile: AnnouncementRulesProfile,
  suit: Suit,
  ranks: readonly Rank[],
) {
  const metadata = profile.sequenceRules.find(
    ({ minLength }) => ranks.length >= minLength,
  );
  if (metadata === undefined) {
    throw new TypeError(`Le profil ${profile.id} ne couvre pas cette séquence.`);
  }
  return createCombination({
    kind: metadata.kind,
    points: metadata.points,
    strength: metadata.strength,
    suit,
    cards: ranks.map((rank) => Object.freeze({ suit, rank })),
  });
}

function createCombination(input: Readonly<{
  kind: AnnouncementKind;
  cards: readonly Readonly<Card>[];
  points: AnnouncementCombination["points"];
  strength: AnnouncementCombination["strength"];
  suit: Suit | null;
}>): AnnouncementCombination {
  const cards = Object.freeze(input.cards.map((card) => Object.freeze({ ...card })));
  const topRank = cards[cards.length - 1]?.rank;
  if (topRank === undefined) throw new TypeError("Une annonce doit contenir des cartes.");
  return Object.freeze({
    ...input,
    id: `${input.kind}:${cards.map(cardKey).join(",")}`,
    cards,
    topRank,
  });
}

function announcementsForTeam(
  declarations: readonly PlayerAnnouncements[],
  team: 0 | 1,
): readonly AnnouncementCombination[] {
  return Object.freeze(declarations.flatMap(({ player, selection }) =>
    player % 2 === team ? selection.announcements : []));
}

function strongest(
  profile: AnnouncementRulesProfile,
  announcements: readonly AnnouncementCombination[],
  privilegedSuit: Suit | null,
): AnnouncementCombination {
  return [...announcements].sort(
    (left, right) => -compareAnnouncements(left, right, privilegedSuit, profile),
  )[0]!;
}

function compareAnnouncements(
  left: AnnouncementCombination,
  right: AnnouncementCombination,
  privilegedSuit: Suit | null,
  profile: AnnouncementRulesProfile,
): number {
  if (left.strength !== right.strength) return left.strength - right.strength;
  const height = announcementHeight(profile, left) - announcementHeight(profile, right);
  if (height !== 0) return height;
  if (profile.tieBreak !== "contract-suit" || privilegedSuit === null) return 0;
  return Number(left.suit === privilegedSuit) - Number(right.suit === privilegedSuit);
}

function announcementHeight(
  profile: AnnouncementRulesProfile,
  announcement: AnnouncementCombination,
): number {
  if (announcement.suit !== null) {
    return profile.sequenceRankOrder.indexOf(announcement.topRank);
  }
  return profile.squareRankOrder.indexOf(announcement.topRank);
}

function winningResolution(
  winner: 0 | 1,
  declarations: readonly PlayerAnnouncements[],
): AnnouncementResolution {
  const accepted = Object.freeze(declarations.flatMap(({ player, selection }) =>
    player % 2 === winner
      ? selection.announcements.map((announcement) => Object.freeze({ player, announcement }))
      : []));
  const marked = accepted.reduce((sum, { announcement }) =>
    sum + announcement.points, 0);
  return Object.freeze({
    winner,
    reason: "winner" as const,
    points: winner === 0
      ? Object.freeze([marked, 0] as const)
      : Object.freeze([0, marked] as const),
    accepted,
  });
}

function emptyResolution(
  reason: "exact-tie" | "none",
): AnnouncementResolution {
  return Object.freeze({
    winner: null,
    reason,
    points: Object.freeze([0, 0] as const),
    accepted: Object.freeze([]),
  });
}

function invalidSelection(
  code: Extract<AnnouncementValidation, { valid: false }>["code"],
): AnnouncementValidation {
  return Object.freeze({ valid: false, code });
}

function hasOverlappingCards(
  announcements: readonly AnnouncementCombination[],
): boolean {
  const keys = announcements.flatMap(({ cards }) => cards.map(cardKey));
  return new Set(keys).size !== keys.length;
}

function cardKey(card: Readonly<Card>): string {
  return `${card.suit}-${card.rank}`;
}

function compareStableCandidates(
  left: AnnouncementCombination,
  right: AnnouncementCombination,
): number {
  return right.strength - left.strength || left.id.localeCompare(right.id);
}

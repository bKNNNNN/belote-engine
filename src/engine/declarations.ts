import type { Card, Suit } from "../card-primitives";
import {
  announcementProfileForCoincheMode,
  detectAnnouncementCandidates,
  type AnnouncementCombination,
  type AnnouncementRulesProfile,
} from "../rules/announcements";
import type { ContractMode } from "../rules/contract-mode";
import { playOrderFrom, sideOf, sidesOf, type Seat, type SideId } from "./seats";
import type { DeclarationRules, VariantConfig } from "./variant-config";

/**
 * Announcements (tierce, cinquante, cent, carrés) wrapping the FFB detector of
 * `announcements.ts`. The wrapper adds the variant options (tierce at 30,
 * overlapping announcements) and resolves by scoring side: only the side with
 * the best announcement scores, and it scores all of its announcements.
 */

export type DeclarationCombination = AnnouncementCombination;

export type DeclarationResolution = Readonly<{
  winningSide: SideId | null;
  pointsBySide: readonly number[];
  accepted: readonly Readonly<{ seat: Seat; combination: DeclarationCombination }>[];
}>;

const PROFILES = new WeakMap<DeclarationRules, Map<string, AnnouncementRulesProfile>>();

function rulesOf(config: VariantConfig): DeclarationRules {
  if (config.declarations === null) throw new TypeError("This variant has no announcements");
  return config.declarations;
}

/**
 * The legacy profiles already carry the FFB tables: carrés of jacks 200 and
 * nines 150 at a trump; aces 200 and tens 150 at no trump (the Marquez table
 * too). Only the tierce value is a variant option here.
 */
function profileFor(rules: DeclarationRules, mode: ContractMode): AnnouncementRulesProfile {
  const cache = PROFILES.get(rules) ?? new Map<string, AnnouncementRulesProfile>();
  PROFILES.set(rules, cache);
  const cached = cache.get(mode.kind);
  if (cached !== undefined) return cached;
  const legacy = announcementProfileForCoincheMode(mode);
  const profile = rules.tierce === 20 ? legacy : Object.freeze({
    ...legacy,
    id: `${legacy.id}+tierce30`,
    sequenceRules: Object.freeze(legacy.sequenceRules.map((rule) =>
      rule.kind === "tierce" ? Object.freeze({ ...rule, points: 30 as 20 }) : rule)),
  });
  cache.set(mode.kind, profile);
  return profile;
}

export function declarationCandidates(
  config: VariantConfig,
  mode: ContractMode,
  hand: readonly Readonly<Card>[],
): readonly DeclarationCombination[] {
  return detectAnnouncementCandidates(profileFor(rulesOf(config), mode), hand);
}

function overlaps(combinations: readonly DeclarationCombination[]): boolean {
  const keys = combinations.flatMap(({ cards }) => cards.map((card) => `${card.suit}:${card.rank}`));
  return new Set(keys).size !== keys.length;
}

/** The chosen combinations, or null when the selection is not valid. */
export function validateDeclaration(
  config: VariantConfig,
  mode: ContractMode,
  hand: readonly Readonly<Card>[],
  ids: readonly string[],
): readonly DeclarationCombination[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const candidates = declarationCandidates(config, mode, hand);
  const chosen = ids.map((id) => candidates.find((candidate) => candidate.id === id));
  if (chosen.some((candidate) => candidate === undefined)) return null;
  const combinations = chosen as readonly DeclarationCombination[];
  if (!rulesOf(config).allowOverlap && overlaps(combinations)) return null;
  return Object.freeze([...combinations]);
}

/** Every valid selection (subsets in candidate order), the empty one first. */
export function declarationSelections(
  config: VariantConfig,
  mode: ContractMode,
  hand: readonly Readonly<Card>[],
): readonly (readonly string[])[] {
  const candidates = declarationCandidates(config, mode, hand);
  const allowOverlap = rulesOf(config).allowOverlap;
  const subsets = candidates.reduce<DeclarationCombination[][]>(
    (current, candidate) => [
      ...current,
      ...current
        .map((subset) => [...subset, candidate])
        .filter((subset) => allowOverlap || !overlaps(subset)),
    ],
    [[]],
  );
  return Object.freeze(subsets.map((subset) => Object.freeze(subset.map(({ id }) => id))));
}

function height(profile: AnnouncementRulesProfile, combination: DeclarationCombination): number {
  return combination.suit === null
    ? profile.squareRankOrder.indexOf(combination.topRank)
    : profile.sequenceRankOrder.indexOf(combination.topRank);
}

function compare(
  profile: AnnouncementRulesProfile,
  privileged: Suit | null,
  left: DeclarationCombination,
  right: DeclarationCombination,
): number {
  if (left.strength !== right.strength) return left.strength - right.strength;
  const byHeight = height(profile, left) - height(profile, right);
  if (byHeight !== 0) return byHeight;
  if (privileged === null) return 0;
  return Number(left.suit === privileged) - Number(right.suit === privileged);
}

type Best = Readonly<{ seat: Seat; combination: DeclarationCombination }>;

function bestOf(
  profile: AnnouncementRulesProfile,
  privileged: Suit | null,
  entries: readonly Best[],
): Best | null {
  return entries.reduce<Best | null>((best, entry) =>
    best === null || compare(profile, privileged, entry.combination, best.combination) > 0
      ? entry
      : best, null);
}

function tieWinner(
  config: VariantConfig,
  leaders: readonly Best[],
  firstSpeaker: Seat,
): Best | null {
  if (rulesOf(config).tieBreak !== "firstInOrder") return null;
  const order = playOrderFrom(config.table, firstSpeaker);
  return [...leaders].sort((left, right) => order.indexOf(left.seat) - order.indexOf(right.seat))[0]!;
}

/**
 * `declared[seat]` lists the combinations each seat announced. Ties between
 * sides fall to the trump suit (FFB), then cancel, or go to the first
 * announcer in play order (`firstInOrder`).
 */
export function resolveDeclarations(
  config: VariantConfig,
  mode: ContractMode,
  declared: readonly (readonly DeclarationCombination[])[],
  firstSpeaker: Seat,
): DeclarationResolution {
  const rules = rulesOf(config);
  const profile = profileFor(rules, mode);
  const privileged = rules.tieBreak === "highCardThenTrumpThenNone" && mode.kind === "suit"
    ? mode.suit
    : null;
  const sides = sidesOf(config.table);
  const entries = declared.flatMap((combinations, seat) =>
    combinations.map((combination) => Object.freeze({ seat, combination })));
  const leaders = sides.flatMap((side) => {
    const best = bestOf(profile, privileged, entries.filter(({ seat }) => sideOf(config.table, seat) === side));
    return best === null ? [] : [best];
  });
  const top = bestOf(profile, privileged, leaders);
  const tied = top === null
    ? []
    : leaders.filter((leader) => compare(profile, privileged, leader.combination, top.combination) === 0);
  const winner = tied.length > 1 ? tieWinner(config, tied, firstSpeaker) : top;
  const winningSide = winner === null ? null : sideOf(config.table, winner.seat);
  const accepted = entries.filter(({ seat }) => sideOf(config.table, seat) === winningSide);
  const points = accepted.reduce((total, { combination }) => total + combination.points, 0);
  return Object.freeze({
    winningSide,
    pointsBySide: Object.freeze(sides.map((side) => side === winningSide ? points : 0)),
    accepted: Object.freeze(accepted),
  });
}

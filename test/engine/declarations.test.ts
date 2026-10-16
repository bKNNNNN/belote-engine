import { describe, expect, it } from "vitest";
import { RANKS, SUITS, type Card, type Suit } from "../../src/card-primitives";
import {
  declarationCandidates,
  declarationSelections,
  resolveDeclarations,
  validateDeclaration,
} from "../../src/engine/declarations";
import { findPreset } from "../../src/engine/presets";
import { resolveVariant, type VariantOverrides } from "../../src/engine/resolve-variant";
import type { VariantConfig } from "../../src/engine/variant-config";
import {
  announcementProfileForCoincheMode,
  createDeclarableHandSnapshot,
  detectAnnouncementCandidates,
  resolveTeamAnnouncementsForMode,
  validateAnnouncementSelection,
} from "../../src/rules/announcements";
import {
  allTrumpMode,
  noTrumpMode,
  suitContractMode,
  type ContractMode,
} from "../../src/rules/contract-mode";
import { testRng } from "../golden/legacy-support/runner";

const COINCHE_SA_TA = findPreset({ id: "coinche-sa-ta-ffb2015", version: 1 })!.config;
const STEPHANOISE = findPreset({ id: "stephanoise-marquez", version: 1 })!.config;
const HEARTS = suitContractMode("hearts");
const MODES: readonly ContractMode[] = [...SUITS.map(suitContractMode), noTrumpMode(), allTrumpMode()];
const DECK = SUITS.flatMap((suit) => RANKS.map((rank): Card => ({ suit, rank })));
const card = (rank: Card["rank"], suit: Suit): Card => ({ suit, rank });

function variant(base: VariantConfig, overrides: VariantOverrides): VariantConfig {
  const resolved = resolveVariant(base, overrides);
  if (!resolved.ok) throw new Error(resolved.errors.join("; "));
  return resolved.config;
}

function shuffled(rng: () => number): Card[] {
  const cards = [...DECK];
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap]!, cards[index]!];
  }
  return cards;
}

const SEQUENCE_HAND: readonly Card[] = [
  card("J", "hearts"), card("Q", "hearts"), card("K", "hearts"),
  card("K", "spades"), card("K", "clubs"), card("K", "diamonds"),
  card("7", "spades"), card("8", "diamonds"),
];

describe("declarations", () => {
  it("detects the same combinations as the legacy FFB detector in every mode", () => {
    const rng = testRng(31);
    for (let round = 0; round < 300; round += 1) {
      const hand = shuffled(rng).slice(0, 8);
      for (const mode of MODES) {
        expect(declarationCandidates(COINCHE_SA_TA, mode, hand))
          .toEqual(detectAnnouncementCandidates(announcementProfileForCoincheMode(mode), hand));
      }
    }
  });

  it("resolves exactly like the legacy team resolution on random declarations", () => {
    const rng = testRng(32);
    for (let round = 0; round < 400; round += 1) {
      const cards = shuffled(rng);
      const mode = MODES[Math.floor(rng() * MODES.length)]!;
      const profile = announcementProfileForCoincheMode(mode);
      const hands = [0, 1, 2, 3].map((seat) => cards.slice(seat * 8, seat * 8 + 8));
      const choices = hands.map((hand) => {
        const options = declarationSelections(COINCHE_SA_TA, mode, hand);
        return options[Math.floor(rng() * options.length)]!;
      });
      const legacy = resolveTeamAnnouncementsForMode(profile, {
        mode,
        declarations: hands.map((hand, player) => {
          const validation = validateAnnouncementSelection(
            profile, createDeclarableHandSnapshot(hand), choices[player]!,
          );
          if (!validation.valid) throw new Error("legacy refused an engine selection");
          return { player: player as 0, selection: validation.selection };
        }),
      });
      const declared = hands.map((hand, seat) => validateDeclaration(COINCHE_SA_TA, mode, hand, choices[seat]!)!);
      const engine = resolveDeclarations(COINCHE_SA_TA, mode, declared, 0);
      expect(engine.pointsBySide).toEqual([...legacy.points]);
      expect(engine.winningSide).toEqual(legacy.winner);
    }
  });

  it("enumerates every valid selection, the empty one first", () => {
    const selections = declarationSelections(COINCHE_SA_TA, HEARTS, SEQUENCE_HAND);
    expect(selections[0]).toEqual([]);
    expect(selections).toHaveLength(3);
    expect(declarationSelections(STEPHANOISE, HEARTS, SEQUENCE_HAND)).toHaveLength(4);
  });

  it("refuses unknown, duplicated or overlapping selections", () => {
    const [square, tierce] = declarationCandidates(STEPHANOISE, HEARTS, SEQUENCE_HAND);
    expect(validateDeclaration(COINCHE_SA_TA, HEARTS, SEQUENCE_HAND, ["nope"])).toBeNull();
    expect(validateDeclaration(COINCHE_SA_TA, HEARTS, SEQUENCE_HAND, [square!.id, square!.id])).toBeNull();
    expect(validateDeclaration(COINCHE_SA_TA, HEARTS, SEQUENCE_HAND, [square!.id, tierce!.id])).toBeNull();
    expect(validateDeclaration(STEPHANOISE, HEARTS, SEQUENCE_HAND, [square!.id, tierce!.id]))
      .toEqual([square, tierce]);
  });

  it("scores a tierce 30 when the variant says so", () => {
    const config = variant(COINCHE_SA_TA, { declarations: { tierce: 30 } });
    const [tierce] = declarationCandidates(config, HEARTS, [
      card("7", "hearts"), card("8", "hearts"), card("9", "hearts"),
    ]);
    expect(tierce!.points).toBe(30);
  });

  it("uses the Marquez square table at no trump (aces 200, tens 150, nines 100)", () => {
    const aces = SUITS.map((suit) => card("A", suit));
    const tens = SUITS.map((suit) => card("10", suit));
    const nines = SUITS.map((suit) => card("9", suit));
    expect(declarationCandidates(STEPHANOISE, noTrumpMode(), [...aces, ...tens]).map(({ points }) => points))
      .toEqual([200, 150]);
    expect(declarationCandidates(STEPHANOISE, noTrumpMode(), nines)[0]!.points).toBe(100);
    expect(declarationCandidates(STEPHANOISE, HEARTS, nines)[0]!.points).toBe(150);
  });

  it("cancels equal non-trump announcements, and keeps the first in order with firstInOrder", () => {
    const left = declarationCandidates(COINCHE_SA_TA, HEARTS, [card("7", "spades"), card("8", "spades"), card("9", "spades")]);
    const right = declarationCandidates(COINCHE_SA_TA, HEARTS, [card("7", "clubs"), card("8", "clubs"), card("9", "clubs")]);
    const tied = resolveDeclarations(COINCHE_SA_TA, HEARTS, [[], left, right, []], 2);
    expect(tied).toMatchObject({ winningSide: null, pointsBySide: [0, 0] });
    const config = variant(COINCHE_SA_TA, { declarations: { tieBreak: "firstInOrder" } });
    expect(resolveDeclarations(config, HEARTS, [[], left, right, []], 2))
      .toMatchObject({ winningSide: 0, pointsBySide: [20, 0] });
    expect(resolveDeclarations(config, HEARTS, [[], left, right, []], 0))
      .toMatchObject({ winningSide: 1, pointsBySide: [0, 20] });
  });
});

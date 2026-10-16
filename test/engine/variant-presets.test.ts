import { describe, expect, it } from "vitest";
import {
  PRESET_REGISTRY,
  findPreset,
  presetForLegacyProfile,
  variantKey,
} from "../../src/engine/presets";
import { resolveVariant } from "../../src/engine/resolve-variant";

const EXPECTED_PRESETS = [
  "classique@1",
  "classique-annonces@1",
  "concours@1",
  "vache@1",
  "vache-retourne@1",
  "moderne@1",
  "contree@2",
  "contree@3",
  "coinche@1",
  "coinche-sa-ta-ffb2015@1",
  "coinche-ffb@2",
  "bridgee@1",
  "stephanoise-marquez@1",
  "a-deux@1",
  "a-trois@1",
  "cavaillon@1",
];

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe("variant presets", () => {
  it("declares every preset of the design (section 2.3) plus the frozen contree@2", () => {
    expect(PRESET_REGISTRY.map(({ config }) => variantKey(config)).sort())
      .toEqual([...EXPECTED_PRESETS].sort());
  });

  it.each(PRESET_REGISTRY.map((entry) => [variantKey(entry.config), entry] as const))(
    "%s is a valid, deeply frozen variant",
    (_key, entry) => {
      const resolved = resolveVariant(entry.config);
      expect(resolved).toEqual({ ok: true, config: entry.config });
      expect(isDeepFrozen(entry.config)).toBe(true);
      expect(entry.config.sources.length).toBeGreaterThan(0);
    },
  );

  it("marks playable every preset the assembled engine runs (step 11), not the bugged contree@2", () => {
    const unplayable = PRESET_REGISTRY
      .filter(({ playable }) => !playable)
      .map(({ config }) => variantKey(config));
    expect(unplayable).toEqual(["contree@2"]);
  });

  it("flags the frozen replay-only profiles", () => {
    const frozen = PRESET_REGISTRY
      .filter(({ frozen }) => frozen)
      .map(({ config }) => variantKey(config))
      .sort();
    expect(frozen).toEqual(["coinche-sa-ta-ffb2015@1", "coinche@1", "contree@2"]);
  });

  it("maps every legacy rule profile to its preset", () => {
    expect(variantKey(presetForLegacyProfile("belote-classique@1")!.config)).toBe("classique@1");
    expect(variantKey(presetForLegacyProfile("belote-annonces@1")!.config))
      .toBe("classique-annonces@1");
    expect(variantKey(presetForLegacyProfile("contree@2")!.config)).toBe("contree@2");
    expect(variantKey(presetForLegacyProfile("coinche@1")!.config)).toBe("coinche@1");
    expect(variantKey(presetForLegacyProfile("coinche-sa-ta-ffb2015@1")!.config))
      .toBe("coinche-sa-ta-ffb2015@1");
    expect(presetForLegacyProfile("contree-v0@1")).toBeNull();
  });

  it("finds presets by reference only", () => {
    expect(findPreset({ id: "coinche-ffb", version: 2 })?.config.id).toBe("coinche-ffb");
    expect(findPreset({ id: "coinche-ffb", version: 1 })).toBeNull();
  });

  it("keeps the arbitrated values of section 7", () => {
    const ffb = findPreset({ id: "coinche-ffb", version: 2 })!.config;
    expect(ffb.scoring.kind === "contract" && ffb.scoring.success.versusDefence)
      .toBe("strictlyMore");
    expect(ffb.trump.kind === "auction" && ffb.trump.modes).toEqual(["suit"]);
    const concours = findPreset({ id: "concours", version: 1 })!.config;
    expect(concours.match.end).toEqual({ kind: "deals", count: 12, tie: "extraDeal" });
    expect(findPreset({ id: "a-trois", version: 1 })!.config.confidence).toBe("maison");
  });
});

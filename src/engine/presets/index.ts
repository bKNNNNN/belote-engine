import { definePreset } from "../resolve-variant";
import type { VariantConfig, VariantRef } from "../variant-config";
import {
  BRIDGEE_1,
  CAVAILLON_1,
  COINCHE_1,
  COINCHE_FFB_2,
  COINCHE_SA_TA_FFB2015_1,
  CONTREE_2,
  CONTREE_3,
  STEPHANOISE_MARQUEZ_1,
} from "./auction-family";
import {
  CLASSIQUE_1,
  CLASSIQUE_ANNONCES_1,
  CONCOURS_1,
  MODERNE_1,
  VACHE_1,
  VACHE_RETOURNE_1,
} from "./classic-family";
import { A_DEUX_1, A_TROIS_1 } from "./small-tables";

/**
 * `playable`: the assembled engine (migration step 11) runs the preset, its
 * golden tables pass and 2 000 random matches keep every invariant. contree@2
 * stays false: it reproduces bugs 2.1 to 2.3 and 2.6 on purpose, for replay.
 * `frozen` presets only replay old logs and are not offered for new tables.
 * `legacyProfile` names the rule profile of the previous engines, if any.
 */
export type PresetEntry = Readonly<{
  config: VariantConfig;
  playable: boolean;
  frozen: boolean;
  legacyProfile: string | null;
}>;

function entry(
  config: VariantConfig,
  options: Readonly<{ frozen?: boolean; legacyProfile?: string; playable?: boolean }> = {},
): PresetEntry {
  return Object.freeze({
    config: definePreset(config),
    playable: options.playable ?? true,
    frozen: options.frozen ?? false,
    legacyProfile: options.legacyProfile ?? null,
  });
}

export const PRESET_REGISTRY: readonly PresetEntry[] = Object.freeze([
  entry(CLASSIQUE_1, { legacyProfile: "belote-classique@1" }),
  entry(CLASSIQUE_ANNONCES_1, { legacyProfile: "belote-annonces@1" }),
  entry(CONCOURS_1),
  entry(VACHE_1),
  entry(VACHE_RETOURNE_1),
  entry(MODERNE_1),
  entry(CONTREE_2, { frozen: true, legacyProfile: "contree@2", playable: false }),
  entry(CONTREE_3),
  entry(COINCHE_1, { frozen: true, legacyProfile: "coinche@1" }),
  entry(COINCHE_SA_TA_FFB2015_1, { frozen: true, legacyProfile: "coinche-sa-ta-ffb2015@1" }),
  entry(COINCHE_FFB_2),
  entry(BRIDGEE_1),
  entry(STEPHANOISE_MARQUEZ_1),
  entry(A_DEUX_1),
  entry(A_TROIS_1),
  entry(CAVAILLON_1),
]);

export function variantKey(ref: VariantRef): string {
  return `${ref.id}@${ref.version}`;
}

export function findPreset(ref: VariantRef): PresetEntry | null {
  return PRESET_REGISTRY.find(({ config }) =>
    config.id === ref.id && config.version === ref.version) ?? null;
}

export function presetForLegacyProfile(profileKey: string): PresetEntry | null {
  return PRESET_REGISTRY.find(({ legacyProfile }) => legacyProfile === profileKey) ?? null;
}

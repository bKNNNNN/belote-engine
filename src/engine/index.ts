/**
 * The single parameterised belote engine (engine-design.md section 2). Pure,
 * deterministic and immutable: `createMatch`, then `step` with intents.
 */

export {
  createMatch,
  createMatchWithDeal,
  legalIntents,
  nextDealWithDeck,
  replay,
  seatToAct,
  step,
  systemIntents,
  type GivenDeck,
  type MatchOptions,
} from "./step";
export type {
  DealPhase,
  DealState,
  DealSummary,
  EngineEvent,
  EngineState,
  Intent,
  PlayIntent,
  CutIntent,
  CutRecord,
  DeclareIntent,
  Rejection,
  RejectionReason,
  StepResult,
  Transition,
} from "./state";
export {
  REDEAL_REASONS,
  plainHandPoints,
  type RedealIntent,
  type RedealReason,
  type RedealRequest,
} from "./redeal-request";
export type { Contract, ContractValue, AuctionAction, SelectionIntent } from "./contract";
export type { MatchState } from "./match";
export type { DealScore, DealOutcome } from "./scoring";
export { PRESET_REGISTRY, findPreset, presetForLegacyProfile, variantKey, type PresetEntry } from "./presets";
export { resolveVariant, type VariantOverrides, type VariantResolution } from "./resolve-variant";
export type { VariantConfig, VariantRef } from "./variant-config";
export { createRng, type Seed } from "./rng";
export { cutDeck, legalCutRange, uncutDeck, type CutRange } from "./deck";
export { viewFor, type Viewer } from "./view";
export type * from "./view-types";
export {
  deduce,
  rememberTricks,
  type Knowledge,
  type MasterCard,
  type SeatKnowledge,
  type TrickMemory,
} from "./knowledge";
export type { Located } from "./knowledge-inference";
export type { Seat, SideId } from "./seats";
export { declarationCandidates, type DeclarationCombination } from "./declarations";

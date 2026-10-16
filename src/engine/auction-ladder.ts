import { SUITS } from "../card-primitives";
import type { ContractMode } from "../rules/contract-mode";
import type { ContractValue } from "./contract";
import type { Seat } from "./seats";
import type { TrumpSelection, VariantConfig } from "./variant-config";

/**
 * The auction ladder: numeric values from `min` to `max` by `step`, then the
 * specials (capot, générale) in that order. With the pagat hierarchy, an equal
 * value outbids when its mode ranks higher: clubs < diamonds < hearts <
 * spades < no trump < all trump.
 */

type AuctionRules = Extract<TrumpSelection, { kind: "auction" }>;
type Bid = Readonly<{ seat: Seat; value: ContractValue; mode: ContractMode }>;

const VALUES = new WeakMap<AuctionRules, readonly ContractValue[]>();
const INDEXES = new WeakMap<AuctionRules, ReadonlyMap<ContractValue, number>>();
const SUIT_RANK = Object.freeze(Object.fromEntries(
  [...SUITS].reverse().map((suit, index) => [suit, index]),
)) as Readonly<Record<(typeof SUITS)[number], number>>;

function rulesOf(config: VariantConfig): AuctionRules {
  if (config.trump.kind !== "auction") throw new TypeError("Not an auction variant");
  return config.trump;
}

export function auctionValues(config: VariantConfig): readonly ContractValue[] {
  const rules = rulesOf(config);
  const cached = VALUES.get(rules);
  if (cached !== undefined) return cached;
  const { min, step, max, specials } = rules.ladder;
  const count = (max - min) / step + 1;
  const values = Object.freeze([
    ...Array.from({ length: count }, (_, index) => min + index * step),
    ...specials,
  ]);
  VALUES.set(rules, values);
  return values;
}

export function valueIndex(config: VariantConfig, value: ContractValue): number {
  const rules = rulesOf(config);
  const cached = INDEXES.get(rules);
  if (cached !== undefined) return cached.get(value) ?? -1;
  const indexes = new Map(auctionValues(config).map((entry, index) => [entry, index] as const));
  INDEXES.set(rules, indexes);
  return indexes.get(value) ?? -1;
}

/** Position of a mode in the pagat hierarchy (higher outbids at equal value). */
export function hierarchyRank(mode: ContractMode): number {
  if (mode.kind === "suit") return SUIT_RANK[mode.suit];
  return mode.kind === "no-trump" ? SUITS.length : SUITS.length + 1;
}

export function outbids(config: VariantConfig, bid: Bid, highest: Bid | null): boolean {
  const index = valueIndex(config, bid.value);
  if (index < 0) return false;
  if (highest === null) return true;
  const top = valueIndex(config, highest.value);
  if (index !== top) return index > top;
  return rulesOf(config).modeHierarchy === "suitOrderBreaksTies"
    && hierarchyRank(bid.mode) > hierarchyRank(highest.mode);
}

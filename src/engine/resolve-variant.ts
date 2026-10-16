import { coherenceErrors } from "./variant-coherence";
import { variantConfigSchema, type VariantConfig } from "./variant-config";

/**
 * Overrides merge into a preset: plain objects merge field by field, arrays and
 * scalars replace, and `undefined` removes a field. Nothing is corrected in
 * silence: a stale field left by a union change is a schema error.
 */
export type VariantOverrides = DeepPartial<VariantConfig>;

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> | undefined } : T;

export type VariantResolution =
  | Readonly<{ ok: true; config: VariantConfig }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const keys = new Set([...Object.keys(base), ...Object.keys(override)]);
  return Object.fromEntries([...keys].flatMap((key) => {
    if (!(key in override)) return [[key, base[key]]];
    const value = override[key];
    if (value === undefined) return [];
    return [[key, key in base ? merge(base[key], value) : value]];
  }));
}

export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function resolveVariant(
  preset: VariantConfig,
  overrides: VariantOverrides = {},
): VariantResolution {
  const parsed = variantConfigSchema.safeParse(merge(preset, overrides));
  if (!parsed.success) {
    return Object.freeze({
      ok: false as const,
      errors: Object.freeze(parsed.error.issues.map((issue) =>
        `schema: ${issue.path.join(".") || "(root)"}: ${issue.message}`)),
    });
  }
  const config = parsed.data as VariantConfig;
  const errors = coherenceErrors(config);
  if (errors.length > 0) return Object.freeze({ ok: false as const, errors });
  return Object.freeze({ ok: true as const, config: deepFreeze(config) });
}

/** Freezes and validates a preset declared as data; throws on an invalid one. */
export function definePreset(config: VariantConfig): VariantConfig {
  const resolution = resolveVariant(config);
  if (!resolution.ok) {
    throw new TypeError(
      `Invalid preset ${config.id}@${config.version}: ${resolution.errors.join("; ")}`,
    );
  }
  return resolution.config;
}

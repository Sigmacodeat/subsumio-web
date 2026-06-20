/**
 * Feature flags (v0.40 D23).
 *
 * Single shared escape hatch for the v0.40 Federated Sync v2 cathedral.
 * Flipping `sync.federated_v2` to `false` reverts to v0.39 sequential
 * behavior without re-installing the binary — useful if a foundational
 * assumption proves wrong in production (e.g. parallel sync trips an
 * undiscovered Postgres lock contention).
 *
 * What the flag gates:
 *   - Parallel branch of `gbrain sync --all` (serial fallback otherwise)
 *   - Auto-enqueue of embed-backfill in the extended `sync` handler
 *   - Autopilot's per-source freshness-gate dispatch (D17)
 *
 * What stays on UNCONDITIONALLY (correctness, not features):
 *   - Per-source sync lock (`syncLockId`)
 *   - Phantom-redirect per-source lock (D16)
 *   - Migration v87 (sources_github_repo index)
 *   - Facts-backstop source-scoping fix (D21)
 *   - safeHexEqual extraction (D15.5)
 *
 * Disable path:
 *   gbrain config set sync.federated_v2 false
 *   gbrain jobs supervisor restart   # autopilot picks up the change
 *
 * Convention: this module is the ONLY place that reads the flag. Callers go
 * through `isFederatedV2Enabled(engine)` so future changes to the flag key,
 * default, or backing store happen in one place.
 */
import type { BrainEngine } from './engine.ts';

export const FEDERATED_V2_CONFIG_KEY = 'sync.federated_v2';

/**
 * True iff Federated Sync v2 behaviors are enabled (default true).
 *
 * Reads `sync.federated_v2` from the DB config plane via `engine.getConfig`.
 * Values: `'false'` → disabled; anything else (including missing/null) →
 * enabled. The default-on posture is deliberate — v0.40 ships expecting the
 * new behavior, and ops opt out by setting the key explicitly.
 *
 * Throwing on engine errors is fine: the flag is only checked at boundary
 * points (CLI dispatch, autopilot tick, sync handler) where an engine error
 * would surface anyway. Callers don't need a try/catch wrapper.
 */
export async function isFederatedV2Enabled(engine: BrainEngine): Promise<boolean> {
  const value = await engine.getConfig(FEDERATED_V2_CONFIG_KEY);
  return value !== 'false';
}

// ─── General-purpose FeatureFlags (Agency-Level Standard) ──────────────

/**
 * Registry of known feature flags and their default values.
 * Add new flags here so they get autocomplete + centralized defaults.
 *
 * Convention: a flag is `true` by default when the feature ships ON,
 * `false` when it ships OFF (opt-in). The DB config plane overrides.
 */
export const FEATURE_FLAG_DEFAULTS = {
  'sync.federated_v2': true,
  'relational_retrieval': false,
  'graph_signals': true,
  'adaptive_return': false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS;

/**
 * General-purpose feature flag checker. Reads from the DB config plane
 * via `engine.getConfig`. Uses an in-process cache (TTL 60s) to avoid
 * hitting the DB on every call in hot paths.
 *
 * Usage:
 *   const flags = new FeatureFlags(engine);
 *   if (await flags.isEnabled('relational_retrieval')) { ... }
 *
 * For one-off checks, the static method is simpler:
 *   if (await FeatureFlags.check(engine, 'relational_retrieval')) { ... }
 *
 * Values: `'false'` → disabled; `'true'` → enabled; anything else (including
 * missing/null) → falls back to the default from FEATURE_FLAG_DEFAULTS.
 */
const DEFAULT_CACHE_TTL_MS = 60_000;

export class FeatureFlags {
  private cache = new Map<string, { value: boolean; expires: number }>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly engine: BrainEngine,
    opts: { cacheTtlMs?: number } = {},
  ) {
    this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /**
   * Check if a feature flag is enabled. Reads from cache or DB.
   * Unknown flags (not in FEATURE_FLAG_DEFAULTS) default to `false`.
   */
  async isEnabled(key: FeatureFlagKey | string): Promise<boolean> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    const defaultValue =
      key in FEATURE_FLAG_DEFAULTS
        ? FEATURE_FLAG_DEFAULTS[key as FeatureFlagKey]
        : false;

    let value: boolean;
    try {
      const raw = await this.engine.getConfig(key);
      if (raw === 'false') value = false;
      else if (raw === 'true') value = true;
      else value = defaultValue;
    } catch {
      value = defaultValue;
    }

    this.cache.set(key, { value, expires: Date.now() + this.cacheTtlMs });
    return value;
  }

  /** Invalidate the cache for a specific key (or all keys if omitted). */
  invalidate(key?: FeatureFlagKey | string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  /**
   * Static one-shot check — no caching. Use when you need a single flag
   * check without constructing a FeatureFlags instance.
   */
  static async check(
    engine: BrainEngine,
    key: FeatureFlagKey | string,
  ): Promise<boolean> {
    const defaultValue =
      key in FEATURE_FLAG_DEFAULTS
        ? FEATURE_FLAG_DEFAULTS[key as FeatureFlagKey]
        : false;
    try {
      const raw = await engine.getConfig(key);
      if (raw === 'false') return false;
      if (raw === 'true') return true;
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }
}

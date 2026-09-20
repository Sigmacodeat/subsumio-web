/**
 * Firm setting "Kanzlei-Gehirn lernt mit" — engine side.
 *
 * The web app is the source of truth (per firm, src/lib/brain-learning.ts in
 * the web app). It hands the setting to the engine through trusted,
 * API-key-guarded server-to-server calls only — never from a browser:
 *
 *   1. `PUT /api/brain/learning` with the firm's own server-set
 *      `x-subsumio-source` header when an admin flips the switch. Persisted as
 *      `sources.config.learning_disabled` on that firm's source row.
 *   2. The nightly cron sends the complete list of switched-off firms with
 *      `POST /api/admin/dream`; the engine reconciles the flags to that list
 *      before the cycle runs (self-healing if a single update was lost).
 *
 * Enforcement reads the persisted flag at the few chokepoints where the
 * engine derives new knowledge on its own (cycle learning phases, post-upload
 * consolidation, the put_page facts backstop), so every write path — web
 * upload, e-mail filing, portal, connectors, background jobs — is covered
 * without threading a flag through each of them.
 *
 * Plain storage, chunking, embedding and search are NOT learning and are
 * never affected: a firm with learning off keeps a fully searchable brain.
 */

import type { BrainEngine } from "./engine.ts";

/** Key inside `sources.config` (JSONB). true = firm switched learning off. */
export const LEARNING_CONFIG_KEY = "learning_disabled";

/**
 * Tenant source ids as the web app mints them (`org_1a2b3c4d`, `brain_…`).
 * Same shape web-api.ts accepts for `x-subsumio-source` — deliberately NOT the
 * strict `SOURCE_ID_RE` from source-id.ts, which rejects underscores.
 */
const TENANT_SOURCE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Hard cap so a malformed body cannot make the cycle build huge SQL arrays. */
const MAX_EXCLUDED = 10_000;

/**
 * Parse the exclude list from an untrusted-shaped body value. Invalid entries
 * are dropped (never thrown on): the cycle must still run for everyone else.
 */
export function parseLearningExcludedSources(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const v of raw) {
    if (typeof v === "string" && TENANT_SOURCE_RE.test(v)) out.add(v);
    if (out.size >= MAX_EXCLUDED) break;
  }
  return [...out];
}

/**
 * Cycle phases that DERIVE new knowledge from a firm's material (facts, takes,
 * links, commentaries, memory strength). They are skipped for every source in
 * the exclude list. Everything else in the cycle (embedding, orphan/purge
 * housekeeping, lint, …) keeps running for all sources.
 */
export const LEARNING_PHASES = new Set<string>([
  "synthesize",
  "extract_facts",
  "extract_atoms",
  "patterns",
  "synthesize_concepts",
  "consolidate",
  "propose_takes",
  "grade_takes",
  "calibration_profile",
  "conversation_facts_backfill",
  "enrich_thin",
  "legal_precedent_linkage",
  "legal_commentary_synthesis",
  "engram_maturation",
  "reconsolidation_sweep",
]);

/** Filter helper used by the per-source loops inside cycle phases. */
export function withoutExcluded<T extends { id: string }>(
  sources: T[],
  excluded: ReadonlySet<string> | undefined
): T[] {
  if (!excluded || excluded.size === 0) return sources;
  return sources.filter((s) => !excluded.has(s.id));
}

/**
 * SQL fragment + params for "source_id is not excluded". Returns an empty
 * clause when nothing is excluded so existing query shapes stay unchanged.
 * `paramIndex` is the 1-based position the array parameter will take.
 */
export function excludedSourcesClause(
  excluded: ReadonlySet<string> | undefined,
  paramIndex: number,
  column = "source_id"
): { clause: string; params: string[][] } {
  if (!excluded || excluded.size === 0) return { clause: "", params: [] };
  return {
    clause: `AND NOT (${column} = ANY($${paramIndex}::text[]))`,
    params: [[...excluded]],
  };
}

// ─── Persisted per-source flag ─────────────────────────────────────

const CACHE_TTL_MS = 30_000;
let cache: { at: number; ids: Set<string> } | null = null;

/** Test/ops seam: forget the cached flag set (also called after every write). */
export function resetLearningCache(): void {
  cache = null;
}

/** Validate a tenant source id as accepted by the web API. */
export function isTenantSourceId(v: unknown): v is string {
  return typeof v === "string" && TENANT_SOURCE_RE.test(v);
}

/**
 * Sources whose firm switched learning off. Cached briefly — the check sits on
 * write paths. Fails OPEN to "learning on" only when the lookup itself errors
 * (e.g. pre-migration schema): that is the behaviour every firm had before the
 * setting existed, and the nightly reconcile re-applies the flags.
 */
export async function learningDisabledSources(engine: BrainEngine): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.ids;
  try {
    const rows = await engine.executeRaw<{ id: string }>(
      `SELECT id FROM sources WHERE config->>'${LEARNING_CONFIG_KEY}' = 'true'`
    );
    const ids = new Set(rows.map((r) => String(r.id)));
    cache = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    console.warn(
      `[brain-learning] could not read learning flags: ${e instanceof Error ? e.message : String(e)}`
    );
    return new Set();
  }
}

/** True when the firm owning `sourceId` switched "Kanzlei-Gehirn lernt mit" off. */
export async function isLearningDisabledForSource(
  engine: BrainEngine,
  sourceId: string | undefined | null
): Promise<boolean> {
  if (!sourceId) return false;
  return (await learningDisabledSources(engine)).has(sourceId);
}

/**
 * Persist the flag for one firm source. Creates the source row when the firm
 * has not written anything yet, so the flag is in place before the first
 * upload. jsonb_build_object keeps the value a real JSONB boolean (no
 * JSON.stringify into a ::jsonb cast — see CLAUDE.md JSONB invariant).
 */
export async function setSourceLearning(
  engine: BrainEngine,
  sourceId: string,
  enabled: boolean
): Promise<void> {
  if (!isTenantSourceId(sourceId)) throw new Error("invalid_source_id");
  await engine.executeRaw(
    `INSERT INTO sources (id, name, config)
     VALUES ($1::text, $1::text, jsonb_build_object('${LEARNING_CONFIG_KEY}', $2::boolean))
     ON CONFLICT (id) DO UPDATE SET
       config = COALESCE(sources.config, '{}'::jsonb)
                || jsonb_build_object('${LEARNING_CONFIG_KEY}', $2::boolean)`,
    [sourceId, !enabled]
  );
  resetLearningCache();
}

/**
 * Make the persisted flags match the web app's complete list of switched-off
 * firms: flag every listed source, clear the flag on every other source.
 */
export async function reconcileLearningDisabled(
  engine: BrainEngine,
  disabledIds: string[]
): Promise<{ disabled: number; cleared: number }> {
  const wanted = new Set(disabledIds.filter(isTenantSourceId));
  resetLearningCache();
  const current = await learningDisabledSources(engine);
  let disabled = 0;
  let cleared = 0;
  for (const id of wanted) {
    if (current.has(id)) continue;
    await setSourceLearning(engine, id, false);
    disabled++;
  }
  for (const id of current) {
    if (wanted.has(id)) continue;
    await setSourceLearning(engine, id, true);
    cleared++;
  }
  resetLearningCache();
  return { disabled, cleared };
}

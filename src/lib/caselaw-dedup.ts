/**
 * Shared deduplication — used by /api/cron/case-law,
 * /api/cron/regulatory-monitors and /api/cron/feedback-triage to filter
 * out already-seen hits. New consumers: use `filterNewIds` with a
 * namespace so features cannot collide on identical ids.
 *
 * Table: subsumio_caselaw_seen (brain_id, hit_id) PRIMARY KEY.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

const ensureCaselawSeenSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_caselaw_seen (
    brain_id text NOT NULL,
    hit_id text NOT NULL,
    seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brain_id, hit_id)
  )
`);

/**
 * Filter hits to only those not yet seen for this brain.
 * Returns all hits in dev mode (no Postgres).
 *
 * @param brainId Brain ID for dedup scoping.
 * @param hitIds Hit IDs to check (already prefixed with monitorId if needed).
 * @returns Array of indices (into the input array) of fresh hits.
 */
/**
 * Generalized variant with an explicit namespace — the shared table is
 * reused beyond caselaw (e.g. NPS feedback triage uses "nps"), so new
 * callers MUST namespace their ids to avoid cross-feature collisions.
 * Existing caselaw rows stay unprefixed for backward compatibility.
 */
export async function filterNewIds(
  brainId: string,
  namespace: string,
  ids: string[]
): Promise<Set<number>> {
  return filterNewHitIds(
    brainId,
    ids.map((id) => `${namespace}:${id}`)
  );
}

export async function filterNewHitIds(brainId: string, hitIds: string[]): Promise<Set<number>> {
  const pool = getSharedPgPool();
  if (!pool) {
    return new Set(hitIds.map((_, i) => i));
  }
  await ensureCaselawSeenSchema();
  const fresh = new Set<number>();
  for (let i = 0; i < hitIds.length; i++) {
    const { rowCount } = await pool.query(
      `INSERT INTO subsumio_caselaw_seen (brain_id, hit_id) VALUES ($1, $2)
       ON CONFLICT (brain_id, hit_id) DO NOTHING`,
      [brainId, hitIds[i]]
    );
    if (rowCount && rowCount > 0) fresh.add(i);
  }
  return fresh;
}

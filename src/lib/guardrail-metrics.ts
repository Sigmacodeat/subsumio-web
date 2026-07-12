/**
 * Guardrail Metrics Store — persists Tier-0 and Tier-1 guardrail results
 * for monitoring dashboards and SLA tracking.
 *
 * Schema: subsumio_guardrail_metrics
 *   - id: bigserial PK
 *   - brain_id: text (tenant)
 *   - user_id: text (who triggered the query)
 *   - query_hash: text (SHA-256 of query, for dedup)
 *   - tier_0_passed: boolean (deterministic guardrail)
 *   - tier_0_flags: jsonb (flag details)
 *   - tier_0_regenerated: boolean
 *   - tier_1_passed: boolean (cross-verify)
 *   - tier_1_flags: jsonb (flag details)
 *   - tier_1_regenerated: boolean
 *   - tier_1_model: text (e.g. "x-ai:grok-4-3")
 *   - jurisdiction: text
 *   - latency_ms: integer
 *   - warnings: text[] (raw warning strings)
 *   - created_at: timestamptz
 */

import { createSchemaInit } from "@/lib/schema-init";
import { getSharedPgPool } from "@/lib/auth/store";

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_guardrail_metrics (
    id bigserial PRIMARY KEY,
    brain_id text NOT NULL,
    user_id text,
    query_hash text,
    tier_0_passed boolean,
    tier_0_flags jsonb DEFAULT '[]',
    tier_0_regenerated boolean DEFAULT false,
    tier_1_passed boolean,
    tier_1_flags jsonb DEFAULT '[]',
    tier_1_regenerated boolean DEFAULT false,
    tier_1_model text,
    jurisdiction text,
    latency_ms integer,
    warnings text[] DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS subsumio_guardrail_metrics_brain_idx
    ON subsumio_guardrail_metrics (brain_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS subsumio_guardrail_metrics_created_idx
    ON subsumio_guardrail_metrics (created_at DESC)`,
]);

export interface GuardrailMetric {
  brain_id: string;
  user_id?: string;
  query_hash?: string;
  tier_0_passed?: boolean;
  tier_0_flags?: unknown[];
  tier_0_regenerated?: boolean;
  tier_1_passed?: boolean;
  tier_1_flags?: unknown[];
  tier_1_regenerated?: boolean;
  tier_1_model?: string;
  jurisdiction?: string;
  latency_ms?: number;
  warnings?: string[];
}

export async function logGuardrailMetric(metric: GuardrailMetric): Promise<void> {
  await ensureSchema();
  const pool = getSharedPgPool();
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO subsumio_guardrail_metrics
        (brain_id, user_id, query_hash, tier_0_passed, tier_0_flags, tier_0_regenerated,
         tier_1_passed, tier_1_flags, tier_1_regenerated, tier_1_model, jurisdiction,
         latency_ms, warnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        metric.brain_id,
        metric.user_id ?? null,
        metric.query_hash ?? null,
        metric.tier_0_passed ?? null,
        JSON.stringify(metric.tier_0_flags ?? []),
        metric.tier_0_regenerated ?? false,
        metric.tier_1_passed ?? null,
        JSON.stringify(metric.tier_1_flags ?? []),
        metric.tier_1_regenerated ?? false,
        metric.tier_1_model ?? null,
        metric.jurisdiction ?? null,
        metric.latency_ms ?? null,
        metric.warnings ?? [],
      ]
    );
  } catch (err) {
    // Metrics logging must never break the response
    console.error(
      "[guardrail-metrics] Failed to log:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

export interface GuardrailStats {
  total: number;
  tier_0_pass_rate: number;
  tier_0_regeneration_rate: number;
  tier_1_pass_rate: number;
  tier_1_regeneration_rate: number;
  tier_1_clean_rate: number;
  by_jurisdiction: Record<string, { total: number; pass_rate: number }>;
  recent_flags: Array<{
    id: number;
    created_at: string;
    tier_0_passed: boolean | null;
    tier_1_passed: boolean | null;
    warnings: string[];
    jurisdiction: string | null;
  }>;
  hourly: Array<{ hour: string; total: number; passed: number; flagged: number }>;
}

export async function getGuardrailStats(
  brainId: string,
  hours = 24
): Promise<GuardrailStats> {
  await ensureSchema();
  const pool = getSharedPgPool();
  if (!pool) {
    return {
      total: 0,
      tier_0_pass_rate: 0,
      tier_0_regeneration_rate: 0,
      tier_1_pass_rate: 0,
      tier_1_regeneration_rate: 0,
      tier_1_clean_rate: 0,
      by_jurisdiction: {},
      recent_flags: [],
      hourly: [],
    };
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Overall stats
  const overallRes = await pool.query(
    `SELECT
      count(*) as total,
      count(*) FILTER (WHERE tier_0_passed = true) as t0_pass,
      count(*) FILTER (WHERE tier_0_regenerated = true) as t0_regen,
      count(*) FILTER (WHERE tier_1_passed = true) as t1_pass,
      count(*) FILTER (WHERE tier_1_regenerated = true) as t1_regen,
      count(*) FILTER (WHERE tier_1_passed = true AND tier_0_passed = true) as both_pass
    FROM subsumio_guardrail_metrics
    WHERE brain_id = $1 AND created_at >= $2`,
    [brainId, since]
  );

  const overall = overallRes.rows[0] as Record<string, string>;
  const total = parseInt(overall.total ?? "0", 10) || 1;

  // By jurisdiction
  const jurRes = await pool.query(
    `SELECT jurisdiction,
      count(*) as total,
      count(*) FILTER (WHERE tier_0_passed = true AND tier_1_passed = true) as passed
    FROM subsumio_guardrail_metrics
    WHERE brain_id = $1 AND created_at >= $2 AND jurisdiction IS NOT NULL
    GROUP BY jurisdiction`,
    [brainId, since]
  );

  const byJurisdiction: Record<string, { total: number; pass_rate: number }> = {};
  for (const row of jurRes.rows) {
    const t = parseInt((row as Record<string, string>).total, 10) || 1;
    const p = parseInt((row as Record<string, string>).passed, 10) || 0;
    byJurisdiction[(row as Record<string, string>).jurisdiction] = {
      total: t,
      pass_rate: p / t,
    };
  }

  // Recent flagged entries
  const recentRes = await pool.query(
    `SELECT id, created_at, tier_0_passed, tier_1_passed, warnings, jurisdiction
    FROM subsumio_guardrail_metrics
    WHERE brain_id = $1 AND created_at >= $2
      AND (tier_0_passed = false OR tier_1_passed = false OR tier_0_regenerated = true OR tier_1_regenerated = true)
    ORDER BY created_at DESC
    LIMIT 20`,
    [brainId, since]
  );

  const recentFlags = recentRes.rows.map((r) => ({
    id: parseInt((r as Record<string, string>).id, 10),
    created_at: (r as Record<string, string>).created_at,
    tier_0_passed: (r as Record<string, string>).tier_0_passed === "true" ? true : (r as Record<string, string>).tier_0_passed === "false" ? false : null,
    tier_1_passed: (r as Record<string, string>).tier_1_passed === "true" ? true : (r as Record<string, string>).tier_1_passed === "false" ? false : null,
    warnings: (r as Record<string, string[]>).warnings ?? [],
    jurisdiction: (r as Record<string, string>).jurisdiction ?? null,
  }));

  // Hourly breakdown
  const hourlyRes = await pool.query(
    `SELECT
      date_trunc('hour', created_at) as hour,
      count(*) as total,
      count(*) FILTER (WHERE tier_0_passed = true AND tier_1_passed = true) as passed,
      count(*) FILTER (WHERE tier_0_passed = false OR tier_1_passed = false) as flagged
    FROM subsumio_guardrail_metrics
    WHERE brain_id = $1 AND created_at >= $2
    GROUP BY hour ORDER BY hour`,
    [brainId, since]
  );

  const hourly = hourlyRes.rows.map((r) => ({
    hour: (r as Record<string, string>).hour,
    total: parseInt((r as Record<string, string>).total, 10),
    passed: parseInt((r as Record<string, string>).passed, 10),
    flagged: parseInt((r as Record<string, string>).flagged, 10),
  }));

  return {
    total: parseInt(overall.total ?? "0", 10),
    tier_0_pass_rate: parseInt(overall.t0_pass ?? "0", 10) / total,
    tier_0_regeneration_rate: parseInt(overall.t0_regen ?? "0", 10) / total,
    tier_1_pass_rate: parseInt(overall.t1_pass ?? "0", 10) / total,
    tier_1_regeneration_rate: parseInt(overall.t1_regen ?? "0", 10) / total,
    tier_1_clean_rate: parseInt(overall.both_pass ?? "0", 10) / total,
    by_jurisdiction: byJurisdiction,
    recent_flags: recentFlags,
    hourly,
  };
}

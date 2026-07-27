/**
 * Web-side data access for the RAG Optimizer admin dashboard.
 *
 * Mirrors the server-side `rag-optimizer.ts` schema but lives in src/lib so
 * Next.js API routes can read run status/history without importing server code.
 */

import { Pool } from "pg";
import { env } from "./env";

let pool: Pool | null = null;

export function getRagOptimizerPool(): Pool {
  if (pool) return pool;
  const url = env("DATABASE_URL") ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured for RAG Optimizer DB access");
  }
  pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 60_000 });
  return pool;
}

export interface OptimizationRunRow {
  id: number;
  name: string;
  run_type: string;
  status: string;
  params: Record<string, unknown> | null;
  baseline_id: number | null;
  results: Record<string, unknown> | null;
  cost_estimate_usd: number | null;
  latency_p95_ms: number | null;
  applied_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestQueueRow {
  id: number;
  slug: string;
  jurisdiction: string;
  source_url: string | null;
  source_type: string;
  status: string;
  priority: number;
  error: string | null;
  retries: number;
  scheduled_at: string;
  completed_at: string | null;
  created_at: string;
}

export async function getOptimizationRuns(
  opts: { limit?: number; runType?: string } = {}
): Promise<OptimizationRunRow[]> {
  const pool = getRagOptimizerPool();
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (opts.runType) {
    values.push(opts.runType);
    conditions.push(`run_type = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(opts.limit ?? 50);

  const res = await pool.query(
    `SELECT * FROM rag_optimization_runs ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
    values
  );
  return res.rows.map((r) => rowToRun(r));
}

export async function getOptimizationRun(id: number): Promise<OptimizationRunRow | null> {
  const pool = getRagOptimizerPool();
  const res = await pool.query("SELECT * FROM rag_optimization_runs WHERE id = $1", [id]);
  return res.rows[0] ? rowToRun(res.rows[0]) : null;
}

export async function getActiveOptimizationRun(): Promise<OptimizationRunRow | null> {
  const pool = getRagOptimizerPool();
  const res = await pool.query(
    `SELECT * FROM rag_optimization_runs WHERE applied_at IS NOT NULL ORDER BY applied_at DESC LIMIT 1`
  );
  return res.rows[0] ? rowToRun(res.rows[0]) : null;
}

export async function getSweepConfigs(): Promise<Record<string, unknown>[]> {
  const pool = getRagOptimizerPool();
  const res = await pool.query(
    `SELECT id, name, description, param_grid, is_default, created_at FROM rag_sweep_configs ORDER BY is_default DESC, name`
  );
  return res.rows;
}

export async function getIngestQueue(limit = 50): Promise<IngestQueueRow[]> {
  const pool = getRagOptimizerPool();
  const res = await pool.query(
    `SELECT * FROM law_ingestion_queue ORDER BY status, priority DESC, scheduled_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    jurisdiction: r.jurisdiction,
    source_url: r.source_url,
    source_type: r.source_type,
    status: r.status,
    priority: r.priority,
    error: r.error,
    retries: r.retries,
    scheduled_at: r.scheduled_at,
    completed_at: r.completed_at,
    created_at: r.created_at,
  }));
}

function rowToRun(row: Record<string, unknown>): OptimizationRunRow {
  return {
    id: row.id as number,
    name: row.name as string,
    run_type: row.run_type as string,
    status: row.status as string,
    params: (row.params as Record<string, unknown> | null) ?? null,
    baseline_id: (row.baseline_id as number | null) ?? null,
    results: (row.results as Record<string, unknown> | null) ?? null,
    cost_estimate_usd: (row.cost_estimate_usd as number | null) ?? null,
    latency_p95_ms: (row.latency_p95_ms as number | null) ?? null,
    applied_at: (row.applied_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

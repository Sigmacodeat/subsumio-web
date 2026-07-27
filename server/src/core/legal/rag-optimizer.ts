/**
 * RAG Auto-Optimizer — backend orchestrator for one-click recall tuning.
 *
 * Responsibilities:
 *   - Run baseline + sweep benchmarks against a live BrainEngine.
 *   - Persist results in `rag_optimization_runs`.
 *   - Recommend the best parameter set.
 *   - Apply/rollback runtime RAG knobs (hnsw.ef_search, LLM reranker).
 *   - Queue new/updated statutes from novella detection for ingestion.
 */

import type { Pool } from "pg";
import type { BrainEngine } from "../engine.ts";
import { runBenchmark } from "../../eval/at-legal-retrieval/benchmark.ts";
import type { BenchmarkReport } from "../../eval/at-legal-retrieval/benchmark.ts";

// ─── Types ───────────────────────────────────────────────────────────────

export interface OptimizationParams {
  /** PostgreSQL pgvector HNSW search probe list size. */
  hnswEfSearch: number;
  /** Enable the DeepSeek LLM paragraph reranker. */
  llmRerankEnabled: boolean;
  /** How many candidates the LLM reranker sees. */
  llmRerankTopNIn?: number;
  /** Provider:model override for the reranker. */
  llmRerankModel?: string;
  /** Sources to search over. */
  sourceIds?: string[];
  /** Fixture path for the benchmark. */
  fixturePath?: string;
  /** Jurisdiction passed to hybridSearch. */
  jurisdiction?: string;
  /** Top-K to evaluate. */
  topK?: number;
}

export interface OptimizationRun {
  id: number;
  name: string;
  run_type: "baseline" | "sweep" | "auto" | "ingest" | "final";
  status: "pending" | "running" | "completed" | "failed" | "rolled_back";
  params: OptimizationParams | Record<string, unknown>;
  baseline_id: number | null;
  results: BenchmarkReport | null;
  cost_estimate_usd: number | null;
  latency_p95_ms: number | null;
  applied_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SweepConfig {
  id: number;
  name: string;
  description: string | null;
  param_grid: Record<string, unknown[]>;
  is_default: boolean;
}

export interface NovellaQueueItem {
  slug: string;
  jurisdiction: string;
  statute_code?: string;
  source_url?: string;
  source_type?: "statute" | "judgement" | "regulation";
}

// ─── Constants ───────────────────────────────────────────────────────────

const ACTIVE_CONFIG_KEY = "rag.optimizer.active_config";
const ACTIVE_RUN_KEY = "rag.optimizer.active_run_id";
const DEFAULT_FIXTURE = "test/fixtures/at-legal-retrieval.jsonl";
const DEFAULT_TOP_K = 8;

// ─── Run CRUD ──────────────────────────────────────────────────────────────

export async function insertRun(
  pool: Pool,
  opts: {
    name: string;
    run_type: OptimizationRun["run_type"];
    params: OptimizationParams | Record<string, unknown>;
    baseline_id?: number;
    created_by?: string;
  }
): Promise<number> {
  const res = await pool.query(
    `INSERT INTO rag_optimization_runs (name, run_type, params, baseline_id, status, created_by)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING id`,
    [
      opts.name,
      opts.run_type,
      JSON.stringify(opts.params),
      opts.baseline_id ?? null,
      opts.created_by ?? null,
    ]
  );
  return res.rows[0].id;
}

export async function updateRun(
  pool: Pool,
  runId: number,
  updates: Partial<{
    status: OptimizationRun["status"];
    results: BenchmarkReport | null;
    cost_estimate_usd: number;
    latency_p95_ms: number;
    applied_at: string;
    error: string | null;
  }>
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(updates.status);
  }
  if ("results" in updates) {
    fields.push(`results = $${idx++}`);
    values.push(updates.results ? JSON.stringify(updates.results) : null);
  }
  if (updates.cost_estimate_usd !== undefined) {
    fields.push(`cost_estimate_usd = $${idx++}`);
    values.push(updates.cost_estimate_usd);
  }
  if (updates.latency_p95_ms !== undefined) {
    fields.push(`latency_p95_ms = $${idx++}`);
    values.push(updates.latency_p95_ms);
  }
  if (updates.applied_at !== undefined) {
    fields.push(`applied_at = $${idx++}`);
    values.push(updates.applied_at);
  }
  if ("error" in updates) {
    fields.push(`error = $${idx++}`);
    values.push(updates.error ?? null);
  }
  if (fields.length === 0) return;
  fields.push(`updated_at = NOW()`);
  values.push(runId);
  await pool.query(
    `UPDATE rag_optimization_runs SET ${fields.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function getRun(pool: Pool, runId: number): Promise<OptimizationRun | null> {
  const res = await pool.query("SELECT * FROM rag_optimization_runs WHERE id = $1", [runId]);
  if (res.rows.length === 0) return null;
  return rowToRun(res.rows[0]);
}

export async function getHistory(
  pool: Pool,
  opts: { limit?: number; runType?: OptimizationRun["run_type"] } = {}
): Promise<OptimizationRun[]> {
  const conditions = [];
  const values: unknown[] = [];
  if (opts.runType) {
    values.push(opts.runType);
    conditions.push(`run_type = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 50;
  const res = await pool.query(
    `SELECT * FROM rag_optimization_runs ${where} ORDER BY created_at DESC LIMIT $${values.length + 1}`,
    [...values, limit]
  );
  return res.rows.map(rowToRun);
}

export async function getActiveRun(pool: Pool): Promise<OptimizationRun | null> {
  const res = await pool.query(
    `SELECT r.* FROM rag_optimization_runs r
     WHERE r.applied_at IS NOT NULL
     ORDER BY r.applied_at DESC
     LIMIT 1`
  );
  return res.rows[0] ? rowToRun(res.rows[0]) : null;
}

function rowToRun(row: Record<string, unknown>): OptimizationRun {
  return {
    id: row.id as number,
    name: row.name as string,
    run_type: row.run_type as OptimizationRun["run_type"],
    status: row.status as OptimizationRun["status"],
    params: (row.params as Record<string, unknown>) ?? {},
    baseline_id: (row.baseline_id as number | null) ?? null,
    results: (row.results as BenchmarkReport | null) ?? null,
    cost_estimate_usd: (row.cost_estimate_usd as number | null) ?? null,
    latency_p95_ms: (row.latency_p95_ms as number | null) ?? null,
    applied_at: (row.applied_at as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

// ─── Engine / DB helpers ───────────────────────────────────────────────────

export async function currentEfSearch(pool: Pool): Promise<string | null> {
  try {
    const res = await pool.query("SHOW hnsw.ef_search");
    return ((res.rows[0] as any)?.["hnsw.ef_search"] as string | null) ?? null;
  } catch {
    return null;
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function pgTerminateOtherSessions(pool: Pool): Promise<void> {
  await pool.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'
  `);
}

export async function setEfSearch(pool: Pool, value: number | null): Promise<void> {
  const dbRes = await pool.query<{ db: string }>("SELECT current_database() AS db");
  const db = dbRes.rows[0].db;
  const ident = quoteIdent(db);
  if (value === null) {
    await pool.query(`ALTER DATABASE ${ident} RESET hnsw.ef_search`);
  } else {
    const n = Math.round(Number(value));
    await pool.query(`ALTER DATABASE ${ident} SET hnsw.ef_search = ${n}`);
  }
}

export async function analyzeAndPrewarm(engine: BrainEngine): Promise<void> {
  try {
    await engine.executeRaw("ANALYZE content_chunks", []);
  } catch (err) {
    console.warn(
      "[rag-optimizer] ANALYZE content_chunks skipped:",
      err instanceof Error ? err.message : String(err)
    );
  }
  try {
    // pg_prewarm requires the extension; fail-open if not installed.
    await engine.executeRaw("SELECT pg_prewarm('content_chunks')", []);
  } catch {
    // ignore
  }
}

// ─── Benchmark execution ───────────────────────────────────────────────────

export async function executeBenchmark(
  engine: BrainEngine,
  pool: Pool,
  runId: number,
  params: OptimizationParams,
  onProgress?: (idx: number, total: number) => void
): Promise<BenchmarkReport> {
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const prevEf = await currentEfSearch(pool);
  const ef = params.hnswEfSearch ?? 64;
  await setEfSearch(pool, ef);

  try {
    const report = await runBenchmark(engine, {
      fixturePath: params.fixturePath ?? DEFAULT_FIXTURE,
      topK: params.topK ?? DEFAULT_TOP_K,
      llmRerank: params.llmRerankEnabled,
      llmRerankModel: params.llmRerankModel,
      llmRerankTopNIn: params.llmRerankTopNIn,
      sourceIds: params.sourceIds,
      jurisdiction: params.jurisdiction ?? "at",
      onProgress: (idx, total) => onProgress?.(idx, total),
    });

    // Rough cost estimate: $0.0005 per rerank + embedding cost per query.
    const rerankCostPerQuery = params.llmRerankEnabled ? 0.0005 : 0;
    const costEstimate = report.total * (rerankCostPerQuery + 0.0001);

    await updateRun(pool, runId, {
      status: "completed",
      results: report,
      cost_estimate_usd: Number(costEstimate.toFixed(4)),
      latency_p95_ms: report.latency_p95_ms,
    });

    return report;
  } catch (err) {
    await updateRun(pool, runId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    await setEfSearch(pool, prevEf ? Number(prevEf) : null);
  }
}

// ─── Baseline / Sweep ──────────────────────────────────────────────────────

export async function runBaseline(
  engine: BrainEngine,
  pool: Pool,
  params: OptimizationParams,
  opts: {
    name?: string;
    createdBy?: string;
    onProgress?: (idx: number, total: number) => void;
  } = {}
): Promise<OptimizationRun> {
  const runId = await insertRun(pool, {
    name:
      opts.name ??
      `baseline-ef${params.hnswEfSearch}-${params.llmRerankEnabled ? "rerank" : "no-rerank"}`,
    run_type: "baseline",
    params,
    created_by: opts.createdBy,
  });

  await updateRun(pool, runId, { status: "running" });
  await executeBenchmark(engine, pool, runId, params, opts.onProgress);
  return (await getRun(pool, runId))!;
}

export function* generateParamCombos(
  grid: Record<string, unknown[]>
): Generator<Record<string, unknown>> {
  const keys = Object.keys(grid);
  const values = keys.map((k) => grid[k]!);

  function* helper(
    idx: number,
    current: Record<string, unknown>
  ): Generator<Record<string, unknown>> {
    if (idx === keys.length) {
      yield { ...current };
      return;
    }
    for (const v of values[idx]!) {
      current[keys[idx]!] = v;
      yield* helper(idx + 1, current);
      delete current[keys[idx]!];
    }
  }

  yield* helper(0, {});
}

export function comboToParams(
  combo: Record<string, unknown>,
  base: Partial<OptimizationParams> = {}
): OptimizationParams {
  return {
    hnswEfSearch: Number(combo["hnsw.ef_search"] ?? base.hnswEfSearch ?? 64),
    llmRerankEnabled: Boolean(combo["llmRerank.enabled"] ?? base.llmRerankEnabled ?? false),
    llmRerankTopNIn:
      combo["llmRerank.topNIn"] !== undefined
        ? Number(combo["llmRerank.topNIn"])
        : base.llmRerankTopNIn,
    llmRerankModel:
      combo["llmRerank.model"] !== undefined
        ? String(combo["llmRerank.model"])
        : base.llmRerankModel,
    sourceIds: base.sourceIds,
    fixturePath: base.fixturePath,
    jurisdiction: base.jurisdiction,
    topK: base.topK,
  };
}

export async function runSweep(
  engine: BrainEngine,
  pool: Pool,
  opts: {
    baselineId: number;
    grid: Record<string, unknown[]>;
    baseParams?: Partial<OptimizationParams>;
    onProgress?: (done: number, total: number, current: OptimizationRun) => void;
  }
): Promise<OptimizationRun[]> {
  const baseline = await getRun(pool, opts.baselineId);
  if (!baseline) throw new Error(`Baseline run ${opts.baselineId} not found`);

  const combos = Array.from(generateParamCombos(opts.grid));
  const runs: OptimizationRun[] = [];
  let idx = 0;

  for (const combo of combos) {
    idx++;
    const params = comboToParams(combo, opts.baseParams);
    const runId = await insertRun(pool, {
      name: `sweep-${idx}-ef${params.hnswEfSearch}-${params.llmRerankEnabled ? "rerank" : "no-rerank"}`,
      run_type: "sweep",
      params,
      baseline_id: opts.baselineId,
    });

    await updateRun(pool, runId, { status: "running" });
    let run = (await getRun(pool, runId))!;
    opts.onProgress?.(idx - 1, combos.length, run);

    try {
      await executeBenchmark(engine, pool, runId, params);
      run = (await getRun(pool, runId))!;
      runs.push(run);
      opts.onProgress?.(idx, combos.length, run);
    } catch (err) {
      console.error(
        `[rag-optimizer] sweep ${runId} failed:`,
        err instanceof Error ? err.message : String(err)
      );
      run = (await getRun(pool, runId))!;
      runs.push(run);
      opts.onProgress?.(idx, combos.length, run);
    }
  }

  return runs;
}

// ─── Recommendation & Apply ────────────────────────────────────────────────

export function scoreRun(run: OptimizationRun, baseline?: OptimizationRun | null): number {
  const r = run.results;
  if (!r) return -Infinity;
  const baselineHit5 = baseline?.results?.aggregate?.hit_at_5 ?? 0;
  const hit5 = r.aggregate.hit_at_5;
  const mrr = r.aggregate.mrr;
  const latency = run.latency_p95_ms ?? 5000;
  const latencyPenalty = Math.max(0, (latency - 2000) / 1000) * 0.01;
  const recallGain = hit5 - baselineHit5;
  return hit5 * 10 + mrr * 5 + recallGain * 20 - latencyPenalty;
}

export function recommendRun(
  runs: OptimizationRun[],
  baseline?: OptimizationRun | null
): OptimizationRun | null {
  const completed = runs.filter((r) => r.status === "completed" && r.results);
  if (completed.length === 0) return null;
  completed.sort((a, b) => scoreRun(b, baseline) - scoreRun(a, baseline));
  return completed[0] ?? null;
}

export async function applyRun(
  engine: BrainEngine,
  pool: Pool,
  runId: number
): Promise<OptimizationRun> {
  const run = await getRun(pool, runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "completed" || !run.results) {
    throw new Error(`Run ${runId} is not completed`);
  }

  const params = run.params as OptimizationParams;
  const prevEf = await currentEfSearch(pool);
  const activeConfig = JSON.stringify(params);

  await pool.query("BEGIN");
  try {
    // Clear active flags on all other runs.
    await pool.query(
      "UPDATE rag_optimization_runs SET applied_at = NULL WHERE applied_at IS NOT NULL"
    );
    await setEfSearch(pool, params.hnswEfSearch);
    await engine.setConfig(ACTIVE_RUN_KEY, String(runId));
    await engine.setConfig(ACTIVE_CONFIG_KEY, activeConfig);
    await analyzeAndPrewarm(engine);
    await updateRun(pool, runId, { applied_at: new Date().toISOString(), status: "completed" });
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    // Best-effort restore previous ef
    try {
      await setEfSearch(pool, prevEf ? Number(prevEf) : null);
    } catch {
      // ignore
    }
    throw err;
  }

  return (await getRun(pool, runId))!;
}

export async function rollbackToRun(
  engine: BrainEngine,
  pool: Pool,
  targetRunId: number
): Promise<OptimizationRun> {
  const target = await getRun(pool, targetRunId);
  if (!target) throw new Error(`Run ${targetRunId} not found`);
  if (target.status !== "completed" || !target.results) {
    throw new Error(`Cannot roll back to incomplete run ${targetRunId}`);
  }

  const params = target.params as OptimizationParams;
  const prevEf = await currentEfSearch(pool);

  await pool.query("BEGIN");
  try {
    await pool.query(
      "UPDATE rag_optimization_runs SET applied_at = NULL WHERE applied_at IS NOT NULL"
    );
    await setEfSearch(pool, params.hnswEfSearch);
    await engine.setConfig(ACTIVE_RUN_KEY, String(targetRunId));
    await engine.setConfig(ACTIVE_CONFIG_KEY, JSON.stringify(params));
    await analyzeAndPrewarm(engine);
    await updateRun(pool, targetRunId, { applied_at: new Date().toISOString() });
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    try {
      await setEfSearch(pool, prevEf ? Number(prevEf) : null);
    } catch {
      // ignore
    }
    throw err;
  }

  return (await getRun(pool, targetRunId))!;
}

export async function loadActiveParams(engine: BrainEngine): Promise<OptimizationParams | null> {
  const raw = await engine.getConfig(ACTIVE_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OptimizationParams;
  } catch {
    return null;
  }
}

// ─── Sweep configs ─────────────────────────────────────────────────────────

export async function getSweepConfigs(pool: Pool): Promise<SweepConfig[]> {
  const res = await pool.query("SELECT * FROM rag_sweep_configs ORDER BY is_default DESC, name");
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    param_grid: r.param_grid,
    is_default: r.is_default,
  }));
}

export async function getDefaultSweepConfig(pool: Pool): Promise<SweepConfig | null> {
  const res = await pool.query("SELECT * FROM rag_sweep_configs WHERE is_default = TRUE LIMIT 1");
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    param_grid: r.param_grid,
    is_default: r.is_default,
  };
}

// ─── Ingestion queue ─────────────────────────────────────────────────────────

export async function enqueueNovellaItems(pool: Pool, items: NovellaQueueItem[]): Promise<number> {
  let inserted = 0;
  for (const item of items) {
    const res = await pool.query(
      `INSERT INTO law_ingestion_queue (slug, jurisdiction, source_url, source_type, status)
       VALUES ($1, $2, $3, $4, 'queued')
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [item.slug, item.jurisdiction, item.source_url ?? null, item.source_type ?? "statute"]
    );
    if (res.rowCount && res.rowCount > 0) inserted++;
  }
  return inserted;
}

export async function getIngestQueue(pool: Pool, limit = 50): Promise<unknown[]> {
  const res = await pool.query(
    `SELECT * FROM law_ingestion_queue ORDER BY status, priority DESC, scheduled_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

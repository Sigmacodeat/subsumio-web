/**
 * Decision Tracing — TRACE-Schema für Subsumio Agent-Pipeline.
 *
 * Persistiert pro Specialist-Call einen typed `decision_record` mit:
 *   - specialist, layer, query_or_task
 *   - tools_called_with_rationale
 *   - alternatives_considered
 *   - selected_approach
 *   - confidence
 *   - reasoning_summary
 *
 * Wie Facio (2026) fordert: "Without the 'why', the audit trail is incomplete."
 * Wie TRACE (arXiv 2607.12480): "no durable state change without a record."
 *
 * Schema: subsumio_decision_records Tabelle (JSONB für flexible Felder).
 */

import type { BrainEngine } from "../engine.ts";

export interface DecisionRecord {
  job_id: number;
  specialist: string;
  layer: number;
  layer_name?: string;
  case_slug?: string;
  model: string;
  model_tier: string;
  query_or_task: string;
  tools_called: Array<{
    tool: string;
    input_summary: string;
    rationale?: string;
    timestamp: string;
  }>;
  alternatives_considered?: string[];
  selected_approach?: string;
  confidence?: "high" | "medium" | "low";
  reasoning_summary?: string;
  final_output_summary?: string;
  tokens_in: number;
  tokens_out: number;
  tokens_cache_read: number;
  duration_ms: number;
  /** v0.43.x EBTE Soft-Enforcement: compliance metrics */
  ebte_total_tool_calls?: number;
  ebte_missing_rationales?: number;
  ebte_compliance_rate?: number;
  created_at: string;
}

let schemaInitialized = false;

async function ensureSchema(engine: BrainEngine): Promise<void> {
  if (schemaInitialized) return;
  await engine.executeRaw(`
    CREATE TABLE IF NOT EXISTS subsumio_decision_records (
      id          bigserial PRIMARY KEY,
      job_id      bigint NOT NULL,
      specialist  text NOT NULL,
      layer       integer NOT NULL,
      layer_name  text,
      case_slug   text,
      model       text NOT NULL,
      model_tier  text NOT NULL,
      query_or_task text NOT NULL,
      tools_called jsonb NOT NULL DEFAULT '[]'::jsonb,
      alternatives_considered jsonb DEFAULT '[]'::jsonb,
      selected_approach text,
      confidence  text,
      reasoning_summary text,
      final_output_summary text,
      tokens_in   integer NOT NULL DEFAULT 0,
      tokens_out  integer NOT NULL DEFAULT 0,
      tokens_cache_read integer NOT NULL DEFAULT 0,
      duration_ms integer NOT NULL DEFAULT 0,
      ebte_total_tool_calls integer DEFAULT 0,
      ebte_missing_rationales integer DEFAULT 0,
      ebte_compliance_rate real DEFAULT 1.0,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS subsumio_decision_records_job_idx
      ON subsumio_decision_records (job_id);
    CREATE INDEX IF NOT EXISTS subsumio_decision_records_specialist_idx
      ON subsumio_decision_records (specialist, created_at DESC);
    CREATE INDEX IF NOT EXISTS subsumio_decision_records_case_idx
      ON subsumio_decision_records (case_slug, created_at DESC)
      WHERE case_slug IS NOT NULL;
    -- v0.43.x EBTE Soft-Enforcement: additive columns for existing tables.
    -- CREATE TABLE IF NOT EXISTS does not add columns to existing tables,
    -- so ALTER TABLE ... ADD COLUMN IF NOT EXISTS is required for upgrades.
    ALTER TABLE subsumio_decision_records
      ADD COLUMN IF NOT EXISTS ebte_total_tool_calls integer DEFAULT 0;
    ALTER TABLE subsumio_decision_records
      ADD COLUMN IF NOT EXISTS ebte_missing_rationales integer DEFAULT 0;
    ALTER TABLE subsumio_decision_records
      ADD COLUMN IF NOT EXISTS ebte_compliance_rate real DEFAULT 1.0;
  `);
  schemaInitialized = true;
}

/**
 * Persistiert einen Decision Record für einen Specialist-Call.
 * Wird vom subagent handler nach Abschluss des Specialist-Loops aufgerufen.
 */
export async function persistDecisionRecord(
  engine: BrainEngine,
  record: Omit<DecisionRecord, "created_at">
): Promise<void> {
  await ensureSchema(engine);
  await engine.executeRaw(
    `INSERT INTO subsumio_decision_records (
       job_id, specialist, layer, layer_name, case_slug,
       model, model_tier, query_or_task, tools_called,
       alternatives_considered, selected_approach, confidence,
       reasoning_summary, final_output_summary,
       tokens_in, tokens_out, tokens_cache_read, duration_ms,
       ebte_total_tool_calls, ebte_missing_rationales, ebte_compliance_rate
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      record.job_id,
      record.specialist,
      record.layer,
      record.layer_name ?? null,
      record.case_slug ?? null,
      record.model,
      record.model_tier,
      record.query_or_task,
      JSON.stringify(record.tools_called),
      JSON.stringify(record.alternatives_considered ?? []),
      record.selected_approach ?? null,
      record.confidence ?? null,
      record.reasoning_summary ?? null,
      record.final_output_summary ?? null,
      record.tokens_in,
      record.tokens_out,
      record.tokens_cache_read,
      record.duration_ms,
      record.ebte_total_tool_calls ?? 0,
      record.ebte_missing_rationales ?? 0,
      record.ebte_compliance_rate ?? 1.0,
    ]
  );
}

/**
 * Lädt Decision Records für einen Job (z.B. für Audit-View).
 */
export async function getDecisionRecords(
  engine: BrainEngine,
  jobId: number
): Promise<DecisionRecord[]> {
  await ensureSchema(engine);
  const rows = await engine.executeRaw(
    `SELECT * FROM subsumio_decision_records WHERE job_id = $1 ORDER BY layer ASC, id ASC`,
    [jobId]
  );
  return (rows as unknown[]).map((r) => r as DecisionRecord);
}

/**
 * Lädt Decision Records für einen Case (z.B. für Case-Audit-View).
 */
export async function getDecisionRecordsForCase(
  engine: BrainEngine,
  caseSlug: string,
  limit = 100
): Promise<DecisionRecord[]> {
  await ensureSchema(engine);
  const rows = await engine.executeRaw(
    `SELECT * FROM subsumio_decision_records
     WHERE case_slug = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [caseSlug, limit]
  );
  return (rows as unknown[]).map((r) => r as DecisionRecord);
}

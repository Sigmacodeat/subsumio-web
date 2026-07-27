import { getSharedPgPool } from "./auth/store";

export interface QualitySnapshotInsert {
  brain_id: string;
  report: Record<string, unknown>;
  health_score: number;
  corpus_total_pages: number;
  corpus_total_chunks: number;
  embedding_coverage_pct: number;
  hallucination_rate: number;
  guardrail_pass_rate: number;
  generated_at: string;
}

export interface QualitySnapshotRow extends QualitySnapshotInsert {
  id: string;
  report_date: string;
  created_at: string;
}

export async function saveQualitySnapshot(
  data: QualitySnapshotInsert
): Promise<QualitySnapshotRow> {
  const pool = getSharedPgPool();
  if (!pool) throw new Error("Database not available");

  const result = await pool.query(
    `
    INSERT INTO quality_snapshots (
      brain_id, report_date, report, health_score,
      corpus_total_pages, corpus_total_chunks, embedding_coverage_pct,
      hallucination_rate, guardrail_pass_rate, generated_at
    ) VALUES (
      $1, ($2)::date, $3, $4, $5, $6, $7, $8, $9, $10
    )
    ON CONFLICT (brain_id, report_date) DO UPDATE SET
      report = EXCLUDED.report,
      health_score = EXCLUDED.health_score,
      corpus_total_pages = EXCLUDED.corpus_total_pages,
      corpus_total_chunks = EXCLUDED.corpus_total_chunks,
      embedding_coverage_pct = EXCLUDED.embedding_coverage_pct,
      hallucination_rate = EXCLUDED.hallucination_rate,
      guardrail_pass_rate = EXCLUDED.guardrail_pass_rate,
      generated_at = EXCLUDED.generated_at,
      created_at = NOW()
    RETURNING id, brain_id, report_date::text AS report_date, report, health_score,
      corpus_total_pages, corpus_total_chunks, embedding_coverage_pct,
      hallucination_rate, guardrail_pass_rate, generated_at::text AS generated_at,
      created_at::text AS created_at
    `,
    [
      data.brain_id,
      data.generated_at.slice(0, 10),
      JSON.stringify(data.report),
      data.health_score,
      data.corpus_total_pages,
      data.corpus_total_chunks,
      data.embedding_coverage_pct,
      data.hallucination_rate,
      data.guardrail_pass_rate,
      data.generated_at,
    ]
  );
  return result.rows[0] as QualitySnapshotRow;
}

export async function getQualityTrends(brainId: string, limit = 30): Promise<QualitySnapshotRow[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];

  const result = await pool.query(
    `
    SELECT id, brain_id, report_date::text AS report_date, report, health_score,
      corpus_total_pages, corpus_total_chunks, embedding_coverage_pct,
      hallucination_rate, guardrail_pass_rate, generated_at::text AS generated_at,
      created_at::text AS created_at
    FROM quality_snapshots
    WHERE brain_id = $1
    ORDER BY report_date DESC
    LIMIT $2
    `,
    [brainId, limit]
  );
  return result.rows as QualitySnapshotRow[];
}

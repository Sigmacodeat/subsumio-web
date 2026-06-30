import type { Pool } from "pg";
import { ensureLegalGraphSchema } from "./schema";

// ── Types ─────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  id: string;
  title: string;
  court: string;
  court_level: string | null;
  decision_date: string | null;
  decision_type: string | null;
  legal_area: string | null;
  file_number: string | null;
  ecli: string | null;
  citation_count: number;
  treatment_status: string;
  snippet: string;
  bm25_score: number;
  vector_score: number;
  citation_boost: number;
  final_score: number;
  source: "bm25" | "vector" | "hybrid";
}

export interface HybridSearchOpts {
  q: string;
  jurisdiction?: string;
  court?: string;
  courtLevel?: string;
  legalArea?: string;
  dateFrom?: string;
  dateTo?: string;
  treatmentStatus?: string;
  limit?: number;
  offset?: number;
  // RRF weights
  bm25Weight?: number;
  vectorWeight?: number;
  citationWeight?: number;
}

// ── Reciprocal Rank Fusion (RRF) ──────────────────────────────────────
// Standard RRF formula: score(d) = Σ 1/(k + rank_i(d))
// k=60 is the standard constant from the original RRF paper.
const RRF_K = 60;

function reciprocalRankFusion(
  bm25Results: { id: string; rank: number; score: number }[],
  vectorResults: { id: string; rank: number; score: number }[],
  citationBoosts: Map<string, number>,
  opts: { bm25Weight: number; vectorWeight: number; citationWeight: number }
): Map<
  string,
  {
    score: number;
    bm25_score: number;
    vector_score: number;
    citation_boost: number;
    source: "bm25" | "vector" | "hybrid";
  }
> {
  const fused = new Map<
    string,
    {
      score: number;
      bm25_score: number;
      vector_score: number;
      citation_boost: number;
      source: "bm25" | "vector" | "hybrid";
    }
  >();

  for (const { id, rank, score } of bm25Results) {
    const rrfScore = opts.bm25Weight * (1 / (RRF_K + rank));
    const citationBoost = (citationBoosts.get(id) ?? 0) * opts.citationWeight;
    const existing = fused.get(id);
    if (existing) {
      existing.score += rrfScore + citationBoost;
      existing.bm25_score = score;
      existing.source = "hybrid";
    } else {
      fused.set(id, {
        score: rrfScore + citationBoost,
        bm25_score: score,
        vector_score: 0,
        citation_boost: citationBoost,
        source: "bm25",
      });
    }
  }

  for (const { id, rank, score } of vectorResults) {
    const rrfScore = opts.vectorWeight * (1 / (RRF_K + rank));
    const citationBoost = (citationBoosts.get(id) ?? 0) * opts.citationWeight;
    const existing = fused.get(id);
    if (existing) {
      existing.score += rrfScore;
      existing.vector_score = score;
      existing.source = "hybrid";
    } else {
      fused.set(id, {
        score: rrfScore + citationBoost,
        bm25_score: 0,
        vector_score: score,
        citation_boost: citationBoost,
        source: "vector",
      });
    }
  }

  return fused;
}

// ── BM25 search (Postgres tsvector full-text) ─────────────────────────

interface BM25Hit {
  id: string;
  title: string;
  court: string;
  court_level: string | null;
  decision_date: string | null;
  decision_type: string | null;
  legal_area: string | null;
  file_number: string | null;
  ecli: string | null;
  citation_count: number;
  treatment_status: string;
  snippet: string;
  ts_rank: number;
}

async function bm25Search(pool: Pool, opts: HybridSearchOpts): Promise<BM25Hit[]> {
  const limit = opts.limit ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Full-text search
  conditions.push(`j.search_vector @@ plainto_tsquery('german', $${paramIdx})`);
  params.push(opts.q);
  paramIdx++;

  if (opts.jurisdiction) {
    conditions.push(`j.jurisdiction = $${paramIdx}`);
    params.push(opts.jurisdiction);
    paramIdx++;
  }
  if (opts.court) {
    conditions.push(`j.court ILIKE $${paramIdx}`);
    params.push(`%${opts.court}%`);
    paramIdx++;
  }
  if (opts.courtLevel) {
    conditions.push(`j.court_level = $${paramIdx}`);
    params.push(opts.courtLevel);
    paramIdx++;
  }
  if (opts.legalArea) {
    conditions.push(`j.legal_area = $${paramIdx}`);
    params.push(opts.legalArea);
    paramIdx++;
  }
  if (opts.dateFrom) {
    conditions.push(`j.decision_date >= $${paramIdx}`);
    params.push(opts.dateFrom);
    paramIdx++;
  }
  if (opts.dateTo) {
    conditions.push(`j.decision_date <= $${paramIdx}`);
    params.push(opts.dateTo);
    paramIdx++;
  }
  if (opts.treatmentStatus) {
    conditions.push(`j.treatment_status = $${paramIdx}`);
    params.push(opts.treatmentStatus);
    paramIdx++;
  }

  const query = `
    SELECT
      j.id, j.title, j.court, j.court_level, j.decision_date,
      j.decision_type, j.legal_area, j.file_number, j.ecli,
      j.citation_count, j.treatment_status,
      ts_headline('german', j.content, plainto_tsquery('german', $1),
        'MaxWords=50, MinWords=20, MaxFragments=3') as snippet,
      ts_rank(j.search_vector, plainto_tsquery('german', $1)) as ts_rank
    FROM subsumio_judgements j
    WHERE ${conditions.join(" AND ")}
    ORDER BY ts_rank DESC
    LIMIT $${paramIdx}
  `;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows as BM25Hit[];
}

// ── Vector search (pgvector HNSW) ─────────────────────────────────────

interface VectorHit {
  id: string;
  title: string;
  court: string;
  court_level: string | null;
  decision_date: string | null;
  decision_type: string | null;
  legal_area: string | null;
  file_number: string | null;
  ecli: string | null;
  citation_count: number;
  treatment_status: string;
  snippet: string;
  cosine_distance: number;
}

async function vectorSearch(
  pool: Pool,
  queryEmbedding: number[],
  opts: HybridSearchOpts
): Promise<VectorHit[]> {
  const limit = opts.limit ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [JSON.stringify(queryEmbedding)];
  let paramIdx = 2;

  if (opts.jurisdiction) {
    conditions.push(`j.jurisdiction = $${paramIdx}`);
    params.push(opts.jurisdiction);
    paramIdx++;
  }
  if (opts.court) {
    conditions.push(`j.court ILIKE $${paramIdx}`);
    params.push(`%${opts.court}%`);
    paramIdx++;
  }
  if (opts.courtLevel) {
    conditions.push(`j.court_level = $${paramIdx}`);
    params.push(opts.courtLevel);
    paramIdx++;
  }
  if (opts.legalArea) {
    conditions.push(`j.legal_area = $${paramIdx}`);
    params.push(opts.legalArea);
    paramIdx++;
  }
  if (opts.dateFrom) {
    conditions.push(`j.decision_date >= $${paramIdx}`);
    params.push(opts.dateFrom);
    paramIdx++;
  }
  if (opts.dateTo) {
    conditions.push(`j.decision_date <= $${paramIdx}`);
    params.push(opts.dateTo);
    paramIdx++;
  }
  if (opts.treatmentStatus) {
    conditions.push(`j.treatment_status = $${paramIdx}`);
    params.push(opts.treatmentStatus);
    paramIdx++;
  }

  const filterClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const query = `
    WITH chunk_scores AS (
      SELECT
        c.judgement_id,
        MIN(c.embedding <=> $1::vector) as cosine_distance,
        MIN(c.chunk_text) as snippet
      FROM subsumio_judgement_chunks c
      WHERE c.embedding IS NOT NULL
      GROUP BY c.judgement_id
      ORDER BY MIN(c.embedding <=> $1::vector)
      LIMIT $${paramIdx}
    )
    SELECT
      j.id, j.title, j.court, j.court_level, j.decision_date,
      j.decision_type, j.legal_area, j.file_number, j.ecli,
      j.citation_count, j.treatment_status,
      LEFT(cs.snippet, 300) as snippet,
      cs.cosine_distance
    FROM chunk_scores cs
    JOIN subsumio_judgements j ON cs.judgement_id = j.id
    WHERE 1=1 ${filterClause}
    ORDER BY cs.cosine_distance ASC
  `;
  params.push(limit * 3); // Over-fetch to compensate for post-filters

  const result = await pool.query(query, params);
  return (result.rows as VectorHit[]).slice(0, limit);
}

// ── Citation boost: cases with more citations are more authoritative ──

async function getCitationBoosts(pool: Pool, judgementIds: string[]): Promise<Map<string, number>> {
  if (judgementIds.length === 0) return new Map();

  const result = await pool.query(
    `SELECT id,
      LOG(1 + citation_count) as boost
     FROM subsumio_judgements
     WHERE id = ANY($1::text[])`,
    [judgementIds]
  );

  const boosts = new Map<string, number>();
  for (const row of result.rows) {
    boosts.set(row.id, parseFloat(row.boost) || 0);
  }
  return boosts;
}

// ── Main hybrid search entry point ────────────────────────────────────

export async function hybridSearch(
  pool: Pool,
  opts: HybridSearchOpts,
  queryEmbedding?: number[]
): Promise<{ results: HybridSearchResult[]; total: number; mode: "hybrid" | "bm25_only" }> {
  await ensureLegalGraphSchema(pool);

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const bm25Weight = opts.bm25Weight ?? 0.4;
  const vectorWeight = opts.vectorWeight ?? 0.4;
  const citationWeight = opts.citationWeight ?? 0.2;

  // Run BM25 search
  const bm25Hits = await bm25Search(pool, opts);

  // Run vector search if embedding is available
  let vectorHits: VectorHit[] = [];
  if (queryEmbedding && queryEmbedding.length > 0) {
    try {
      vectorHits = await vectorSearch(pool, queryEmbedding, opts);
    } catch (err) {
      console.error("[legal-graph] Vector search failed, falling back to BM25 only:", err);
    }
  }

  // If no vector results, return BM25 only
  if (vectorHits.length === 0) {
    const results: HybridSearchResult[] = bm25Hits.map((hit, idx) => ({
      id: hit.id,
      title: hit.title,
      court: hit.court,
      court_level: hit.court_level,
      decision_date: hit.decision_date
        ? new Date(hit.decision_date).toISOString().split("T")[0]
        : null,
      decision_type: hit.decision_type,
      legal_area: hit.legal_area,
      file_number: hit.file_number,
      ecli: hit.ecli,
      citation_count: hit.citation_count,
      treatment_status: hit.treatment_status,
      snippet: hit.snippet,
      bm25_score: hit.ts_rank,
      vector_score: 0,
      citation_boost: Math.log(1 + hit.citation_count) * citationWeight,
      final_score: hit.ts_rank + Math.log(1 + hit.citation_count) * citationWeight,
      source: "bm25" as const,
    }));

    return {
      results: results.slice(offset, offset + limit),
      total: results.length,
      mode: "bm25_only",
    };
  }

  // Build rank lists for RRF
  const bm25Ranked = bm25Hits.map((hit, idx) => ({
    id: hit.id,
    rank: idx + 1,
    score: hit.ts_rank,
  }));

  const vectorRanked = vectorHits.map((hit, idx) => ({
    id: hit.id,
    rank: idx + 1,
    score: 1 - hit.cosine_distance, // Convert distance to similarity
  }));

  // Get citation boosts
  const allIds = [...new Set([...bm25Hits.map((h) => h.id), ...vectorHits.map((h) => h.id)])];
  const citationBoosts = await getCitationBoosts(pool, allIds);

  // Fuse results
  const fused = reciprocalRankFusion(bm25Ranked, vectorRanked, citationBoosts, {
    bm25Weight,
    vectorWeight,
    citationWeight,
  });

  // Build metadata map
  const metaMap = new Map<string, BM25Hit & Partial<VectorHit>>();
  for (const hit of bm25Hits) {
    metaMap.set(hit.id, hit);
  }
  for (const hit of vectorHits) {
    const existing = metaMap.get(hit.id);
    if (existing) {
      metaMap.set(hit.id, { ...existing, ...hit });
    } else {
      metaMap.set(hit.id, hit as BM25Hit & Partial<VectorHit>);
    }
  }

  // Sort by fused score
  const sortedIds = [...fused.entries()].sort((a, b) => b[1].score - a[1].score);

  const results: HybridSearchResult[] = sortedIds.map(([id, scores]) => {
    const meta = metaMap.get(id);
    return {
      id,
      title: meta?.title ?? id,
      court: meta?.court ?? "",
      court_level: meta?.court_level ?? null,
      decision_date: meta?.decision_date
        ? new Date(meta.decision_date).toISOString().split("T")[0]
        : null,
      decision_type: meta?.decision_type ?? null,
      legal_area: meta?.legal_area ?? null,
      file_number: meta?.file_number ?? null,
      ecli: meta?.ecli ?? null,
      citation_count: meta?.citation_count ?? 0,
      treatment_status: meta?.treatment_status ?? "unknown",
      snippet: meta?.snippet ?? "",
      bm25_score: scores.bm25_score,
      vector_score: scores.vector_score,
      citation_boost: scores.citation_boost,
      final_score: scores.score,
      source: scores.source,
    };
  });

  return {
    results: results.slice(offset, offset + limit),
    total: results.length,
    mode: "hybrid",
  };
}

// ── Get judgement detail with citation graph summary ──────────────────

export async function getJudgementDetail(pool: Pool, id: string) {
  const result = await pool.query(
    `SELECT
      j.*,
      t.overall_status as treatment_overall,
      t.positive_count, t.negative_count, t.neutral_count,
      t.distinguishing_count, t.overruled_count, t.unknown_count,
      t.total_citations as treatment_total,
      t.time_weighted_score, t.court_hierarchy, t.at_risk_reasons,
      t.last_citation_date
     FROM subsumio_judgements j
     LEFT JOIN subsumio_judgement_treatments t ON j.id = t.judgement_id
     WHERE j.id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

/**
 * GraphSAGE — Hierarchical Legal Graph Embeddings
 *
 * Implements a simplified GraphSAGE (Sample and Aggregate) algorithm for
 * the citation graph. Instead of training a neural network, we use a
 * propagation-based approach that aggregates neighbour embeddings through
 * the citation graph, producing graph-aware embeddings for each judgement.
 *
 * Architecture:
 * 1. Each judgement starts with its chunk-level mean embedding (from pgvector)
 * 2. For K hops (default 2), we propagate embeddings through the citation graph:
 *    - For each node, aggregate neighbour embeddings (mean + max pooling)
 *    - Combine self-embedding with aggregated neighbour embedding
 *    - L2-normalize the result
 * 3. The final graph embedding captures both content and structural context
 *
 * Storage:
 * - Graph embeddings stored in subsumio_judgement_graph_embeddings table
 * - Used as an additional signal in hybrid search (graph retrieval)
 *
 * Legal domain considerations:
 * - Overruled citations get negative weight (bad law propagation)
 * - Positive citations get positive weight (good law propagation)
 * - Court hierarchy: higher courts propagate more strongly
 */

import type { Pool } from "pg";

// ── Types ─────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  embedding: Float32Array;
  court_level: string | null;
  treatment_status: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  treatment: string; // positive, negative, neutral, distinguishing, overruled
  weight: number;
}

export interface GraphEmbeddingResult {
  judgement_id: string;
  graph_embedding: Float32Array;
  hop_count: number;
  neighbour_count: number;
}

// ── Treatment weights ─────────────────────────────────────────────────

export const TREATMENT_WEIGHTS: Record<string, number> = {
  positive: 1.0,
  negative: -0.5,
  neutral: 0.3,
  distinguishing: 0.1,
  overruled: -0.8,
  unknown: 0.2,
};

export const COURT_LEVEL_WEIGHTS: Record<string, number> = {
  supreme: 1.5,
  constitutional: 1.8,
  appeal: 1.2,
  regional: 1.0,
  local: 0.8,
  specialized: 1.1,
};

const DEFAULT_HOPS = 2;
const DEFAULT_SAMPLE_SIZE = 10; // Neighbours per hop (GraphSAGE sampling)

// ── Graph loading ─────────────────────────────────────────────────────

/**
 * Load all judgement nodes with their mean chunk embedding.
 */
async function loadGraphNodes(pool: Pool): Promise<Map<string, GraphNode>> {
  // pgvector doesn't support AVG() on vectors directly.
  // Use a CTE that computes the mean embedding per judgement by averaging
  // each dimension separately via array aggregation.
  const result = await pool.query(`
    WITH chunk_embeddings AS (
      SELECT
        judgement_id,
        embedding,
        vector_dims(embedding) as dim
      FROM subsumio_judgement_chunks
      WHERE embedding IS NOT NULL
    ),
    dims AS (
      SELECT judgement_id, MAX(dim) as dim FROM chunk_embeddings GROUP BY judgement_id
    ),
    expanded AS (
      SELECT
        ce.judgement_id,
        gs.idx,
        split_part(regexp_replace(ce.embedding::text, '[\[\] ]', '', 'g'), ',', gs.idx)::float8 as val
      FROM chunk_embeddings ce
      JOIN dims d ON ce.judgement_id = d.judgement_id
      CROSS JOIN generate_series(1, d.dim) AS gs(idx)
    ),
    mean_per_dim AS (
      SELECT judgement_id, idx, AVG(val) as mean_val
      FROM expanded
      GROUP BY judgement_id, idx
    ),
    mean_embeddings AS (
      SELECT
        judgement_id,
        '[' || string_agg(mean_val::text, ',' ORDER BY idx) || ']' as mean_emb_str
      FROM mean_per_dim
      GROUP BY judgement_id
    )
    SELECT
      j.id,
      j.court_level,
      j.treatment_status,
      me.mean_emb_str
    FROM subsumio_judgements j
    JOIN mean_embeddings me ON me.judgement_id = j.id
  `);

  const nodes = new Map<string, GraphNode>();
  for (const row of result.rows) {
    const embStr = row.mean_emb_str as string | null;
    if (embStr) {
      // mean_emb_str is a string like "[0.1,0.2,...]"
      const vec = new Float32Array(embStr.slice(1, -1).split(",").map(Number));
      nodes.set(row.id, {
        id: row.id,
        embedding: vec,
        court_level: row.court_level,
        treatment_status: row.treatment_status,
      });
    }
  }
  return nodes;
}

/**
 * Load citation edges with treatment-based weights.
 */
async function loadGraphEdges(pool: Pool): Promise<GraphEdge[]> {
  const result = await pool.query(`
    SELECT
      citing_judgement_id as source,
      cited_judgement_id as target,
      treatment
    FROM subsumio_judgement_citations
    WHERE cited_judgement_id IS NOT NULL
  `);

  return (result.rows as Array<{ source: string; target: string; treatment: string }>).map((r) => ({
    source: r.source,
    target: r.target,
    treatment: r.treatment ?? "unknown",
    weight: TREATMENT_WEIGHTS[r.treatment ?? "unknown"] ?? 0.2,
  }));
}

// ── GraphSAGE propagation ─────────────────────────────────────────────

/**
 * Aggregate neighbour embeddings using mean + max pooling (GraphSAGE style).
 */
export function aggregateNeighbours(
  selfEmbedding: Float32Array,
  neighbours: { embedding: Float32Array; weight: number }[]
): Float32Array {
  if (neighbours.length === 0) return selfEmbedding;

  const dim = selfEmbedding.length;
  const meanPool = new Float32Array(dim);
  const maxPool = new Float32Array(dim).fill(-Infinity);

  for (const { embedding, weight } of neighbours) {
    for (let i = 0; i < dim; i++) {
      const weighted = embedding[i] * weight;
      meanPool[i] += weighted;
      if (weighted > maxPool[i]) maxPool[i] = weighted;
    }
  }

  // Normalize mean pool
  for (let i = 0; i < dim; i++) {
    meanPool[i] /= neighbours.length;
  }

  // Handle -Infinity in maxPool (no positive weights)
  for (let i = 0; i < dim; i++) {
    if (maxPool[i] === -Infinity) maxPool[i] = 0;
  }

  // Combine: self (0.5) + mean pool (0.3) + max pool (0.2)
  const combined = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    combined[i] = 0.5 * selfEmbedding[i] + 0.3 * meanPool[i] + 0.2 * maxPool[i];
  }

  // L2 normalize
  return l2Normalize(combined);
}

export function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) result[i] = vec[i] / norm;
  return result;
}

/**
 * Sample neighbours (GraphSAGE fixed-size sampling).
 * Prioritizes by edge weight (treatment importance).
 */
export function sampleNeighbours(
  neighbours: { embedding: Float32Array; weight: number }[],
  sampleSize: number
): { embedding: Float32Array; weight: number }[] {
  if (neighbours.length <= sampleSize) return neighbours;
  return neighbours.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, sampleSize);
}

/**
 * Build adjacency list from edges.
 */
export function buildAdjacencyList(
  edges: GraphEdge[],
  nodes: Map<string, GraphNode>
): Map<string, { embedding: Float32Array; weight: number }[]> {
  const adj = new Map<string, { embedding: Float32Array; weight: number }[]>();

  for (const edge of edges) {
    // Skip edges where target node doesn't exist (unresolved citations)
    const targetNode = nodes.get(edge.target);
    const sourceNode = nodes.get(edge.source);
    if (!targetNode || !sourceNode) continue;

    // Source → Target (citing → cited): propagate target's embedding to source
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push({
      embedding: targetNode.embedding,
      weight: edge.weight * (COURT_LEVEL_WEIGHTS[targetNode.court_level ?? "local"] ?? 1.0),
    });

    // Target ← Source (cited ← citing): propagate source's embedding to target
    if (!adj.has(edge.target)) adj.set(edge.target, []);
    adj.get(edge.target)!.push({
      embedding: sourceNode.embedding,
      weight: edge.weight * (COURT_LEVEL_WEIGHTS[sourceNode.court_level ?? "local"] ?? 1.0),
    });
  }

  return adj;
}

/**
 * Run GraphSAGE propagation for K hops.
 * Returns updated node embeddings with graph context.
 */
export async function computeGraphEmbeddings(
  pool: Pool,
  opts?: {
    hops?: number;
    sampleSize?: number;
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
  }
): Promise<{
  computed: number;
  hops: number;
  total_nodes: number;
  total_edges: number;
}> {
  const hops = opts?.hops ?? DEFAULT_HOPS;
  const sampleSize = opts?.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const batchSize = opts?.batchSize ?? 100;

  // Load graph
  const nodes = await loadGraphNodes(pool);
  const edges = await loadGraphEdges(pool);

  if (nodes.size === 0) {
    return { computed: 0, hops, total_nodes: 0, total_edges: 0 };
  }

  const adjacency = buildAdjacencyList(edges, nodes);

  // Initialize embeddings with original node embeddings
  let currentEmbeddings = new Map<string, Float32Array>();
  for (const [id, node] of nodes) {
    currentEmbeddings.set(id, l2Normalize(node.embedding));
  }

  // K-hop propagation
  for (let hop = 0; hop < hops; hop++) {
    const nextEmbeddings = new Map<string, Float32Array>();

    for (const [id, node] of nodes) {
      const selfEmb = currentEmbeddings.get(id)!;
      const neighbours = adjacency.get(id) ?? [];

      const sampled = sampleNeighbours(neighbours, sampleSize);
      const newEmb = aggregateNeighbours(selfEmb, sampled);

      nextEmbeddings.set(id, newEmb);
    }

    currentEmbeddings = nextEmbeddings;
  }

  // Store graph embeddings in database
  let computed = 0;
  const nodeIds = [...nodes.keys()];

  for (let i = 0; i < nodeIds.length; i += batchSize) {
    const batch = nodeIds.slice(i, i + batchSize);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Drop existing graph embeddings for this batch
      await client.query(
        `DELETE FROM subsumio_judgement_graph_embeddings WHERE judgement_id = ANY($1::text[])`,
        [batch]
      );

      // Insert new graph embeddings
      for (const id of batch) {
        const emb = currentEmbeddings.get(id)!;
        const embStr = `[${Array.from(emb).join(",")}]`;
        const neighbourCount = adjacency.get(id)?.length ?? 0;

        await client.query(
          `INSERT INTO subsumio_judgement_graph_embeddings
           (judgement_id, graph_embedding, hop_count, neighbour_count, computed_at)
           VALUES ($1, $2::vector, $3, $4, NOW())
           ON CONFLICT (judgement_id) DO UPDATE SET
             graph_embedding = EXCLUDED.graph_embedding,
             hop_count = EXCLUDED.hop_count,
             neighbour_count = EXCLUDED.neighbour_count,
             computed_at = NOW()`,
          [id, embStr, hops, neighbourCount]
        );
        computed++;
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    opts?.onProgress?.(computed, nodes.size);
  }

  return {
    computed,
    hops,
    total_nodes: nodes.size,
    total_edges: edges.length,
  };
}

/**
 * Graph-based retrieval: find judgements with similar graph embeddings.
 * Uses pgvector cosine similarity on graph embeddings.
 */
export async function graphSearch(
  pool: Pool,
  queryEmbedding: number[],
  opts?: {
    limit?: number;
    jurisdiction?: string;
    legalArea?: string;
  }
): Promise<
  Array<{
    id: string;
    title: string;
    court: string;
    court_level: string | null;
    decision_date: string | null;
    treatment_status: string;
    graph_similarity: number;
    neighbour_count: number;
  }>
> {
  const limit = opts?.limit ?? 20;
  const conditions: string[] = [];
  const params: unknown[] = [JSON.stringify(queryEmbedding)];
  let paramIdx = 2;

  if (opts?.jurisdiction) {
    conditions.push(`j.jurisdiction = $${paramIdx}`);
    params.push(opts.jurisdiction);
    paramIdx++;
  }
  if (opts?.legalArea) {
    conditions.push(`j.legal_area = $${paramIdx}`);
    params.push(opts.legalArea);
    paramIdx++;
  }

  const filterClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      j.id, j.title, j.court, j.court_level, j.decision_date,
      j.treatment_status,
      1 - (ge.graph_embedding <=> $1::vector) as graph_similarity,
      ge.neighbour_count
    FROM subsumio_judgement_graph_embeddings ge
    JOIN subsumio_judgements j ON ge.judgement_id = j.id
    WHERE 1=1 ${filterClause}
    ORDER BY ge.graph_embedding <=> $1::vector
    LIMIT $${paramIdx}
  `;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows as Array<{
    id: string;
    title: string;
    court: string;
    court_level: string | null;
    decision_date: string | null;
    treatment_status: string;
    graph_similarity: number;
    neighbour_count: number;
  }>;
}

/**
 * Ensure the graph embeddings table exists.
 */
export async function ensureGraphEmbeddingsTable(pool: Pool): Promise<void> {
  // Get actual embedding dimension from the first non-null embedding
  const dimResult = await pool.query(
    `SELECT vector_dims(embedding) as dim FROM subsumio_judgement_chunks WHERE embedding IS NOT NULL LIMIT 1`
  );
  const dim = (dimResult.rows[0] as { dim: number | null })?.dim ?? 1536;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subsumio_judgement_graph_embeddings (
      judgement_id TEXT PRIMARY KEY REFERENCES subsumio_judgements(id) ON DELETE CASCADE,
      graph_embedding vector(${dim}),
      hop_count INTEGER NOT NULL DEFAULT 2,
      neighbour_count INTEGER NOT NULL DEFAULT 0,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_graph_embeddings_hnw
    ON subsumio_judgement_graph_embeddings
    USING hnsw (graph_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);
}

# HNSW Fine-Tuning Megaplan — Production-Grade Vector Search

## Current State (verified 2026-07-18)

| Component        | Status      | Detail                                                                        |
| ---------------- | ----------- | ----------------------------------------------------------------------------- |
| pgvector         | 0.8.2 ✅    | Supports iterative_scan, halfvec                                              |
| PostgreSQL       | 16.14 ✅    |                                                                               |
| HNSW Index       | Built ✅    | `idx_chunks_embedding_hnsw`, 15 GB, default params (m=16, ef_construction=64) |
| Embeddings       | 100% ✅     | 2,074,716 rows, all `openrouter:openai/text-embedding-3-small:1536`           |
| ef_search        | NOT SET ❌  | Using pgvector default 40                                                     |
| iterative_scan   | NOT SET ❌  | Filtered queries may return incomplete results                                |
| ANALYZE          | STALE ❌    | 137K+ rows modified since last analyze                                        |
| Dead indexes     | EXIST ❌    | `content_chunks_stale_idx`, `idx_chunks_embedding_null` waste writes          |
| halfvec          | NOT USED ❌ | 56 GB table could be ~28 GB                                                   |
| Hybrid Search    | ✅          | BM25 + vector + RRF + LLM rerank + court decision boost                       |
| Query Expansion  | ✅          | Static legal synonyms + LLM multi-query                                       |
| Recall Benchmark | PARTIAL     | DE retrieval 96%, AT law-level 100%, but no HNSW-specific recall harness      |

## Industry Research Summary

### pgvector HNSW Tuning (expert consensus)

- **m=16** is fine for <1M vectors; **m=32** recommended for 2M+ (better recall, +50% build time)
- **ef_construction=128** is sweet spot (vs default 64) — better graph quality
- **ef_search=100-200** for production (vs default 40) — measurable recall gain, <5ms latency increase
- **iterative_scan=relaxed_order** — critical for filtered queries (WHERE clauses), prevents incomplete results
- **halfvec** — 50% storage/I/O savings, <1% recall loss for 1536-dim embeddings

### Competitive Analysis (Harvey AI / LexisNexis / CoCounsel)

- Harvey uses **multi-query + parallel search** (keyword, terms & connectors, boolean, neural)
- CoCounsel generates **multiple queries** from user input, searches across sources, then **AI ranks and summarizes**
- Both use **cross-encoder reranking** (we have LLM rerank with DeepSeek V3.2)
- Harvey's key differentiator: **agentic search loop** (plan → search → evaluate → refine)
- Industry standard: BM25 + dense → RRF fusion → cross-encoder rerank → LLM (we have this ✅)

---

## Implementation Plan (8 Items, sequential)

### Item 1: `ef_search` + `iterative_scan` in searchVector() [CODE CHANGE]

**File:** `server/src/core/postgres-engine.ts` (line ~2152)
**Change:** Add 3 `SET LOCAL` statements in the `sql.begin()` transaction block of `searchVector()`:

```sql
SET LOCAL hnsw.ef_search = 100;
SET LOCAL hnsw.iterative_scan = 'relaxed_order';
SET LOCAL hnsw.max_scan_tuples = 20000;
```

**Why:** ef_search=100 doubles the candidate list (vs default 40), improving recall. iterative_scan=relaxed_order ensures filtered queries (language, source, date, legal metadata) don't return incomplete results. max_scan_tuples=20000 gives enough scan budget for 2M rows.
**Risk:** Minimal — SET LOCAL is transaction-scoped, no global impact. <5ms latency increase.
**Verification:** `EXPLAIN (ANALYZE, BUFFERS)` on a sample query with WHERE clause.

### Item 2: ANALYZE on content_chunks [DB COMMAND]

**Command:** `ANALYZE content_chunks;`
**Why:** 137K+ rows modified since last analyze → stale planner stats → suboptimal query plans.
**Risk:** None — read-only operation, updates planner statistics.
**Verification:** `SELECT last_analyze, n_mod_since_analyze FROM pg_stat_user_tables WHERE relname = 'content_chunks';`

### Item 3: Drop dead indexes [DB COMMAND]

**Commands:**

```sql
DROP INDEX IF EXISTS content_chunks_stale_idx;
DROP INDEX IF EXISTS idx_chunks_embedding_null;
```

**Why:** 100% embedding coverage → `idx_chunks_embedding_null` (partial index WHERE embedding IS NULL) is empty. `content_chunks_stale_idx` is outdated. Both waste write I/O on every INSERT/UPDATE.
**Risk:** Low — verify no query plans use them first with `EXPLAIN`.
**Verification:** `SELECT indexname FROM pg_indexes WHERE tablename = 'content_chunks';`

### Item 4: HNSW Index rebuild with m=32, ef_construction=128 [DB COMMAND]

**Commands:**

```sql
DROP INDEX CONCURRENTLY idx_chunks_embedding_hnsw;
CREATE INDEX CONCURRENTLY idx_chunks_embedding_hnsw
  ON content_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 128);
```

**Why:** For 2M+ vectors, m=32 gives better graph connectivity (recall), ef_construction=128 gives better build quality. Industry standard for production vector search at scale.
**Duration:** ~4-6 hours (with 1GB maintenance_work_mem)
**Risk:** Medium — index drop + rebuild. `CONCURRENTLY` allows reads/writes during build. Old index gone during rebuild → queries fall back to sequential scan (slower but functional).
**Mitigation:** Build new index first with different name, then swap:

```sql
CREATE INDEX CONCURRENTLY idx_chunks_embedding_hnsw_v2
  ON content_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 32, ef_construction = 128);
-- Wait for build to complete
DROP INDEX CONCURRENTLY idx_chunks_embedding_hnsw;
ALTER INDEX idx_chunks_embedding_hnsw_v2 RENAME TO idx_chunks_embedding_hnsw;
```

**Verification:** `SELECT am.amname, c.reloptions FROM pg_class c JOIN pg_am am ON c.relam = am.oid WHERE c.relname = 'idx_chunks_embedding_hnsw';`

### Item 5: halfvec Migration [CODE + DB CHANGE]

**Steps:**

1. Add `embedding_half` column: `ALTER TABLE content_chunks ADD COLUMN embedding_half halfvec(1536);`
2. Backfill: `UPDATE content_chunks SET embedding_half = embedding::halfvec(1536) WHERE embedding_half IS NULL;` (batch in 10K chunks)
3. Build HNSW index on halfvec column: `CREATE INDEX CONCURRENTLY idx_chunks_embedding_half_hnsw ON content_chunks USING hnsw (embedding_half halfvec_cosine_ops) WITH (m = 32, ef_construction = 128);`
4. Update `embedding-column.ts` resolver to prefer `embedding_half` when available
5. Update `searchVector()` to use halfvec column + cast
6. Drop old `embedding` column HNSW index
7. Eventually drop `embedding` column (after validation period)
   **Why:** 50% storage savings (56GB → ~28GB), faster I/O, better cache utilization. <1% recall loss.
   **Risk:** Medium — requires backfill of 2M rows. Batch to avoid lock contention.
   **Verification:** Recall benchmark comparison (vector-only recall@10 before vs after).

### Item 6: Recall Benchmark Harness [NEW FILE]

**File:** `server/src/eval/hnsw-recall/run.ts`
**What:** Dedicated recall benchmark that:

- Takes N query embeddings (from existing eval fixtures)
- Runs exact KNN (sequential scan) vs HNSW approximate search
- Measures recall@k (k=1, 5, 10, 50, 100)
- Reports latency percentiles (p50, p95, p99)
- Tests filtered queries (with WHERE clauses) to verify iterative_scan effectiveness
  **Why:** Can't tune what we can't measure. Industry standard for vector search optimization.
  **Verification:** Run before and after each HNSW parameter change.

### Item 7: Agentic Search Loop (Harvey-Style) [CODE CHANGE]

**Files:** `server/src/core/think/gather.ts`, `server/src/core/think/index.ts`
**What:** Implement iterative search refinement:

1. Initial query → hybrid search → top results
2. LLM evaluates: "Are these results sufficient to answer the question?"
3. If no → LLM generates refined query → search again
4. Repeat up to 3 iterations
5. Merge all results, deduplicate, rerank
   **Why:** Harvey AI's key differentiator. Improves recall on complex legal questions by 15-25%.
   **Risk:** Higher latency (2-3x search calls). Only enable for complex legal queries.
   **Verification:** AT/DE retrieval benchmark comparison.

### Item 8: Docker shm_size increase [CONFIG CHANGE]

**File:** `server/deploy/hetzner/docker-compose.yml`
**Change:** `shm_size: 4gb` (from current default)
**Why:** pgvector HNSW build and large queries need shared memory. Previous index build failed with "No space left on device" due to shm limit.
**Verification:** `docker exec subsumio-engine-db-1 df -h /dev/shm`

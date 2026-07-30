/**
 * HNSW Recall Benchmark — measures approximate vs exact KNN recall@k
 * and latency percentiles for the HNSW index on content_chunks.
 *
 * What it measures:
 *   - recall@k:  How many of the true top-k nearest neighbours does HNSW find?
 *   - latency:   p50/p95/p99 query latency for HNSW vs sequential scan
 *   - filtered:  Recall on queries with WHERE clauses (tests iterative_scan)
 *
 * Methodology:
 *   1. Pick N random query vectors from the existing embeddings (ground truth vectors)
 *   2. For each query, run exact KNN (sequential scan, no index) → ground truth top-k
 *   3. For each query, run HNSW approximate search → approximate top-k
 *   4. Compute recall = |approx ∩ exact| / k
 *   5. Measure latency for both approaches
 *
 * Usage:
 *   bun run src/eval/hnsw-recall/run.ts [options]
 *
 * Options:
 *   --sample-size N    Number of random query vectors to test (default: 200)
 *   --k N              K values to test, comma-separated (default: 10,50,100)
 *   --filtered         Also run filtered queries (with WHERE language='de')
 *   --output PATH      Write JSONL results to PATH
 *   --connection STRING  Override DATABASE_URL
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";

// ─── Types ───────────────────────────────────────────────────────────────

interface RecallResult {
  k: number;
  filtered: boolean;
  recall: number;
  exact_latency_ms: number;
  hnsw_latency_ms: number;
}

interface QueryResult {
  query_id: number;
  k: number;
  filtered: boolean;
  exact_ids: number[];
  hnsw_ids: number[];
  recall: number;
  exact_latency_ms: number;
  hnsw_latency_ms: number;
}

interface BenchmarkReport {
  schema_version: 1;
  benchmark: "hnsw-recall";
  timestamp: string;
  sample_size: number;
  k_values: number[];
  filtered: boolean;
  pgvector_version: string;
  index_params: Record<string, unknown> | null;
  results: RecallResult[];
  per_query: QueryResult[];
  latency_percentiles: {
    k: number;
    filtered: boolean;
    exact_p50: number;
    exact_p95: number;
    exact_p99: number;
    hnsw_p50: number;
    hnsw_p95: number;
    hnsw_p99: number;
  }[];
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  sampleSize: number;
  kValues: number[];
  filtered: boolean;
  outputPath?: string;
  connection?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { sampleSize: 200, kValues: [10, 50, 100], filtered: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--sample-size" && i + 1 < args.length) {
      out.sampleSize = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--k" && i + 1 < args.length) {
      out.kValues = args[++i].split(",").map((s) => parseInt(s.trim(), 10));
      continue;
    }
    if (a === "--filtered") {
      out.filtered = true;
      continue;
    }
    if (a === "--output" && i + 1 < args.length) {
      out.outputPath = args[++i];
      continue;
    }
    if (a === "--connection" && i + 1 < args.length) {
      out.connection = args[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/hnsw-recall/run.ts [options]\n` +
          `  --sample-size N    Number of random query vectors (default: 200)\n` +
          `  --k K1,K2,...      K values to test (default: 10,50,100)\n` +
          `  --filtered         Also test with WHERE clause (language='de')\n` +
          `  --output PATH      Write JSONL results to PATH\n` +
          `  --connection STR   Override DATABASE_URL\n`
      );
      process.exit(0);
    }
  }
  return out;
}

class JsonlEmitter {
  constructor(
    private path: string,
    private append: boolean
  ) {
    if (!append && existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  process.stderr.write(
    `[hnsw-recall] sample_size=${opts.sampleSize}, k=${opts.kValues.join(",")}, filtered=${opts.filtered}\n`
  );

  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json first.");
  }

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  // Get raw SQL connection for direct queries
  const sql = (engine as any).sql;
  if (!sql) {
    throw new Error("Engine does not expose raw SQL — HNSW recall benchmark requires Postgres.");
  }

  // 1. Fetch pgvector version + index params
  const versionRow = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
  const pgvectorVersion = versionRow[0]?.extversion || "unknown";

  const indexParamsRow = await sql`
    SELECT c.reloptions
    FROM pg_class c
    JOIN pg_am am ON c.relam = am.oid
    WHERE c.relname = 'idx_chunks_embedding_hnsw'
  `;
  const indexParams = indexParamsRow[0]?.reloptions || null;

  process.stderr.write(
    `[hnsw-recall] pgvector=${pgvectorVersion}, index_params=${JSON.stringify(indexParams)}\n`
  );

  // 2. Sample N random query vectors from existing embeddings
  process.stderr.write(`[hnsw-recall] sampling ${opts.sampleSize} random query vectors...\n`);
  const sampleRows = await sql`
    SELECT id, embedding::text as emb_text
    FROM content_chunks
    WHERE embedding IS NOT NULL
    ORDER BY RANDOM()
    LIMIT ${opts.sampleSize}
  `;
  const queryVectors = sampleRows.map((r: any) => ({ id: r.id, embText: r.emb_text }));
  process.stderr.write(`[hnsw-recall] sampled ${queryVectors.length} vectors\n`);

  // Exclude the query vector's own ID from results to avoid self-match bias
  const maxK = Math.max(...opts.kValues);

  const allResults: RecallResult[] = [];
  const perQuery: QueryResult[] = [];

  for (const k of opts.kValues) {
    // --- Unfiltered ---
    process.stderr.write(
      `\n[hnsw-recall] k=${k} unfiltered — running ${queryVectors.length} queries...\n`
    );

    const exactLatencies: number[] = [];
    const hnswLatencies: number[] = [];
    let totalRecall = 0;

    for (let qi = 0; qi < queryVectors.length; qi++) {
      const qv = queryVectors[qi];

      // Exact KNN (sequential scan — no index)
      const t0Exact = performance.now();
      const exactRows = await sql.begin(async (tx: any) => {
        await tx`SET LOCAL enable_indexscan = off`;
        await tx`SET LOCAL enable_seqscan = on`;
        return await tx`
          SELECT id
          FROM content_chunks
          WHERE embedding IS NOT NULL AND id != ${qv.id}
          ORDER BY embedding <=> ${qv.embText}::vector
          LIMIT ${k}
        `;
      });
      const exactMs = performance.now() - t0Exact;
      exactLatencies.push(exactMs);

      // HNSW approximate search
      const t0Hnsw = performance.now();
      const hnswRows = await sql.begin(async (tx: any) => {
        await tx`SET LOCAL hnsw.ef_search = 200`;
        await tx`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`;
        await tx`SET LOCAL hnsw.max_scan_tuples = 20000`;
        return await tx`
          SELECT id
          FROM content_chunks
          WHERE embedding IS NOT NULL AND id != ${qv.id}
          ORDER BY embedding <=> ${qv.embText}::vector
          LIMIT ${k}
        `;
      });
      const hnswMs = performance.now() - t0Hnsw;
      hnswLatencies.push(hnswMs);

      const exactIds = new Set<number>(exactRows.map((r: any) => r.id as number));
      const hnswIds: number[] = hnswRows.map((r: any) => r.id as number);
      const overlap = hnswIds.filter((id: number) => exactIds.has(id)).length;
      const recall = overlap / k;
      totalRecall += recall;

      perQuery.push({
        query_id: qi,
        k,
        filtered: false,
        exact_ids: [...exactIds],
        hnsw_ids: hnswIds,
        recall,
        exact_latency_ms: exactMs,
        hnsw_latency_ms: hnswMs,
      });

      if ((qi + 1) % 50 === 0 || qi === queryVectors.length - 1) {
        process.stderr.write(
          `  ${qi + 1}/${queryVectors.length} — avg recall so far: ${(totalRecall / (qi + 1)).toFixed(4)}\n`
        );
      }
    }

    exactLatencies.sort((a: number, b: number) => a - b);
    hnswLatencies.sort((a: number, b: number) => a - b);

    const avgRecall = totalRecall / queryVectors.length;
    const avgExact = exactLatencies.reduce((a, b) => a + b, 0) / exactLatencies.length;
    const avgHnsw = hnswLatencies.reduce((a, b) => a + b, 0) / hnswLatencies.length;

    allResults.push({
      k,
      filtered: false,
      recall: avgRecall,
      exact_latency_ms: avgExact,
      hnsw_latency_ms: avgHnsw,
    });

    process.stderr.write(
      `[hnsw-recall] k=${k} unfiltered — recall=${avgRecall.toFixed(4)}, exact=${avgExact.toFixed(1)}ms, hnsw=${avgHnsw.toFixed(1)}ms\n`
    );

    // --- Filtered (if requested) ---
    if (opts.filtered) {
      process.stderr.write(
        `\n[hnsw-recall] k=${k} filtered (language='de') — running ${queryVectors.length} queries...\n`
      );

      const fExactLatencies: number[] = [];
      const fHnswLatencies: number[] = [];
      let fTotalRecall = 0;

      for (let qi = 0; qi < queryVectors.length; qi++) {
        const qv = queryVectors[qi];

        // Exact KNN with filter
        const t0Exact = performance.now();
        const exactRows = await sql.begin(async (tx: any) => {
          await tx`SET LOCAL enable_indexscan = off`;
          await tx`SET LOCAL enable_seqscan = on`;
          return await tx`
            SELECT cc.id
            FROM content_chunks cc
            JOIN pages p ON p.id = cc.page_id
            WHERE cc.embedding IS NOT NULL AND cc.id != ${qv.id}
              AND cc.language = 'de'
            ORDER BY cc.embedding <=> ${qv.embText}::vector
            LIMIT ${k}
          `;
        });
        const exactMs = performance.now() - t0Exact;
        fExactLatencies.push(exactMs);

        // HNSW with filter + iterative_scan
        const t0Hnsw = performance.now();
        const hnswRows = await sql.begin(async (tx: any) => {
          await tx`SET LOCAL hnsw.ef_search = 200`;
          await tx`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`;
          await tx`SET LOCAL hnsw.max_scan_tuples = 20000`;
          return await tx`
            SELECT cc.id
            FROM content_chunks cc
            JOIN pages p ON p.id = cc.page_id
            WHERE cc.embedding IS NOT NULL AND cc.id != ${qv.id}
              AND cc.language = 'de'
            ORDER BY cc.embedding <=> ${qv.embText}::vector
            LIMIT ${k}
          `;
        });
        const hnswMs = performance.now() - t0Hnsw;
        fHnswLatencies.push(hnswMs);

        const exactIds = new Set<number>(exactRows.map((r: any) => r.id as number));
        const hnswIds: number[] = hnswRows.map((r: any) => r.id as number);
        const overlap = hnswIds.filter((id: number) => exactIds.has(id)).length;
        const recall = overlap / k;
        fTotalRecall += recall;

        perQuery.push({
          query_id: qi,
          k,
          filtered: true,
          exact_ids: [...exactIds],
          hnsw_ids: hnswIds,
          recall,
          exact_latency_ms: exactMs,
          hnsw_latency_ms: hnswMs,
        });

        if ((qi + 1) % 50 === 0 || qi === queryVectors.length - 1) {
          process.stderr.write(
            `  ${qi + 1}/${queryVectors.length} — avg recall so far: ${(fTotalRecall / (qi + 1)).toFixed(4)}\n`
          );
        }
      }

      fExactLatencies.sort((a: number, b: number) => a - b);
      fHnswLatencies.sort((a: number, b: number) => a - b);

      const fAvgRecall = fTotalRecall / queryVectors.length;
      const fAvgExact = fExactLatencies.reduce((a, b) => a + b, 0) / fExactLatencies.length;
      const fAvgHnsw = fHnswLatencies.reduce((a, b) => a + b, 0) / fHnswLatencies.length;

      allResults.push({
        k,
        filtered: true,
        recall: fAvgRecall,
        exact_latency_ms: fAvgExact,
        hnsw_latency_ms: fAvgHnsw,
      });

      process.stderr.write(
        `[hnsw-recall] k=${k} filtered — recall=${fAvgRecall.toFixed(4)}, exact=${fAvgExact.toFixed(1)}ms, hnsw=${fAvgHnsw.toFixed(1)}ms\n`
      );
    }
  }

  // ─── Build latency percentiles ──────────────────────────────────────────
  const latencyPercentiles: BenchmarkReport["latency_percentiles"] = [];
  for (const k of opts.kValues) {
    const unfilteredExact = perQuery
      .filter((q) => q.k === k && !q.filtered)
      .map((q) => q.exact_latency_ms)
      .sort((a, b) => a - b);
    const unfilteredHnsw = perQuery
      .filter((q) => q.k === k && !q.filtered)
      .map((q) => q.hnsw_latency_ms)
      .sort((a, b) => a - b);
    latencyPercentiles.push({
      k,
      filtered: false,
      exact_p50: percentile(unfilteredExact, 50),
      exact_p95: percentile(unfilteredExact, 95),
      exact_p99: percentile(unfilteredExact, 99),
      hnsw_p50: percentile(unfilteredHnsw, 50),
      hnsw_p95: percentile(unfilteredHnsw, 95),
      hnsw_p99: percentile(unfilteredHnsw, 99),
    });
    if (opts.filtered) {
      const filteredExact = perQuery
        .filter((q) => q.k === k && q.filtered)
        .map((q) => q.exact_latency_ms)
        .sort((a, b) => a - b);
      const filteredHnsw = perQuery
        .filter((q) => q.k === k && q.filtered)
        .map((q) => q.hnsw_latency_ms)
        .sort((a, b) => a - b);
      latencyPercentiles.push({
        k,
        filtered: true,
        exact_p50: percentile(filteredExact, 50),
        exact_p95: percentile(filteredExact, 95),
        exact_p99: percentile(filteredExact, 99),
        hnsw_p50: percentile(filteredHnsw, 50),
        hnsw_p95: percentile(filteredHnsw, 95),
        hnsw_p99: percentile(filteredHnsw, 99),
      });
    }
  }

  // ─── Report ─────────────────────────────────────────────────────────────
  const report: BenchmarkReport = {
    schema_version: 1,
    benchmark: "hnsw-recall",
    timestamp: new Date().toISOString(),
    sample_size: queryVectors.length,
    k_values: opts.kValues,
    filtered: opts.filtered,
    pgvector_version: pgvectorVersion,
    index_params: indexParams,
    results: allResults,
    per_query: perQuery,
    latency_percentiles: latencyPercentiles,
  };

  // Print summary table
  process.stderr.write(`\n═══════════════════════════════════════════════════════════════\n`);
  process.stderr.write(`  HNSW RECALL BENCHMARK — ${new Date().toISOString()}\n`);
  process.stderr.write(`  pgvector=${pgvectorVersion}, sample=${queryVectors.length}\n`);
  process.stderr.write(`═══════════════════════════════════════════════════════════════\n`);
  process.stderr.write(
    `  ${"k".padEnd(6)} ${"filtered".padEnd(10)} ${"recall".padEnd(10)} ${"exact(ms)".padEnd(12)} ${"hnsw(ms)".padEnd(12)} ${"speedup".padEnd(10)}\n`
  );
  process.stderr.write(`  ${"-".repeat(60)}\n`);
  for (const r of allResults) {
    const speedup = r.exact_latency_ms / r.hnsw_latency_ms;
    process.stderr.write(
      `  ${String(r.k).padEnd(6)} ${String(r.filtered).padEnd(10)} ${r.recall.toFixed(4).padEnd(10)} ${r.exact_latency_ms.toFixed(1).padEnd(12)} ${r.hnsw_latency_ms.toFixed(1).padEnd(12)} ${speedup.toFixed(2).padEnd(10)}x\n`
    );
  }
  process.stderr.write(`\n  Latency percentiles:\n`);
  for (const lp of latencyPercentiles) {
    process.stderr.write(
      `  k=${lp.k} filtered=${lp.filtered} — exact p50/p95/p99: ${lp.exact_p50.toFixed(1)}/${lp.exact_p95.toFixed(1)}/${lp.exact_p99.toFixed(1)}ms | hnsw p50/p95/p99: ${lp.hnsw_p50.toFixed(1)}/${lp.hnsw_p95.toFixed(1)}/${lp.hnsw_p99.toFixed(1)}ms\n`
    );
  }
  process.stderr.write(`═══════════════════════════════════════════════════════════════\n`);

  // Write output
  if (opts.outputPath) {
    const emitter = new JsonlEmitter(opts.outputPath, false);
    emitter.emit(report as unknown as Record<string, unknown>);
    process.stderr.write(`[hnsw-recall] results written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
}

main().catch((err) => {
  process.stderr.write(`[hnsw-recall] FATAL: ${err}\n`);
  process.exit(1);
});

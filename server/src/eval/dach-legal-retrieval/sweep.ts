/**
 * DACH Legal Retrieval — Parameter Sweep Optimizer (Phase 7)
 *
 * Runs the DACH benchmark across multiple parameter configurations to find
 * the optimal settings for RRF_K, LLM reranker topN, and dedup parameters.
 * Produces a comparison table showing which config wins on Hit@5 and MRR.
 *
 * Usage:
 *   bun run src/eval/dach-legal-retrieval/sweep.ts [options]
 *
 * Options:
 *   --top-k N        Top-K results per query (default: 8)
 *   --jurisdiction J Only run questions for jurisdiction J (at|de|ch|eu|xj)
 *   --output PATH    Write JSON results to PATH
 *   --configs FILE   Load sweep configs from JSON file (default: built-in)
 */

import { readFileSync, existsSync, writeFileSync } from "fs";

// ─── Types ───────────────────────────────────────────────────────────────

interface SweepConfig {
  name: string;
  rrfK?: number;
  llmRerankTopN?: number;
  llmRerankEnabled?: boolean;
  dedupCosineThreshold?: number;
  dedupMaxPerPage?: number;
}

interface SweepResult {
  config_name: string;
  config: SweepConfig;
  total: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
  duration_ms: number;
  per_jurisdiction: Record<string, { n: number; hit_at_5: number; mrr: number }>;
}

// ─── Default sweep configs ───────────────────────────────────────────────

const DEFAULT_SWEEP_CONFIGS: SweepConfig[] = [
  { name: "baseline-k60" },
  { name: "rrf-k40", rrfK: 40 },
  { name: "rrf-k50", rrfK: 50 },
  { name: "rrf-k80", rrfK: 80 },
  { name: "rrf-k100", rrfK: 100 },
  { name: "rerank-top15", llmRerankEnabled: true, llmRerankTopN: 15 },
  { name: "rerank-top20", llmRerankEnabled: true, llmRerankTopN: 20 },
  { name: "rerank-top25", llmRerankEnabled: true, llmRerankTopN: 25 },
  { name: "rerank-top30", llmRerankEnabled: true, llmRerankTopN: 30 },
  { name: "rerank-top40", llmRerankEnabled: true, llmRerankTopN: 40 },
  { name: "dedup-cos085", dedupCosineThreshold: 0.85 },
  { name: "dedup-cos090", dedupCosineThreshold: 0.9 },
  { name: "dedup-cos095", dedupCosineThreshold: 0.95 },
  { name: "dedup-max3", dedupMaxPerPage: 3 },
  { name: "dedup-max5", dedupMaxPerPage: 5 },
  { name: "dedup-max8", dedupMaxPerPage: 8 },
  { name: "combo-k50-rerank25", rrfK: 50, llmRerankEnabled: true, llmRerankTopN: 25 },
  { name: "combo-k40-rerank20", rrfK: 40, llmRerankEnabled: true, llmRerankTopN: 20 },
  {
    name: "combo-k50-rerank30-dedup5",
    rrfK: 50,
    llmRerankEnabled: true,
    llmRerankTopN: 30,
    dedupMaxPerPage: 5,
  },
];

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  topK: number;
  jurisdiction?: string;
  outputPath?: string;
  configsPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { topK: 8 };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--top-k" && i + 1 < args.length) {
      out.topK = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--jurisdiction" && i + 1 < args.length) {
      out.jurisdiction = args[++i];
      continue;
    }
    if (a === "--output" && i + 1 < args.length) {
      out.outputPath = args[++i];
      continue;
    }
    if (a === "--configs" && i + 1 < args.length) {
      out.configsPath = args[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/dach-legal-retrieval/sweep.ts [options]\n` +
          `  --top-k N        Top-K per query (default: 8)\n` +
          `  --jurisdiction J Only run J (at|de|ch|eu|xj)\n` +
          `  --output PATH    Write JSON results to PATH\n` +
          `  --configs FILE   Load sweep configs from JSON file\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  let sweepConfigs: SweepConfig[] = DEFAULT_SWEEP_CONFIGS;
  if (opts.configsPath && existsSync(opts.configsPath)) {
    sweepConfigs = JSON.parse(readFileSync(opts.configsPath, "utf-8"));
  }

  process.stderr.write(`[sweep] ${sweepConfigs.length} configurations to test\n`);
  process.stderr.write(`[sweep] top-k=${opts.topK}\n`);
  if (opts.jurisdiction) {
    process.stderr.write(`[sweep] jurisdiction filter: ${opts.jurisdiction}\n`);
  }

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  // Import the DACH harness functions
  const dachModule: any = await import("./run.ts");
  const loadAllQuestions = dachModule.loadAllQuestions as (j?: string) => any[];
  const slugMatches = dachModule.slugMatches as (slug: string, q: any) => boolean;
  const getSearchOpts = dachModule.getSearchOpts as (
    q: any,
    topK: number,
    llmRerank: boolean
  ) => any;

  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json");
  }
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[sweep] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal
  }

  const questions = loadAllQuestions(opts.jurisdiction);
  process.stderr.write(`[sweep] ${questions.length} questions loaded\n\n`);

  const allResults: SweepResult[] = [];

  for (let ci = 0; ci < sweepConfigs.length; ci++) {
    const sc = sweepConfigs[ci];
    const t0 = Date.now();

    process.stderr.write(`[sweep] (${ci + 1}/${sweepConfigs.length}) ${sc.name}...\n`);

    const hits = { h1: 0, h3: 0, h5: 0, h8: 0, rr: 0 };
    const perJur: Record<string, { n: number; h5: number; rr: number }> = {};

    let qIdx = 0;
    for (const q of questions) {
      qIdx++;
      try {
        const baseOpts = getSearchOpts(q, opts.topK, sc.llmRerankEnabled ?? false);

        // Apply sweep config overrides
        if (sc.rrfK !== undefined) baseOpts.rrfK = sc.rrfK;
        if (sc.llmRerankEnabled && sc.llmRerankTopN !== undefined) {
          baseOpts.llmRerank = { enabled: true, topNIn: sc.llmRerankTopN };
        }
        if (sc.dedupCosineThreshold !== undefined || sc.dedupMaxPerPage !== undefined) {
          baseOpts.dedupOpts = {};
          if (sc.dedupCosineThreshold !== undefined)
            baseOpts.dedupOpts.cosineThreshold = sc.dedupCosineThreshold;
          if (sc.dedupMaxPerPage !== undefined) baseOpts.dedupOpts.maxPerPage = sc.dedupMaxPerPage;
        }

        const searchResults = await hybridSearch(engine, q.question, baseOpts);
        const rankedSlugs = searchResults.map((r: any) => r.slug);
        const firstHit = rankedSlugs.findIndex((s: string) => slugMatches(s, q));

        if (firstHit >= 0) {
          const rank = firstHit + 1;
          hits.rr += 1 / rank;
          if (rank <= 1) hits.h1++;
          if (rank <= 3) hits.h3++;
          if (rank <= 5) hits.h5++;
          if (rank <= 8) hits.h8++;
        }

        const jur = q.jurisdiction;
        if (!perJur[jur]) perJur[jur] = { n: 0, h5: 0, rr: 0 };
        perJur[jur].n++;
        if (firstHit >= 0 && firstHit < 5) perJur[jur].h5++;
        if (firstHit >= 0) perJur[jur].rr += 1 / (firstHit + 1);

        if (qIdx % 50 === 0) {
          process.stderr.write(`  ${qIdx}/${questions.length}...\n`);
        }
      } catch (err: any) {
        // Count as miss
      }
    }

    const n = questions.length;
    const duration = Date.now() - t0;
    const result: SweepResult = {
      config_name: sc.name,
      config: sc,
      total: n,
      hit_at_1: hits.h1 / n,
      hit_at_3: hits.h3 / n,
      hit_at_5: hits.h5 / n,
      hit_at_8: hits.h8 / n,
      mrr: hits.rr / n,
      duration_ms: duration,
      per_jurisdiction: Object.fromEntries(
        Object.entries(perJur).map(([k, v]) => [
          k,
          { n: v.n, hit_at_5: v.h5 / v.n, mrr: v.rr / v.n },
        ])
      ),
    };
    allResults.push(result);

    process.stderr.write(
      `  → Hit@1=${(result.hit_at_1 * 100).toFixed(1)}% Hit@5=${(result.hit_at_5 * 100).toFixed(1)}% MRR=${result.mrr.toFixed(3)} (${(duration / 1000).toFixed(1)}s)\n\n`
    );
  }

  // Sort by Hit@5 descending
  allResults.sort((a, b) => b.hit_at_5 - a.hit_at_5);

  // Print summary table
  process.stderr.write(`\n[sweep] RESULTS (sorted by Hit@5)\n`);
  process.stderr.write(`${"Config".padEnd(30)} Hit@1   Hit@5   Hit@8   MRR     Time\n`);
  process.stderr.write(`${"-".repeat(70)}\n`);
  for (const r of allResults) {
    process.stderr.write(
      `${r.config_name.padEnd(30)} ${(r.hit_at_1 * 100).toFixed(1)}%  ${(r.hit_at_5 * 100).toFixed(1)}%  ${(r.hit_at_8 * 100).toFixed(1)}%  ${r.mrr.toFixed(3)}  ${(r.duration_ms / 1000).toFixed(1)}s\n`
    );
  }

  // Print best config per jurisdiction
  process.stderr.write(`\n[sweep] BEST CONFIG PER JURISDICTION\n`);
  const jurisdictions = new Set<string>();
  for (const r of allResults) {
    for (const j of Object.keys(r.per_jurisdiction)) jurisdictions.add(j);
  }
  for (const jur of [...jurisdictions].sort()) {
    let best = allResults[0];
    let bestH5 = -1;
    for (const r of allResults) {
      const j = r.per_jurisdiction[jur];
      if (j && j.hit_at_5 > bestH5) {
        bestH5 = j.hit_at_5;
        best = r;
      }
    }
    const j = best.per_jurisdiction[jur];
    if (j) {
      process.stderr.write(
        `  ${jur}: ${best.config_name} (Hit@5=${(j.hit_at_5 * 100).toFixed(1)}%, MRR=${j.mrr.toFixed(3)})\n`
      );
    }
  }

  // Print overall winner
  process.stderr.write(`\n[sweep] OVERALL WINNER: ${allResults[0].config_name}\n`);
  process.stderr.write(
    `  Hit@1=${(allResults[0].hit_at_1 * 100).toFixed(1)}% Hit@5=${(allResults[0].hit_at_5 * 100).toFixed(1)}% MRR=${allResults[0].mrr.toFixed(3)}\n`
  );

  if (opts.outputPath) {
    writeFileSync(opts.outputPath, JSON.stringify(allResults, null, 2) + "\n");
    process.stderr.write(`[sweep] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[sweep] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

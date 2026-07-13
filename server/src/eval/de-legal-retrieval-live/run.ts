/**
 * German Legal Retrieval Benchmark — LIVE engine version.
 *
 * Uses the configured production engine (Postgres via ~/.gbrain/config.json)
 * which already has law-de imported and embedded (9101 pages). This avoids
 * re-embedding the entire corpus on every run — only the 100 query embeddings
 * are generated.
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval-live/run.ts \
 *     test/fixtures/de-legal-retrieval.jsonl \
 *     --top-k 8 \
 *     --output /tmp/de-legal-live.jsonl
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";

// ─── Types ───────────────────────────────────────────────────────────────

interface DeLegalQuestion {
  question_id: string;
  question: string;
  answer_slug: string;
  expected_section?: string;
  legal_area: string;
  question_type: string;
}

interface QuestionResult {
  question_id: string;
  question: string;
  legal_area: string;
  question_type: string;
  expected_slug: string;
  rank: number;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  reciprocal_rank: number;
  top_slugs: string[];
  error?: string;
}

interface AreaReport {
  legal_area: string;
  n: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
}

interface BenchmarkReport {
  schema_version: 1;
  benchmark: "de-legal-retrieval-live";
  total: number;
  top_k: number;
  areas: AreaReport[];
  aggregate: {
    hit_at_1: number;
    hit_at_3: number;
    hit_at_5: number;
    hit_at_8: number;
    mrr: number;
  };
  questions: QuestionResult[];
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  topK: number;
  outputPath?: string;
  append: boolean;
  byType: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { fixturePath: "", topK: 8, append: false, byType: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--top-k" && i + 1 < args.length) { out.topK = parseInt(args[++i], 10); continue; }
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--append") { out.append = true; continue; }
    if (a === "--by-type") { out.byType = true; continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/de-legal-retrieval-live/run.ts <fixture.jsonl> [options]\n` +
          `  --top-k N        Top-K results to retrieve (default: 8)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --append         Append to output instead of overwriting\n` +
          `  --by-type        Print per-area breakdown\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) { out.fixturePath = a; continue; }
  }
  if (!out.fixturePath) {
    process.stderr.write("Error: fixture path required\n");
    process.exit(1);
  }
  return out;
}

function loadFixture(path: string): DeLegalQuestion[] {
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as DeLegalQuestion);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);

  process.stderr.write(`[de-legal-live] loaded ${questions.length} questions\n`);
  process.stderr.write(`[de-legal-live] top-k=${opts.topK}\n`);

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

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

  process.stderr.write(`[de-legal-live] connecting to configured engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal
  }

  const results: QuestionResult[] = [];
  let questionIdx = 0;
  for (const q of questions) {
    questionIdx++;
    try {
      const searchResults = await hybridSearch(engine, q.question, {
        limit: opts.topK,
        sourceId: "law-de",
        sourceIds: ["law-de", "law-eu"],
        jurisdiction: "de",
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
      });

      const rankedSlugs = searchResults.map((r) => r.slug);
      // Live engine uses slugs like 'legal/statutes/de/hgb/p-1'.
      // Match at law-level: any slug starting with 'legal/statutes/de/<answer_slug>/'
      const lawPrefix = `legal/statutes/de/${q.answer_slug}/`;
      const firstHit = rankedSlugs.findIndex((s) => s.startsWith(lawPrefix));
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      const result: QuestionResult = {
        question_id: q.question_id,
        question: q.question,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected_slug: lawPrefix,
        rank: firstHit >= 0 ? firstHit + 1 : 0,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
        top_slugs: rankedSlugs.slice(0, 8),
      };
      results.push(result);

      const pct = Math.round((questionIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : "✗";
      process.stderr.write(
        `[de-legal-live] ${questionIdx}/${questions.length} (${pct}%) ${hit} ${q.question_id}\n`
      );
    } catch (err: any) {
      const expectedSlug = `legal/statutes/de/${q.answer_slug}/`;
      results.push({
        question_id: q.question_id,
        question: q.question,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected_slug: expectedSlug,
        rank: 0,
        hit_at_1: false,
        hit_at_3: false,
        hit_at_5: false,
        hit_at_8: false,
        reciprocal_rank: 0,
        top_slugs: [],
        error: String(err?.message ?? err),
      });
      process.stderr.write(
        `[de-legal-live] ${questionIdx}/${questions.length} ${q.question_id} (error: ${err?.message})\n`
      );
    }
  }

  const byArea = new Map<string, QuestionResult[]>();
  for (const r of results) {
    const list = byArea.get(r.legal_area) ?? [];
    list.push(r);
    byArea.set(r.legal_area, list);
  }

  const areas: AreaReport[] = [];
  for (const [area, list] of byArea) {
    const n = list.length;
    areas.push({
      legal_area: area,
      n,
      hit_at_1: list.filter((r) => r.hit_at_1).length / n,
      hit_at_3: list.filter((r) => r.hit_at_3).length / n,
      hit_at_5: list.filter((r) => r.hit_at_5).length / n,
      hit_at_8: list.filter((r) => r.hit_at_8).length / n,
      mrr: list.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    });
  }
  areas.sort((a, b) => a.legal_area.localeCompare(b.legal_area));

  const n = results.length;
  const report: BenchmarkReport = {
    schema_version: 1,
    benchmark: "de-legal-retrieval-live",
    total: n,
    top_k: opts.topK,
    areas,
    aggregate: {
      hit_at_1: results.filter((r) => r.hit_at_1).length / n,
      hit_at_3: results.filter((r) => r.hit_at_3).length / n,
      hit_at_5: results.filter((r) => r.hit_at_5).length / n,
      hit_at_8: results.filter((r) => r.hit_at_8).length / n,
      mrr: results.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    },
    questions: results,
  };

  process.stderr.write(`\n[de-legal-live] RESULTS (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(
    `  Aggregate: Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );
  if (opts.byType) {
    for (const a of areas) {
      process.stderr.write(
        `  ${a.legal_area} (n=${a.n}): Hit@5=${(a.hit_at_5 * 100).toFixed(1)}% MRR=${a.mrr.toFixed(3)}\n`
      );
    }
  }

  if (opts.outputPath) {
    if (opts.append && existsSync(opts.outputPath)) {
      appendFileSync(opts.outputPath, JSON.stringify(report) + "\n");
    } else {
      writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    }
    process.stderr.write(`[de-legal-live] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[de-legal-live] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

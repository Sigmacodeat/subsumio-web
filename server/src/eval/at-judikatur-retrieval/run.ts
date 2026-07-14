/**
 * Austrian Judikatur Retrieval Benchmark — evaluates hybrid search quality
 * for OGH court decisions (source: law-at-judikatur).
 *
 * Tests whether realistic legal queries surface the correct court decision
 * from the judikatur corpus. Uses slug-level matching against expected
 * decision slugs.
 *
 * Usage:
 *   bun run src/eval/at-judikatur-retrieval/run.ts \
 *     test/fixtures/at-judikatur-retrieval.jsonl \
 *     --top-k 8 \
 *     --output /tmp/at-judikatur-results.jsonl
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";

interface JudikaturQuestion {
  question_id: string;
  question: string;
  expected_slug: string;
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
  benchmark: "at-judikatur-retrieval";
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

interface ParsedArgs {
  fixturePath: string;
  topK: number;
  outputPath?: string;
  append: boolean;
  byArea: boolean;
  llmRerank: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { fixturePath: "", topK: 8, append: false, byArea: false, llmRerank: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--top-k" && i + 1 < args.length) { out.topK = parseInt(args[++i], 10); continue; }
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--append") { out.append = true; continue; }
    if (a === "--by-area") { out.byArea = true; continue; }
    if (a === "--llm-rerank") { out.llmRerank = true; continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/at-judikatur-retrieval/run.ts <fixture.jsonl> [options]\n` +
          `  --top-k N        Top-K results to retrieve (default: 8)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --append         Append to output file instead of overwriting\n` +
          `  --by-area        Break down results by legal_area\n` +
          `  --llm-rerank     Re-rank top results with LLM (DeepSeek)\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) out.fixturePath = a;
  }
  if (!out.fixturePath) { process.stderr.write("Error: fixture path required\n"); process.exit(1); }
  return out;
}

function loadFixture(path: string): JudikaturQuestion[] {
  const raw = readFileSync(path, "utf-8");
  return raw.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => JSON.parse(l));
}

class JsonlEmitter {
  constructor(private path: string, private append: boolean) {
    if (!append && existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>): void { appendFileSync(this.path, JSON.stringify(obj) + "\n"); }
}

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);

  process.stderr.write(`[at-judikatur-retrieval] loaded ${questions.length} questions\n`);
  process.stderr.write(`[at-judikatur-retrieval] top-k=${opts.topK}\n`);
  if (opts.llmRerank) process.stderr.write(`[at-judikatur-retrieval] LLM re-ranker: ENABLED\n`);

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } = await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json.");
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[at-judikatur-retrieval] connecting to configured engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try { await reconfigureGatewayWithEngine(engine); } catch { /* non-fatal */ }

  const results: QuestionResult[] = [];
  let qIdx = 0;
  for (const q of questions) {
    qIdx++;
    try {
      const searchResults = await hybridSearch(engine, q.question, {
        limit: opts.topK,
        sourceIds: ["law-at-judikatur"],
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
        ...(opts.llmRerank
          ? { llmRerank: { enabled: true, topNIn: 25, model: "openrouter:deepseek/deepseek-chat", timeoutMs: 30000 } }
          : {}),
      });

      const rankedSlugs = searchResults.map((r) => r.slug);
      if (rankedSlugs.length === 0) {
        process.stderr.write(`[at-judikatur-retrieval] WARNING: empty results for "${q.question}" (${q.question_id})\n`);
      }

      const firstHit = rankedSlugs.indexOf(q.expected_slug);
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      const result: QuestionResult = {
        question_id: q.question_id,
        question: q.question,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected_slug: q.expected_slug,
        rank: firstHit >= 0 ? firstHit + 1 : 0,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
        top_slugs: rankedSlugs.slice(0, 25),
      };
      results.push(result);

      const pct = Math.round((qIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : "✗";
      process.stderr.write(`[at-judikatur-retrieval] ${qIdx}/${questions.length} (${pct}%) ${hit} ${q.question_id}\n`);
    } catch (err: any) {
      results.push({
        question_id: q.question_id, question: q.question, legal_area: q.legal_area,
        question_type: q.question_type, expected_slug: q.expected_slug,
        rank: 0, hit_at_1: false, hit_at_3: false, hit_at_5: false, hit_at_8: false,
        reciprocal_rank: 0, top_slugs: [], error: String(err?.message ?? err),
      });
      process.stderr.write(`[at-judikatur-retrieval] ${qIdx}/${questions.length} ${q.question_id} (error: ${err?.message})\n`);
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
      legal_area: area, n,
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
    benchmark: "at-judikatur-retrieval",
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

  process.stderr.write(`\n[at-judikatur-retrieval] RESULTS (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(
    `  Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% ` +
    `Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% ` +
    `Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% ` +
    `Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% ` +
    `MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );
  if (opts.byArea) {
    for (const a of areas) {
      process.stderr.write(
        `  ${a.legal_area} (n=${a.n}): ` +
        `Hit@1=${(a.hit_at_1 * 100).toFixed(1)}% ` +
        `Hit@3=${(a.hit_at_3 * 100).toFixed(1)}% ` +
        `Hit@5=${(a.hit_at_5 * 100).toFixed(1)}% ` +
        `Hit@8=${(a.hit_at_8 * 100).toFixed(1)}% ` +
        `MRR=${a.mrr.toFixed(3)}\n`
      );
    }
  }

  if (opts.outputPath) {
    const emitter = new JsonlEmitter(opts.outputPath, opts.append);
    for (const r of results) emitter.emit(r as unknown as Record<string, unknown>);
    emitter.emit({
      schema_version: 1, kind: "summary",
      benchmark: report.benchmark, total: report.total, top_k: report.top_k,
      aggregate: report.aggregate, areas: report.areas,
    });
    process.stderr.write(`[at-judikatur-retrieval] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[at-judikatur-retrieval] done.\n`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });

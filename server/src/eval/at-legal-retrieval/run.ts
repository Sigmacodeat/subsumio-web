/**
 * Austrian Legal Retrieval Benchmark — verifies hybrid search actually
 * surfaces the correct §-page for realistic lawyer-phrased questions against
 * the LIVE production brain (not a fresh in-memory copy).
 *
 * Unlike de-legal-retrieval/run.ts (which imports whole-law pages into a
 * throwaway in-memory engine), this connects to the CONFIGURED engine
 * (Postgres prod via ~/.gbrain/config.json / DATABASE_URL) because the AT
 * corpus is already split per-§ and embedded there — re-importing would
 * re-pay embedding cost for no benefit and wouldn't test the real system.
 *
 * Usage:
 *   bun run src/eval/at-legal-retrieval/run.ts \
 *     test/fixtures/at-legal-retrieval.jsonl \
 *     --top-k 5 \
 *     --output /tmp/at-legal-ro.jsonl
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";

// ─── Types ───────────────────────────────────────────────────────────────

interface AtLegalQuestion {
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
  /** One-based rank; 0 means the expected result was not retrieved. */
  rank: number;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  reciprocal_rank: number;
  top_slugs: string[];
  /** Law-level hits: the correct LAW was found (prefix match), even if the exact paragraph differs. */
  law_hit_at_1: boolean;
  law_hit_at_3: boolean;
  law_hit_at_5: boolean;
  law_hit_at_8: boolean;
  law_rank: number;
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
  benchmark: "at-legal-retrieval";
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
  llmRerank: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    topK: 8,
    append: false,
    byType: false,
    llmRerank: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--top-k" && i + 1 < args.length) {
      out.topK = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--output" && i + 1 < args.length) {
      out.outputPath = args[++i];
      continue;
    }
    if (a === "--append") {
      out.append = true;
      continue;
    }
    if (a === "--by-type") {
      out.byType = true;
      continue;
    }
    if (a === "--llm-rerank") {
      out.llmRerank = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/at-legal-retrieval/run.ts <fixture.jsonl> [options]\n` +
          `  --top-k N        Top-K results to retrieve (default: 8)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --append         Append to output file instead of overwriting\n` +
          `  --by-type        Break down results by legal_area\n` +
          `  --llm-rerank     Re-rank top results with LLM (DeepSeek) for paragraph-level precision\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) {
      out.fixturePath = a;
    }
  }
  if (!out.fixturePath) {
    process.stderr.write("Error: fixture path required\n");
    process.exit(1);
  }
  return out;
}

function loadFixture(path: string): AtLegalQuestion[] {
  const raw = readFileSync(path, "utf-8");
  const lines = raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  return lines.map((l) => JSON.parse(l));
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

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);

  process.stderr.write(`[at-legal-retrieval] loaded ${questions.length} questions\n`);
  process.stderr.write(`[at-legal-retrieval] top-k=${opts.topK}\n`);
  if (opts.llmRerank) {
    process.stderr.write(`[at-legal-retrieval] LLM re-ranker: ENABLED (deepseek-chat)\n`);
  }

  // Increase query embed timeout for OpenRouter latency (default 6s is too tight).
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error(
      "No engine configured. Set DATABASE_URL / ~/.gbrain/config.json before running this eval " +
        "— it tests the LIVE brain, not a throwaway copy."
    );
  }
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[at-legal-retrieval] connecting to configured engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal: pre-v39 brains may not have a usable config table.
  }

  const results: QuestionResult[] = [];
  let questionIdx = 0;
  for (const q of questions) {
    questionIdx++;
    try {
      const searchResults = await hybridSearch(engine, q.question, {
        limit: opts.topK,
        innerLimit: 50,
        keywordWeight: 1.5,
        vectorWeight: 0.7,
        sourceId: "law-at",
        sourceIds: ["law-at", "law-at-judikatur", "law-eu"],
        jurisdiction: "at",
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
        ...(opts.llmRerank
          ? {
              llmRerank: {
                enabled: true,
                topNIn: 50,
                model: "openrouter:deepseek/deepseek-chat",
                timeoutMs: 30000,
              },
            }
          : {}),
      });

      const rankedSlugs = searchResults.map((r) => r.slug);
      if (rankedSlugs.length === 0) {
        process.stderr.write(
          `[at-legal-retrieval] WARNING: empty search results for "${q.question}" (${q.question_id})\n`
        );
      }

      const firstHit = rankedSlugs.indexOf(q.expected_slug);
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      // Law-level match: extract the law prefix (e.g. "legal/statutes/at/stgb/" from
      // "legal/statutes/at/stgb/p-128") and check if any returned slug starts with it.
      // This is the realistic metric — finding the right law is what the user needs;
      // the exact paragraph can be scrolled to.
      const lawPrefix = q.expected_slug.replace(/\/(?:p|art)-[^/]+$/, "/");
      const lawFirstHit =
        lawPrefix !== q.expected_slug
          ? rankedSlugs.findIndex((s) => s.startsWith(lawPrefix))
          : firstHit;
      const lawHitAt = (k: number) => lawFirstHit >= 0 && lawFirstHit < k;

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
        law_hit_at_1: lawHitAt(1),
        law_hit_at_3: lawHitAt(3),
        law_hit_at_5: lawHitAt(5),
        law_hit_at_8: lawHitAt(8),
        law_rank: lawFirstHit >= 0 ? lawFirstHit + 1 : 0,
      };
      results.push(result);

      const pct = Math.round((questionIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : lawFirstHit >= 0 ? "~" : "✗";
      process.stderr.write(
        `[at-legal-retrieval] ${questionIdx}/${questions.length} (${pct}%) ${hit} ${q.question_id}\n`
      );
      // Keepalive: LLM rerank adds 5-15s latency between DB queries; without
      // this the pool's idle_timeout (20s) closes the connection mid-benchmark.
      if (opts.llmRerank && questionIdx < questions.length) {
        try {
          await engine.searchKeyword("keepalive", { limit: 1 });
        } catch {}
      }
    } catch (err: any) {
      results.push({
        question_id: q.question_id,
        question: q.question,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected_slug: q.expected_slug,
        rank: 0,
        hit_at_1: false,
        hit_at_3: false,
        hit_at_5: false,
        hit_at_8: false,
        reciprocal_rank: 0,
        top_slugs: [],
        law_hit_at_1: false,
        law_hit_at_3: false,
        law_hit_at_5: false,
        law_hit_at_8: false,
        law_rank: 0,
        error: String(err?.message ?? err),
      });
      process.stderr.write(
        `[at-legal-retrieval] ${questionIdx}/${questions.length} ${q.question_id} (error: ${err?.message})\n`
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
    benchmark: "at-legal-retrieval",
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

  const lawAgg = {
    hit_at_1: results.filter((r) => r.law_hit_at_1).length / n,
    hit_at_3: results.filter((r) => r.law_hit_at_3).length / n,
    hit_at_5: results.filter((r) => r.law_hit_at_5).length / n,
    hit_at_8: results.filter((r) => r.law_hit_at_8).length / n,
  };

  process.stderr.write(`\n[at-legal-retrieval] RESULTS (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(
    `  Paragraph-level: Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );
  process.stderr.write(
    `  Law-level:       Hit@1=${(lawAgg.hit_at_1 * 100).toFixed(1)}% Hit@3=${(lawAgg.hit_at_3 * 100).toFixed(1)}% Hit@5=${(lawAgg.hit_at_5 * 100).toFixed(1)}% Hit@8=${(lawAgg.hit_at_8 * 100).toFixed(1)}%\n`
  );
  if (opts.byType) {
    for (const a of areas) {
      process.stderr.write(
        `  ${a.legal_area} (n=${a.n}): Hit@1=${(a.hit_at_1 * 100).toFixed(1)}% Hit@3=${(a.hit_at_3 * 100).toFixed(1)}% Hit@5=${(a.hit_at_5 * 100).toFixed(1)}% Hit@8=${(a.hit_at_8 * 100).toFixed(1)}% MRR=${a.mrr.toFixed(3)}\n`
      );
    }
  }

  if (opts.outputPath) {
    const emitter = new JsonlEmitter(opts.outputPath, opts.append);
    for (const r of results) emitter.emit(r as unknown as Record<string, unknown>);
    emitter.emit({
      schema_version: 1,
      kind: "summary",
      benchmark: report.benchmark,
      total: report.total,
      top_k: report.top_k,
      aggregate: report.aggregate,
      areas: report.areas,
    });
    process.stderr.write(`[at-legal-retrieval] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[at-legal-retrieval] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

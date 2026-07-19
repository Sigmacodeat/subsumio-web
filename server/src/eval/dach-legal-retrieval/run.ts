/**
 * DACH Legal Retrieval Benchmark — Unified v2 Catalog (300+ questions)
 *
 * Runs all jurisdictions (AT, DE, CH, EU, cross-jurisdictional) in a single
 * pass against the live engine. Reports per-jurisdiction and aggregate metrics.
 *
 * Usage:
 *   bun run src/eval/dach-legal-retrieval/run.ts [options]
 *
 * Options:
 *   --top-k N        Top-K results to retrieve (default: 8)
 *   --output PATH    Write JSONL results to PATH
 *   --by-area        Print per-area breakdown
 *   --by-type        Print per-question-type breakdown
 *   --jurisdiction J Only run questions for jurisdiction J (at|de|ch|eu|xj)
 *   --llm-rerank     Enable LLM re-ranker for paragraph-level ranking
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";

// ─── Types ───────────────────────────────────────────────────────────────

interface LegalQuestion {
  question_id: string;
  question: string;
  legal_area: string;
  question_type: string;
  jurisdiction: string;
  // DE/EU format: answer_slug + expected_section
  answer_slug?: string;
  expected_section?: string;
  // AT format: expected_slug (full slug)
  expected_slug?: string;
}

interface QuestionResult {
  question_id: string;
  question: string;
  jurisdiction: string;
  legal_area: string;
  question_type: string;
  expected: string;
  rank: number;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  reciprocal_rank: number;
  top_slugs: string[];
  error?: string;
}

interface GroupReport {
  label: string;
  n: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
}

interface BenchmarkReport {
  schema_version: 2;
  benchmark: "dach-legal-retrieval-v2";
  total: number;
  top_k: number;
  llm_rerank: boolean;
  by_jurisdiction: GroupReport[];
  by_area: GroupReport[];
  by_type: GroupReport[];
  aggregate: {
    hit_at_1: number;
    hit_at_3: number;
    hit_at_5: number;
    hit_at_8: number;
    mrr: number;
  };
  questions: QuestionResult[];
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  topK: number;
  outputPath?: string;
  append: boolean;
  byArea: boolean;
  byType: boolean;
  jurisdiction?: string;
  llmRerank: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    topK: 8,
    append: false,
    byArea: false,
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
    if (a === "--by-area") {
      out.byArea = true;
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
    if (a === "--jurisdiction" && i + 1 < args.length) {
      out.jurisdiction = args[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/dach-legal-retrieval/run.ts [options]\n` +
          `  --top-k N        Top-K results (default: 8)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --append         Append to output\n` +
          `  --by-area        Print per-area breakdown\n` +
          `  --by-type        Print per-type breakdown\n` +
          `  --jurisdiction J Only run J (at|de|ch|eu|xj)\n` +
          `  --llm-rerank     Enable LLM re-ranker\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Fixture loading ─────────────────────────────────────────────────────

const FIXTURE_DIR = "test/fixtures";

function loadFixture(filename: string, defaultJurisdiction: string): LegalQuestion[] {
  const path = `${FIXTURE_DIR}/${filename}`;
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const q = JSON.parse(l) as LegalQuestion;
      if (!q.jurisdiction) q.jurisdiction = defaultJurisdiction;
      return q;
    });
}

export function loadAllQuestions(jurisdictionFilter?: string): LegalQuestion[] {
  const all: LegalQuestion[] = [];
  // DE format: answer_slug + expected_section (no expected_slug)
  all.push(...loadFixture("de-legal-retrieval.jsonl", "de"));
  // AT format: expected_slug (full slug)
  all.push(...loadFixture("at-legal-retrieval.jsonl", "at"));
  // CH format: answer_slug + expected_section
  all.push(...loadFixture("ch-legal-retrieval.jsonl", "ch"));
  // EU format: answer_slug + expected_section
  all.push(...loadFixture("eu-legal-retrieval.jsonl", "eu"));
  // Cross-jurisdictional: has jurisdiction field
  all.push(...loadFixture("cross-jurisdictional-retrieval.jsonl", "xj"));

  if (jurisdictionFilter) {
    return all.filter((q) => q.jurisdiction === jurisdictionFilter);
  }
  return all;
}

// ─── Matching ────────────────────────────────────────────────────────────

/**
 * Determine whether a search result slug matches the expected answer.
 * - AT: exact slug match or prefix match on expected_slug
 * - DE/CH/EU: prefix match on `legal/statutes/<jur>/<answer_slug>/`
 * - Cross-jurisdictional: uses the appropriate jurisdiction format
 */
export function slugMatches(resultSlug: string, q: LegalQuestion): boolean {
  // AT format: expected_slug is a full slug like "legal/statutes/at/abgb/p-1295"
  if (q.expected_slug) {
    // Exact match or prefix match (for paragraph-level)
    return resultSlug === q.expected_slug || resultSlug.startsWith(q.expected_slug);
  }
  // DE/CH/EU format: answer_slug is a law abbreviation like "bgb", "or", "dsgvo"
  if (q.answer_slug) {
    const jur = q.jurisdiction;
    if (jur === "de") {
      return (
        resultSlug.startsWith(`legal/statutes/de/${q.answer_slug}/`) ||
        resultSlug.startsWith(`law/de/${q.answer_slug}`)
      );
    }
    if (jur === "ch") {
      return (
        resultSlug.startsWith(`legal/statutes/ch/${q.answer_slug}/`) ||
        resultSlug.startsWith(`law/ch/${q.answer_slug}`)
      );
    }
    if (jur === "eu") {
      return (
        resultSlug.startsWith(`legal/statutes/eu/${q.answer_slug}/`) ||
        resultSlug.startsWith(`law/eu/${q.answer_slug}`)
      );
    }
    // Cross-jurisdictional: use the jurisdiction field to determine prefix
    if (jur === "at") {
      return resultSlug.startsWith(`legal/statutes/at/${q.answer_slug}/`);
    }
    // Fallback: check all statute prefix patterns
    return resultSlug.includes(`/${q.answer_slug}/`);
  }
  return false;
}

// ─── Search config per jurisdiction ───────────────────────────────────────

export function getSearchOpts(q: LegalQuestion, topK: number, llmRerank: boolean) {
  const jur = q.jurisdiction;
  const sourceMap: Record<
    string,
    { sourceId?: string; sourceIds: string[]; jurisdiction?: string }
  > = {
    at: { sourceId: "law-at", sourceIds: ["law-at", "law-eu"], jurisdiction: "at" },
    de: { sourceId: "law-de", sourceIds: ["law-de", "law-eu"], jurisdiction: "de" },
    ch: { sourceId: "law-ch", sourceIds: ["law-ch", "law-eu"], jurisdiction: "ch" },
    eu: { sourceId: "law-eu", sourceIds: ["law-eu", "law-de", "law-ch"], jurisdiction: "eu" },
    xj: {
      sourceId: undefined,
      sourceIds: ["law-at", "law-de", "law-ch", "law-eu"],
      jurisdiction: undefined,
    },
  };
  const cfg = sourceMap[jur] ?? sourceMap.xj;

  const opts: Record<string, unknown> = {
    limit: topK,
    sourceIds: cfg.sourceIds,
    embeddingColumn: {
      name: "embedding",
      type: "vector" as const,
      dimensions: 1536,
      embeddingModel: "openrouter:openai/text-embedding-3-small",
    },
  };

  if (cfg.jurisdiction) opts.jurisdiction = cfg.jurisdiction;
  if (cfg.sourceId) opts.sourceId = cfg.sourceId;
  if (llmRerank) {
    opts.llmRerank = { enabled: true, topNIn: 25 };
  }

  return opts;
}

// ─── Reporting ───────────────────────────────────────────────────────────

function groupResults(
  results: QuestionResult[],
  keyFn: (r: QuestionResult) => string
): GroupReport[] {
  const groups = new Map<string, QuestionResult[]>();
  for (const r of results) {
    const key = keyFn(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const reports: GroupReport[] = [];
  for (const [label, list] of groups) {
    const n = list.length;
    reports.push({
      label,
      n,
      hit_at_1: list.filter((r) => r.hit_at_1).length / n,
      hit_at_3: list.filter((r) => r.hit_at_3).length / n,
      hit_at_5: list.filter((r) => r.hit_at_5).length / n,
      hit_at_8: list.filter((r) => r.hit_at_8).length / n,
      mrr: list.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    });
  }
  reports.sort((a, b) => a.label.localeCompare(b.label));
  return reports;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadAllQuestions(opts.jurisdiction);

  process.stderr.write(`[dach-v2] loaded ${questions.length} questions\n`);
  process.stderr.write(`[dach-v2] top-k=${opts.topK}, llm-rerank=${opts.llmRerank}\n`);
  if (opts.jurisdiction) {
    process.stderr.write(`[dach-v2] jurisdiction filter: ${opts.jurisdiction}\n`);
  }

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

  process.stderr.write(`[dach-v2] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal
  }

  const results: QuestionResult[] = [];
  let qIdx = 0;
  for (const q of questions) {
    qIdx++;
    try {
      const searchOpts = getSearchOpts(q, opts.topK, opts.llmRerank);
      const searchResults = await hybridSearch(engine, q.question, searchOpts);

      const rankedSlugs = searchResults.map((r) => r.slug);
      const firstHit = rankedSlugs.findIndex((s) => slugMatches(s, q));
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      const expected = q.expected_slug ?? `legal/statutes/${q.jurisdiction}/${q.answer_slug}/`;

      const result: QuestionResult = {
        question_id: q.question_id,
        question: q.question,
        jurisdiction: q.jurisdiction,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected,
        rank: firstHit >= 0 ? firstHit + 1 : 0,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
        top_slugs: rankedSlugs.slice(0, 8),
      };
      results.push(result);

      const pct = Math.round((qIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : "✗";
      process.stderr.write(
        `[dach-v2] ${qIdx}/${questions.length} (${pct}%) ${hit} ${q.question_id} [${q.jurisdiction}]\n`
      );
    } catch (err: any) {
      const expected = q.expected_slug ?? `legal/statutes/${q.jurisdiction}/${q.answer_slug}/`;
      results.push({
        question_id: q.question_id,
        question: q.question,
        jurisdiction: q.jurisdiction,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected,
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
        `[dach-v2] ${qIdx}/${questions.length} ${q.question_id} (error: ${err?.message})\n`
      );
    }
  }

  const n = results.length;
  const byJur = groupResults(results, (r) => r.jurisdiction);
  const byArea = groupResults(results, (r) => r.legal_area);
  const byType = groupResults(results, (r) => r.question_type);

  const report: BenchmarkReport = {
    schema_version: 2,
    benchmark: "dach-legal-retrieval-v2",
    total: n,
    top_k: opts.topK,
    llm_rerank: opts.llmRerank,
    by_jurisdiction: byJur,
    by_area: byArea,
    by_type: byType,
    aggregate: {
      hit_at_1: results.filter((r) => r.hit_at_1).length / n,
      hit_at_3: results.filter((r) => r.hit_at_3).length / n,
      hit_at_5: results.filter((r) => r.hit_at_5).length / n,
      hit_at_8: results.filter((r) => r.hit_at_8).length / n,
      mrr: results.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    },
    questions: results,
  };

  // Print summary
  process.stderr.write(`\n[dach-v2] RESULTS (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(
    `  Aggregate: Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );

  process.stderr.write(`\n  By Jurisdiction:\n`);
  for (const j of byJur) {
    process.stderr.write(
      `    ${j.label} (n=${j.n}): Hit@5=${(j.hit_at_5 * 100).toFixed(1)}% MRR=${j.mrr.toFixed(3)}\n`
    );
  }

  if (opts.byArea) {
    process.stderr.write(`\n  By Legal Area:\n`);
    for (const a of byArea) {
      process.stderr.write(
        `    ${a.label} (n=${a.n}): Hit@5=${(a.hit_at_5 * 100).toFixed(1)}% MRR=${a.mrr.toFixed(3)}\n`
      );
    }
  }

  if (opts.byType) {
    process.stderr.write(`\n  By Question Type:\n`);
    for (const t of byType) {
      process.stderr.write(
        `    ${t.label} (n=${t.n}): Hit@5=${(t.hit_at_5 * 100).toFixed(1)}% MRR=${t.mrr.toFixed(3)}\n`
      );
    }
  }

  if (opts.outputPath) {
    if (opts.append && existsSync(opts.outputPath)) {
      appendFileSync(opts.outputPath, JSON.stringify(report) + "\n");
    } else {
      writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    }
    process.stderr.write(`[dach-v2] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[dach-v2] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

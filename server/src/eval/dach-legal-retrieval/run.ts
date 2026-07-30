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
import { bootstrapCI, bootstrapMeanCI, latencyPercentiles, formatCI } from "../stats.ts";

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
  matching_level: "paragraph" | "law";
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
  law_level: {
    hit_at_1: number;
    hit_at_3: number;
    hit_at_5: number;
    hit_at_8: number;
    mrr: number;
  };
  confidence_intervals: {
    hit_at_5: { lower: number; upper: number; point: number; n: number };
    hit_at_1: { lower: number; upper: number; point: number; n: number };
    mrr: { lower: number; upper: number; point: number; n: number };
  };
  latency: {
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    avg_ms: number;
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
 * Parse a section string like "§ 1", "§ 1 Abs 2", "§ 104a", "Art. 62"
 * and convert it to the slug suffix used in the pages table.
 * - § N → "p-N"  (DE, AT)
 * - Art. N → "art-N"  (CH, EU)
 * Returns null if the section cannot be parsed.
 */
function sectionToSlugSuffix(section: string): string | null {
  // § N [Abs M] [lit X] → p-N
  const paraMatch = section.match(/§\s*([0-9]+[a-z]?)/i);
  if (paraMatch) return `p-${paraMatch[1]}`;
  // Art. N → art-N
  const artMatch = section.match(/Art\.?\s*([0-9]+[a-z]?)/i);
  if (artMatch) return `art-${artMatch[1]}`;
  return null;
}

/**
 * Build the expected full slug for a question, using expected_section
 * to achieve paragraph-level matching. Falls back to law-level if no
 * section is available.
 */
function buildExpectedSlug(q: LegalQuestion): string {
  const jur = q.jurisdiction;
  const law = q.answer_slug;
  if (!law) return q.expected_slug ?? "";
  const base = `legal/statutes/${jur}/${law}/`;
  if (q.expected_section) {
    const suffix = sectionToSlugSuffix(q.expected_section);
    if (suffix) return `${base}${suffix}`;
  }
  return base;
}

/**
 * Law-level matching: any paragraph from the correct law counts as a hit.
 * Used for the law-level fallback metric and for dual-level reporting.
 */
function lawLevelSlugMatches(resultSlug: string, q: LegalQuestion): boolean {
  if (q.expected_slug) {
    // AT: strip the last segment (p-N) and match the law prefix
    const lawPrefix = q.expected_slug.replace(/\/[^/]+$/, "/");
    return resultSlug.startsWith(lawPrefix);
  }
  if (q.answer_slug) {
    const jur = q.jurisdiction;
    return (
      resultSlug.startsWith(`legal/statutes/${jur}/${q.answer_slug}/`) ||
      resultSlug.startsWith(`law/${jur}/${q.answer_slug}`)
    );
  }
  return false;
}

/**
 * Determine whether a search result slug matches the expected answer.
 * - If expected_slug is set (AT): exact or prefix match on the full slug
 * - If expected_section is set (DE/CH/EU): paragraph-level match via slug suffix
 * - Falls back to law-level matching if no section is available
 */
export function slugMatches(resultSlug: string, q: LegalQuestion): boolean {
  // AT format: expected_slug is a full slug like "legal/statutes/at/abgb/p-1295"
  if (q.expected_slug) {
    return resultSlug === q.expected_slug || resultSlug.startsWith(q.expected_slug);
  }
  // DE/CH/EU format: try paragraph-level matching
  if (q.answer_slug && q.expected_section) {
    const suffix = sectionToSlugSuffix(q.expected_section);
    if (suffix) {
      // Paragraph-level match only — NO law-level fallback when section is specified
      const jur = q.jurisdiction;
      const expectedFull = `legal/statutes/${jur}/${q.answer_slug}/${suffix}`;
      if (resultSlug === expectedFull) return true;
      // Also check law/ format (legacy)
      const legacyFull = `law/${jur}/${q.answer_slug}/${suffix}`;
      if (resultSlug === legacyFull) return true;
      return false;
    }
    // If suffix parsing fails, fall through to law-level
  }
  // Law-level fallback (only when no expected_section or unparseable section)
  if (q.answer_slug) {
    return lawLevelSlugMatches(resultSlug, q);
  }
  return false;
}

/**
 * Paragraph-level only matching (strict). Returns false if no
 * expected_section/expected_slug is available.
 */
export function slugMatchesParagraph(resultSlug: string, q: LegalQuestion): boolean {
  if (q.expected_slug) {
    return resultSlug === q.expected_slug || resultSlug.startsWith(q.expected_slug);
  }
  if (q.answer_slug && q.expected_section) {
    const suffix = sectionToSlugSuffix(q.expected_section);
    if (suffix) {
      const jur = q.jurisdiction;
      const expectedFull = `legal/statutes/${jur}/${q.answer_slug}/${suffix}`;
      return resultSlug === expectedFull || resultSlug === `law/${jur}/${q.answer_slug}/${suffix}`;
    }
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

  // ── Empty-DB Guard ──────────────────────────────────────────────────
  // A benchmark that reports Hit@5=0 against an empty DB is indistinguishable
  // from a broken retrieval pipeline. Abort early with a clear message instead.
  const allSlugs = await engine.getAllSlugs();
  let legalPageCount = 0;
  for (const slug of allSlugs) {
    if (slug.startsWith("legal/statutes/")) legalPageCount++;
  }
  if (legalPageCount === 0) {
    const msg = `[dach-v2] ABORT: Database has 0 legal/statutes/ pages. The benchmark cannot run against an empty corpus. Ensure the database is seeded before running this benchmark.`;
    process.stderr.write(msg + "\n");
    if (opts.outputPath) {
      writeFileSync(
        opts.outputPath,
        JSON.stringify({ error: "empty_database", message: msg }) + "\n"
      );
    }
    process.exit(1);
  }
  process.stderr.write(`[dach-v2] corpus check: ${legalPageCount} legal/statutes/ pages found\n`);

  const results: QuestionResult[] = [];
  // Dual-level: track both paragraph-level and law-level hits
  const lawLevelHits = { h1: 0, h3: 0, h5: 0, h8: 0, rr: 0 };
  let qIdx = 0;
  for (const q of questions) {
    qIdx++;
    try {
      const searchOpts = getSearchOpts(q, opts.topK, opts.llmRerank);
      const t0Query = performance.now();
      const searchResults = await hybridSearch(engine, q.question, searchOpts);
      const latencyMs = performance.now() - t0Query;

      const rankedSlugs = searchResults.map((r) => r.slug);
      // Paragraph-level match (strict)
      const firstHit = rankedSlugs.findIndex((s) => slugMatches(s, q));
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      // Law-level match (any paragraph from correct law)
      const firstLawHit = rankedSlugs.findIndex((s) => lawLevelSlugMatches(s, q));
      if (firstLawHit >= 0) {
        lawLevelHits.rr += 1 / (firstLawHit + 1);
        if (firstLawHit < 1) lawLevelHits.h1++;
        if (firstLawHit < 3) lawLevelHits.h3++;
        if (firstLawHit < 5) lawLevelHits.h5++;
        if (firstLawHit < 8) lawLevelHits.h8++;
      }

      const expected = buildExpectedSlug(q);
      const hasSection = !!(q.expected_section || q.expected_slug);
      const matchingLevel: "paragraph" | "law" = hasSection ? "paragraph" : "law";

      const result: QuestionResult = {
        question_id: q.question_id,
        question: q.question,
        jurisdiction: q.jurisdiction,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected,
        matching_level: matchingLevel,
        rank: firstHit >= 0 ? firstHit + 1 : 0,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
        top_slugs: rankedSlugs.slice(0, 8),
      };
      (result as any).latency_ms = Math.round(latencyMs * 100) / 100;
      results.push(result);

      const pct = Math.round((qIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : "✗";
      const lawHit = firstLawHit >= 0 ? "✓" : "✗";
      process.stderr.write(
        `[dach-v2] ${qIdx}/${questions.length} (${pct}%) para:${hit} law:${lawHit} ${q.question_id} [${q.jurisdiction}] ${Math.round(latencyMs)}ms\n`
      );
    } catch (err: any) {
      const expected = buildExpectedSlug(q);
      results.push({
        question_id: q.question_id,
        question: q.question,
        jurisdiction: q.jurisdiction,
        legal_area: q.legal_area,
        question_type: q.question_type,
        expected,
        matching_level: "paragraph",
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

  // Latency percentiles
  const latencies = results.map((r) => (r as any).latency_ms ?? 0).filter((v) => v > 0);
  const lat = latencyPercentiles(latencies);

  // Bootstrap confidence intervals (2000 resamples, 95% CI)
  const hit1Values = results.map((r) => (r.hit_at_1 ? 1 : 0));
  const hit5Values = results.map((r) => (r.hit_at_5 ? 1 : 0));
  const mrrValues = results.map((r) => r.reciprocal_rank);
  const ciHit5 = bootstrapCI(hit5Values);
  const ciHit1 = bootstrapCI(hit1Values);
  const ciMrr = bootstrapMeanCI(mrrValues);

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
    law_level: {
      hit_at_1: lawLevelHits.h1 / n,
      hit_at_3: lawLevelHits.h3 / n,
      hit_at_5: lawLevelHits.h5 / n,
      hit_at_8: lawLevelHits.h8 / n,
      mrr: lawLevelHits.rr / n,
    },
    confidence_intervals: {
      hit_at_5: ciHit5,
      hit_at_1: ciHit1,
      mrr: ciMrr,
    },
    latency: {
      p50_ms: lat.p50,
      p95_ms: lat.p95,
      p99_ms: lat.p99,
      avg_ms: lat.avg,
    },
    questions: results,
  };

  // Print summary
  process.stderr.write(`\n[dach-v2] RESULTS (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(
    `  Paragraph-level: Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );
  process.stderr.write(
    `  Law-level:       Hit@1=${(report.law_level.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.law_level.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.law_level.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.law_level.hit_at_8 * 100).toFixed(1)}% MRR=${report.law_level.mrr.toFixed(3)}\n`
  );
  process.stderr.write(
    `  95% Bootstrap CI: Hit@5=${formatCI(report.confidence_intervals.hit_at_5)} Hit@1=${formatCI(report.confidence_intervals.hit_at_1)} MRR=${report.confidence_intervals.mrr.point.toFixed(3)} [${report.confidence_intervals.mrr.lower.toFixed(3)}–${report.confidence_intervals.mrr.upper.toFixed(3)}]\n`
  );
  process.stderr.write(
    `  Latency: p50=${report.latency.p50_ms}ms p95=${report.latency.p95_ms}ms p99=${report.latency.p99_ms}ms avg=${Math.round(report.latency.avg_ms)}ms\n`
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

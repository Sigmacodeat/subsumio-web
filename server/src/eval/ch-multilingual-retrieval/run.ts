/**
 * Cross-lingual CH Retrieval Benchmark — LIVE engine.
 *
 * Sends French and Italian legal queries against the production Postgres DB
 * and measures whether the correct FR/IT article is retrieved in top-K.
 *
 * Uses the multilingual fixtures (16 FR + IT questions) and searches
 * the law-ch-fr / law-ch-it sources.
 *
 * Usage:
 *   bun run src/eval/ch-multilingual-retrieval/run.ts [--top-k 8] [--output PATH]
 */

import { writeFileSync, existsSync, appendFileSync } from "fs";
import { MULTILINGUAL_CH_FIXTURES, type MultilingualFixture } from "../multilingual-fixtures.ts";

interface QuestionResult {
  id: string;
  language: "fr" | "it";
  question: string;
  expected_slug: string;
  expected_law: string;
  expected_section: string;
  rank: number;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  reciprocal_rank: number;
  top_slugs: string[];
  error?: string;
}

interface LangReport {
  language: string;
  n: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
}

interface BenchmarkReport {
  schema_version: 1;
  benchmark: "ch-multilingual-retrieval";
  total: number;
  top_k: number;
  by_language: LangReport[];
  aggregate: {
    hit_at_1: number;
    hit_at_3: number;
    hit_at_5: number;
    hit_at_8: number;
    mrr: number;
  };
  cross_lingual_check: {
    description: string;
    pairs_checked: number;
    same_law_same_section: number;
  };
  questions: QuestionResult[];
}

async function main() {
  const args = process.argv.slice(2);
  let topK = 8;
  let outputPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top-k" && i + 1 < args.length) topK = parseInt(args[++i], 10);
    if (args[i] === "--output" && i + 1 < args.length) outputPath = args[++i];
  }

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json");
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[ch-multilingual] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    /* non-fatal */
  }

  const fixtures = MULTILINGUAL_CH_FIXTURES;
  process.stderr.write(
    `[ch-multilingual] ${fixtures.length} questions (${fixtures.filter((f) => f.language === "fr").length} FR, ${fixtures.filter((f) => f.language === "it").length} IT), top-k=${topK}\n`
  );

  const results: QuestionResult[] = [];
  let idx = 0;

  for (const fx of fixtures) {
    idx++;
    const sourceId = `law-ch-${fx.language}`;
    try {
      const searchResults = await hybridSearch(engine, fx.question, {
        limit: topK,
        sourceId,
        sourceIds: [sourceId],
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
      });

      const rankedSlugs = searchResults.map((r) => r.slug);
      // Match at article level: expected_slug is e.g. legal/statutes/ch-fr/or/art-54
      const firstHit = rankedSlugs.indexOf(fx.expected_slug);
      // Also check law-level match (any slug starting with the same law prefix)
      const lawPrefix = fx.expected_slug.replace(/\/art-.*$/, "/");
      const lawLevelHit = rankedSlugs.findIndex((s) => s.startsWith(lawPrefix));
      const bestHit = firstHit >= 0 ? firstHit : lawLevelHit;
      const hitAt = (k: number) => bestHit >= 0 && bestHit < k;

      const result: QuestionResult = {
        id: fx.id,
        language: fx.language,
        question: fx.question,
        expected_slug: fx.expected_slug,
        expected_law: fx.expected_law,
        expected_section: fx.expected_section,
        rank: bestHit >= 0 ? bestHit + 1 : 0,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: bestHit >= 0 ? 1 / (bestHit + 1) : 0,
        top_slugs: rankedSlugs.slice(0, 8),
      };
      results.push(result);

      const pct = Math.round((idx / fixtures.length) * 100);
      const hit = bestHit >= 0 ? "✓" : "✗";
      process.stderr.write(
        `[ch-multilingual] ${idx}/${fixtures.length} (${pct}%) ${hit} ${fx.id} rank=${result.rank} [${fx.language}] ${fx.question.substring(0, 50)}...\n`
      );
    } catch (err: any) {
      results.push({
        id: fx.id,
        language: fx.language,
        question: fx.question,
        expected_slug: fx.expected_slug,
        expected_law: fx.expected_law,
        expected_section: fx.expected_section,
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
        `[ch-multilingual] ${idx}/${fixtures.length} ${fx.id} ERROR: ${err?.message}\n`
      );
    }
  }

  // Per-language reports
  const byLang = new Map<string, QuestionResult[]>();
  for (const r of results) {
    const list = byLang.get(r.language) ?? [];
    list.push(r);
    byLang.set(r.language, list);
  }

  const langReports: LangReport[] = [];
  for (const [lang, list] of byLang) {
    const n = list.length;
    langReports.push({
      language: lang,
      n,
      hit_at_1: list.filter((r) => r.hit_at_1).length / n,
      hit_at_3: list.filter((r) => r.hit_at_3).length / n,
      hit_at_5: list.filter((r) => r.hit_at_5).length / n,
      hit_at_8: list.filter((r) => r.hit_at_8).length / n,
      mrr: list.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    });
  }
  langReports.sort((a, b) => a.language.localeCompare(b.language));

  // Cross-lingual check: FR and IT queries for the same law+section should both hit
  const frResults = results.filter((r) => r.language === "fr");
  const itResults = results.filter((r) => r.language === "it");
  let crossPairs = 0;
  let crossMatch = 0;
  for (const fr of frResults) {
    const it = itResults.find(
      (r) => r.expected_law === fr.expected_law && r.expected_section === fr.expected_section
    );
    if (it) {
      crossPairs++;
      if (fr.hit_at_5 && it.hit_at_5) crossMatch++;
    }
  }

  const n = results.length;
  const report: BenchmarkReport = {
    schema_version: 1,
    benchmark: "ch-multilingual-retrieval",
    total: n,
    top_k: topK,
    by_language: langReports,
    aggregate: {
      hit_at_1: results.filter((r) => r.hit_at_1).length / n,
      hit_at_3: results.filter((r) => r.hit_at_3).length / n,
      hit_at_5: results.filter((r) => r.hit_at_5).length / n,
      hit_at_8: results.filter((r) => r.hit_at_8).length / n,
      mrr: results.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    },
    cross_lingual_check: {
      description: "FR and IT queries for the same law+section both hit in top-5",
      pairs_checked: crossPairs,
      same_law_same_section: crossMatch,
    },
    questions: results,
  };

  process.stderr.write(`\n[ch-multilingual] RESULTS (${n} questions, top-k=${topK})\n`);
  process.stderr.write(
    `  Aggregate: Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );
  for (const lr of langReports) {
    process.stderr.write(
      `  ${lr.language.toUpperCase()} (n=${lr.n}): Hit@5=${(lr.hit_at_5 * 100).toFixed(1)}% MRR=${lr.mrr.toFixed(3)}\n`
    );
  }
  process.stderr.write(`  Cross-lingual: ${crossMatch}/${crossPairs} pairs both hit in top-5\n`);

  if (outputPath) {
    if (existsSync(outputPath)) {
      appendFileSync(outputPath, JSON.stringify(report) + "\n");
    } else {
      writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
    }
    process.stderr.write(`[ch-multilingual] output written to ${outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[ch-multilingual] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

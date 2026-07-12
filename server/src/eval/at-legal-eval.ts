/**
 * AT Legal Brain Eval Framework — Versioned baselines, parameter capture,
 * regression detection, and release gates.
 *
 * Replaces the placeholder eval in eval-framework.ts with a real pipeline
 * that records every parameter that could affect retrieval or answer quality,
 * stores results in a versioned baseline format, and blocks deployment when
 * metrics regress against the last approved baseline.
 *
 * Eval types:
 *   - retrieval:  Hit@k, MRR per question + per legal area
 *   - end-to-end: Full pipeline (retrieval → synthesis → guardrail → judge)
 *   - citation:   Citation precision, hallucination rate, grounding verification
 *
 * Usage:
 *   const run = await runAtEval({ type: 'retrieval', fixture, engine, ... });
 *   const baseline = loadBaseline('at-retrieval-v1');
 *   const comparison = compareWithBaseline(run, baseline);
 *   if (comparison.regressed) throw new Error('Regression — do not deploy');
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";

// ─── Types ───────────────────────────────────────────────────────────────

export type EvalType = "retrieval" | "end-to-end" | "citation";

export interface EvalRunParams {
  /** Git commit hash at eval time */
  git_commit: string;
  /** Git branch */
  git_branch: string;
  /** Git dirty flag (uncommitted changes) */
  git_dirty: boolean;
  /** Corpus version (hash of all corpus files) */
  corpus_version: string;
  /** Prompt version identifier */
  prompt_version: string;
  /** Embedding model used */
  embedding_model: string;
  /** Embedding dimensions */
  embedding_dimensions: number;
  /** Retrieval top-k */
  top_k: number;
  /** Source IDs searched */
  source_ids: string[];
  /** Reranker model (if any) */
  reranker_model?: string;
  /** LLM model for synthesis (end-to-end only) */
  synthesis_model?: string;
  /** Judge model (end-to-end only) */
  judge_model?: string;
  /** Guardrail enabled */
  guardrail_enabled: boolean;
  /** Cross-verify enabled */
  cross_verify_enabled: boolean;
  /** Legal query expansion enabled */
  query_expansion_enabled: boolean;
  /** Legal graph fan-out enabled */
  legal_graph_enabled: boolean;
  /** Jurisdiction filter */
  jurisdiction: string;
  /** Temporal cutoff date (ISO) */
  temporal_cutoff?: string;
  /** Additional config notes */
  notes?: string;
}

export interface EvalRunMetadata {
  /** Unique run ID (timestamp-based) */
  run_id: string;
  /** Eval type */
  type: EvalType;
  /** ISO timestamp of run start */
  started_at: string;
  /** ISO timestamp of run end */
  finished_at: string;
  /** Duration in ms */
  duration_ms: number;
  /** Fixture file path */
  fixture_path: string;
  /** Fixture version (from fixture metadata) */
  fixture_version: string;
  /** Number of questions */
  total_questions: number;
  /** All parameters */
  params: EvalRunParams;
  /** Token usage (for end-to-end runs) */
  token_usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  };
}

export interface RetrievalQuestionResult {
  question_id: string;
  question: string;
  legal_area: string;
  question_type: string;
  expected_slug: string;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  hit_at_10: boolean;
  reciprocal_rank: number;
  rank: number; // 0 = not found, 1 = first hit
  top_slugs: string[];
  top_scores: number[];
  error?: string;
  /** Error classification for misses */
  error_class?: ErrorClass;
  /** Error analysis details */
  error_analysis?: string;
}

export type ErrorClass =
  | "query_weakness"      // Natural language question doesn't match statute text
  | "cross_law_contamination" // Wrong law retrieved due to similar terms
  | "close_miss"          // Right law, wrong paragraph (adjacent)
  | "slug_normalization"  // Slug format mismatch
  | "embedding_failure"   // Embedding API error
  | "empty_results"       // No results returned at all
  | "timeout"             // Search timed out
  | "unknown";            // Unclassified

export interface EndToEndQuestionResult {
  question_id: string;
  question: string;
  legal_area: string;
  expected_norms: string[];
  retrieved_norms: string[];
  norm_recall: number;
  answer: string;
  citations: string[];
  citation_precision: number;
  hallucination_detected: boolean;
  guardrail_passed: boolean;
  guardrail_flags: string[];
  judge_score?: number;
  judge_correct?: boolean;
  judge_notes?: string;
  latency_ms: number;
  error?: string;
}

export interface CitationQuestionResult {
  question_id: string;
  answer: string;
  cited_norms: string[];
  grounded_norms: string[];
  ungrounded_norms: string[];
  fabricated_references: string[];
  citation_precision: number;
  grounding_verified: boolean;
  guardrail_flags: string[];
}

export interface EvalRunResult {
  metadata: EvalRunMetadata;
  retrieval_results?: RetrievalQuestionResult[];
  e2e_results?: EndToEndQuestionResult[];
  citation_results?: CitationQuestionResult[];
  aggregate: EvalAggregate;
}

export interface EvalAggregate {
  // Retrieval metrics
  hit_at_1?: number;
  hit_at_3?: number;
  hit_at_5?: number;
  hit_at_8?: number;
  hit_at_10?: number;
  mrr?: number;
  // End-to-end metrics
  norm_recall?: number;
  citation_precision?: number;
  hallucination_rate?: number;
  guardrail_pass_rate?: number;
  judge_correct_rate?: number;
  avg_judge_score?: number;
  // Citation metrics
  grounding_rate?: number;
  fabricated_rate?: number;
  // Error classification
  error_classes?: Record<ErrorClass, number>;
  // Per-area breakdown
  per_area?: Record<string, AreaMetrics>;
}

export interface AreaMetrics {
  n: number;
  hit_at_1?: number;
  hit_at_3?: number;
  hit_at_5?: number;
  hit_at_8?: number;
  mrr?: number;
  norm_recall?: number;
  citation_precision?: number;
}

export interface Baseline {
  version: string;
  label: string;
  created_at: string;
  eval_type: EvalType;
  params: Partial<EvalRunParams>;
  aggregate: EvalAggregate;
  /** Path to full results file */
  results_path: string;
  /** Approval status */
  approved: boolean;
  /** Approval note */
  approval_note?: string;
}

export interface BaselineComparison {
  current: EvalAggregate;
  baseline: EvalAggregate;
  deltas: Record<string, { current: number; baseline: number; delta: number; regressed: boolean }>;
  regressed: boolean;
  regressions: string[];
  improvements: string[];
}

// ─── Parameter Capture ───────────────────────────────────────────────────

export function captureRunParams(opts: {
  promptVersion?: string;
  topK?: number;
  sourceIds?: string[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  rerankerModel?: string;
  synthesisModel?: string;
  judgeModel?: string;
  guardrailEnabled?: boolean;
  crossVerifyEnabled?: boolean;
  queryExpansionEnabled?: boolean;
  legalGraphEnabled?: boolean;
  jurisdiction?: string;
  temporalCutoff?: string;
  notes?: string;
}): EvalRunParams {
  let gitCommit = "unknown";
  let gitBranch = "unknown";
  let gitDirty = false;

  try {
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
    gitDirty = status.length > 0;
  } catch {
    // Not in a git repo or git not available
  }

  return {
    git_commit: gitCommit,
    git_branch: gitBranch,
    git_dirty: gitDirty,
    corpus_version: computeCorpusVersion(),
    prompt_version: opts.promptVersion ?? "default",
    embedding_model: opts.embeddingModel ?? "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: opts.embeddingDimensions ?? 1536,
    top_k: opts.topK ?? 8,
    source_ids: opts.sourceIds ?? ["law-at", "law-at-judikatur"],
    reranker_model: opts.rerankerModel,
    synthesis_model: opts.synthesisModel,
    judge_model: opts.judgeModel,
    guardrail_enabled: opts.guardrailEnabled ?? true,
    cross_verify_enabled: opts.crossVerifyEnabled ?? true,
    query_expansion_enabled: opts.queryExpansionEnabled ?? true,
    legal_graph_enabled: opts.legalGraphEnabled ?? true,
    jurisdiction: opts.jurisdiction ?? "AT",
    temporal_cutoff: opts.temporalCutoff,
    notes: opts.notes,
  };
}

function computeCorpusVersion(): string {
  try {
    const here = import.meta.dirname ?? (typeof __dirname !== "undefined" ? __dirname : process.cwd());
    const corpusDir = join(here, "../../../law-corpus/at");
    if (!existsSync(corpusDir)) return "no-corpus";
    // Hash file list + sizes as a quick corpus version
    const output = execSync(
      `find "${corpusDir}" -name "*.md" -type f -exec sh -c 'echo "$(basename "$1") $(wc -c < "$1")"' _ {} \\; | sort`,
      { encoding: "utf-8" }
    );
    // Simple hash
    let hash = 0;
    for (let i = 0; i < output.length; i++) {
      hash = ((hash << 5) - hash + output.charCodeAt(i)) | 0;
    }
    return `at-${Math.abs(hash).toString(16)}`;
  } catch {
    return "unknown";
  }
}

// ─── Error Classification ────────────────────────────────────────────────

export function classifyError(
  result: RetrievalQuestionResult,
  allResults: RetrievalQuestionResult[]
): { class: ErrorClass; analysis: string } {
  if (result.error?.includes("timeout") || result.error?.includes("Timeout")) {
    return { class: "timeout", analysis: "Search timed out" };
  }
  if (result.error?.includes("embed") || result.error?.includes("Embed")) {
    return { class: "embedding_failure", analysis: "Embedding API error" };
  }
  if (result.top_slugs.length === 0) {
    return { class: "empty_results", analysis: "No search results returned" };
  }

  const expected = result.expected_slug;
  const expectedLaw = extractLawFromSlug(expected);
  const topLaws = result.top_slugs.slice(0, 5).map(extractLawFromSlug);

  // Check if expected law appears in top results at all
  const expectedLawInTop = topLaws.some((l) => l === expectedLaw);

  if (!expectedLawInTop) {
    // Cross-law contamination: wrong law entirely
    const wrongLaws = [...new Set(topLaws)].filter((l) => l !== expectedLaw);
    return {
      class: "cross_law_contamination",
      analysis: `Expected law "${expectedLaw}" not in top-5. Got: ${wrongLaws.join(", ")}. Query terms may match wrong law.`,
    };
  }

  // Right law but wrong paragraph
  const expectedPara = extractParaFromSlug(expected);
  const topParasInLaw = result.top_slugs
    .filter((s) => extractLawFromSlug(s) === expectedLaw)
    .map(extractParaFromSlug);

  if (topParasInLaw.some((p) => Math.abs(parseInt(p) - parseInt(expectedPara)) <= 5)) {
    return {
      class: "close_miss",
      analysis: `Right law (${expectedLaw}), but close paragraph miss. Expected §${expectedPara}, got §${topParasInLaw.slice(0, 3).join(", §")}.`,
    };
  }

  // Query weakness: right law not in top-5 but might be in top-8
  if (result.hit_at_8) {
    return {
      class: "query_weakness",
      analysis: `Expected slug found at rank ${result.rank} (in top-8 but not top-5). Query needs better term matching.`,
    };
  }

  return {
    class: "query_weakness",
    analysis: `Expected slug not in top-8. Query terms don't match statute text. Expected: ${expected}.`,
  };
}

function extractLawFromSlug(slug: string): string {
  // legal/statutes/at/abgb/p-1295 → abgb
  const parts = slug.split("/");
  return parts[3] ?? parts[parts.length - 2] ?? "unknown";
}

function extractParaFromSlug(slug: string): string {
  // legal/statutes/at/abgb/p-1295 → 1295
  const parts = slug.split("/");
  const last = parts[parts.length - 1] ?? "";
  return last.replace(/^p-/, "").replace(/[^\d]/g, "");
}

// ─── Aggregate Computation ───────────────────────────────────────────────

export function computeRetrievalAggregate(
  results: RetrievalQuestionResult[]
): EvalAggregate {
  const n = results.length;
  if (n === 0) return {};

  const errorClasses: Record<ErrorClass, number> = {
    query_weakness: 0,
    cross_law_contamination: 0,
    close_miss: 0,
    slug_normalization: 0,
    embedding_failure: 0,
    empty_results: 0,
    timeout: 0,
    unknown: 0,
  };

  for (const r of results) {
    if (!r.hit_at_5 && r.error_class) {
      errorClasses[r.error_class]++;
    }
  }

  const perArea: Record<string, AreaMetrics> = {};
  const areaMap = new Map<string, RetrievalQuestionResult[]>();
  for (const r of results) {
    const list = areaMap.get(r.legal_area) ?? [];
    list.push(r);
    areaMap.set(r.legal_area, list);
  }
  for (const [area, list] of areaMap) {
    const an = list.length;
    perArea[area] = {
      n: an,
      hit_at_1: list.filter((r) => r.hit_at_1).length / an,
      hit_at_3: list.filter((r) => r.hit_at_3).length / an,
      hit_at_5: list.filter((r) => r.hit_at_5).length / an,
      hit_at_8: list.filter((r) => r.hit_at_8).length / an,
      mrr: list.reduce((s, r) => s + r.reciprocal_rank, 0) / an,
    };
  }

  return {
    hit_at_1: results.filter((r) => r.hit_at_1).length / n,
    hit_at_3: results.filter((r) => r.hit_at_3).length / n,
    hit_at_5: results.filter((r) => r.hit_at_5).length / n,
    hit_at_8: results.filter((r) => r.hit_at_8).length / n,
    hit_at_10: results.filter((r) => r.hit_at_10).length / n,
    mrr: results.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    error_classes: errorClasses,
    per_area: perArea,
  };
}

export function computeE2EAggregate(
  results: EndToEndQuestionResult[]
): EvalAggregate {
  const n = results.length;
  if (n === 0) return {};

  const perArea: Record<string, AreaMetrics> = {};
  const areaMap = new Map<string, EndToEndQuestionResult[]>();
  for (const r of results) {
    const list = areaMap.get(r.legal_area) ?? [];
    list.push(r);
    areaMap.set(r.legal_area, list);
  }
  for (const [area, list] of areaMap) {
    const an = list.length;
    perArea[area] = {
      n: an,
      norm_recall: list.reduce((s, r) => s + r.norm_recall, 0) / an,
      citation_precision: list.reduce((s, r) => s + r.citation_precision, 0) / an,
    };
  }

  const judgedResults = results.filter((r) => r.judge_score !== undefined);

  return {
    norm_recall: results.reduce((s, r) => s + r.norm_recall, 0) / n,
    citation_precision: results.reduce((s, r) => s + r.citation_precision, 0) / n,
    hallucination_rate: results.filter((r) => r.hallucination_detected).length / n,
    guardrail_pass_rate: results.filter((r) => r.guardrail_passed).length / n,
    judge_correct_rate: judgedResults.length > 0
      ? judgedResults.filter((r) => r.judge_correct).length / judgedResults.length
      : undefined,
    avg_judge_score: judgedResults.length > 0
      ? judgedResults.reduce((s, r) => s + (r.judge_score ?? 0), 0) / judgedResults.length
      : undefined,
    per_area: perArea,
  };
}

// ─── Baseline Management ─────────────────────────────────────────────────

const BASELINE_DIR = "server/eval/baselines";

export function saveBaseline(
  result: EvalRunResult,
  label: string,
  approved: boolean = false,
  approvalNote?: string
): Baseline {
  const dir = join(process.cwd(), BASELINE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const version = `${result.metadata.type}-v${Date.now()}`;
  const resultsPath = join(dir, `${version}-results.json`);
  const baselinePath = join(dir, `${version}-baseline.json`);

  // Save full results
  writeFileSync(resultsPath, JSON.stringify(result, null, 2));

  const baseline: Baseline = {
    version,
    label,
    created_at: new Date().toISOString(),
    eval_type: result.metadata.type,
    params: result.metadata.params,
    aggregate: result.aggregate,
    results_path: resultsPath,
    approved,
    approval_note: approvalNote,
  };

  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  // Update baseline index
  const indexPath = join(dir, "index.json");
  const index = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, "utf-8"))
    : { baselines: [] };
  index.baselines.push({
    version,
    label,
    eval_type: result.metadata.type,
    created_at: baseline.created_at,
    approved,
    aggregate: result.aggregate,
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2));

  return baseline;
}

export function loadBaseline(version: string): Baseline | null {
  const path = join(process.cwd(), BASELINE_DIR, `${version}-baseline.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function getLatestBaseline(evalType: EvalType): Baseline | null {
  const indexPath = join(process.cwd(), BASELINE_DIR, "index.json");
  if (!existsSync(indexPath)) return null;

  const index = JSON.parse(readFileSync(indexPath, "utf-8"));
  const matching = index.baselines
    .filter((b: { eval_type: string; approved: boolean }) => b.eval_type === evalType && b.approved)
    .sort((a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at)
    );

  if (matching.length === 0) return null;
  return loadBaseline(matching[0].version);
}

// ─── Baseline Comparison ─────────────────────────────────────────────────

const REGRESSION_THRESHOLDS: Record<string, { metric: keyof EvalAggregate; maxDelta: number }> = {
  hit_at_5: { metric: "hit_at_5", maxDelta: -0.02 },      // ≤ 2pp drop
  hit_at_1: { metric: "hit_at_1", maxDelta: -0.05 },      // ≤ 5pp drop
  mrr: { metric: "mrr", maxDelta: -0.03 },                // ≤ 0.03 MRR drop
  norm_recall: { metric: "norm_recall", maxDelta: -0.02 }, // ≤ 2pp drop
  citation_precision: { metric: "citation_precision", maxDelta: -0.005 }, // ≤ 0.5pp drop
  hallucination_rate: { metric: "hallucination_rate", maxDelta: 0.02 },    // ≤ 2pp increase
  guardrail_pass_rate: { metric: "guardrail_pass_rate", maxDelta: -0.02 }, // ≤ 2pp drop
  judge_correct_rate: { metric: "judge_correct_rate", maxDelta: -0.05 },   // ≤ 5pp drop
};

export function compareWithBaseline(
  current: EvalAggregate,
  baseline: EvalAggregate
): BaselineComparison {
  const deltas: Record<string, { current: number; baseline: number; delta: number; regressed: boolean }> = {};
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const [name, threshold] of Object.entries(REGRESSION_THRESHOLDS)) {
    const curRaw = current[threshold.metric];
    const baseRaw = baseline[threshold.metric];
    if (typeof curRaw !== "number" || typeof baseRaw !== "number") continue;
    const currentValue: number = curRaw;
    const baselineValue: number = baseRaw;

    const delta = currentValue - baselineValue;
    const regressed = delta < threshold.maxDelta;

    deltas[name] = { current: currentValue, baseline: baselineValue, delta, regressed };

    if (regressed) {
      regressions.push(
        `${name}: ${(currentValue * 100).toFixed(1)}% vs baseline ${(baselineValue * 100).toFixed(1)}% (Δ${(delta * 100).toFixed(1)}pp)`
      );
    } else if (delta > 0.01) {
      improvements.push(
        `${name}: ${(currentValue * 100).toFixed(1)}% vs baseline ${(baselineValue * 100).toFixed(1)}% (+${(delta * 100).toFixed(1)}pp)`
      );
    }
  }

  return {
    current,
    baseline,
    deltas,
    regressed: regressions.length > 0,
    regressions,
    improvements,
  };
}

// ─── Release Gate ─────────────────────────────────────────────────────────

export interface ReleaseGateResult {
  passed: boolean;
  blocked_by: string[];
  comparison?: BaselineComparison;
  metrics: EvalAggregate;
  thresholds: Record<string, number>;
}

export const RELEASE_THRESHOLDS: Record<string, number> = {
  hit_at_5: 0.90,           // ≥ 90%
  hit_at_1: 0.70,           // ≥ 70%
  mrr: 0.65,                // ≥ 0.65
  norm_recall: 0.90,        // ≥ 90%
  citation_precision: 0.995, // ≥ 99.5%
  hallucination_rate: 0.10,  // ≤ 10%
  guardrail_pass_rate: 0.90, // ≥ 90%
  judge_correct_rate: 0.80,  // ≥ 80%
};

export function evalGate(
  result: EvalRunResult,
  opts?: { compareBaseline?: boolean }
): ReleaseGateResult {
  const metrics = result.aggregate;
  const blockedBy: string[] = [];

  for (const [name, threshold] of Object.entries(RELEASE_THRESHOLDS)) {
    const raw = metrics[name as keyof EvalAggregate];
    if (typeof raw !== "number") continue;
    const value: number = raw;

    // For hallucination_rate, lower is better
    if (name === "hallucination_rate") {
      if (value > threshold) {
        blockedBy.push(`${name}: ${(value * 100).toFixed(1)}% > threshold ${(threshold * 100).toFixed(1)}%`);
      }
    } else {
      if (value < threshold) {
        blockedBy.push(`${name}: ${(value * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(1)}%`);
      }
    }
  }

  let comparison: BaselineComparison | undefined;
  if (opts?.compareBaseline) {
    const baseline = getLatestBaseline(result.metadata.type);
    if (baseline) {
      comparison = compareWithBaseline(metrics, baseline.aggregate);
      if (comparison.regressed) {
        blockedBy.push(`REGRESSION: ${comparison.regressions.join("; ")}`);
      }
    }
  }

  return {
    passed: blockedBy.length === 0,
    blocked_by: blockedBy,
    comparison,
    metrics,
    thresholds: RELEASE_THRESHOLDS,
  };
}

// ─── Run Metadata ────────────────────────────────────────────────────────

export function createRunMetadata(
  type: EvalType,
  fixturePath: string,
  fixtureVersion: string,
  totalQuestions: number,
  params: EvalRunParams
): EvalRunMetadata {
  return {
    run_id: `at-${type}-${Date.now()}`,
    type,
    started_at: new Date().toISOString(),
    finished_at: "",
    duration_ms: 0,
    fixture_path: fixturePath,
    fixture_version: fixtureVersion,
    total_questions: totalQuestions,
    params,
  };
}

export function finalizeRunMetadata(
  metadata: EvalRunMetadata,
  tokenUsage?: EvalRunMetadata["token_usage"]
): EvalRunMetadata {
  const finished = new Date();
  return {
    ...metadata,
    finished_at: finished.toISOString(),
    duration_ms: finished.getTime() - new Date(metadata.started_at).getTime(),
    token_usage: tokenUsage,
  };
}

// ─── Fixture Loading ─────────────────────────────────────────────────────

export interface FixtureMetadata {
  version: string;
  type: EvalType;
  description?: string;
}

export function loadFixture(path: string): { questions: unknown[]; metadata: FixtureMetadata } {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"));

  // First line might be metadata
  let metadata: FixtureMetadata = { version: "1.0.0", type: "retrieval" };
  let questionLines = lines;

  try {
    const first = JSON.parse(lines[0]);
    if (first.kind === "metadata" || first.fixture_metadata) {
      metadata = first.fixture_metadata ?? first;
      questionLines = lines.slice(1);
    }
  } catch {
    // First line is a question, not metadata
  }

  const questions = questionLines.map((l) => JSON.parse(l));
  return { questions, metadata };
}

// ─── Report Formatting ───────────────────────────────────────────────────

export function formatRetrievalReport(result: EvalRunResult): string {
  const lines: string[] = [];
  const m = result.metadata;
  const a = result.aggregate;

  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(`  AT Legal Retrieval Benchmark — ${m.run_id}`);
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push(`  Date:        ${m.started_at}`);
  lines.push(`  Duration:    ${(m.duration_ms / 1000).toFixed(1)}s`);
  lines.push(`  Questions:   ${m.total_questions}`);
  lines.push(`  Git:         ${m.params.git_commit.slice(0, 8)} (${m.params.git_branch}${m.params.git_dirty ? ", dirty" : ""})`);
  lines.push(`  Corpus:      ${m.params.corpus_version}`);
  lines.push(`  Embedding:   ${m.params.embedding_model} (${m.params.embedding_dimensions}d)`);
  lines.push(`  Top-K:       ${m.params.top_k}`);
  lines.push(`  Sources:     ${m.params.source_ids.join(", ")}`);
  lines.push(`  Expansion:   ${m.params.query_expansion_enabled ? "ON" : "OFF"}`);
  lines.push(`  Graph:       ${m.params.legal_graph_enabled ? "ON" : "OFF"}`);
  lines.push("───────────────────────────────────────────────────────────────");
  lines.push("");

  const h1 = typeof a.hit_at_1 === "number" ? a.hit_at_1 : undefined;
  const h3 = typeof a.hit_at_3 === "number" ? a.hit_at_3 : undefined;
  const h5 = typeof a.hit_at_5 === "number" ? a.hit_at_5 : undefined;
  const h8 = typeof a.hit_at_8 === "number" ? a.hit_at_8 : undefined;
  const h10 = typeof a.hit_at_10 === "number" ? a.hit_at_10 : undefined;
  const mrr = typeof a.mrr === "number" ? a.mrr : undefined;

  if (h1 !== undefined) {
    lines.push("  AGGREGATE METRICS");
    lines.push("  ───────────────────────────────────────────");
    lines.push(`  Hit@1:   ${(h1 * 100).toFixed(1)}%`);
    lines.push(`  Hit@3:   ${(h3! * 100).toFixed(1)}%`);
    lines.push(`  Hit@5:   ${(h5! * 100).toFixed(1)}%  ${h5! >= 0.90 ? "✅" : "❌"}`);
    lines.push(`  Hit@8:   ${(h8! * 100).toFixed(1)}%`);
    lines.push(`  Hit@10:  ${(h10! * 100).toFixed(1)}%`);
    lines.push(`  MRR:     ${mrr!.toFixed(3)}`);
    lines.push("");
  }

  if (a.per_area) {
    lines.push("  PER-AREA BREAKDOWN");
    lines.push("  ───────────────────────────────────────────");
    for (const [area, metrics] of Object.entries(a.per_area)) {
      lines.push(
        `  ${area.padEnd(12)} (n=${String(metrics.n).padStart(2)}): ` +
        `H@1=${((metrics.hit_at_1 ?? 0) * 100).toFixed(0)}% ` +
        `H@5=${((metrics.hit_at_5 ?? 0) * 100).toFixed(0)}% ` +
        `H@8=${((metrics.hit_at_8 ?? 0) * 100).toFixed(0)}% ` +
        `MRR=${(metrics.mrr ?? 0).toFixed(3)}`
      );
    }
    lines.push("");
  }

  if (a.error_classes) {
    lines.push("  ERROR CLASSIFICATION (misses only)");
    lines.push("  ───────────────────────────────────────────");
    for (const [cls, count] of Object.entries(a.error_classes)) {
      if (count > 0) {
        lines.push(`  ${cls.padEnd(28)}: ${count}`);
      }
    }
    lines.push("");
  }

  // Show misses
  if (result.retrieval_results) {
    const misses = result.retrieval_results.filter((r) => !r.hit_at_5);
    if (misses.length > 0) {
      lines.push("  MISSES (Hit@5 failures)");
      lines.push("  ───────────────────────────────────────────");
      for (const m of misses) {
        lines.push(`  ${m.question_id}: ${m.error_class ?? "unclassified"}`);
        lines.push(`    Q: ${m.question.slice(0, 80)}`);
        lines.push(`    Expected: ${m.expected_slug}`);
        lines.push(`    Got:      ${m.top_slugs.slice(0, 3).join(", ")}`);
        if (m.error_analysis) {
          lines.push(`    Analysis: ${m.error_analysis}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("═══════════════════════════════════════════════════════════════");

  return lines.join("\n");
}

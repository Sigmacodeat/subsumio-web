/**
 * Austrian Legal Retrieval Benchmark — reusable library entrypoint.
 *
 * Extracted from run.ts so the RAG Optimizer can invoke the same benchmark
 * against a live engine without shelling out to the CLI harness.
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "node:fs";
import type { BrainEngine } from "../../core/engine.ts";
import type { SearchResult, ResolvedColumn } from "../../core/types.ts";
import { AT_LAW_SOURCES_ALL, AT_PRIMARY_STATUTE_SOURCE } from "../../core/legal/jurisdiction.ts";

// ─── Types ───────────────────────────────────────────────────────────────

export interface AtLegalQuestion {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area: string;
  question_type: string;
}

export interface QuestionResult {
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
  law_hit_at_1: boolean;
  law_hit_at_3: boolean;
  law_hit_at_5: boolean;
  law_hit_at_8: boolean;
  law_rank: number;
  latency_ms?: number;
  error?: string;
}

export interface AreaReport {
  legal_area: string;
  n: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
}

export interface BenchmarkReport {
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
  law_aggregate: {
    hit_at_1: number;
    hit_at_3: number;
    hit_at_5: number;
    hit_at_8: number;
  };
  questions: QuestionResult[];
  latency_p95_ms: number;
}

export interface BenchmarkOpts {
  fixturePath: string;
  topK: number;
  llmRerank: boolean;
  llmRerankModel?: string;
  llmRerankTopNIn?: number;
  sourceIds?: string[];
  jurisdiction?: string;
  embeddingColumn?: ResolvedColumn;
  outputPath?: string;
  append?: boolean;
  onProgress?: (idx: number, total: number, result: QuestionResult) => void;
  onLog?: (message: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function loadFixture(path: string): AtLegalQuestion[] {
  const raw = readFileSync(path, "utf-8");
  const lines = raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  return lines.map((l) => JSON.parse(l) as AtLegalQuestion);
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

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[pos] ?? 0;
}

// ─── Benchmark ───────────────────────────────────────────────────────────

export async function runBenchmark(
  engine: BrainEngine,
  opts: BenchmarkOpts
): Promise<BenchmarkReport> {
  const questions = loadFixture(opts.fixturePath);
  const { hybridSearch } = await import("../../core/search/hybrid.ts");

  const log = opts.onLog ?? ((m: string) => process.stderr.write(m + "\n"));
  log(`[at-legal-retrieval] loaded ${questions.length} questions`);
  log(`[at-legal-retrieval] top-k=${opts.topK}`);
  if (opts.llmRerank) {
    log(`[at-legal-retrieval] LLM re-ranker: ENABLED`);
  }

  const sourceIds = opts.sourceIds ?? AT_LAW_SOURCES_ALL;
  const llmRerankModel = opts.llmRerankModel ?? "openrouter:deepseek/deepseek-chat";
  const llmRerankTopNIn = opts.llmRerankTopNIn ?? 50;
  const embeddingColumn = opts.embeddingColumn ?? {
    name: "embedding",
    type: "vector" as const,
    dimensions: 1536,
    embeddingModel: "openrouter:openai/text-embedding-3-small",
  };

  const results: QuestionResult[] = [];
  const latencies: number[] = [];
  let questionIdx = 0;

  for (const q of questions) {
    questionIdx++;
    const t0 = performance.now();
    try {
      const searchResults = await hybridSearch(engine, q.question, {
        limit: opts.topK,
        innerLimit: 50,
        sourceId: AT_PRIMARY_STATUTE_SOURCE,
        sourceIds,
        jurisdiction: opts.jurisdiction ?? "at",
        useBM25: true,
        embeddingColumn,
        ...(opts.llmRerank
          ? {
              llmRerank: {
                enabled: true,
                topNIn: llmRerankTopNIn,
                model: llmRerankModel,
                timeoutMs: 60000,
              },
            }
          : {}),
      });
      const latency = Math.round(performance.now() - t0);
      latencies.push(latency);

      const rankedSlugs = searchResults.map((r: SearchResult) => r.slug);
      if (rankedSlugs.length === 0) {
        log(
          `[at-legal-retrieval] WARNING: empty search results for "${q.question}" (${q.question_id})`
        );
      }

      const firstHit = rankedSlugs.indexOf(q.expected_slug);
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

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
        latency_ms: latency,
      };
      results.push(result);
      opts.onProgress?.(questionIdx, questions.length, result);
    } catch (err) {
      const latency = Math.round(performance.now() - t0);
      latencies.push(latency);
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
        latency_ms: latency,
        error: err instanceof Error ? err.message : String(err),
      });
      log(
        `[at-legal-retrieval] ${questionIdx}/${questions.length} ${q.question_id} (error: ${err instanceof Error ? err.message : String(err)})`
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
      hit_at_1: n > 0 ? results.filter((r) => r.hit_at_1).length / n : 0,
      hit_at_3: n > 0 ? results.filter((r) => r.hit_at_3).length / n : 0,
      hit_at_5: n > 0 ? results.filter((r) => r.hit_at_5).length / n : 0,
      hit_at_8: n > 0 ? results.filter((r) => r.hit_at_8).length / n : 0,
      mrr: n > 0 ? results.reduce((s, r) => s + r.reciprocal_rank, 0) / n : 0,
    },
    law_aggregate: {
      hit_at_1: n > 0 ? results.filter((r) => r.law_hit_at_1).length / n : 0,
      hit_at_3: n > 0 ? results.filter((r) => r.law_hit_at_3).length / n : 0,
      hit_at_5: n > 0 ? results.filter((r) => r.law_hit_at_5).length / n : 0,
      hit_at_8: n > 0 ? results.filter((r) => r.law_hit_at_8).length / n : 0,
    },
    questions: results,
    latency_p95_ms: p95(latencies),
  };

  if (opts.outputPath) {
    const emitter = new JsonlEmitter(opts.outputPath, opts.append ?? false);
    for (const r of results) emitter.emit(r as unknown as Record<string, unknown>);
    emitter.emit({
      schema_version: 1,
      kind: "summary",
      benchmark: report.benchmark,
      total: report.total,
      top_k: report.top_k,
      aggregate: report.aggregate,
      law_aggregate: report.law_aggregate,
      latency_p95_ms: report.latency_p95_ms,
      areas: report.areas,
    });
    log(`[at-legal-retrieval] output written to ${opts.outputPath}`);
  }

  return report;
}

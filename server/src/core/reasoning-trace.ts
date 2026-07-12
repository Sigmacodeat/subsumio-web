/**
 * AI Reasoning Trace — Server-side trace builder (EU AI Act Art. 12)
 *
 * Server-side version of the reasoning trace module for use in the think pipeline.
 * The frontend version (src/lib/ai-reasoning-trace.ts) re-exports the same types
 * for dashboard display and compliance export.
 */

import { createHash } from "crypto";

export interface RetrievedChunkRecord {
  slug: string;
  score: number;
  rank: number;
  source: string;
}

export interface ReasoningTrace {
  trace_id: string;
  timestamp: string;
  brain_id: string;
  user_id?: string;
  query: string;
  query_hash: string;
  jurisdiction?: string;
  search_mode?: string;
  retrieved_chunks: RetrievedChunkRecord[];
  pages_gathered: number;
  takes_gathered: number;
  graph_hits: number;
  model_used: string;
  system_prompt_hash: string;
  max_tokens?: number;
  guardrail_passed?: boolean;
  guardrail_flags?: unknown[];
  cross_verify_clean?: boolean;
  cross_verify_flags?: unknown[];
  ensemble_clean?: boolean;
  ensemble_flags?: unknown[];
  ensemble_method?: string;
  regeneration_count: number;
  injection_detected: boolean;
  injection_blocked: boolean;
  injection_flags?: unknown[];
  final_answer_hash: string;
  answer_length: number;
  citations: unknown[];
  confidence_level?: string;
  overall_confidence?: number;
  provenance_links?: unknown[];
  prev_trace_hash?: string;
  trace_hash: string;
  latency_ms?: number;
  warnings: string[];
}

export interface TraceCaptureOpts {
  brain_id: string;
  user_id?: string;
  query: string;
  jurisdiction?: string;
  search_mode?: string;
  retrieved_chunks: RetrievedChunkRecord[];
  pages_gathered: number;
  takes_gathered: number;
  graph_hits: number;
  model_used: string;
  system_prompt: string;
  max_tokens?: number;
  answer: string;
  citations: unknown[];
  warnings: string[];
  latency_ms?: number;
  guardrail_passed?: boolean;
  guardrail_flags?: unknown[];
  cross_verify_clean?: boolean;
  cross_verify_flags?: unknown[];
  ensemble_clean?: boolean;
  ensemble_flags?: unknown[];
  ensemble_method?: string;
  regeneration_count?: number;
  injection_detected?: boolean;
  injection_blocked?: boolean;
  injection_flags?: unknown[];
  confidence_level?: string;
  overall_confidence?: number;
  provenance_links?: unknown[];
  prev_trace_hash?: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function generateTraceId(): string {
  return crypto.randomUUID();
}

function computeTraceHash(trace: Omit<ReasoningTrace, "trace_hash" | "prev_trace_hash">): string {
  const content = JSON.stringify({
    trace_id: trace.trace_id,
    timestamp: trace.timestamp,
    brain_id: trace.brain_id,
    query_hash: trace.query_hash,
    model_used: trace.model_used,
    system_prompt_hash: trace.system_prompt_hash,
    final_answer_hash: trace.final_answer_hash,
    guardrail_passed: trace.guardrail_passed,
    cross_verify_clean: trace.cross_verify_clean,
    ensemble_clean: trace.ensemble_clean,
    injection_detected: trace.injection_detected,
    injection_blocked: trace.injection_blocked,
    regeneration_count: trace.regeneration_count,
    retrieved_chunks: trace.retrieved_chunks,
    answer_length: trace.answer_length,
    citations: trace.citations,
    confidence_level: trace.confidence_level,
    overall_confidence: trace.overall_confidence,
    latency_ms: trace.latency_ms,
    warnings: trace.warnings,
  });
  return sha256(content);
}

export function buildReasoningTrace(opts: TraceCaptureOpts): ReasoningTrace {
  const trace_id = generateTraceId();
  const timestamp = new Date().toISOString();
  const query_hash = sha256(opts.query);
  const system_prompt_hash = sha256(opts.system_prompt);
  const final_answer_hash = sha256(opts.answer);

  const traceWithoutHash: Omit<ReasoningTrace, "trace_hash"> = {
    trace_id,
    timestamp,
    brain_id: opts.brain_id,
    user_id: opts.user_id,
    query: opts.query,
    query_hash,
    jurisdiction: opts.jurisdiction,
    search_mode: opts.search_mode,
    retrieved_chunks: opts.retrieved_chunks,
    pages_gathered: opts.pages_gathered,
    takes_gathered: opts.takes_gathered,
    graph_hits: opts.graph_hits,
    model_used: opts.model_used,
    system_prompt_hash,
    max_tokens: opts.max_tokens,
    guardrail_passed: opts.guardrail_passed,
    guardrail_flags: opts.guardrail_flags,
    cross_verify_clean: opts.cross_verify_clean,
    cross_verify_flags: opts.cross_verify_flags,
    ensemble_clean: opts.ensemble_clean,
    ensemble_flags: opts.ensemble_flags,
    ensemble_method: opts.ensemble_method,
    regeneration_count: opts.regeneration_count ?? 0,
    injection_detected: opts.injection_detected ?? false,
    injection_blocked: opts.injection_blocked ?? false,
    injection_flags: opts.injection_flags,
    final_answer_hash,
    answer_length: opts.answer.length,
    citations: opts.citations,
    confidence_level: opts.confidence_level,
    overall_confidence: opts.overall_confidence,
    provenance_links: opts.provenance_links,
    prev_trace_hash: opts.prev_trace_hash,
    latency_ms: opts.latency_ms,
    warnings: opts.warnings,
  };

  const trace_hash = computeTraceHash(traceWithoutHash);

  return {
    ...traceWithoutHash,
    trace_hash,
  };
}

export function verifyTraceChain(traces: ReasoningTrace[]): {
  valid: boolean;
  broken_at?: number;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const { trace_hash, prev_trace_hash, ...content } = trace;
    const computedHash = computeTraceHash(content);
    if (computedHash !== trace_hash) {
      errors.push(`Trace ${i} (${trace.trace_id}): hash mismatch — trace may have been tampered with`);
      return { valid: false, broken_at: i, errors };
    }

    if (i > 0) {
      const expectedPrevHash = traces[i - 1].trace_hash;
      if (trace.prev_trace_hash !== expectedPrevHash) {
        errors.push(`Trace ${i} (${trace.trace_id}): chain broken — prev_trace_hash does not match previous trace's hash`);
        return { valid: false, broken_at: i, errors };
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

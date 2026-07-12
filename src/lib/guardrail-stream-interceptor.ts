/**
 * SSE Stream Interceptor — parses engine SSE stream for guardrail warnings
 * and logs metrics to the guardrail_metrics table.
 *
 * Wraps the upstream SSE stream, extracting warning fields from data chunks
 * while passing all data through transparently to the client.
 */

import { logGuardrailMetric, type GuardrailMetric } from "@/lib/guardrail-metrics";

interface WarningAccumulator {
  warnings: string[];
  startTime: number;
  brainId: string;
  userId?: string;
  jurisdiction?: string;
  queryHash?: string;
  logged: boolean;
}

function parseWarningsFromChunk(data: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  if (Array.isArray(data.warnings)) {
    for (const w of data.warnings) {
      if (typeof w === "string") warnings.push(w);
    }
  }
  // Also check for individual warning fields in final/done chunks
  if (typeof data.warning === "string") {
    warnings.push(data.warning);
  }
  return warnings;
}

function classifyWarnings(warnings: string[]): Partial<GuardrailMetric> {
  const tier0Passed = warnings.some((w) => w.includes("GUARDRAIL_PASSED"));
  const tier0Flagged = warnings.some((w) => w.includes("GUARDRAIL_FLAGGED"));
  const tier0Regenerated =
    warnings.some((w) => w.includes("GUARDRAIL_REGENERATION_PASSED")) ||
    warnings.some((w) => w.includes("GUARDRAIL_REGENERATION_STILL_FLAGGED"));
  const tier1Passed = warnings.some((w) => w.includes("CROSS_VERIFY_PASSED"));
  const tier1PassedWithNotes = warnings.some((w) =>
    w.includes("CROSS_VERIFY_PASSED_WITH_NOTES")
  );
  const tier1Flagged = warnings.some((w) => w.includes("CROSS_VERIFY_FLAGGED"));
  const tier1Regenerated = warnings.some((w) =>
    w.includes("CROSS_VERIFY_REGENERATION_DONE")
  );
  const tier1Skipped = warnings.some((w) => w.includes("CROSS_VERIFY_SKIPPED"));

  return {
    tier_0_passed: tier0Passed || (!tier0Flagged && !tier0Regenerated ? undefined : false),
    tier_0_flags: tier0Flagged
      ? warnings.filter((w) => w.includes("GUARDRAIL_FLAGGED")).map((w) => ({ type: w }))
      : [],
    tier_0_regenerated: tier0Regenerated,
    tier_1_passed: tier1Passed || tier1PassedWithNotes || (!tier1Flagged && !tier1Skipped ? undefined : false),
    tier_1_flags: tier1Flagged
      ? warnings.filter((w) => w.includes("CROSS_VERIFY_FLAGGED")).map((w) => ({ type: w }))
      : [],
    tier_1_regenerated: tier1Regenerated,
    tier_1_model: tier1Passed || tier1Flagged || tier1PassedWithNotes ? "x-ai:grok-4-3" : undefined,
  };
}

/**
 * Wrap a ReadableStream<Uint8Array> (SSE from engine) to intercept warnings
 * and log guardrail metrics when the stream ends.
 */
export function interceptGuardrailStream(
  upstream: ReadableStream<Uint8Array>,
  opts: {
    brainId: string;
    userId?: string;
    jurisdiction?: string;
    queryHash?: string;
  }
): ReadableStream<Uint8Array> {
  const acc: WarningAccumulator = {
    warnings: [],
    startTime: Date.now(),
    brainId: opts.brainId,
    userId: opts.userId,
    jurisdiction: opts.jurisdiction,
    queryHash: opts.queryHash,
    logged: false,
  };

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Log metrics
            if (!acc.logged) {
              acc.logged = true;
              const classified = classifyWarnings(acc.warnings);
              void logGuardrailMetric({
                brain_id: acc.brainId,
                user_id: acc.userId,
                query_hash: acc.queryHash,
                jurisdiction: acc.jurisdiction,
                latency_ms: Date.now() - acc.startTime,
                warnings: acc.warnings,
                ...classified,
              });
            }
            controller.close();
            return;
          }

          // Parse SSE for warnings
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
                const ws = parseWarningsFromChunk(parsed);
                acc.warnings.push(...ws);
                // Also check for done signal
                if (parsed.done === true || parsed.done === "true") {
                  if (!acc.logged) {
                    acc.logged = true;
                    const classified = classifyWarnings(acc.warnings);
                    void logGuardrailMetric({
                      brain_id: acc.brainId,
                      user_id: acc.userId,
                      query_hash: acc.queryHash,
                      jurisdiction: acc.jurisdiction,
                      latency_ms: Date.now() - acc.startTime,
                      warnings: acc.warnings,
                      ...classified,
                    });
                  }
                }
              } catch {
                // Not JSON, skip
              }
            }
          }

          // Pass through original data
          controller.enqueue(value);
        }
      } catch (err) {
        // Log what we have so far
        if (!acc.logged) {
          acc.logged = true;
          const classified = classifyWarnings(acc.warnings);
          void logGuardrailMetric({
            brain_id: acc.brainId,
            user_id: acc.userId,
            query_hash: acc.queryHash,
            jurisdiction: acc.jurisdiction,
            latency_ms: Date.now() - acc.startTime,
            warnings: acc.warnings,
            ...classified,
          });
        }
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    cancel() {
      // Stream cancelled by client — log what we have
      if (!acc.logged) {
        acc.logged = true;
        const classified = classifyWarnings(acc.warnings);
        void logGuardrailMetric({
          brain_id: acc.brainId,
          user_id: acc.userId,
          query_hash: acc.queryHash,
          jurisdiction: acc.jurisdiction,
          latency_ms: Date.now() - acc.startTime,
          warnings: acc.warnings,
          ...classified,
        });
      }
    },
  });
}

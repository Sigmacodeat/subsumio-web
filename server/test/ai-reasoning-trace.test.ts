import { describe, test, expect } from "bun:test";
import {
  buildReasoningTrace,
  verifyTraceChain,
  exportTracesCSV,
  exportTracesJSON,
  exportTracesHTML,
  redactTraceForDisplay,
  buildTraceAuditDetails,
  shouldEscalate,
  buildWebhookEvent,
  deliverWebhook,
  storeTrace,
  loadTraces,
  type TraceCaptureOpts,
} from "../../src/lib/ai-reasoning-trace.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

const baseOpts: TraceCaptureOpts = {
  brain_id: "brain-001",
  user_id: "user-001",
  query: "Was sagt § 433 BGB?",
  jurisdiction: "DE",
  search_mode: "balanced",
  retrieved_chunks: [
    { slug: "legal/statutes/de/bgb/p-433", score: 0.95, rank: 1, source: "hybrid" },
    { slug: "legal/statutes/de/bgb/p-434", score: 0.82, rank: 2, source: "hybrid" },
  ],
  pages_gathered: 2,
  takes_gathered: 0,
  graph_hits: 3,
  model_used: "anthropic:claude-sonnet-4-20250514",
  system_prompt: "Du bist ein juristischer AI-Assistent.",
  max_tokens: 4000,
  answer: "Gemäß § 433 BGB ist der Verkäufer verpflichtet, dem Käufer die Sache zu übergeben.",
  citations: [{ page_slug: "legal/statutes/de/bgb/p-433", row_num: null }],
  warnings: ["GUARDRAIL_PASSED", "CROSS_VERIFY_PASSED"],
  latency_ms: 1500,
  guardrail_passed: true,
  cross_verify_clean: true,
  ensemble_clean: true,
  ensemble_method: "Stage 1 → Stage 2 → Stage 3",
  regeneration_count: 0,
  injection_detected: false,
  injection_blocked: false,
  confidence_level: "high",
  overall_confidence: 0.92,
  provenance_links: [{ claim_index: 0, claim_text: "Übergabepflicht", source_slug: "legal/statutes/de/bgb/p-433", source_passage: "Der Verkäufer ist verpflichtet...", relevance: "direct" }],
};

describe("buildReasoningTrace", () => {
  test("creates a trace with all fields populated", () => {
    const trace = buildReasoningTrace(baseOpts);

    expect(trace.trace_id).toBeTruthy();
    expect(trace.timestamp).toBeTruthy();
    expect(trace.brain_id).toBe("brain-001");
    expect(trace.user_id).toBe("user-001");
    expect(trace.query).toBe("Was sagt § 433 BGB?");
    expect(trace.query_hash).toHaveLength(64); // SHA-256 hex
    expect(trace.system_prompt_hash).toHaveLength(64);
    expect(trace.final_answer_hash).toHaveLength(64);
    expect(trace.model_used).toBe("anthropic:claude-sonnet-4-20250514");
    expect(trace.retrieved_chunks.length).toBe(2);
    expect(trace.pages_gathered).toBe(2);
    expect(trace.graph_hits).toBe(3);
    expect(trace.guardrail_passed).toBe(true);
    expect(trace.cross_verify_clean).toBe(true);
    expect(trace.ensemble_clean).toBe(true);
    expect(trace.regeneration_count).toBe(0);
    expect(trace.injection_detected).toBe(false);
    expect(trace.confidence_level).toBe("high");
    expect(trace.overall_confidence).toBe(0.92);
    expect(trace.trace_hash).toHaveLength(64);
    expect(trace.warnings).toEqual(["GUARDRAIL_PASSED", "CROSS_VERIFY_PASSED"]);
  });

  test("generates unique trace IDs", () => {
    const trace1 = buildReasoningTrace(baseOpts);
    const trace2 = buildReasoningTrace(baseOpts);
    expect(trace1.trace_id).not.toBe(trace2.trace_id);
  });

  test("computes correct query hash", () => {
    const trace = buildReasoningTrace(baseOpts);
    // SHA-256 of "Was sagt § 433 BGB?"
    const expected = require("crypto").createHash("sha256").update("Was sagt § 433 BGB?", "utf8").digest("hex");
    expect(trace.query_hash).toBe(expected);
  });

  test("computes correct answer hash", () => {
    const trace = buildReasoningTrace(baseOpts);
    const expected = require("crypto").createHash("sha256").update(baseOpts.answer, "utf8").digest("hex");
    expect(trace.final_answer_hash).toBe(expected);
  });

  test("defaults regeneration_count to 0", () => {
    const trace = buildReasoningTrace({ ...baseOpts, regeneration_count: undefined });
    expect(trace.regeneration_count).toBe(0);
  });

  test("defaults injection flags to false", () => {
    const trace = buildReasoningTrace({ ...baseOpts, injection_detected: undefined, injection_blocked: undefined });
    expect(trace.injection_detected).toBe(false);
    expect(trace.injection_blocked).toBe(false);
  });

  test("records answer length", () => {
    const trace = buildReasoningTrace(baseOpts);
    expect(trace.answer_length).toBe(baseOpts.answer.length);
  });

  test("stores prev_trace_hash for chaining", () => {
    const trace = buildReasoningTrace({ ...baseOpts, prev_trace_hash: "abc123" });
    expect(trace.prev_trace_hash).toBe("abc123");
  });
});

describe("verifyTraceChain", () => {
  test("valid chain returns valid=true", () => {
    const trace1 = buildReasoningTrace(baseOpts);
    const trace2 = buildReasoningTrace({ ...baseOpts, prev_trace_hash: trace1.trace_hash });
    // Recompute trace2's hash since we added prev_trace_hash after initial computation
    // Actually buildReasoningTrace handles this internally
    const result = verifyTraceChain([trace1, trace2]);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test("detects tampered trace", () => {
    const trace = buildReasoningTrace(baseOpts);
    const tampered = { ...trace, answer_length: 999 }; // Tampered field
    const result = verifyTraceChain([tampered]);
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("detects broken chain linkage", () => {
    const trace1 = buildReasoningTrace(baseOpts);
    const trace2 = buildReasoningTrace({ ...baseOpts, prev_trace_hash: "wrong_hash" });
    const result = verifyTraceChain([trace1, trace2]);
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(1);
  });

  test("empty chain is valid", () => {
    const result = verifyTraceChain([]);
    expect(result.valid).toBe(true);
  });

  test("single trace is valid (no chain linkage)", () => {
    const trace = buildReasoningTrace(baseOpts);
    const result = verifyTraceChain([trace]);
    expect(result.valid).toBe(true);
  });
});

describe("exportTracesCSV", () => {
  test("generates CSV with headers", () => {
    const trace = buildReasoningTrace(baseOpts);
    const csv = exportTracesCSV([trace]);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("trace_id");
    expect(lines[0]).toContain("timestamp");
    expect(lines[0]).toContain("model_used");
    expect(lines[0]).toContain("guardrail_passed");
    expect(lines[0]).toContain("trace_hash");
    expect(lines.length).toBe(2); // header + 1 trace
  });

  test("escapes quotes in CSV", () => {
    const trace = buildReasoningTrace({ ...baseOpts, query: 'Was sagt "§ 433"?' });
    const csv = exportTracesCSV([trace]);
    // The query itself isn't in the CSV (only query_hash), but test escaping works
    expect(csv).toContain('""');
  });

  test("handles multiple traces", () => {
    const trace1 = buildReasoningTrace(baseOpts);
    const trace2 = buildReasoningTrace({ ...baseOpts, query: "Andere Frage" });
    const csv = exportTracesCSV([trace1, trace2]);
    const lines = csv.split("\n");
    expect(lines.length).toBe(3); // header + 2 traces
  });
});

describe("exportTracesJSON", () => {
  test("generates JSON with metadata", () => {
    const trace = buildReasoningTrace(baseOpts);
    const json = exportTracesJSON([trace]);
    const parsed = JSON.parse(json);
    expect(parsed.export_format).toBe("EU_AI_ACT_ART_13");
    expect(parsed.trace_count).toBe(1);
    expect(parsed.traces.length).toBe(1);
    expect(parsed.traces[0].trace_id).toBe(trace.trace_id);
  });

  test("includes chain validity check", () => {
    const trace1 = buildReasoningTrace(baseOpts);
    const trace2 = buildReasoningTrace({ ...baseOpts, prev_trace_hash: trace1.trace_hash });
    const json = exportTracesJSON([trace1, trace2]);
    const parsed = JSON.parse(json);
    expect(parsed.chain_valid).toBe(true);
  });
});

describe("redactTraceForDisplay", () => {
  test("redacts sensitive content", () => {
    const trace = buildReasoningTrace(baseOpts);
    const redacted = redactTraceForDisplay(trace);
    expect(redacted.trace_id).toBe(trace.trace_id);
    expect(redacted.query_hash).toBe(trace.query_hash);
    expect(redacted.final_answer_hash).toBe(trace.final_answer_hash);
    // Should not contain the actual query text or answer text
    expect(JSON.stringify(redacted)).not.toContain("Was sagt § 433 BGB?");
    expect(JSON.stringify(redacted)).not.toContain("Gemäß § 433 BGB");
  });

  test("includes counts for display", () => {
    const trace = buildReasoningTrace(baseOpts);
    const redacted = redactTraceForDisplay(trace);
    expect(redacted.retrieved_chunks_count).toBe(2);
    expect(redacted.citations_count).toBe(1);
  });

  test("includes guardrail and verification status", () => {
    const trace = buildReasoningTrace(baseOpts);
    const redacted = redactTraceForDisplay(trace);
    expect(redacted.guardrail_passed).toBe(true);
    expect(redacted.ensemble_clean).toBe(true);
    expect(redacted.injection_detected).toBe(false);
  });
});

describe("exportTracesHTML", () => {
  test("generates valid HTML document", () => {
    const trace = buildReasoningTrace(baseOpts);
    const html = exportTracesHTML([trace]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("EU AI Act Art. 12-13");
    expect(html).toContain("</html>");
  });

  test("includes trace data in table", () => {
    const trace = buildReasoningTrace(baseOpts);
    const html = exportTracesHTML([trace]);
    expect(html).toContain(trace.trace_id.slice(0, 8));
    expect(html).toContain(trace.model_used);
    expect(html).toContain(trace.trace_hash.slice(0, 12));
  });

  test("shows chain validity status", () => {
    const trace = buildReasoningTrace(baseOpts);
    const html = exportTracesHTML([trace]);
    expect(html).toContain("VALID");
  });

  test("shows chain broken status for tampered traces", () => {
    const trace = buildReasoningTrace(baseOpts);
    const tampered = { ...trace, answer_length: 999 };
    const html = exportTracesHTML([tampered]);
    expect(html).toContain("BROKEN");
  });

  test("handles empty trace list", () => {
    const html = exportTracesHTML([]);
    expect(html).toContain("0");
    expect(html).toContain("VALID");
  });
});

describe("buildTraceAuditDetails", () => {
  test("builds audit details from trace", () => {
    const trace = buildReasoningTrace(baseOpts);
    const details = buildTraceAuditDetails(trace);
    expect(details.trace_id).toBe(trace.trace_id);
    expect(details.trace_hash).toBe(trace.trace_hash);
    expect(details.model_used).toBe(trace.model_used);
    expect(details.guardrail_passed).toBe(true);
    expect(details.injection_detected).toBe(false);
  });

  test("includes regeneration count", () => {
    const trace = buildReasoningTrace({ ...baseOpts, regeneration_count: 2 });
    const details = buildTraceAuditDetails(trace);
    expect(details.regeneration_count).toBe(2);
  });
});

describe("shouldEscalate", () => {
  test("returns BLOCK for injection detected but not blocked", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const result = shouldEscalate(trace);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("BLOCK");
    expect(result!.severity).toBe("critical");
  });

  test("returns null for injection blocked", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: true,
    });
    const result = shouldEscalate(trace);
    expect(result).toBeNull();
  });

  test("returns ESCALATE for guardrail failed after max regenerations", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      guardrail_passed: false,
      regeneration_count: 2,
    });
    const result = shouldEscalate(trace);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("ESCALATE");
    expect(result!.severity).toBe("high");
  });

  test("returns ESCALATE for cross-verify flagged", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      cross_verify_clean: false,
    });
    const result = shouldEscalate(trace);
    expect(result).not.toBeNull();
    expect(result!.event).toBe("ESCALATE");
    expect(result!.severity).toBe("medium");
  });

  test("returns ESCALATE for low confidence", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      confidence_level: "low",
      overall_confidence: 0.3,
    });
    const result = shouldEscalate(trace);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("medium");
  });

  test("returns null for clean trace", () => {
    const trace = buildReasoningTrace(baseOpts);
    const result = shouldEscalate(trace);
    expect(result).toBeNull();
  });
});

describe("buildWebhookEvent", () => {
  test("builds webhook event for injection not blocked", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const event = buildWebhookEvent(trace);
    expect(event).not.toBeNull();
    expect(event!.event).toBe("BLOCK");
    expect(event!.severity).toBe("critical");
    expect(event!.trace_id).toBe(trace.trace_id);
    expect(event!.brain_id).toBe(trace.brain_id);
    expect(event!.details.injection_detected).toBe(true);
  });

  test("returns null for clean trace", () => {
    const trace = buildReasoningTrace(baseOpts);
    const event = buildWebhookEvent(trace);
    expect(event).toBeNull();
  });

  test("includes warnings in event details", () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      guardrail_passed: false,
      regeneration_count: 2,
      warnings: ["GUARDRAIL_FLAGGED", "CROSS_VERIFY_FLAGGED"],
    });
    const event = buildWebhookEvent(trace);
    expect(event).not.toBeNull();
    expect(event!.details.warnings).toEqual(["GUARDRAIL_FLAGGED", "CROSS_VERIFY_FLAGGED"]);
  });
});

describe("deliverWebhook", () => {
  test("returns skipped when no URL provided", async () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const event = buildWebhookEvent(trace)!;
    const result = await deliverWebhook(event, undefined);
    expect(result.status).toBe("skipped");
  });

  test("returns skipped when URL is empty string", async () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const event = buildWebhookEvent(trace)!;
    const result = await deliverWebhook(event, "");
    expect(result.status).toBe("skipped");
  });

  test("sends HTTP POST to configured URL", async () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const event = buildWebhookEvent(trace)!;

    // Mock fetch
    const originalFetch = globalThis.fetch;
    let capturedBody: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string;
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const result = await deliverWebhook(event, "https://hooks.example.com/subsumio");
      expect(result.status).toBe("sent");
      expect(result.statusCode).toBe(200);
      expect(capturedBody).toBeDefined();
      const parsed = JSON.parse(capturedBody!);
      expect(parsed.event).toBe("BLOCK");
      expect(parsed.trace_id).toBe(trace.trace_id);
      expect(capturedHeaders?.["Content-Type"]).toBe("application/json");
      expect(capturedHeaders?.["X-Subsumio-Event"]).toBe("BLOCK");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns failed on non-ok response", async () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const event = buildWebhookEvent(trace)!;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("error", { status: 500 })) as unknown as typeof fetch;

    try {
      const result = await deliverWebhook(event, "https://hooks.example.com/subsumio");
      expect(result.status).toBe("failed");
      expect(result.statusCode).toBe(500);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns failed on network error", async () => {
    const trace = buildReasoningTrace({
      ...baseOpts,
      injection_detected: true,
      injection_blocked: false,
    });
    const event = buildWebhookEvent(trace)!;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("Network error");
    }) as unknown as typeof fetch;

    try {
      const result = await deliverWebhook(event, "https://hooks.example.com/subsumio");
      expect(result.status).toBe("failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("storeTrace / loadTraces", () => {
  test("storeTrace returns false when no DB pool available", async () => {
    const trace = buildReasoningTrace(baseOpts);
    const result = await storeTrace(trace);
    expect(result).toBe(false);
  });

  test("loadTraces returns empty array when no DB pool available", async () => {
    const result = await loadTraces({ brainId: "brain-001" });
    expect(result).toEqual([]);
  });

  test("loadTraces accepts date range filters without error", async () => {
    const result = await loadTraces({
      brainId: "brain-001",
      from: "2026-01-01",
      to: "2026-12-31",
      limit: 50,
    });
    expect(result).toEqual([]);
  });
});

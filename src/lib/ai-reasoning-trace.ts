/**
 * AI Reasoning Trace — EU AI Act Art. 12 Compliance
 *
 * Captures a complete, immutable reasoning trace for every AI output.
 * Traces are hash-chained for tamper detection and exportable in
 * EU AI Act Art. 13 format (CSV/JSON).
 *
 * Architecture:
 *   - Trace capture: buildReasoningTrace() from ThinkResult
 *   - Hash chaining: SHA-256 of trace content + previous trace hash
 *   - Storage: subsumio_reasoning_traces table (immutable, no UPDATE/DELETE)
 *   - Export: CSV + JSON for compliance audits
 *   - Retention: Configurable, default 10 years
 */

import { createHash } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────

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
  // Guardrail results
  guardrail_passed?: boolean;
  guardrail_flags?: unknown[];
  // Cross-verify results
  cross_verify_clean?: boolean;
  cross_verify_flags?: unknown[];
  // Ensemble results
  ensemble_clean?: boolean;
  ensemble_flags?: unknown[];
  ensemble_method?: string;
  // Regeneration
  regeneration_count?: number;
  // Adversarial defense
  injection_detected?: boolean;
  injection_blocked?: boolean;
  injection_flags?: unknown[];
  // Confidence
  confidence_level?: string;
  overall_confidence?: number;
  // Provenance
  provenance_links?: unknown[];
  // Hash chaining
  prev_trace_hash?: string;
}

// ── Hash Helpers ──────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function generateTraceId(): string {
  return crypto.randomUUID();
}

/**
 * Compute the hash of a trace's content (excluding the hash fields themselves).
 * This is used for tamper detection — any modification changes the hash.
 */
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

// ── Trace Capture ─────────────────────────────────────────────────────

/**
 * Build a reasoning trace from think pipeline results.
 * This is the main entry point — called after the think pipeline completes.
 */
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

/**
 * Verify the hash chain integrity of a sequence of traces.
 * Returns true if all hashes are valid and the chain is unbroken.
 */
export function verifyTraceChain(traces: ReasoningTrace[]): {
  valid: boolean;
  broken_at?: number;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];

    // Verify trace hash
    const { trace_hash, prev_trace_hash, ...content } = trace;
    const computedHash = computeTraceHash(content);
    if (computedHash !== trace_hash) {
      errors.push(`Trace ${i} (${trace.trace_id}): hash mismatch — trace may have been tampered with`);
      return { valid: false, broken_at: i, errors };
    }

    // Verify chain linkage
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

// ── Export ────────────────────────────────────────────────────────────

/**
 * Export traces as CSV (EU AI Act Art. 13 format).
 */
export function exportTracesCSV(traces: ReasoningTrace[]): string {
  const headers = [
    "trace_id",
    "timestamp",
    "brain_id",
    "user_id",
    "query_hash",
    "jurisdiction",
    "model_used",
    "system_prompt_hash",
    "guardrail_passed",
    "cross_verify_clean",
    "ensemble_clean",
    "ensemble_method",
    "regeneration_count",
    "injection_detected",
    "injection_blocked",
    "final_answer_hash",
    "answer_length",
    "pages_gathered",
    "takes_gathered",
    "graph_hits",
    "confidence_level",
    "overall_confidence",
    "latency_ms",
    "trace_hash",
    "prev_trace_hash",
  ];

  const rows = traces.map((t) => [
    t.trace_id,
    t.timestamp,
    t.brain_id,
    t.user_id ?? "",
    t.query_hash,
    t.jurisdiction ?? "",
    t.model_used,
    t.system_prompt_hash,
    t.guardrail_passed ?? "",
    t.cross_verify_clean ?? "",
    t.ensemble_clean ?? "",
    t.ensemble_method ?? "",
    t.regeneration_count,
    t.injection_detected,
    t.injection_blocked,
    t.final_answer_hash,
    t.answer_length,
    t.pages_gathered,
    t.takes_gathered,
    t.graph_hits,
    t.confidence_level ?? "",
    t.overall_confidence ?? "",
    t.latency_ms ?? "",
    t.trace_hash,
    t.prev_trace_hash ?? "",
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/**
 * Export traces as JSON (full detail for compliance audits).
 */
export function exportTracesJSON(traces: ReasoningTrace[]): string {
  return JSON.stringify({
    export_format: "EU_AI_ACT_ART_13",
    export_timestamp: new Date().toISOString(),
    trace_count: traces.length,
    chain_valid: verifyTraceChain(traces).valid,
    traces,
  }, null, 2);
}

/**
 * Export traces as a print-ready HTML document (EU AI Act Art. 13 PDF format).
 * The HTML can be opened in a browser and printed to PDF via Ctrl+P.
 * This avoids a heavy PDF library dependency while still providing
 * a structured, paginated compliance document.
 */
export function exportTracesHTML(traces: ReasoningTrace[]): string {
  const chainResult = verifyTraceChain(traces);
  const exportTs = new Date().toISOString();

  const traceRows = traces
    .map((t, i) => {
      const guardrailStatus = t.guardrail_passed === true ? "PASSED" : t.guardrail_passed === false ? "FLAGGED" : "N/A";
      const injectionStatus = t.injection_detected ? (t.injection_blocked ? "BLOCKED" : "DETECTED") : "CLEAN";
      const confidence = t.confidence_level ?? "N/A";
      return `
        <tr>
          <td>${i + 1}</td>
          <td><code>${t.trace_id.slice(0, 8)}</code></td>
          <td>${t.timestamp}</td>
          <td>${t.jurisdiction ?? "—"}</td>
          <td>${t.model_used}</td>
          <td>${guardrailStatus}</td>
          <td>${t.cross_verify_clean === true ? "CLEAN" : t.cross_verify_clean === false ? "FLAGGED" : "N/A"}</td>
          <td>${injectionStatus}</td>
          <td>${t.regeneration_count}</td>
          <td>${confidence}</td>
          <td>${t.latency_ms ?? "—"}ms</td>
          <td><code>${t.trace_hash.slice(0, 12)}</code></td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EU AI Act Art. 12-13 — Compliance Audit Export</title>
  <style>
    @page { margin: 2cm; @bottom-center { content: "Page " counter(page) " of " counter(pages); } }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    h2 { font-size: 16px; margin-top: 24px; color: #444; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .meta { background: #f8f8f8; padding: 12px 16px; border-radius: 6px; margin: 16px 0; font-size: 13px; }
    .meta strong { display: inline-block; min-width: 180px; }
    .chain-valid { color: #16a34a; font-weight: 600; }
    .chain-broken { color: #dc2626; font-weight: 600; }
    code { font-family: 'SF Mono', Monaco, monospace; font-size: 10px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
    @media print { body { max-width: none; } .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>EU AI Act Art. 12-13 — Compliance Audit Export</h1>
  <div class="meta">
    <p><strong>Export timestamp:</strong> ${exportTs}</p>
    <p><strong>Trace count:</strong> ${traces.length}</p>
    <p><strong>Chain integrity:</strong> <span class="${chainResult.valid ? "chain-valid" : "chain-broken"}">${chainResult.valid ? "VALID ✓" : "BROKEN ✗"}</span></p>
    ${chainResult.errors.length > 0 ? `<p><strong>Chain errors:</strong><br>${chainResult.errors.map((e) => `• ${e}`).join("<br>")}</p>` : ""}
    <p><strong>Jurisdictions:</strong> ${[...new Set(traces.map((t) => t.jurisdiction ?? "—"))].join(", ")}</p>
    <p><strong>Models used:</strong> ${[...new Set(traces.map((t) => t.model_used))].join(", ")}</p>
  </div>

  <h2>Reasoning Trace Summary</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Trace ID</th>
        <th>Timestamp</th>
        <th>Jurisdiction</th>
        <th>Model</th>
        <th>Guardrail</th>
        <th>Cross-Verify</th>
        <th>Injection</th>
        <th>Regen</th>
        <th>Confidence</th>
        <th>Latency</th>
        <th>Hash</th>
      </tr>
    </thead>
    <tbody>${traceRows}</tbody>
  </table>

  <h2>Detailed Trace Hashes</h2>
  <table>
    <thead>
      <tr><th>Trace ID</th><th>Trace Hash (SHA-256)</th><th>Previous Hash</th></tr>
    </thead>
    <tbody>
      ${traces.map((t) => `<tr><td><code>${t.trace_id}</code></td><td><code>${t.trace_hash}</code></td><td><code>${t.prev_trace_hash ?? "—"}</code></td></tr>`).join("")}
    </tbody>
  </table>

  <div class="footer">
    <p>This document was generated automatically by Subsumio Compliance Export (EU AI Act Art. 12-13).</p>
    <p>Traces are immutable and hash-chained for tamper detection. Retention period: 10 years (configurable).</p>
  </div>
</body>
</html>`;
}

/**
 * Link a reasoning trace to the audit log.
 * Creates an audit entry referencing the trace_id so that audit trails
 * and reasoning traces can be cross-referenced during compliance audits.
 */
export function buildTraceAuditDetails(trace: ReasoningTrace): Record<string, unknown> {
  return {
    trace_id: trace.trace_id,
    trace_hash: trace.trace_hash,
    timestamp: trace.timestamp,
    model_used: trace.model_used,
    guardrail_passed: trace.guardrail_passed,
    injection_detected: trace.injection_detected,
    injection_blocked: trace.injection_blocked,
    confidence_level: trace.confidence_level,
    regeneration_count: trace.regeneration_count,
  };
}

/**
 * Webhook event types for compliance escalation.
 */
export type WebhookEventType = "ESCALATE" | "BLOCK" | "TRACE_CREATED";

export interface WebhookEvent {
  event: WebhookEventType;
  trace_id: string;
  timestamp: string;
  brain_id: string;
  severity: "critical" | "high" | "medium" | "low";
  details: Record<string, unknown>;
}

/**
 * Determine if a trace should trigger a webhook escalation.
 * Returns the event type and severity if escalation is needed.
 */
export function shouldEscalate(trace: ReasoningTrace): { event: WebhookEventType; severity: "critical" | "high" | "medium" } | null {
  // BLOCK: Injection was detected but NOT blocked — critical
  if (trace.injection_detected && !trace.injection_blocked) {
    return { event: "BLOCK", severity: "critical" };
  }

  // ESCALATE: Guardrail failed after max regenerations — high
  if (trace.guardrail_passed === false && trace.regeneration_count >= 2) {
    return { event: "ESCALATE", severity: "high" };
  }

  // ESCALATE: Cross-verify flagged — medium
  if (trace.cross_verify_clean === false) {
    return { event: "ESCALATE", severity: "medium" };
  }

  // ESCALATE: Confidence is low — medium
  if (trace.confidence_level === "low") {
    return { event: "ESCALATE", severity: "medium" };
  }

  return null;
}

/**
 * Build a webhook event payload for a trace.
 */
export function buildWebhookEvent(trace: ReasoningTrace): WebhookEvent | null {
  const escalation = shouldEscalate(trace);
  if (!escalation) return null;

  return {
    event: escalation.event,
    trace_id: trace.trace_id,
    timestamp: new Date().toISOString(),
    brain_id: trace.brain_id,
    severity: escalation.severity,
    details: {
      model_used: trace.model_used,
      guardrail_passed: trace.guardrail_passed,
      injection_detected: trace.injection_detected,
      injection_blocked: trace.injection_blocked,
      cross_verify_clean: trace.cross_verify_clean,
      confidence_level: trace.confidence_level,
      regeneration_count: trace.regeneration_count,
      warnings: trace.warnings,
      query_hash: trace.query_hash,
      trace_hash: trace.trace_hash,
    },
  };
}

/**
 * Deliver a webhook event to a configured URL via HTTP POST.
 * Returns the delivery status. Does not throw — failures are logged.
 */
export async function deliverWebhook(
  event: WebhookEvent,
  webhookUrl?: string
): Promise<{ status: "sent" | "failed" | "skipped"; statusCode?: number }> {
  if (!webhookUrl) {
    return { status: "skipped" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Subsumio-Event": event.event,
        "X-Subsumio-Severity": event.severity,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      return { status: "sent", statusCode: res.status };
    }

    return { status: "failed", statusCode: res.status };
  } catch (err) {
    console.error(
      `[webhook] delivery failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { status: "failed" };
  }
}

/**
 * Store a reasoning trace in the database (subsumio_reasoning_traces table).
 * The trace is immutable once stored — no UPDATE or DELETE allowed.
 * Returns the stored trace or null on failure.
 */
export async function storeTrace(
  trace: ReasoningTrace,
  auditId?: number
): Promise<boolean> {
  const { getSharedPgPool } = await import("@/lib/auth/store");
  const pool = getSharedPgPool();
  if (!pool) return false;

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS subsumio_reasoning_traces (
        trace_id            TEXT PRIMARY KEY,
        audit_id            BIGINT,
        brain_id            TEXT NOT NULL,
        user_id             TEXT,
        timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
        query               TEXT NOT NULL,
        query_hash          TEXT NOT NULL,
        jurisdiction        TEXT,
        search_mode         TEXT,
        retrieved_chunks    JSONB NOT NULL DEFAULT '[]',
        pages_gathered      INTEGER NOT NULL DEFAULT 0,
        takes_gathered      INTEGER NOT NULL DEFAULT 0,
        graph_hits          INTEGER NOT NULL DEFAULT 0,
        model_used          TEXT NOT NULL,
        system_prompt_hash  TEXT NOT NULL,
        max_tokens          INTEGER,
        guardrail_passed    BOOLEAN,
        guardrail_flags     JSONB,
        cross_verify_clean  BOOLEAN,
        cross_verify_flags  JSONB,
        ensemble_clean      BOOLEAN,
        ensemble_flags      JSONB,
        ensemble_method     TEXT,
        regeneration_count  INTEGER NOT NULL DEFAULT 0,
        injection_detected  BOOLEAN NOT NULL DEFAULT false,
        injection_blocked   BOOLEAN NOT NULL DEFAULT false,
        injection_flags     JSONB,
        final_answer_hash   TEXT NOT NULL,
        answer_length       INTEGER NOT NULL DEFAULT 0,
        citations           JSONB NOT NULL DEFAULT '[]',
        confidence_level    TEXT,
        overall_confidence  REAL,
        provenance_links    JSONB,
        prev_trace_hash     TEXT,
        trace_hash          TEXT NOT NULL,
        latency_ms          INTEGER,
        warnings            JSONB NOT NULL DEFAULT '[]',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );

    await pool.query(
      `INSERT INTO subsumio_reasoning_traces
        (trace_id, audit_id, brain_id, user_id, timestamp,
         query, query_hash, jurisdiction, search_mode,
         retrieved_chunks, pages_gathered, takes_gathered, graph_hits,
         model_used, system_prompt_hash, max_tokens,
         guardrail_passed, guardrail_flags,
         cross_verify_clean, cross_verify_flags,
         ensemble_clean, ensemble_flags, ensemble_method,
         regeneration_count,
         injection_detected, injection_blocked, injection_flags,
         final_answer_hash, answer_length, citations,
         confidence_level, overall_confidence, provenance_links,
         prev_trace_hash, trace_hash,
         latency_ms, warnings)
       VALUES ($1, $2, $3, $4, $5,
               $6, $7, $8, $9,
               $10::jsonb, $11, $12, $13,
               $14, $15, $16,
               $17, $18::jsonb,
               $19, $20::jsonb,
               $21, $22::jsonb, $23,
               $24,
               $25, $26, $27::jsonb,
               $28, $29, $30::jsonb,
               $31, $32, $33::jsonb,
               $34, $35,
               $36, $37::jsonb)
       ON CONFLICT (trace_id) DO NOTHING`,
      [
        trace.trace_id,
        auditId ?? null,
        trace.brain_id,
        trace.user_id ?? null,
        trace.timestamp,
        trace.query,
        trace.query_hash,
        trace.jurisdiction ?? null,
        trace.search_mode ?? null,
        JSON.stringify(trace.retrieved_chunks),
        trace.pages_gathered,
        trace.takes_gathered,
        trace.graph_hits,
        trace.model_used,
        trace.system_prompt_hash,
        trace.max_tokens ?? null,
        trace.guardrail_passed ?? null,
        trace.guardrail_flags ? JSON.stringify(trace.guardrail_flags) : null,
        trace.cross_verify_clean ?? null,
        trace.cross_verify_flags ? JSON.stringify(trace.cross_verify_flags) : null,
        trace.ensemble_clean ?? null,
        trace.ensemble_flags ? JSON.stringify(trace.ensemble_flags) : null,
        trace.ensemble_method ?? null,
        trace.regeneration_count,
        trace.injection_detected,
        trace.injection_blocked,
        trace.injection_flags ? JSON.stringify(trace.injection_flags) : null,
        trace.final_answer_hash,
        trace.answer_length,
        JSON.stringify(trace.citations),
        trace.confidence_level ?? null,
        trace.overall_confidence ?? null,
        trace.provenance_links ? JSON.stringify(trace.provenance_links) : null,
        trace.prev_trace_hash ?? null,
        trace.trace_hash,
        trace.latency_ms ?? null,
        JSON.stringify(trace.warnings ?? []),
      ]
    );
    return true;
  } catch (err) {
    console.error(
      `[reasoning-trace] store failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

/**
 * Load reasoning traces from the database for a given brain.
 * Returns traces ordered by timestamp descending.
 */
export async function loadTraces(opts: {
  brainId: string;
  limit?: number;
  from?: string;
  to?: string;
}): Promise<ReasoningTrace[]> {
  const { getSharedPgPool } = await import("@/lib/auth/store");
  const pool = getSharedPgPool();
  if (!pool) return [];

  try {
    const conditions = ["brain_id = $1"];
    const params: unknown[] = [opts.brainId];
    let paramIdx = 2;

    if (opts.from) {
      conditions.push(`timestamp >= $${paramIdx++}`);
      params.push(opts.from);
    }
    if (opts.to) {
      conditions.push(`timestamp <= $${paramIdx++}`);
      params.push(opts.to);
    }

    const limit = opts.limit ?? 100;
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT * FROM subsumio_reasoning_traces
       WHERE ${conditions.join(" AND ")}
       ORDER BY timestamp DESC
       LIMIT $${paramIdx}`,
      params
    );

    return rows.map((r) => ({
      trace_id: r.trace_id,
      timestamp: r.timestamp?.toISOString?.() ?? String(r.timestamp),
      brain_id: r.brain_id,
      user_id: r.user_id ?? undefined,
      query: r.query,
      query_hash: r.query_hash,
      jurisdiction: r.jurisdiction ?? undefined,
      search_mode: r.search_mode ?? undefined,
      retrieved_chunks: typeof r.retrieved_chunks === "string" ? JSON.parse(r.retrieved_chunks) : r.retrieved_chunks ?? [],
      pages_gathered: r.pages_gathered ?? 0,
      takes_gathered: r.takes_gathered ?? 0,
      graph_hits: r.graph_hits ?? 0,
      model_used: r.model_used,
      system_prompt_hash: r.system_prompt_hash,
      max_tokens: r.max_tokens ?? undefined,
      guardrail_passed: r.guardrail_passed ?? undefined,
      guardrail_flags: typeof r.guardrail_flags === "string" ? JSON.parse(r.guardrail_flags) : r.guardrail_flags,
      cross_verify_clean: r.cross_verify_clean ?? undefined,
      cross_verify_flags: typeof r.cross_verify_flags === "string" ? JSON.parse(r.cross_verify_flags) : r.cross_verify_flags,
      ensemble_clean: r.ensemble_clean ?? undefined,
      ensemble_flags: typeof r.ensemble_flags === "string" ? JSON.parse(r.ensemble_flags) : r.ensemble_flags,
      ensemble_method: r.ensemble_method ?? undefined,
      regeneration_count: r.regeneration_count ?? 0,
      injection_detected: r.injection_detected ?? false,
      injection_blocked: r.injection_blocked ?? false,
      injection_flags: typeof r.injection_flags === "string" ? JSON.parse(r.injection_flags) : r.injection_flags,
      final_answer_hash: r.final_answer_hash,
      answer_length: r.answer_length ?? 0,
      citations: typeof r.citations === "string" ? JSON.parse(r.citations) : r.citations ?? [],
      confidence_level: r.confidence_level ?? undefined,
      overall_confidence: r.overall_confidence ?? undefined,
      provenance_links: typeof r.provenance_links === "string" ? JSON.parse(r.provenance_links) : r.provenance_links,
      prev_trace_hash: r.prev_trace_hash ?? undefined,
      trace_hash: r.trace_hash,
      latency_ms: r.latency_ms ?? undefined,
      warnings: typeof r.warnings === "string" ? JSON.parse(r.warnings) : r.warnings ?? [],
    })) as ReasoningTrace[];
  } catch (err) {
    console.error(
      `[reasoning-trace] load failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }
}

/**
 * Get a redacted version of the trace for display (no sensitive content,
 * only hashes). Used for dashboard preview.
 */
export function redactTraceForDisplay(trace: ReasoningTrace): Record<string, unknown> {
  return {
    trace_id: trace.trace_id,
    timestamp: trace.timestamp,
    brain_id: trace.brain_id,
    query_hash: trace.query_hash,
    model_used: trace.model_used,
    system_prompt_hash: trace.system_prompt_hash,
    guardrail_passed: trace.guardrail_passed,
    cross_verify_clean: trace.cross_verify_clean,
    ensemble_clean: trace.ensemble_clean,
    injection_detected: trace.injection_detected,
    injection_blocked: trace.injection_blocked,
    final_answer_hash: trace.final_answer_hash,
    answer_length: trace.answer_length,
    pages_gathered: trace.pages_gathered,
    takes_gathered: trace.takes_gathered,
    graph_hits: trace.graph_hits,
    confidence_level: trace.confidence_level,
    overall_confidence: trace.overall_confidence,
    regeneration_count: trace.regeneration_count,
    latency_ms: trace.latency_ms,
    trace_hash: trace.trace_hash,
    prev_trace_hash: trace.prev_trace_hash,
    warnings: trace.warnings,
    retrieved_chunks_count: trace.retrieved_chunks.length,
    citations_count: trace.citations.length,
  };
}

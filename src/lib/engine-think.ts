/**
 * Typed server-side client for the engine's /api/think.
 *
 * The engine ALWAYS answers /api/think as an SSE stream (`{chunk}` events,
 * one final `{citations, gaps, final_answer?, …}` event, then `[DONE]`) and
 * reads the question from `query`. Several routes hand-rolled the call with
 * `{prompt}` and `res.json()` — the engine answered 400 / the JSON parse
 * threw, and the features silently produced empty results. Route every
 * server-side think call through here instead.
 */

import { ENGINE_URL, engineHeadersWithCaseJurisdiction } from "@/lib/engine";
import { consumeSSEStream } from "@/lib/sse-stream";
import { EU_ONLY_REFUSAL_MESSAGE, isEuOnlyRefusal } from "@/lib/eu-policy-refusal";

export interface EngineThinkRequest {
  /** The question / task. Sent as `query` — the only field the engine reads. */
  query: string;
  /** System-prompt instructions (persona, output format). */
  instructions?: string;
  mode?: "conservative" | "balanced" | "tokenmax";
  /** Retrieval profile (e.g. "deep_matter"); the engine picks its default when omitted. */
  queryMode?: string;
  caseSlug?: string;
  timeoutMs?: number;
}

export interface EngineThinkResult {
  answer: string;
  citations: unknown[];
  gaps: unknown[];
  warnings: string[];
  /** Verification replaced the streamed draft with `answer`. */
  revised: boolean;
}

export class EngineThinkError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "EngineThinkError";
  }
}

export async function engineThink(
  headers: Record<string, string>,
  req: EngineThinkRequest,
  fetchFn: typeof fetch = fetch
): Promise<EngineThinkResult> {
  // The matter's jurisdiction scopes the law corpus (AT case → AT law).
  const scoped = req.caseSlug
    ? await engineHeadersWithCaseJurisdiction(headers, req.caseSlug)
    : headers;
  const res = await fetchFn(`${ENGINE_URL}/api/think`, {
    method: "POST",
    headers: { ...scoped, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: req.query,
      ...(req.instructions ? { instructions: req.instructions } : {}),
      mode: req.mode ?? "balanced",
      ...(req.queryMode ? { query_mode: req.queryMode } : {}),
      ...(req.caseSlug ? { case_slug: req.caseSlug } : {}),
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    // "Nur EU": the refusal is the firm's policy, not an outage — say so.
    if (isEuOnlyRefusal(body)) throw new EngineThinkError(EU_ONLY_REFUSAL_MESSAGE, 403);
    throw new EngineThinkError(`engine think ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const out: EngineThinkResult = {
    answer: "",
    citations: [],
    gaps: [],
    warnings: [],
    revised: false,
  };
  let streamError: string | null = null;
  await consumeSSEStream(res.body, (data, parsed) => {
    if (data === "[DONE]" || !parsed) return;
    if (typeof parsed.chunk === "string") out.answer += parsed.chunk;
    if (typeof parsed.final_answer === "string" && parsed.final_answer) {
      out.answer = parsed.final_answer;
      out.revised = true;
    }
    if (Array.isArray(parsed.citations)) out.citations = parsed.citations;
    if (Array.isArray(parsed.gaps)) out.gaps = parsed.gaps;
    if (Array.isArray(parsed.warnings)) {
      out.warnings = parsed.warnings.filter((w): w is string => typeof w === "string");
    }
    if (typeof parsed.error === "string") streamError = parsed.error;
  });
  if (streamError && !out.answer.trim()) {
    throw new EngineThinkError(`engine think failed: ${streamError}`, 502);
  }
  return out;
}

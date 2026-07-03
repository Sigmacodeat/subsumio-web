/**
 * Shared utilities for the legal document analysis pipeline.
 *
 * Extracted from `src/app/api/legal/analyze/route.ts` to improve
 * testability and reduce the route file to an orchestration layer.
 */

/** Timeout for engine fetch calls (page reads, patches). */
export const ENGINE_FETCH_TIMEOUT = 300_000;

/** Timeout for auto-created deadline page POST (best-effort, non-blocking). */
export const DEADLINE_CREATE_TIMEOUT = 15_000;

/** Timeout for contradictions check (fire-and-forget). */
export const CONTRADICTIONS_TIMEOUT = 60_000;

/** Maximum document text length sent to the LLM (chars). */
export const MAX_ANALYSIS_CHARS = 80_000;

/** Maximum raw text input accepted from the client (chars). */
export const MAX_TEXT_INPUT = 512_000;

/**
 * Parse JSON from an LLM response that may be wrapped in markdown
 * code fences or contain trailing prose.
 *
 * Strategy:
 *   1. Strip ```json fences
 *   2. Try direct JSON.parse
 *   3. Fallback: extract first {...} block
 *   4. Return empty object on total failure
 */
export function safeParseJson(text: string): Record<string, unknown> {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    return {};
  }
}

/**
 * Build a minimal "no analysis" result with all required fields
 * so the frontend can render a consistent empty state.
 */
export function buildEmptyResult(reason: string): Record<string, unknown> {
  return {
    document_type: "unknown",
    type_confidence: 0,
    parties: [],
    deadlines: [],
    cited_statutes: [],
    risks: [],
    action_items: [],
    summary: reason,
    language: "de",
    privilege: {
      is_privileged: false,
      privilege_type: "none",
      privilege_basis: "Keine Analyse durchgeführt",
    },
  };
}

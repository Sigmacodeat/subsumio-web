/**
 * llm-util — shared building blocks for the engine-side legal modules
 * (document-review, summarize, memo, risk-analysis, contract-draft,
 * contract-redline, due-diligence).
 *
 * Every legal module follows the same shape that `analyze-document.ts`
 * established and proved:
 *   1. a dependency-injected LLM (`LegalLLM`) so tests run without an API key,
 *   2. structured JSON output parsed defensively,
 *   3. anti-hallucination grounding — any model claim that carries a verbatim
 *      `quote` is dropped unless that quote appears in the source text.
 *
 * This module centralizes those primitives so the seven modules don't each
 * re-implement them (the DRY bar CLAUDE.md asks for: one canonical helper,
 * derived consumers).
 */
import type { BrainEngine } from '../engine.ts';

/** Injected LLM call. Returns the model's raw text (expected to be JSON). */
export interface LegalLLM {
  (opts: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

/**
 * Build the default gateway-backed LLM adapter. Returns null when no chat
 * model is configured so the caller can surface a graceful "LLM unavailable"
 * result instead of throwing — same seam `analyzeDocument`/`runThink` use.
 */
export async function defaultLegalLLM(): Promise<LegalLLM | null> {
  const { isAvailable, chat } = await import('../ai/gateway.ts');
  if (!isAvailable('chat') && !isAvailable('expansion')) return null;
  return async ({ system, user, maxTokens }) => {
    const r = await chat({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: maxTokens ?? 4000,
    });
    return r.text;
  };
}

/** Load a page's text (compiled_truth) by slug, or null if the page is missing. */
export async function loadPageText(
  engine: BrainEngine,
  slug: string,
  opts: { sourceId?: string; sourceIds?: string[] } = {},
): Promise<string | null> {
  const page = await engine.getPage(slug, {
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
  });
  if (!page) return null;
  return String((page as { compiled_truth?: string }).compiled_truth ?? '');
}

export interface ResolveTextOpts {
  slug?: string;
  text?: string;
  sourceId?: string;
  sourceIds?: string[];
}

/**
 * Resolve the document text a module should analyze: prefer the explicit
 * `text` body field, otherwise load the brain page named by `slug`.
 * Returns `{ text: '' }` with a reason when nothing is resolvable.
 */
export async function resolveDocumentText(
  engine: BrainEngine,
  opts: ResolveTextOpts,
): Promise<{ text: string; sourceSlug?: string; notFound?: boolean }> {
  if (opts.text && opts.text.trim()) return { text: opts.text };
  if (opts.slug) {
    const loaded = await loadPageText(engine, opts.slug, {
      ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      ...(opts.sourceIds !== undefined ? { sourceIds: opts.sourceIds } : {}),
    });
    if (loaded === null) return { text: '', sourceSlug: opts.slug, notFound: true };
    return { text: loaded, sourceSlug: opts.slug };
  }
  return { text: '' };
}

/** Clip text to a char ceiling, returning a truncation warning when it bit. */
export function clipText(
  text: string,
  maxChars: number,
): { clipped: string; warning?: string } {
  if (text.length <= maxChars) return { clipped: text };
  return {
    clipped: text.slice(0, maxChars),
    warning: `DOCUMENT_TRUNCATED_FOR_ANALYSIS: ${text.length} → ${maxChars} chars`,
  };
}

/** Parse model output that should be a JSON object, tolerating code fences and prose. */
export function tryParseJSON(text: string): Record<string, unknown> | null {
  const stripped = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Whitespace-normalize for verbatim quote matching (model reflows line breaks). */
export function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Anti-hallucination gate, generalized from `analyze-document.groundIssues`.
 * Keeps only items whose extracted quote appears verbatim (whitespace-
 * normalized, ≥ 8 chars) in the document. Returns kept items + one warning
 * per drop. Items WITHOUT a quote requirement (quote === undefined) pass
 * through untouched — use `requireQuote` to enforce.
 */
export function groundQuotes<T>(
  items: T[],
  getQuote: (item: T) => string | undefined,
  documentText: string,
  opts: { label?: string; minQuoteLen?: number } = {},
): { grounded: T[]; warnings: string[] } {
  const haystack = normalizeForMatch(documentText);
  const minLen = opts.minQuoteLen ?? 8;
  const label = opts.label ?? 'ITEM';
  const grounded: T[] = [];
  const warnings: string[] = [];
  for (const it of items) {
    const q = normalizeForMatch(getQuote(it) ?? '');
    if (q.length >= minLen && haystack.includes(q)) {
      grounded.push(it);
    } else {
      warnings.push(`UNGROUNDED_${label}_DROPPED`);
    }
  }
  return { grounded, warnings };
}

/** Coerce an unknown into a bounded number in [min,max], or fallback. */
export function asScore(v: unknown, fallback = 0, min = 0, max = 100): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
const VALID_RISK = new Set<RiskLevel>(['low', 'medium', 'high', 'critical']);
export function asRiskLevel(v: unknown, fallback: RiskLevel = 'medium'): RiskLevel {
  return typeof v === 'string' && VALID_RISK.has(v as RiskLevel) ? (v as RiskLevel) : fallback;
}

/** Map a 0–100 score to a coarse risk level (shared scale across modules). */
export function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/** The single jurisdiction-label helper, so every prompt phrases it identically. */
export function jurisdictionLabel(j: string): string {
  switch (j) {
    case 'at':
      return 'Österreich (AT)';
    case 'de':
      return 'Deutschland (DE)';
    case 'ch':
      return 'Schweiz (CH)';
    default:
      return 'AT, DE oder CH (DACH-Raum)';
  }
}

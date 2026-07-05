/**
 * Client-safe subset of citation-gate.
 * Contains only pure functions and types — NO imports from node:fs/node:path.
 * Client code must import from here, not from citation-gate.ts (which pulls in
 * legal-grounding.ts → node:fs).
 */

import type { RawCitation, GroundedCitation } from "@/lib/types";

// ── Statute extraction ────────────────────────────────────────────────

/**
 * Regex to extract statute references from legal text.
 * Matches patterns like:
 *   § 433 BGB
 *   § 922 ABGB
 *   § 12 Abs. 3 ZPO
 *   §§ 433, 434 BGB
 *   § 1 StGB
 */
const STATUTE_RX = /§+\s*(\d+[a-z]?(?:\s*(?:Abs\.|Absatz)\s*\d+)?)\s+([A-Z][A-Za-zÄÖÜ]{1,10})/g;

/**
 * Extract statute citations from free-text answer.
 * Returns deduplicated RawCitation[] suitable for groundCitations().
 */
export function extractStatuteCitations(text: string): RawCitation[] {
  const citations: RawCitation[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = STATUTE_RX.exec(text)) !== null) {
    const paragraph = match[1].trim();
    const code = match[2].trim();
    const key = `${code}#${paragraph}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const start = Math.max(0, match.index - 60);
    const end = Math.min(text.length, match.index + match[0].length + 60);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();

    citations.push({
      code,
      paragraph: `§ ${paragraph}`,
      context,
    });
  }

  return citations;
}

// ── Grounding metadata ────────────────────────────────────────────────

export interface GroundingMetadata {
  citations_verified: number;
  citations_unverified: number;
  corpus_checked: boolean;
  grounded_citations: GroundedCitation[];
  analyzed_at: string;
  has_unverified: boolean;
  warning?: string;
}

// ── JSON response text extraction ─────────────────────────────────────

/**
 * Known top-level string fields in engine JSON responses that may contain
 * statute references requiring corpus grounding.
 */
const JSON_TEXT_FIELDS = [
  "answer",
  "summary",
  "memo",
  "analysis",
  "review",
  "text",
  "translated_text",
  "anonymized_text",
  "content",
  "conclusion",
  "recommendation",
  "report",
] as const;

/**
 * Known array fields whose items may contain text with statute references.
 */
const JSON_ARRAY_FIELDS = [
  "results",
  "risks",
  "issues",
  "findings",
  "items",
  "redlines",
  "obligations",
  "deadlines",
] as const;

/**
 * Text fields to look for inside array items.
 */
const ARRAY_ITEM_TEXT_FIELDS = [
  "text",
  "description",
  "reason",
  "legal_basis",
  "summary",
  "analysis",
  "content",
  "recommendation",
  "mitigation",
] as const;

/**
 * Extract all text from a JSON engine response that might contain statute
 * citations. Scans known top-level string fields and known array-of-object
 * fields, collecting text for grounding.
 */
export function extractTextFromJsonResponse(obj: Record<string, unknown>): string[] {
  const parts: string[] = [];

  for (const field of JSON_TEXT_FIELDS) {
    if (typeof obj[field] === "string") {
      const text = (obj[field] as string).trim();
      if (text) parts.push(text);
    }
  }

  for (const field of JSON_ARRAY_FIELDS) {
    if (!Array.isArray(obj[field])) continue;
    for (const item of obj[field] as Array<Record<string, unknown>>) {
      if (typeof item !== "object" || item === null) continue;
      for (const tf of ARRAY_ITEM_TEXT_FIELDS) {
        if (typeof item[tf] === "string") {
          const text = (item[tf] as string).trim();
          if (text) parts.push(text);
        }
      }
    }
  }

  return parts;
}

/**
 * Empty grounding metadata for error/fallback cases.
 */
export function emptyGroundingMetadata(): GroundingMetadata {
  return {
    citations_verified: 0,
    citations_unverified: 0,
    corpus_checked: false,
    grounded_citations: [],
    analyzed_at: new Date().toISOString(),
    has_unverified: false,
  };
}

import { groundCitations } from "@/lib/legal-grounding";
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
}

/**
 * Run corpus grounding on the answer text.
 * Extracts statute references, verifies them against the law corpus,
 * and returns structured grounding metadata.
 */
export async function groundAnswerCitations(answerText: string): Promise<GroundingMetadata> {
  const rawCitations = extractStatuteCitations(answerText);
  const grounded = await groundCitations(rawCitations);
  const verified = grounded.filter((c) => c.verified).length;
  const unverified = grounded.filter((c) => !c.verified).length;

  return {
    citations_verified: verified,
    citations_unverified: unverified,
    corpus_checked: true,
    grounded_citations: grounded,
    analyzed_at: new Date().toISOString(),
  };
}

// ── JSON response grounding ────────────────────────────────────────────

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
 * Ground statute citations from a structured JSON engine response.
 * Extracts text from known response fields, verifies citations against the
 * law corpus, and returns grounding metadata suitable for injection as
 * `_grounding` on the response.
 */
export async function groundJsonResponse(obj: Record<string, unknown>): Promise<GroundingMetadata> {
  const textParts = extractTextFromJsonResponse(obj);
  if (textParts.length === 0) {
    return {
      citations_verified: 0,
      citations_unverified: 0,
      corpus_checked: false,
      grounded_citations: [],
      analyzed_at: new Date().toISOString(),
    };
  }
  return groundAnswerCitations(textParts.join(" "));
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
  };
}

// ── SSE stream transformation ─────────────────────────────────────────

/**
 * Ground statute citations from a structured contract-redline result.
 * Extracts statute references from `legal_basis`, `reason`, and `summary`
 * fields of each redline, verifies them against the law corpus, and returns
 * grounding metadata suitable for injection into the response.
 */
export async function groundRedlineCitations(
  redlines: Array<{ legal_basis?: string; reason?: string }>,
  summary?: string
): Promise<GroundingMetadata> {
  const textParts: string[] = [];
  if (typeof summary === "string" && summary.trim()) {
    textParts.push(summary);
  }
  for (const r of redlines) {
    if (typeof r.legal_basis === "string" && r.legal_basis.trim()) {
      textParts.push(r.legal_basis);
    }
    if (typeof r.reason === "string" && r.reason.trim()) {
      textParts.push(r.reason);
    }
  }
  const combinedText = textParts.join(" ");
  return groundAnswerCitations(combinedText);
}

/**
 * Intercept the engine's SSE stream, collect answer text from chunk events,
 * and when the final citations event arrives, inject grounding metadata.
 *
 * Stream format from engine:
 *   data: {"chunk":"text"}
 *   data: {"citations":[...],"gaps":[...]}
 *   data: [DONE]
 *
 * After transformation:
 *   data: {"chunk":"text"}
 *   data: {"citations":[...],"gaps":[...],"grounding":{...}}
 *   data: [DONE]
 */
export function createCitationGateStream(
  upstream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let answerText = "";
  let buffer = "";

  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        // Split on SSE event boundaries (\n\n)
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const lines = event.split("\n");
          const newLines: string[] = [];

          for (const line of lines) {
            if (!line.startsWith("data: ")) {
              newLines.push(line);
              continue;
            }
            const data = line.slice(6);

            if (data === "[DONE]") {
              newLines.push(line);
              continue;
            }

            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;

              if (typeof parsed.chunk === "string") {
                answerText += parsed.chunk;
              }

              if (parsed.citations !== undefined) {
                // Enrich each source citation with passage coordinates if the
                // engine included them (page_number, char_offset_start/end,
                // passage_text). These pass through untouched — we just make
                // the contract explicit so the frontend can render "Seite X".
                if (Array.isArray(parsed.citations)) {
                  parsed.citations = (
                    parsed.citations as Array<Record<string, unknown>>
                  ).map((c) => ({
                    slug: c.slug,
                    title: c.title,
                    score: c.score,
                    // Passage-level coordinates from engine chunk metadata
                    page_number: c.page_number ?? c.metadata_page ?? undefined,
                    char_offset_start: c.char_offset_start ?? undefined,
                    char_offset_end: c.char_offset_end ?? undefined,
                    passage_text: c.passage_text ?? c.text ?? c.excerpt ?? undefined,
                    // Keep any other fields the engine may add in future
                    ...Object.fromEntries(
                      Object.entries(c).filter(
                        ([k]) =>
                          ![
                            "slug","title","score","page_number","metadata_page",
                            "char_offset_start","char_offset_end","passage_text","text","excerpt",
                          ].includes(k)
                      )
                    ),
                  }));
                }
                try {
                  const grounding = await groundAnswerCitations(answerText);
                  parsed.grounding = grounding;
                } catch (err) {
                  console.error(
                    "[citation-gate] grounding failed:",
                    err instanceof Error ? err.message : String(err)
                  );
                  parsed.grounding = {
                    citations_verified: 0,
                    citations_unverified: 0,
                    corpus_checked: false,
                    grounded_citations: [],
                    analyzed_at: new Date().toISOString(),
                  };
                }
                newLines.push(`data: ${JSON.stringify(parsed)}`);
                continue;
              }

              newLines.push(`data: ${JSON.stringify(parsed)}`);
            } catch {
              newLines.push(line);
            }
          }

          controller.enqueue(encoder.encode(newLines.join("\n") + "\n\n"));
        }
      },

      flush(controller) {
        // Flush any remaining buffered data
        if (buffer.length > 0) {
          controller.enqueue(encoder.encode(buffer));
        }
      },
    })
  );
}

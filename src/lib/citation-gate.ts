/**
 * Server-only citation gate.
 * This file imports legal-grounding.ts which uses node:fs/node:path.
 * Client code MUST NOT import from this file — use citation-gate-client.ts instead.
 */

import { ASSISTANT_UNAVAILABLE_MESSAGE, isDegradedAnswer } from "./engine-degraded";
import {
  groundCitations,
  groundLiteratureCitations,
  inferAnswerJurisdiction,
  NOT_CHECKED_REASON,
  type GroundingJurisdiction,
} from "@/lib/legal-grounding";
import type { GroundedCitation } from "@/lib/types";
import { extractCaseCitations } from "@/lib/case-citations";
import { groundCaseCitations } from "@/lib/case-grounding";

// Re-export client-safe functions and types for server-side convenience
export {
  extractStatuteCitations,
  extractLiteratureCitations,
  extractTextFromJsonResponse,
  emptyGroundingMetadata,
  type GroundingMetadata,
} from "@/lib/citation-gate-client";

import {
  extractStatuteCitations,
  extractLiteratureCitations,
  extractTextFromJsonResponse,
  emptyGroundingMetadata,
} from "@/lib/citation-gate-client";
import type { GroundingMetadata } from "@/lib/citation-gate-client";

/**
 * Run corpus grounding on the answer text.
 * Extracts statute references AND literature/materialien references
 * (BT-Drs., Onlinekommentar, publisher commentaries), verifies them against
 * the law corpus, and returns structured grounding metadata. Publisher
 * citations (Grüneberg etc.) always count as unverified — we hold no license
 * for their text, and the answer must carry the warning instead of silently
 * presenting them as grounded.
 */
export async function groundAnswerCitations(
  answerText: string,
  opts: {
    /** Forces the jurisdiction (caller knows it). */
    jurisdiction?: GroundingJurisdiction | null;
    /** Used only when the answer text itself is not decisive (e.g. the user's profile). */
    fallbackJurisdiction?: GroundingJurisdiction | null;
  } = {}
): Promise<GroundingMetadata> {
  const rawCitations = extractStatuteCitations(answerText);
  const rawLiterature = extractLiteratureCitations(answerText);
  const jurisdiction =
    opts.jurisdiction ?? inferAnswerJurisdiction(answerText, opts.fallbackJurisdiction);
  const [statuteGrounded, literatureGrounded, caseGrounded] = await Promise.all([
    groundCitations(rawCitations, { jurisdiction }),
    groundLiteratureCitations(rawLiterature),
    groundCaseCitations(extractCaseCitations(answerText)),
  ]);
  const grounded = [...statuteGrounded, ...literatureGrounded, ...caseGrounded];
  const verified = grounded.filter((c) => c.verified).length;
  const unverified = grounded.filter((c) => !c.verified).length;
  const hasUnverified = unverified > 0;

  return {
    citations_verified: verified,
    citations_unverified: unverified,
    corpus_checked: true,
    grounded_citations: grounded,
    analyzed_at: new Date().toISOString(),
    has_unverified: hasUnverified,
    warning: hasUnverified ? unverifiedWarning(grounded, unverified) : undefined,
  };
}

/** The warning names citations skipped by the check limit separately. */
function unverifiedWarning(grounded: GroundedCitation[], unverified: number): string {
  const notChecked = grounded.filter((c) => c.unverifiable_reason === NOT_CHECKED_REASON).length;
  const base = `${unverified} Zitat(e) konnten nicht im Gesetzescorpus verifiziert werden — bitte manuell prüfen.`;
  return notChecked > 0 ? `${base} Davon ${notChecked} wegen des Prüflimits nicht geprüft.` : base;
}

/** Jurisdiction hint for the gate wrappers: the user's profile, used when the text is not decisive. */
export interface GateJurisdictionOpts {
  fallbackJurisdiction?: GroundingJurisdiction | null;
}

// ── JSON response grounding ────────────────────────────────────────────

/**
 * Ground statute citations from a structured JSON engine response.
 * Extracts text from known response fields, verifies citations against the
 * law corpus, and returns grounding metadata suitable for injection as
 * `_grounding` on the response.
 */
export async function groundJsonResponse(
  obj: Record<string, unknown>,
  opts: GateJurisdictionOpts = {}
): Promise<GroundingMetadata> {
  const textParts = extractTextFromJsonResponse(obj);
  if (textParts.length === 0) {
    return emptyGroundingMetadata();
  }
  return groundAnswerCitations(textParts.join(" "), opts);
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
  summary?: string,
  opts: GateJurisdictionOpts = {}
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
  return groundAnswerCitations(combinedText, opts);
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
  upstream: ReadableStream<Uint8Array>,
  opts: GateJurisdictionOpts = {}
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
                // Engine diagnostics ("(no LLM available — …)") never reach the lawyer.
                if (answerText === "" && isDegradedAnswer(parsed.chunk)) {
                  parsed.chunk = ASSISTANT_UNAVAILABLE_MESSAGE;
                  parsed.degraded = true;
                }
                answerText += parsed.chunk;
              }

              // The engine replaced the streamed draft after verification —
              // ground the text the lawyer will actually read.
              if (typeof parsed.final_answer === "string" && parsed.final_answer) {
                answerText = parsed.final_answer;
              }

              if (parsed.citations !== undefined) {
                // Enrich each source citation with passage coordinates if the
                // engine included them (page_number, char_offset_start/end,
                // passage_text). These pass through untouched — we just make
                // the contract explicit so the frontend can render "Seite X".
                if (Array.isArray(parsed.citations)) {
                  parsed.citations = (parsed.citations as Array<Record<string, unknown>>).map(
                    (c) => ({
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
                              "slug",
                              "title",
                              "score",
                              "page_number",
                              "metadata_page",
                              "char_offset_start",
                              "char_offset_end",
                              "passage_text",
                              "text",
                              "excerpt",
                            ].includes(k)
                        )
                      ),
                    })
                  );
                }
                try {
                  const grounding = await groundAnswerCitations(answerText, opts);
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
                    has_unverified: false,
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

import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { apiError } from "@/lib/api-response";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { groundCitations } from "@/lib/legal-grounding";
import { searchJudgements, type JudgementHit } from "@/lib/judgements";
import type { RawCitation } from "@/lib/types";

export const maxDuration = 120;

// ── Zod validation ────────────────────────────────────────────────────
const analyzeSchema = z
  .object({
    document_slug: z.string().optional(),
    text: z.string().max(512_000).optional(),
    jurisdiction: z.string().optional(),
    brain_id: z.string().optional(),
  })
  .passthrough();

function safeParseJson(text: string): Record<string, unknown> {
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

function buildEmptyResult(reason: string): Record<string, unknown> {
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
  };
}

function buildAnalysisPrompt(text: string, jurisdiction: string): string {
  const jurHint =
    jurisdiction === "all"
      ? "AT (\u00d6sterreich), DE (Deutschland) oder CH (Schweiz)"
      : jurisdiction.toUpperCase();

  // P0-SEC-001: the document text is user-controlled and is interpolated into
  // the LLM prompt below. Strip prompt-injection patterns and control chars
  // before embedding it between the document delimiters.
  const safeText = sanitizeUserInput(text);

  return `Du bist ein \u00f6sterreichischer/deutscher Rechtsexperte. Analysiere das folgende Rechtsdokument.

KRITISCHE REGEL: Du darfst KEINE Gesetzesnormen erfinden oder raten. Nenne AUSSCHLIESSLICH \u00a7-Paragraphen, die EXPLIZIT im Dokument genannt werden oder sich zwingend logisch aus dem Dokumenttyp ergeben (Kaufvertrag \u2192 \u00a7 433 BGB, Gew\u00e4hrleistung \u2192 \u00a7 922 ABGB, etc.).

Antworte AUSSCHLIESSLICH als g\u00fcltiges JSON ohne Markdown-Codeblock, keine anderen Zeichen au\u00dferhalb des JSON.

Dokument:
---
${safeText}
---

Rechtsordnung: ${jurHint}

Extrahiere:
1. document_type: Kaufvertrag | Mietvertrag | Arbeitsvertrag | Gerichtsurteil | Schriftsatz | Mahnschreiben | Anwaltsschreiben | Rechnung | Gesetzesentwurf | Korrespondenz | sonstiges
2. type_confidence: 0.0\u20131.0 (wie sicher bist du beim document_type)
3. parties: Vollst\u00e4ndige Namen der Beteiligten (Klient, Gegner, Gericht, Beh\u00f6rde)
4. deadlines: Fristen und Daten aus dem Dokument
5. cited_statutes: Nur \u00a7\u00a7 die im Dokument stehen ODER zwingend anwendbar sind
6. risks: Konkrete rechtliche Risiken mit Schweregrad
7. action_items: N\u00e4chste konkrete Schritte f\u00fcr den Anwalt
8. summary: 2-3 pr\u00e4zise S\u00e4tze
9. language: de | en | other

Hinweis: Nach deiner Analyse wird automatisch nach relevanten Gerichtsentscheidungen (OGH, BGH, BFH, EuGH) gesucht. Deine zitierten Normen und Risiko-Beschreibungen werden als Suchkriterien verwendet — formuliere sie präzise.

Antworte JETZT mit reinem JSON:
{
  "document_type": "string",
  "type_confidence": 0.0,
  "parties": [{"name":"string","role":"Klient|Gegner|Gericht|Beh\u00f6rde|Zeuge|sonstige"}],
  "deadlines": [{"label":"string","date":"string","urgency":"critical|normal","source":"exact quote from document"}],
  "cited_statutes": [{"code":"string","paragraph":"string","context":"why this statute applies"}],
  "risks": [{"severity":"high|medium|low","description":"string","mitigation":"string"}],
  "action_items": ["string"],
  "summary": "string",
  "language": "string"
}`;
}

function encodeSlugPath(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

// ── Route handler ─────────────────────────────────────────────────────

export const POST = createHandler(
  {
    action: "legal.document_review",
    rateTier: "heavy",
    quota: "queries",
    body: analyzeSchema,
    maxDuration: 120,
  },
  async (ctx, body, _query, _req) => {
    const isInternal = ctx.brainId === "internal";
    let engineHeaders: Record<string, string> = ctx.headers;

    const documentSlug = typeof body.document_slug === "string" ? body.document_slug.trim() : "";
    const jurisdiction =
      typeof body.jurisdiction === "string" ? body.jurisdiction.toLowerCase() : "all";

    // Only internal service callers may specify a brain_id; authenticated user
    // sessions always use the server-resolved brainId from engineContext to
    // prevent IDOR (cross-tenant brain access).
    if (isInternal) {
      const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
      if (brainId) {
        engineHeaders = { ...engineHeaders, "x-subsumio-source": brainId };
      }
    }

    // 1. Fetch document text from Brain engine
    const warnings: string[] = [];
    let text = "";
    let documentCaseSlug: string | undefined;
    if (documentSlug) {
      try {
        const pageRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(documentSlug)}`, {
          headers: engineHeaders,
        signal: AbortSignal.timeout(300_000),
        });
        if (pageRes.ok) {
          const page = (await pageRes.json()) as {
            content?: string;
            title?: string;
            frontmatter?: Record<string, unknown>;
          };
          text = [page.title, page.content].filter(Boolean).join("\n\n");
          // P0-2: Remember the case_slug so we can write back suggested deadlines
          documentCaseSlug =
            typeof page.frontmatter?.case_slug === "string"
              ? page.frontmatter.case_slug
              : undefined;
        } else {
          console.error(`[analyze] page fetch for ${documentSlug} returned ${pageRes.status}`);
          warnings.push("document_fetch_failed");
        }
      } catch (err) {
        console.error(
          `[analyze] page fetch for ${documentSlug} failed:`,
          err instanceof Error ? err.message : String(err)
        );
        warnings.push("document_fetch_failed");
      }
    }

    if (!text && typeof body.text === "string") {
      text = body.text;
    }

    if (!text.trim()) {
      return apiError("document_not_found_or_empty", "Document not found or empty", 404);
    }

    // 2. Truncate to ~80k chars
    const MAX_CHARS = 80_000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "\n\n[... document truncated for analysis]";
    }

    // 3. AI analysis via engine /api/think
    let parsed: Record<string, unknown>;
    try {
      const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...engineHeaders },
        body: JSON.stringify({
          prompt: buildAnalysisPrompt(text, jurisdiction),
          mode: "json",
          max_tokens: 4000,
        signal: AbortSignal.timeout(300_000),
        }),
      });

      if (!thinkRes.ok) {
        throw new Error(`Engine think ${thinkRes.status}`);
      }

      const thinkData = (await thinkRes.json()) as { answer?: string };
      parsed = safeParseJson(thinkData.answer || "{}");
    } catch (err) {
      console.error("[analyze] AI step failed:", err instanceof Error ? err.message : String(err));
      const empty = buildEmptyResult("Analyse fehlgeschlagen \u2014 Engine nicht verf\u00fcgbar.");
      empty._warnings = [...warnings, "ai_analysis_failed"];
      empty._degraded = true;
      return Response.json(empty, { status: 502 });
    }

    // 4. Ground cited_statutes against actual corpus (anti-hallucination)
    const rawCitations = Array.isArray(parsed.cited_statutes)
      ? (parsed.cited_statutes as RawCitation[])
      : [];

    const groundedCitations = await groundCitations(rawCitations);
    parsed.cited_statutes = groundedCitations;

    const verified = groundedCitations.filter((c) => c.verified).length;
    const unverified = groundedCitations.filter((c) => !c.verified).length;
    parsed._grounding = {
      citations_verified: verified,
      citations_unverified: unverified,
      corpus_checked: true,
      analyzed_at: new Date().toISOString(),
    };

    // 5. Auto-search for relevant court decisions (precedent suggestions)
    const suggestedPrecedents = await findRelevantPrecedents(parsed, jurisdiction);
    if (suggestedPrecedents.length > 0) {
      parsed.suggested_precedents = suggestedPrecedents;
    }

    // 6. Store analysis results (best-effort, non-blocking)
    // P0-3: Stamp document_type into the document's frontmatter (not just meta)
    // P0-2: Write suggested_deadlines into the CASE frontmatter so the
    //       deadline-reminder cron and the UI can pick them up.
    if (documentSlug) {
      void (async () => {
        try {
          const docType =
            typeof parsed.document_type === "string" ? parsed.document_type : undefined;
          const docPatch: Record<string, unknown> = {
            meta: {
              auto_analysis: parsed,
              analyzed_at: new Date().toISOString(),
            },
            // merge:true is critical — without it the engine may replace the
            // entire frontmatter and wipe case_slug/assignment_status/extraction
            // metadata on the document, detaching it from its case.
            merge: true,
          };
          if (docType && docType !== "unknown") {
            docPatch.frontmatter = { document_type: docType };
          }
          await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(documentSlug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...engineHeaders },
            body: JSON.stringify(docPatch),
          signal: AbortSignal.timeout(300_000),
          });
        } catch (err) {
          console.error(
            `[analyze] failed to persist analysis for ${documentSlug}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      })();
    }

    // P0-2: Write suggested deadlines + parties to the case frontmatter
    if (documentCaseSlug) {
      void (async () => {
        try {
          const extractedDeadlines = Array.isArray(parsed.deadlines)
            ? (parsed.deadlines as Array<Record<string, unknown>>)
            : [];
          const extractedParties = Array.isArray(parsed.parties)
            ? (parsed.parties as Array<Record<string, unknown>>)
            : [];

          if (extractedDeadlines.length === 0 && extractedParties.length === 0) return;

          const encodedCaseSlug = documentCaseSlug.split("/").map(encodeURIComponent).join("/");
          const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodedCaseSlug}`, {
            headers: engineHeaders,
          signal: AbortSignal.timeout(300_000),
          });
          if (!caseRes.ok) return;
          const casePage = (await caseRes.json()) as {
            frontmatter?: Record<string, unknown>;
          };
          const caseFm = (casePage.frontmatter ?? {}) as Record<string, unknown>;

          // Build suggested deadlines with source provenance — deduplicate by title+due_date
          const existingDlKeys = new Set(
            (Array.isArray(caseFm.suggested_deadlines) ? caseFm.suggested_deadlines : []).map(
              (sd) => {
                const e = sd as Record<string, unknown>;
                return `${String(e.title ?? "")}|${String(e.due_date ?? "")}`;
              }
            )
          );
          const suggestedDeadlines = extractedDeadlines
            .map((d) => ({
              title: String(d.label ?? "Erkannte Frist"),
              due_date: String(d.date ?? ""),
              urgency: String(d.urgency ?? "normal"),
              source: `KI-Analyse: ${documentSlug}`,
              source_quote: String(d.source ?? ""),
              confirmed: false,
            }))
            .filter((sd) => {
              const key = `${sd.title}|${sd.due_date}`;
              if (existingDlKeys.has(key)) return false;
              existingDlKeys.add(key);
              return true;
            });

          // Build suggested parties — deduplicate by name+role
          const existingPartyKeys = new Set(
            (Array.isArray(caseFm.suggested_parties) ? caseFm.suggested_parties : []).map((sp) => {
              const e = sp as Record<string, unknown>;
              return `${String(e.name ?? "")}|${String(e.role ?? "")}`;
            })
          );
          const suggestedParties = extractedParties
            .map((p) => ({
              name: String(p.name ?? ""),
              role: String(p.role ?? "sonstige"),
              source: `KI-Analyse: ${documentSlug}`,
              confirmed: false,
            }))
            .filter((sp) => {
              const key = `${sp.name}|${sp.role}`;
              if (existingPartyKeys.has(key)) return false;
              existingPartyKeys.add(key);
              return true;
            });

          // C2 FIX: If-Match retry loop — re-fetch version on 409 conflict
          // to prevent lost writeback when case was concurrently modified.
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const retryCaseRes =
                attempt === 0
                  ? caseRes
                  : await fetch(`${ENGINE_URL}/api/pages/${encodedCaseSlug}`, {
                      headers: engineHeaders,
                    signal: AbortSignal.timeout(300_000),
                    });
              if (!retryCaseRes.ok) break;
              const retryCasePage =
                attempt === 0
                  ? casePage
                  : ((await retryCaseRes.json()) as { frontmatter?: Record<string, unknown> });
              const retryFm = (retryCasePage.frontmatter ?? {}) as Record<string, unknown>;
              const retryVersion = (retryFm.version as number | undefined) ?? 0;

              // Rebuild patchBody with fresh frontmatter + version
              const retryPatchBody: Record<string, unknown> = {
                frontmatter: {
                  ...retryFm,
                  ...(suggestedDeadlines.length > 0
                    ? {
                        suggested_deadlines: [
                          ...(Array.isArray(retryFm.suggested_deadlines)
                            ? retryFm.suggested_deadlines
                            : []),
                          ...suggestedDeadlines,
                        ],
                      }
                    : {}),
                  ...(suggestedParties.length > 0
                    ? {
                        suggested_parties: [
                          ...(Array.isArray(retryFm.suggested_parties)
                            ? retryFm.suggested_parties
                            : []),
                          ...suggestedParties,
                        ],
                      }
                    : {}),
                },
                merge: true,
              };

              const patchRes = await fetch(`${ENGINE_URL}/api/pages/${encodedCaseSlug}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  "If-Match": String(retryVersion),
                  ...engineHeaders,
                },
                body: JSON.stringify(retryPatchBody),
              signal: AbortSignal.timeout(300_000),
              });
              if (patchRes.status === 409 && attempt < 2) continue;
              break;
            } catch {
              break;
            }
          }
        } catch (err) {
          console.error(
            `[analyze] failed to write suggested deadlines to case ${documentCaseSlug}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      })();
    }

    if (warnings.length > 0) {
      parsed._warnings = warnings;
    }

    return Response.json(parsed);
  }
);

// ── Precedent discovery ───────────────────────────────────────────────

interface SuggestedPrecedent {
  id: string;
  title: string;
  court: string;
  date: string;
  case_number: string;
  ecli: string;
  legal_area: string;
  url: string;
  snippet: string;
  source: string;
  relevance_reason: string;
}

/**
 * Extract search keywords from the AI analysis result and query
 * external judgement databases for relevant court decisions.
 *
 * Strategy:
 *   1. Build a search query from cited statutes + document type + risk keywords
 *   2. Search RIS-OGD (AT), openlegaldata (DE), OpenCaseLaw (CH) in parallel
 *   3. Map hits to SuggestedPrecedent with a relevance reason
 *   4. Return top 10 results sorted by relevance
 */
async function findRelevantPrecedents(
  parsed: Record<string, unknown>,
  jurisdiction: string
): Promise<SuggestedPrecedent[]> {
  const searchTerms: string[] = [];

  // Extract statute codes from cited_statutes (e.g. "§ 433 BGB" → "433 BGB")
  const citedStatutes = Array.isArray(parsed.cited_statutes)
    ? (parsed.cited_statutes as Array<Record<string, unknown>>)
    : [];
  for (const cite of citedStatutes.slice(0, 5)) {
    const code = String(cite.code ?? "").trim();
    const paragraph = String(cite.paragraph ?? "")
      .replace(/^§\s*/, "")
      .trim();
    if (code && paragraph) {
      searchTerms.push(`${paragraph} ${code}`);
    }
  }

  // Add document type as a search term
  const docType = String(parsed.document_type ?? "").trim();
  if (docType && docType !== "sonstiges" && docType !== "unknown") {
    searchTerms.push(docType);
  }

  // Add key risk descriptions (first 3 words of each risk)
  const risks = Array.isArray(parsed.risks) ? (parsed.risks as Array<Record<string, unknown>>) : [];
  for (const risk of risks.slice(0, 3)) {
    const desc = String(risk.description ?? "").trim();
    if (desc) {
      const keywords = desc.split(/\s+/).slice(0, 4).join(" ");
      if (keywords.length > 3) searchTerms.push(keywords);
    }
  }

  if (searchTerms.length === 0) return [];

  // Determine which jurisdictions to search
  const jur =
    jurisdiction === "at"
      ? "at"
      : jurisdiction === "de"
        ? "de"
        : jurisdiction === "ch"
          ? "ch"
          : "all";

  // Search with the most specific terms first, dedup by hit ID
  const seenIds = new Set<string>();
  const allHits: Array<{ hit: JudgementHit; reason: string }> = [];

  for (const term of searchTerms.slice(0, 6)) {
    try {
      const { results } = await searchJudgements({
        q: term,
        jurisdiction: jur as "at" | "de" | "ch" | "all",
        limit: 10,
      });
      for (const hit of results) {
        if (seenIds.has(hit.id)) continue;
        seenIds.add(hit.id);
        allHits.push({
          hit,
          reason:
            term.includes(" ") && /\d+/.test(term)
              ? `Relevant zitierte Norm: ${term}`
              : `Relevant für Dokumenttyp: ${docType}`,
        });
      }
    } catch (err) {
      // External judgement APIs may be down — continue with other terms,
      // but log so a systemic outage shows up in monitoring.
      console.error(
        `[analyze] precedent search for "${term}" failed:`,
        err instanceof Error ? err.message : String(err)
      );
    }
    if (allHits.length >= 15) break;
  }

  return allHits.slice(0, 10).map(({ hit, reason }) => ({
    id: hit.id,
    title: hit.title,
    court: hit.court,
    date: hit.date,
    case_number: hit.caseNumber,
    ecli: hit.ecli,
    legal_area: hit.legalArea || hit.type || "Allgemein",
    url: hit.url,
    snippet: hit.snippet || hit.summary || "",
    source: hit.source,
    relevance_reason: reason,
  }));
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { ENGINE_URL, engineConfigurationResponse, requireEngineContext } from "@/lib/engine";
import { validateCsrf, CSRF_COOKIE_NAME } from "@/lib/csrf";
import { apiError } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { groundCitations } from "@/lib/legal-grounding";
import type { RawCitation } from "@/lib/types";

export const maxDuration = 120;

// ── Internal service auth ─────────────────────────────────────────────
const INTERNAL_SECRET = env("SUBSUMIO_INTERNAL_SECRET");

// ── Zod validation ────────────────────────────────────────────────────
const analyzeSchema = z
  .object({
    document_slug: z.string().optional(),
    text: z.string().optional(),
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

// ── Route handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Determine auth: internal service call vs. authenticated user session
  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal =
    Boolean(INTERNAL_SECRET) &&
    Boolean(internalSecret) &&
    timingSafeCompare(internalSecret!, INTERNAL_SECRET!);

  let engineHeaders: Record<string, string> = {};

  if (!isInternal) {
    // User session path: full auth + RBAC + rate limit + quota + CSRF
    const ctx = await requireEngineContext(req, "legal.document_review", "heavy", "queries");
    if (ctx instanceof Response) return ctx;

    // CSRF check for user session path
    const cookieValue = req.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (!validateCsrf(req, cookieValue)) {
      return apiError("csrf_invalid", "CSRF token missing or invalid", 403);
    }

    engineHeaders = ctx.headers;
  } else {
    // Internal: build engine headers from environment
    const apiKey = env("SUBSUMIO_WEB_API_KEY") || "";
    engineHeaders = apiKey ? { "x-subsumio-api-key": apiKey } : {};
  }

  const configError = engineConfigurationResponse();
  if (configError) return configError;

  // Zod validation
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError("invalid_json", "Request body is not valid JSON", 400);
  }

  const result = analyzeSchema.safeParse(raw);
  if (!result.success) {
    return apiError("validation_failed", "Request body validation failed", 400, {
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const body = result.data;

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
  let text = "";
  if (documentSlug) {
    try {
      const pageRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(documentSlug)}`, {
        headers: engineHeaders,
      });
      if (pageRes.ok) {
        const page = (await pageRes.json()) as { content?: string; title?: string };
        text = [page.title, page.content].filter(Boolean).join("\n\n");
      }
    } catch {
      /* best-effort */
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
      }),
    });

    if (!thinkRes.ok) {
      throw new Error(`Engine think ${thinkRes.status}`);
    }

    const thinkData = (await thinkRes.json()) as { answer?: string };
    parsed = safeParseJson(thinkData.answer || "{}");
  } catch (err) {
    console.error("[analyze] AI step failed:", err instanceof Error ? err.message : String(err));
    return Response.json(
      buildEmptyResult("Analyse fehlgeschlagen \u2014 Engine nicht verf\u00fcgbar.")
    );
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

  // 5. Store analysis as page metadata (best-effort, non-blocking)
  if (documentSlug) {
    void (async () => {
      try {
        await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(documentSlug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...engineHeaders },
          body: JSON.stringify({
            meta: {
              auto_analysis: parsed,
              analyzed_at: new Date().toISOString(),
            },
          }),
        });
      } catch {
        /* best-effort */
      }
    })();
  }

  return Response.json(parsed);
}

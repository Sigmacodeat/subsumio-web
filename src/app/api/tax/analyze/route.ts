import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { apiError } from "@/lib/api-response";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { collectSSEChunks } from "@/lib/sse-stream";

export const maxDuration = 120;

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

function buildTaxAnalysisPrompt(text: string, jurisdiction: string): string {
  const jurHint =
    jurisdiction === "all" ? "DE (Deutschland) oder AT (Österreich)" : jurisdiction.toUpperCase();

  const safeText = sanitizeUserInput(text);

  return `Du bist ein deutscher/österreichischer Steuerexperte (Steuerberater). Analysiere das folgende Steuerdokument.

KRITISCHE REGEL: Du darfst KEINE Gesetzesnormen erfinden oder raten. Nenne AUSSCHLIESSLICH §-Paragraphen, die EXPLIZIT im Dokument genannt werden oder sich zwingend logisch aus dem Dokumenttyp ergeben (Steuerbescheid → § 122 AO, Einspruch → § 347 AO, etc.).

Antworte AUSSCHLIESSLICH als gültiges JSON ohne Markdown-Codeblock, keine anderen Zeichen außerhalb des JSON.

Dokument:
---
${safeText}
---

Steuerordnung: ${jurHint}

Extrahiere:
1. document_type: Steuerbescheid | Steuererklärung | Einspruch | Berufung | Betriebsprüfungsbericht | Buchführungsunterlage | Jahresabschluss | Lohnabrechnung | Umsatzsteuervoranmeldung | Korrespondenz | sonstiges
2. type_confidence: 0.0–1.0 (wie sicher bist du beim document_type)
3. parties: Vollständige Namen der Beteiligten (Mandant, Finanzamt, Betriebsprüfer, sonstige)
4. deadlines: Steuerfristen und Daten aus dem Dokument (§ 109 AO Einspruchsfrist, § 226 AO Zahlungsfrist, § 149 AO Erklärungsfrist, etc.)
5. cited_statutes: Nur §§ die im Dokument stehen ODER zwingend anwendbar sind (AO, EStG, UStG, KStG, GewStG, ErbStG, BewG, StBVV)
6. risks: Konkrete steuerliche Risiken mit Schweregrad (Nachzahlung, Verspätungszuschlag, Hinterziehung)
7. action_items: Nächste konkrete Schritte für den Steuerberater
8. summary: 2-3 präzise Sätze
9. language: de | en | other
10. tax_details: Steuerliche Details
    - tax_type: ESt | USt | KSt | GewSt | ErbSt | LSt | sonstige
    - assessment_period: Veranlagungszeitraum (z.B. "2024")
    - assessed_amount: festgesetzte Steuer (falls im Dokument)
    - payment_due_date: Fälligkeitsdatum
    - interest_amount: Zinsbetrag (§ 233 AO) falls vorhanden

Antworte JETZT mit reinem JSON:
{
  "document_type": "string",
  "type_confidence": 0.0,
  "parties": [{"name":"string","role":"Mandant|Finanzamt|Betriebsprüfer|sonstige"}],
  "deadlines": [{"label":"string","date":"string","urgency":"critical|normal","source":"exact quote from document","legal_basis":"§ XYZ AO"}],
  "cited_statutes": [{"code":"string","paragraph":"string","context":"why this statute applies"}],
  "risks": [{"severity":"high|medium|low","description":"string","mitigation":"string"}],
  "action_items": ["string"],
  "summary": "string",
  "language": "string",
  "tax_details": {
    "tax_type": "string",
    "assessment_period": "string",
    "assessed_amount": null,
    "payment_due_date": "string",
    "interest_amount": null
  }
}`;
}

function encodeSlugPath(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

export const POST = createHandler(
  {
    action: "tax.analyze",
    rateTier: "heavy",
    quota: "queries",
    body: analyzeSchema,
    maxDuration: 120,
    allowInternal: true,
  },
  async (ctx, body, _query, _req) => {
    const isInternal = ctx.brainId === "internal";
    let engineHeaders: Record<string, string> = ctx.headers;

    const documentSlug = typeof body.document_slug === "string" ? body.document_slug.trim() : "";
    const jurisdiction =
      typeof body.jurisdiction === "string" ? body.jurisdiction.toLowerCase() : "de";

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
        const pageRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(documentSlug)}`, {
          headers: engineHeaders,
          signal: AbortSignal.timeout(300_000),
        });
        if (pageRes.ok) {
          const page = (await pageRes.json()) as {
            content?: string;
            title?: string;
          };
          text = [page.title, page.content].filter(Boolean).join("\n\n");
        }
      } catch {
        /* ignore fetch errors */
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
          query: buildTaxAnalysisPrompt(text, jurisdiction),
          mode: "balanced",
        }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!thinkRes.ok) throw new Error(`Engine think ${thinkRes.status}`);
      const rawText = await collectSSEChunks(thinkRes.body!);
      parsed = safeParseJson(rawText);
    } catch {
      parsed = {
        document_type: "unknown",
        type_confidence: 0,
        parties: [],
        deadlines: [],
        cited_statutes: [],
        risks: [],
        action_items: [],
        summary: "Analyse fehlgeschlagen — Engine nicht erreichbar",
        language: "de",
        tax_details: {
          tax_type: "unknown",
          assessment_period: "",
          assessed_amount: null,
          payment_due_date: "",
          interest_amount: null,
        },
      };
    }

    return Response.json(parsed);
  }
);

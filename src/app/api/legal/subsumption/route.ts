import { z } from "zod";
import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersWithCaseJurisdiction } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { trustedLegalJurisdiction } from "@/lib/legal-jurisdiction";

export const maxDuration = 60;

/**
 * POST /api/legal/subsumption
 *
 * Interactive legal subsumption: user provides a factual scenario,
 * the agent searches for relevant §§, structures a subsumption
 * (Obersatz → Untersatz → Schluss), and returns it.
 *
 * Follow-up messages refine the subsumption (e.g. "Mitverschulden prüfen").
 *
 * Uses the engine's /api/think endpoint with a specialized subsumption prompt
 * that forces structured output with §-citations grounded in the law corpus.
 */

const bodySchema = z.object({
  scenario: z.string().min(10).max(8000),
  jurisdiction: z.enum(["at", "de", "ch"]).default("at"),
  follow_up: z.string().max(4000).optional(),
  previous_result: z.string().max(20000).optional(),
  case_slug: z.string().max(300).optional(),
});

function buildSubsumptionPrompt(
  scenario: string,
  jurisdiction: string,
  followUp?: string,
  previousResult?: string
): string {
  const jurisdictionLabel: Record<string, string> = {
    at: "österreichisches Recht (ABGB, StGB, ZPO, UGB, KSchG, ArbVG, AHG, etc.)",
    de: "deutsches Recht (BGB, StGB, ZPO, HGB, etc.)",
    ch: "Schweizer Recht (OR, ZGB, StGB, etc.)",
  };
  const jurLabel = jurisdictionLabel[jurisdiction] ?? "DACH-Rechtsraum";

  const followUpSection = followUp
    ? `\n\n## FOLLOW-UP\nDer Nutzer hat folgende Ergänzung/Frage gestellt:\n${followUp}\n\nBerücksichtige dies und aktualisiere die Subsumtion entsprechend. Behalte bereits gefundene §§ bei, wenn sie weiterhin relevant sind.`
    : "";

  const previousSection = previousResult
    ? `\n\n## BISHERIGE SUBSUMTION\n${previousResult}\n\nAktualisiere/ergänze diese Subsumtion basierend auf dem Follow-up.`
    : "";

  return `Du bist ein juristischer Subsumtions-Assistent für ${jurLabel}.

## SACHVERHALT
${scenario}${followUpSection}${previousSection}

## DEINE AUFGABE
1. IDENTIFIZIERE alle rechtlich relevanten Aspekte des Sachverhalts
2. SUCHE im Gesetzeskorpus nach den einschlägigen §§ (nutze die Suchfunktion)
3. ERSTELLE eine strukturierte Subsumtion für jeden rechtlichen Aspekt
4. PRÜFE auch naheliegende Gegenargumente und Einwendungen
5. VERWEISE auf OGH-Judikatur falls verfügbar

## AUSGABEFORMAT
Für jeden rechtlichen Aspekt:

### Aspekt: [Bezeichnung]

**Obersatz (Legal Rule):**
§ [Nummer] [Gesetz] besagt: "[Wörtlicher Gesetzestext aus dem Korpus]"

**Untersatz (Subsumption):**
Im vorliegenden Fall [Anwendung auf den Sachverhalt]...

**Schluss (Conclusion):**
Daraus folgt: [Rechtliche Folge]

---

## WICHTIGE REGELN
- VERWENDE NUR §§ die du im Gesetzeskorpus gefunden hast
- Zitiere Gesetzestexte WORTWÖRTLICH
- ERFINDE KEINE §§ oder Gesetze
- Wenn ein § nicht gefunden wird: "Dieser § konnte im Korpus nicht gefunden werden"
- Prüfe auch VERJÄHRUNG, MITVERSCHULDEN, and naheliegende EINWENDUNGEN
- Verweise auf OGH-Judikatur wenn verfügbar (search nach Schlagworten)

Diese Information ersetzt keine anwaltliche Prüfung.`;
}

export const POST = createHandler(
  {
    action: "legal.subsumption" as const,
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "legal.subsumption" as const,
      entityType: "subsumption",
      details: {
        jurisdiction: body.jurisdiction,
        scenarioLength: body.scenario.length,
        hasFollowUp: Boolean(body.follow_up),
        hasPrevious: Boolean(body.previous_result),
      },
    }),
  },
  async (ctx, body, _query, req: NextRequest) => {
    const {
      scenario,
      jurisdiction: requestedJurisdiction,
      follow_up,
      previous_result,
      case_slug,
    } = body;

    // Case jurisdiction takes priority over body jurisdiction (Case > User > Fail-Closed).
    // When case_slug is provided, resolve the case's jurisdiction from its frontmatter
    // and inject x-subsumio-case-jurisdiction so readSourcesFor() scopes the law corpus.
    const caseScopedHeaders = await engineHeadersWithCaseJurisdiction(ctx.headers, case_slug);
    const jurisdiction = trustedLegalJurisdiction(caseScopedHeaders, requestedJurisdiction);
    const promptJurisdiction = jurisdiction ?? requestedJurisdiction;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...caseScopedHeaders,
    };
    // Never let the request body widen or switch the engine's law-corpus
    // scope. The session/case headers are server-controlled; with neither
    // present, the engine remains fail-closed and can only search tenant data.
    if (jurisdiction) headers["x-subsumio-jurisdiction"] = jurisdiction.toUpperCase();

    const trustedPrompt = buildSubsumptionPrompt(
      scenario,
      promptJurisdiction,
      follow_up,
      previous_result
    );

    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: trustedPrompt,
        mode: "tokenmax",
        legal_mode: true,
        ...(case_slug ? { case_slug } : {}),
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      console.error("[legal/subsumption] engine think failed:", res.status, payload);
      return Response.json(
        {
          error: "subsumption_failed",
          message: "Subsumtion konnte nicht erstellt werden.",
        },
        { status: 502 }
      );
    }

    // The engine returns SSE stream or JSON depending on Accept header
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      // Stream SSE chunks back to client
      const decoder = new TextDecoder();
      const reader = res.body?.getReader();
      if (!reader) {
        return Response.json(
          { error: "no_stream_body", message: "Stream konnte nicht gelesen werden." },
          { status: 502 }
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            console.error("[legal/subsumption] stream error:", err);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // JSON response
    const data = (await res.json().catch(() => ({}))) as {
      answer?: string;
      citations?: unknown[];
      warnings?: string[];
    };

    void req;

    return Response.json({
      ok: true,
      answer: data.answer ?? "",
      citations: Array.isArray(data.citations) ? data.citations : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    });
  }
);

import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const maxDuration = 120;

const opponentSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  draft_content: z.string().min(1, "draft_content_required").max(200_000),
  selected_gruende: z
    .array(
      z.object({
        titel: z.string().max(500),
        beschreibung: z.string().max(5000),
        erfolgsprognose: z.number().min(1).max(5),
      })
    )
    .default([]),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).optional().default("all"),
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface CaseData {
  title: string;
  frontmatter: Record<string, unknown>;
}

interface OpponentFinding {
  argument: string;
  severity: "kritisch" | "mittel" | "niedrig";
  gegenargument: string;
  empfehlung: string;
}

interface OpponentResult {
  findings: OpponentFinding[];
  overall_assessment: string;
  recommended_response: string;
  generatedAt: string;
}

export const POST = createHandler(
  {
    action: "legal.opponent_simulation",
    rateTier: "heavy",
    body: opponentSchema,
    audit: (_ctx, body) => ({
      action: "legal.opponent_simulation" as const,
      entityType: "opponent_simulation",
      details: {
        case_slug: body.case_slug,
        gruende_count: body.selected_gruende.length,
        draft_length: body.draft_content.length,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    // 1. Fetch case data for context
    const encodedSlug = body.case_slug.split("/").map(encodeURIComponent).join("/");
    let caseData: CaseData | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) caseData = (await res.json()) as CaseData;
    } catch {
      // Best-effort — opponent simulation can run on draft alone
    }

    const fm = caseData?.frontmatter ?? {};
    const caseTitle = caseData?.title || body.case_slug;
    const caseFacts = typeof fm.facts === "string" ? fm.facts : "";

    const gruendeSummary =
      body.selected_gruende.length > 0
        ? body.selected_gruende
            .map(
              (g, i) => `${i + 1}. ${g.titel} (Prognose ${g.erfolgsprognose}/5): ${g.beschreibung}`
            )
            .join("\n")
        : "Keine spezifischen Berufungsgründe übermittelt.";

    const jurisdictionLabel =
      body.jurisdiction === "all" ? "AT/DE/CH" : body.jurisdiction.toUpperCase();
    const langHint = body.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

    const draftPreview = body.draft_content.slice(0, 8000);

    const prompt = `Du simulierst den Gegenanwalt / die Gegenseite in einem Rechtsmittelverfahren (${jurisdictionLabel}).
Du erhältst den Entwurf des Rechtsmittels und die zugrundeliegenden Berufungsgründe.
Deine Aufgabe: Schwachstellen angreifen, Gegenargumente aufbauen, und Empfehlungen geben, wie der Anwalt den Entwurf stärken kann.

FALLDATEN:
- Titel: ${caseTitle}
- Sachverhalt: ${caseFacts.slice(0, 2000)}

BERUFUNGSGRÜNDE:
${gruendeSummary}

ENTWURF DES RECHTSMITTELS:
---
${draftPreview}
---

${langHint}
Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "findings": [
    {
      "argument": "Welches Argument des Entwurfs wird angegriffen",
      "severity": "kritisch|mittel|niedrig",
      "gegenargument": "Konkretes Gegenargument der Gegenseite (mit Norm/Rechtsprechung)",
      "empfehlung": "Wie der Anwalt darauf reagieren sollte"
    }
  ],
  "overall_assessment": "Gesamtbewertung der Schwachstellen (2-3 Sätze)",
  "recommended_response": "Strategische Empfehlung für die nächste Überarbeitung (3-5 Sätze)"
}

Identifiziere 3-8 konkrete Schwachstellen. Sortiere nach Severity (kritisch zuerst).`;

    // 2. Stream the engine's think response to the client as SSE.
    //    We forward raw text chunks for live progress, accumulate the full
    //    response, then parse the JSON at the end and send a final "result"
    //    event with the structured findings.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let rawResponse = "";
        const sendEvent = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              question: prompt,
              mode: "balanced",
              source_id: ctx.brainId,
            }),
            signal: AbortSignal.timeout(120_000),
          });

          if (!thinkRes.ok) {
            sendEvent({
              type: "error",
              error: `Opponent simulation failed: ${thinkRes.status}`,
            });
            controller.close();
            return;
          }

          const contentType = thinkRes.headers.get("Content-Type") || "";
          if (contentType.includes("text/event-stream") && thinkRes.body) {
            const reader = thinkRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6).trim();
                  if (data === "[DONE]") continue;
                  try {
                    const parsed = JSON.parse(data);
                    if (typeof parsed.chunk === "string") {
                      rawResponse += parsed.chunk;
                      sendEvent({ type: "chunk", text: parsed.chunk });
                    }
                    if (typeof parsed.answer === "string") {
                      rawResponse = parsed.answer;
                      sendEvent({ type: "chunk", text: parsed.answer });
                    }
                  } catch {
                    // Non-JSON line, skip
                  }
                }
              }
            }
          } else {
            const data = await thinkRes.json();
            rawResponse = typeof data.answer === "string" ? data.answer : JSON.stringify(data);
            sendEvent({ type: "chunk", text: rawResponse });
          }
        } catch (err) {
          sendEvent({
            type: "error",
            error: err instanceof Error ? err.message : "Opponent simulation failed",
          });
          controller.close();
          return;
        }

        // 3. Parse the accumulated result
        let result: OpponentResult;
        try {
          const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : rawResponse;
          const parsed = JSON.parse(jsonStr);

          const findings: OpponentFinding[] = Array.isArray(parsed.findings)
            ? parsed.findings.map((f: Record<string, unknown>): OpponentFinding => {
                const sev =
                  f.severity === "kritisch" || f.severity === "mittel" || f.severity === "niedrig"
                    ? f.severity
                    : "mittel";
                return {
                  argument: String(f.argument ?? ""),
                  severity: sev,
                  gegenargument: String(f.gegenargument ?? ""),
                  empfehlung: String(f.empfehlung ?? ""),
                };
              })
            : [];

          result = {
            findings,
            overall_assessment: String(parsed.overall_assessment ?? ""),
            recommended_response: String(parsed.recommended_response ?? ""),
            generatedAt: new Date().toISOString(),
          };
        } catch {
          result = {
            findings: [],
            overall_assessment: rawResponse.slice(0, 500),
            recommended_response: "",
            generatedAt: new Date().toISOString(),
          };
        }

        // 4. Persist to case frontmatter (best-effort)
        try {
          await enginePatchPage(ctx.headers, {
            slug: body.case_slug,
            frontmatter: {
              opponent_simulation: result,
              opponent_simulation_generated_at: result.generatedAt,
            },
          });
        } catch {
          // Best-effort persistence
        }

        // 5. Send the final parsed result, then close the stream
        sendEvent({ type: "result", ...result });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
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
);

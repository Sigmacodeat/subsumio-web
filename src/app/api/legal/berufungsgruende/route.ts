import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 120;

const berufsgruendeSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  analysis: z
    .object({
      summary: z.string().default(""),
      recommended: z.string().default(""),
      recommendedApproach: z.string().default(""),
      risks: z
        .array(
          z.object({
            description: z.string().default(""),
            probability: z.enum(["high", "medium", "low"]).default("medium"),
            impact: z.enum(["high", "medium", "low"]).default("medium"),
            mitigation: z.string().default(""),
          })
        )
        .default([]),
      next_steps: z.array(z.string()).default([]),
      success_probability: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).optional().default("all"),
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface CaseData {
  title: string;
  frontmatter: Record<string, unknown>;
  content?: string;
}

interface BerufungsGrund {
  id: string;
  titel: string;
  beschreibung: string;
  erfolgsprognose: 1 | 2 | 3 | 4 | 5;
  label: "stark" | "mittel" | "schwach";
  quelle?: string;
}

interface BerufungsgruendeResult {
  gruende: BerufungsGrund[];
  generatedAt: string;
}

function labelFromScore(score: number): "stark" | "mittel" | "schwach" {
  if (score >= 4) return "stark";
  if (score >= 2) return "mittel";
  return "schwach";
}

export const POST = createHandler(
  {
    action: "legal.berufungsgruende",
    rateTier: "heavy",
    body: berufsgruendeSchema,
    audit: (_ctx, body) => ({
      action: "legal.berufungsgruende" as const,
      entityType: "berufungsgruende",
      details: { case_slug: body.case_slug, jurisdiction: body.jurisdiction },
    }),
  },
  async (ctx, body, _query, _req) => {
    // 1. Fetch case data
    const encodedSlug = body.case_slug.split("/").map(encodeURIComponent).join("/");
    let caseData: CaseData | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("case_not_found", `Case not found: ${res.status}`, 404);
      caseData = (await res.json()) as CaseData;
    } catch (err) {
      return apiError(
        "engine_unreachable",
        err instanceof Error ? err.message : "Engine nicht erreichbar",
        503
      );
    }
    if (!caseData) return apiError("case_not_found", "Case not found", 404);

    const fm = caseData.frontmatter ?? {};
    const caseTitle = caseData.title || body.case_slug;
    const caseFacts = typeof fm.facts === "string" ? fm.facts : "";
    const caseClaims = Array.isArray(fm.claims) ? fm.claims.join("; ") : "";
    const caseDefenses = Array.isArray(fm.defenses) ? fm.defenses.join("; ") : "";
    const caseStatus = typeof fm.status === "string" ? fm.status : "open";
    const caseLegalArea = typeof fm.legal_area === "string" ? fm.legal_area : "";

    const analysis = body.analysis;
    const analysisSummary = analysis
      ? `Vorherige Strategie-Analyse:\n- Zusammenfassung: ${analysis.summary}\n- Empfohlener Ansatz: ${analysis.recommendedApproach}\n- Erfolgsprognose: ${Math.round(analysis.success_probability * 100)}%\n- Risiken: ${analysis.risks.map((r) => r.description).join("; ")}`
      : "Keine vorherige Strategie-Analyse verfügbar.";

    const jurisdictionLabel =
      body.jurisdiction === "all" ? "AT/DE/CH" : body.jurisdiction.toUpperCase();
    const langHint = body.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

    const prompt = `Du bist ein erfahrener Rechtsmittel-Experte (${jurisdictionLabel}) für Berufung, Revision und Beschwerde.
Analysiere den folgenden Fall und identifiziere mögliche Berufungsgründe / Revisionsgründe / Beschwerdegründe.

FALLDATEN:
- Titel: ${caseTitle}
- Status: ${caseStatus}
- Rechtsgebiet: ${caseLegalArea}
- Sachverhalt: ${caseFacts}
- Ansprüche: ${caseClaims}
- Verteidigung: ${caseDefenses}

${analysisSummary}

${langHint}
Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "gruende": [
    {
      "id": "g1",
      "titel": "Kurzer Titel des Grundes (z.B. 'Verfahrensfehler — § 421 ZPO')",
      "beschreibung": "Detaillierte Beschreibung: warum dieser Grund greift, welche Norm verletzt wurde, welche Tatsachen ihn stützen",
      "erfolgsprognose": 1-5 (5 = sehr aussichtsreich, 1 = gering),
      "quelle": "Zitierte Norm/Rechtsprechung (z.B. '§ 421 ZPO; 6 Ob 123/21g OGH')"
    }
  ]
}

Identifiziere 3-8 konkrete, unterscheidbare Gründe. Sortiere nach Erfolgsprognose (höchste zuerst).`;

    // 2. Call the engine's think endpoint
    let rawResponse = "";
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
        return apiError(
          "think_failed",
          `Berufungsgründe generation failed: ${thinkRes.status}`,
          thinkRes.status
        );
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
                if (typeof parsed.chunk === "string") rawResponse += parsed.chunk;
                if (typeof parsed.answer === "string") rawResponse = parsed.answer;
              } catch {
                // Non-JSON line, skip
              }
            }
          }
        }
      } else {
        const data = await thinkRes.json();
        rawResponse = typeof data.answer === "string" ? data.answer : JSON.stringify(data);
      }
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Berufungsgründe generation failed",
        503
      );
    }

    // 3. Parse the result
    let result: BerufungsgruendeResult;
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : rawResponse;
      const parsed = JSON.parse(jsonStr);

      const gruende: BerufungsGrund[] = Array.isArray(parsed.gruende)
        ? parsed.gruende.map((g: Record<string, unknown>, idx: number): BerufungsGrund => {
            const score =
              typeof g.erfolgsprognose === "number"
                ? Math.max(1, Math.min(5, Math.round(g.erfolgsprognose)))
                : 3;
            return {
              id: typeof g.id === "string" ? g.id : `g${idx + 1}`,
              titel: String(g.titel ?? `Grund ${idx + 1}`),
              beschreibung: String(g.beschreibung ?? ""),
              erfolgsprognose: score as 1 | 2 | 3 | 4 | 5,
              label: labelFromScore(score),
              quelle: typeof g.quelle === "string" ? g.quelle : undefined,
            };
          })
        : [];

      result = {
        gruende,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      result = {
        gruende: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // 4. Persist to case frontmatter (best-effort)
    try {
      await enginePatchPage(ctx.headers, {
        slug: body.case_slug,
        frontmatter: {
          berufungsgruende: result.gruende,
          berufungsgruende_generated_at: result.generatedAt,
        },
      });
    } catch {
      // Best-effort persistence
    }

    return Response.json(result);
  }
);

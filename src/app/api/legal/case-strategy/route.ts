import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 120;

const strategySchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).optional().default("all"),
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface CaseData {
  title: string;
  frontmatter: Record<string, unknown>;
  content?: string;
}

interface DocumentAnalysis {
  slug: string;
  title: string;
  analysis?: {
    document_type?: string;
    parties?: Array<{ name?: string; role?: string }>;
    risks?: Array<{ description?: string; severity?: string; mitigation?: string }>;
    summary?: string;
    cited_statutes?: Array<{ code?: string; paragraph?: string }>;
  };
}

interface StrategyResult {
  summary: string;
  recommended: string;
  recommendedApproach: string;
  risks: Array<{
    description: string;
    probability: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    mitigation: string;
  }>;
  next_steps: string[];
  cost_estimate?: {
    min: number;
    max: number;
    currency: string;
    basis: string;
  };
  success_probability: number;
  generatedAt: string;
}

export const POST = createHandler(
  {
    action: "legal.strategy",
    rateTier: "heavy",
    body: strategySchema,
    audit: (_ctx, body) => ({
      action: "legal.strategy" as const,
      entityType: "case_strategy",
      details: { case_slug: body.case_slug },
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

    // 2. Fetch all analyzed documents for this case
    let documents: DocumentAnalysis[] = [];
    try {
      const docRes = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=200`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (docRes.ok) {
        const docData = await docRes.json();
        if (Array.isArray(docData)) {
          documents = (
            docData as Array<{
              slug: string;
              title: string;
              frontmatter?: Record<string, unknown>;
            }>
          )
            .filter((p) => {
              const docFm = p.frontmatter ?? {};
              return (
                docFm.case_slug === body.case_slug &&
                docFm.assignment_status !== "unassigned" &&
                docFm.status !== "tombstoned"
              );
            })
            .map((p) => ({
              slug: p.slug,
              title: p.title ?? p.slug,
              analysis: (p.frontmatter?.auto_analysis as DocumentAnalysis["analysis"]) ?? undefined,
            }));
        }
      }
    } catch {
      // Best-effort — strategy can be generated without documents
    }

    // 3. Build strategy prompt
    const caseTitle = caseData.title || body.case_slug;
    const caseFacts = typeof fm.facts === "string" ? fm.facts : "";
    const caseClaims = Array.isArray(fm.claims) ? fm.claims.join("; ") : "";
    const caseDefenses = Array.isArray(fm.defenses) ? fm.defenses.join("; ") : "";
    const caseStatus = typeof fm.status === "string" ? fm.status : "open";
    const caseLegalArea = typeof fm.legal_area === "string" ? fm.legal_area : "";

    const docSummaries = documents
      .filter((d) => d.analysis)
      .map((d) => {
        const a = d.analysis!;
        const parties = (a.parties ?? []).map((p) => `${p.name} (${p.role})`).join(", ");
        const risks = (a.risks ?? []).map((r) => `${r.description} [${r.severity}]`).join("; ");
        return `- ${d.title}: ${a.summary ?? "Keine Zusammenfassung"} | Parteien: ${parties} | Risiken: ${risks}`;
      })
      .join("\n");

    const contradictions = Array.isArray(fm.contradictions) ? fm.contradictions : [];
    const contradictionSummary =
      contradictions.length > 0
        ? `\nWidersprüche erkannt: ${contradictions.length} — siehe case frontmatter.`
        : "";

    const jurisdictionLabel =
      body.jurisdiction === "all" ? "AT/DE/CH" : body.jurisdiction.toUpperCase();

    const langHint = body.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

    const prompt = `Du bist ein erfahrener Rechtsstrategie-Berater (${jurisdictionLabel}).
Analysiere den folgenden Fall und entwickle eine Strategieempfehlung.

FALLDATEN:
- Titel: ${caseTitle}
- Status: ${caseStatus}
- Rechtsgebiet: ${caseLegalArea}
- Sachverhalt: ${caseFacts}
- Ansprüche: ${caseClaims}
- Verteidigung: ${caseDefenses}
${contradictionSummary}

DOKUMENTANALYSEN:
${docSummaries || "Keine Dokumentanalysen verfügbar."}

${langHint}
Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "summary": "Kurzusammenfassung der strategischen Lage (2-3 Sätze)",
  "recommended": "Empfohlene Strategie in einem Satz",
  "recommendedApproach": "Detaillierte Beschreibung des empfohlenen Vorgehens (3-5 Sätze)",
  "risks": [
    {
      "description": "Risikobeschreibung",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "Empfohlene Maßnahme zur Risikominimierung"
    }
  ],
  "next_steps": ["Konkrete nächste Schritte"],
  "cost_estimate": {
    "min": 0,
    "max": 0,
    "currency": "EUR",
    "basis": "Schätzung basierend auf..."
  },
  "success_probability": 0.0
}`;

    // 4. Call the engine's think endpoint for strategy generation
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
          `Strategy generation failed: ${thinkRes.status}`,
          thinkRes.status
        );
      }

      // The think endpoint returns SSE — collect the answer
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
        // JSON response
        const data = await thinkRes.json();
        rawResponse = typeof data.answer === "string" ? data.answer : JSON.stringify(data);
      }
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Strategy generation failed",
        503
      );
    }

    // 5. Parse the strategy result
    let strategy: StrategyResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : rawResponse;
      const parsed = JSON.parse(jsonStr);

      strategy = {
        summary: String(parsed.summary ?? ""),
        recommended: String(parsed.recommended ?? ""),
        recommendedApproach: String(parsed.recommendedApproach ?? ""),
        risks: Array.isArray(parsed.risks)
          ? parsed.risks.map((r: Record<string, unknown>) => ({
              description: String(r.description ?? ""),
              probability: (r.probability === "high" ||
              r.probability === "medium" ||
              r.probability === "low"
                ? r.probability
                : "medium") as "high" | "medium" | "low",
              impact: (r.impact === "high" || r.impact === "medium" || r.impact === "low"
                ? r.impact
                : "medium") as "high" | "medium" | "low",
              mitigation: String(r.mitigation ?? ""),
            }))
          : [],
        next_steps: Array.isArray(parsed.next_steps)
          ? parsed.next_steps.map((s: unknown) => String(s))
          : [],
        success_probability:
          typeof parsed.success_probability === "number"
            ? Math.max(0, Math.min(1, parsed.success_probability))
            : 0.5,
        generatedAt: new Date().toISOString(),
      };

      if (parsed.cost_estimate && typeof parsed.cost_estimate === "object") {
        const ce = parsed.cost_estimate as Record<string, unknown>;
        strategy.cost_estimate = {
          min: typeof ce.min === "number" ? ce.min : 0,
          max: typeof ce.max === "number" ? ce.max : 0,
          currency: typeof ce.currency === "string" ? ce.currency : "EUR",
          basis: typeof ce.basis === "string" ? ce.basis : "",
        };
      }
    } catch {
      // Fallback: use raw response as summary
      strategy = {
        summary: rawResponse.slice(0, 500),
        recommended: "Strategieempfehlung generiert — siehe Zusammenfassung",
        recommendedApproach: rawResponse.slice(0, 1000),
        risks: [],
        next_steps: [],
        success_probability: 0.5,
        generatedAt: new Date().toISOString(),
      };
    }

    // 6. Persist strategy to case frontmatter
    try {
      await enginePatchPage(ctx.headers, {
        slug: body.case_slug,
        frontmatter: {
          strategy: strategy,
          strategy_generated_at: strategy.generatedAt,
        },
      });
    } catch {
      // Best-effort persistence — response still carries the strategy
    }

    return Response.json(strategy);
  }
);

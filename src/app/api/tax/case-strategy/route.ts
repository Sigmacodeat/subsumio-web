import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

export const maxDuration = 120;

const strategySchema = z.object({
  return_slug: z.string().min(1, "return_slug_required"),
  jurisdiction: z.enum(["de", "at"]).optional().default("de"),
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface TaxReturnData {
  title: string;
  frontmatter: Record<string, unknown>;
  content?: string;
}

interface TaxStrategyResult {
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

export const POST = createHandler(
  {
    action: "tax.strategy",
    rateTier: "heavy",
    body: strategySchema,
    audit: (_ctx, body) => ({
      action: "tax.strategy" as const,
      entityType: "tax_strategy",
      details: { return_slug: body.return_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    const encodedSlug = body.return_slug.split("/").map(encodeURIComponent).join("/");

    let returnData: TaxReturnData | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("return_not_found", `Tax return not found: ${res.status}`, 404);
      returnData = (await res.json()) as TaxReturnData;
    } catch (err) {
      return apiError(
        "engine_unreachable",
        err instanceof Error ? err.message : "Engine nicht erreichbar",
        503
      );
    }

    if (!returnData) return apiError("return_not_found", "Tax return not found", 404);

    const fm = returnData.frontmatter ?? {};
    const clientName = String(fm.client_name ?? "—");
    const taxType = String(fm.tax_type ?? "ESt");
    const year = Number(fm.year ?? new Date().getFullYear());
    const status = String(fm.status ?? "draft");
    const taxAmount = typeof fm.tax_amount === "number" ? fm.tax_amount : undefined;
    const refundAmount = typeof fm.refund_amount === "number" ? fm.refund_amount : undefined;
    const notes = sanitizeUserInput(String(fm.notes ?? returnData.content ?? ""));

    const jurisdictionLabel = body.jurisdiction === "at" ? "AT (Österreich)" : "DE (Deutschland)";
    const langHint = body.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

    const prompt = `Du bist ein erfahrener Steuerberater-Strategie-Berater (${jurisdictionLabel}).
Analysiere die folgende Steuererklärung und entwickle eine Strategieempfehlung.

STEUERERKLÄRUNGSDATEN:
- Mandant: ${clientName}
- Steuerart: ${taxType}
- Jahr: ${year}
- Status: ${status}
- Festgesetzte Steuer: ${taxAmount ?? "nicht bekannt"}
- Erstattung: ${refundAmount ?? "keine"}
- Notizen: ${notes}

${langHint}
Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "summary": "Kurzzusammenfassung der steuerlichen Situation (2-3 Sätze)",
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

    let rawResponse = "";
    try {
      const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          query: prompt,
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

      rawResponse = await collectSSEChunks(thinkRes.body!);
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Strategy generation failed",
        503
      );
    }

    const parsed = safeParseJson(rawResponse);

    const strategy: TaxStrategyResult = {
      summary: String(parsed.summary ?? rawResponse.slice(0, 500)),
      recommended: String(parsed.recommended ?? ""),
      recommendedApproach: String(parsed.recommendedApproach ?? ""),
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.map((r: Record<string, unknown>) => ({
            description: String(r.description ?? ""),
            probability:
              r.probability === "high" || r.probability === "medium" || r.probability === "low"
                ? r.probability
                : "medium",
            impact:
              r.impact === "high" || r.impact === "medium" || r.impact === "low"
                ? r.impact
                : "medium",
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

    try {
      await enginePatchPage(ctx.headers, {
        slug: body.return_slug,
        frontmatter: {
          strategy: strategy,
          strategy_generated_at: strategy.generatedAt,
        },
      });
    } catch {
      // best-effort
    }

    return Response.json(strategy);
  }
);

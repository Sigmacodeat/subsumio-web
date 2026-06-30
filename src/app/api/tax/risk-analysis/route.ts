import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

export const maxDuration = 120;

const riskSchema = z.object({
  client_slug: z.string().optional(),
  return_slug: z.string().optional(),
  text: z.string().max(512_000).optional(),
  jurisdiction: z.enum(["de", "at"]).optional().default("de"),
});

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

interface RiskResult {
  overall_risk_level: "low" | "medium" | "high";
  risks: Array<{
    category: string;
    description: string;
    severity: "low" | "medium" | "high";
    potential_amount?: number;
    mitigation: string;
    legal_basis?: string;
  }>;
  recommendations: string[];
  generatedAt: string;
}

export const POST = createHandler(
  {
    action: "tax.risk_analysis",
    rateTier: "heavy",
    body: riskSchema,
    audit: (_ctx, body) => ({
      action: "tax.risk_analysis" as const,
      entityType: "tax_risk",
      details: {
        client_slug: body.client_slug,
        return_slug: body.return_slug,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    let contextText = "";

    if (body.return_slug) {
      const encodedSlug = body.return_slug.split("/").map(encodeURIComponent).join("/");
      try {
        const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const page = (await res.json()) as { content?: string; title?: string };
          contextText = [page.title, page.content].filter(Boolean).join("\n\n");
        }
      } catch {
        /* ignore */
      }
    }

    if (!contextText && body.text) {
      contextText = body.text;
    }

    if (!contextText.trim()) {
      return apiError("no_data", "No data provided for risk analysis", 400);
    }

    const safeText = sanitizeUserInput(contextText.slice(0, 80_000));
    const jurisdictionLabel =
      body.jurisdiction === "at" ? "AT (Österreich, BAO/BAO)" : "DE (Deutschland, AO)";

    const prompt = `Du bist ein Steuerberater-Risikoanalyst (${jurisdictionLabel}).
Analysiere die folgenden Steuerdaten auf Risiken.

STEUERDATEN:
---
${safeText}
---

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "overall_risk_level": "low|medium|high",
  "risks": [
    {
      "category": "Nachzahlung|Verspätungszuschlag|Hinterziehung|Betriebsprüfung|Sonstiges",
      "description": "Konkrete Risikobeschreibung",
      "severity": "low|medium|high",
      "potential_amount": null,
      "mitigation": "Empfohlene Maßnahme",
      "legal_basis": "§ XYZ AO"
    }
  ],
  "recommendations": ["Konkrete Empfehlungen"]
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
          `Risk analysis failed: ${thinkRes.status}`,
          thinkRes.status
        );
      }

      rawResponse = await collectSSEChunks(thinkRes.body!);
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Risk analysis failed",
        503
      );
    }

    const parsed = safeParseJson(rawResponse);

    const result: RiskResult = {
      overall_risk_level:
        parsed.overall_risk_level === "high" ||
        parsed.overall_risk_level === "medium" ||
        parsed.overall_risk_level === "low"
          ? parsed.overall_risk_level
          : "medium",
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.map((r: Record<string, unknown>) => ({
            category: String(r.category ?? "Sonstiges"),
            description: String(r.description ?? ""),
            severity:
              r.severity === "high" || r.severity === "medium" || r.severity === "low"
                ? r.severity
                : "medium",
            potential_amount:
              typeof r.potential_amount === "number" ? r.potential_amount : undefined,
            mitigation: String(r.mitigation ?? ""),
            legal_basis: r.legal_basis ? String(r.legal_basis) : undefined,
          }))
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((r: unknown) => String(r))
        : [],
      generatedAt: new Date().toISOString(),
    };

    return Response.json(result);
  }
);

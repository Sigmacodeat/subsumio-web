import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

export const maxDuration = 120;

const searchSchema = z.object({
  query: z.string().min(2, "query_too_short").max(2000),
  jurisdiction: z.enum(["de", "at"]).optional().default("de"),
  limit: z.number().min(1).max(20).optional().default(5),
});

interface PrecedentResult {
  precedents: Array<{
    court: string;
    date: string;
    file_number: string;
    summary: string;
    relevance: number;
    key_holdings: string[];
    legal_basis: string[];
  }>;
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
    action: "tax.precedent_search",
    rateTier: "heavy",
    body: searchSchema,
    audit: (_ctx, body) => ({
      action: "tax.precedent_search" as const,
      entityType: "tax_precedent",
      details: { query: body.query.slice(0, 100) },
    }),
  },
  async (ctx, body, _query, _req) => {
    const safeQuery = sanitizeUserInput(body.query);
    const jurisdictionLabel =
      body.jurisdiction === "at" ? "AT (BFH/FG/österreichisch)" : "DE (BFH/FG/deutsch)";

    const prompt = `Du bist ein Steuerrecht-Recherche-Experte (${jurisdictionLabel}).
Suche relevante BFH-Urteile und Finanzgerichtsurteile zur folgenden Frage.

FRAGE:
${safeQuery}

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown), maximal ${body.limit} Ergebnisse:
{
  "precedents": [
    {
      "court": "BFH | FG <Stadt> | BVerfG",
      "date": "YYYY-MM-DD",
      "file_number": "z.B. VI R 42/23",
      "summary": "Kurzzusammenfassung der Entscheidung (2-3 Sätze)",
      "relevance": 0.0-1.0,
      "key_holdings": ["Leitsätze/Kernaussagen"],
      "legal_basis": ["§ XYZ EStG", "§ XYZ AO"]
    }
  ]
}

WICHTIG: Nenne NUR reale, existierende Urteile. Erfinde KEINE Aktenzeichen oder Daten.
Wenn du keine relevanten Urteile kennst, gib ein leeres Array zurück.`;

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
          `Precedent search failed: ${thinkRes.status}`,
          thinkRes.status
        );
      }

      rawResponse = await collectSSEChunks(thinkRes.body!);
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "Precedent search failed",
        503
      );
    }

    const parsed = safeParseJson(rawResponse);

    const result: PrecedentResult = {
      precedents: Array.isArray(parsed.precedents)
        ? parsed.precedents.slice(0, body.limit).map((p: Record<string, unknown>) => ({
            court: String(p.court ?? ""),
            date: String(p.date ?? ""),
            file_number: String(p.file_number ?? ""),
            summary: String(p.summary ?? ""),
            relevance:
              typeof p.relevance === "number" ? Math.max(0, Math.min(1, p.relevance)) : 0.5,
            key_holdings: Array.isArray(p.key_holdings)
              ? p.key_holdings.map((h: unknown) => String(h))
              : [],
            legal_basis: Array.isArray(p.legal_basis)
              ? p.legal_basis.map((b: unknown) => String(b))
              : [],
          }))
        : [],
      generatedAt: new Date().toISOString(),
    };

    return Response.json(result);
  }
);

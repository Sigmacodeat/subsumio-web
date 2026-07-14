import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { collectSSEChunks } from "@/lib/sse-stream";
import { buildTaxBfhFeedPrompt, type TaxJurisdiction } from "@/lib/tax-prompts";

export const maxDuration = 120;

const feedSchema = z.object({
  topic: z.string().max(500).optional(),
  limit: z.number().min(1).max(20).optional().default(10),
  jurisdiction: z.enum(["de", "at", "ch"]).optional().default("de"),
});

interface BfhDecision {
  court: string;
  file_number: string;
  date: string;
  topic: string;
  summary: string;
  key_holdings: string[];
  legal_basis: string[];
  relevance: "high" | "medium" | "low";
}

interface BfhFeedResult {
  decisions: BfhDecision[];
  topic_summary: string;
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
    action: "tax.bfh_feed",
    rateTier: "heavy",
    body: feedSchema,
    audit: (_ctx, body) => ({
      action: "tax.bfh_feed" as const,
      entityType: "tax_bfh_feed",
      details: { topic: body.topic, limit: body.limit },
    }),
  },
  async (ctx, body, _query, _req) => {
    const topic = body.topic || "aktuelle steuerrechtliche Entwicklungen";
    let corpusResults: Array<{ slug: string; title: string; snippet: string }> = [];
    try {
      const searchRes = await fetch(`${ENGINE_URL}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          query: `BFH Urteil ${topic} ${new Date().getFullYear()}`,
          mode: "balanced",
          source_id: ctx.brainId,
          limit: body.limit * 2,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const hits = Array.isArray(searchData)
          ? searchData
          : Array.isArray(searchData?.results)
            ? searchData.results
            : [];
        corpusResults = hits.slice(0, body.limit * 2).map((h: Record<string, unknown>) => ({
          slug: String(h.slug ?? h.id ?? ""),
          title: String(h.title ?? ""),
          snippet: String(h.snippet ?? h.text ?? ""),
        }));
      }
    } catch {
      // best-effort search
    }

    const prompt = buildTaxBfhFeedPrompt({
      topic,
      jurisdiction: body.jurisdiction.toUpperCase() as TaxJurisdiction,
      corpusResults: corpusResults.map((r) => ({ title: r.title, snippet: r.snippet })),
    });

    let rawResponse = "";
    try {
      const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          query: prompt,
          mode: "balanced",
          tax_mode: true,
          source_id: ctx.brainId,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!thinkRes.ok) {
        return apiError(
          "think_failed",
          `BFH feed generation failed: ${thinkRes.status}`,
          thinkRes.status
        );
      }

      rawResponse = await collectSSEChunks(thinkRes.body!);
    } catch (err) {
      return apiError(
        "think_failed",
        err instanceof Error ? err.message : "BFH feed generation failed",
        503
      );
    }

    const parsed = safeParseJson(rawResponse);

    const result: BfhFeedResult = {
      decisions: Array.isArray(parsed.decisions)
        ? (parsed.decisions as Record<string, unknown>[]).slice(0, body.limit).map((d) => ({
            court: String(d.court ?? "BFH"),
            file_number: String(d.file_number ?? ""),
            date: String(d.date ?? ""),
            topic: String(d.topic ?? ""),
            summary: String(d.summary ?? ""),
            key_holdings: Array.isArray(d.key_holdings)
              ? d.key_holdings.map((h: unknown) => String(h))
              : [],
            legal_basis: Array.isArray(d.legal_basis)
              ? d.legal_basis.map((b: unknown) => String(b))
              : [],
            relevance:
              d.relevance === "high" || d.relevance === "medium" || d.relevance === "low"
                ? (d.relevance as BfhDecision["relevance"])
                : "medium",
          }))
        : [],
      topic_summary: String(parsed.topic_summary ?? ""),
      generatedAt: new Date().toISOString(),
    };

    return Response.json(result);
  }
);

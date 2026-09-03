import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { apiError } from "@/lib/api-response";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { collectSSEChunks } from "@/lib/sse-stream";
import { buildTaxAnalyzePrompt } from "@/lib/tax-prompts";

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

function encodeSlugPath(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

export const POST = createHandler(
  {
    action: "tax.analyze",
    rateTier: "heavy",
    quota: "queries",
    credits: "document_analysis",
    body: analyzeSchema,
    maxDuration: 120,
    allowInternal: true,
    audit: (_ctx, body) => ({
      action: "tax.analyze" as const,
      entityType: "document",
      entityId: body.document_slug,
      details: {
        jurisdiction: body.jurisdiction,
        source: body.document_slug ? "document_slug" : "inline_text",
      },
    }),
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
          query: buildTaxAnalyzePrompt(sanitizeUserInput(text), jurisdiction),
          mode: "balanced",
          tax_mode: true,
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

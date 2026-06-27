import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiStream, apiError, recordQuota } from "@/lib/api-handler";
import { groundRedlineCitations } from "@/lib/citation-gate";
import { createCitationGateStream } from "@/lib/citation-gate";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";

export const maxDuration = 300;

const contractRedlineSchema = z.object({
  original_text: z.string().min(1, "original_text_required").max(100_000, "text_too_long"),
  counterparty_text: z.string().max(100_000).optional(),
  playbook_slug: z.string().optional(),
  contract_type: z.string().max(100).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
  perspective: z.enum(["client", "counterparty", "neutral"]).default("client"),
  language: z.enum(["de", "en"]).default("de"),
});

export const POST = createHandler(
  {
    action: "legal.redline",
    rateTier: "heavy",
    quota: "queries",
    body: contractRedlineSchema,
    audit: (_ctx, b) => ({
      action: "legal.redline" as const,
      entityType: "document",
      details: {
        jurisdiction: b.jurisdiction,
        perspective: b.perspective,
        contractType: b.contract_type,
        hasCounterparty: Boolean(b.counterparty_text),
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    void recordQuota(ctx, "queries");

    const payload = sanitizeObjectStrings({
      original_text: body.original_text,
      counterparty_text: body.counterparty_text || undefined,
      playbook_slug: body.playbook_slug || undefined,
      contract_type: body.contract_type || undefined,
      jurisdiction: body.jurisdiction,
      perspective: body.perspective,
      language: body.language,
    });

    try {
      const upstream = await fetch(`${ENGINE_URL}/api/legal/contract-redline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(300_000),
      });

      if (!upstream.ok) {
        const errPayload = await upstream.json().catch(() => ({}));
        return Response.json(
          errPayload.error ? errPayload : { error: `Engine returned ${upstream.status}` },
          { status: upstream.status }
        );
      }

      const contentType = upstream.headers.get("Content-Type") || "";

      // If engine returns SSE stream, wrap with citation gate
      if (contentType.includes("text/event-stream")) {
        return apiStream(createCitationGateStream(upstream.body!), {
          contentType,
          aiGenerated: true,
        });
      }

      // Engine returns JSON — parse, ground statute citations, inject _grounding
      const result = (await upstream.json()) as Record<string, unknown>;
      const redlines = Array.isArray(result.redlines)
        ? (result.redlines as Array<{ legal_basis?: string; reason?: string }>)
        : [];

      try {
        const grounding = await groundRedlineCitations(
          redlines,
          typeof result.summary === "string" ? result.summary : undefined
        );
        result._grounding = grounding;
      } catch (err) {
        console.error(
          "[contract-redline] grounding failed:",
          err instanceof Error ? err.message : String(err)
        );
        result._grounding = {
          citations_verified: 0,
          citations_unverified: 0,
          corpus_checked: false,
          grounded_citations: [],
          analyzed_at: new Date().toISOString(),
        };
      }

      return Response.json(result);
    } catch (err) {
      console.error(
        "[contract-redline] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);

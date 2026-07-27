import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import {
  createHandler,
  apiStream,
  apiError,
  recordQuota,
  recordCreditConsumption,
} from "@/lib/api-handler";
import { groundRedlineCitations } from "@/lib/citation-gate";
import { createCitationGateStream } from "@/lib/citation-gate";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";
import { storeReceipt, type WorkProductReceipt } from "@/lib/work-product-receipt-store";

export const maxDuration = 300;

const contractRedlineSchema = z.object({
  original_text: z.string().min(1, "original_text_required").max(100_000, "text_too_long"),
  counterparty_text: z.string().max(100_000).optional(),
  playbook_slug: z.string().optional(),
  contract_type: z.string().max(100).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
  perspective: z.enum(["client", "counterparty", "neutral"]).default("client"),
  language: z.enum(["de", "en"]).default("de"),
  case_slug: z.string().optional(),
  document_slug: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "legal.redline",
    rateTier: "heavy",
    quota: "queries",
    credits: "subsumption",
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
    void recordCreditConsumption(ctx, "subsumption", body.case_slug);

    const payload = sanitizeObjectStrings({
      original_text: body.original_text,
      counterparty_text: body.counterparty_text || undefined,
      playbook_slug: body.playbook_slug || undefined,
      contract_type: body.contract_type || undefined,
      jurisdiction: body.jurisdiction,
      perspective: body.perspective,
      language: body.language,
      case_slug: body.case_slug || undefined,
      document_slug: body.document_slug || undefined,
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
      const result = (await upstream.json()) as Record<string, unknown> & {
        receipt?: WorkProductReceipt;
      };
      const redlines = Array.isArray(result.redlines)
        ? (result.redlines as Array<{ legal_basis?: string; reason?: string }>)
        : [];

      // Persist the verification receipt if the engine produced one.
      // Override product_ref with a unique document/matter reference instead
      // of the default brain_id, ensuring receipts are scoped per-document.
      if (result.receipt) {
        try {
          const productRef =
            body.document_slug ||
            (body.case_slug ? `${body.case_slug}/redline` : undefined) ||
            `redline/${ctx.brainId}/${Date.now()}`;
          const scopedReceipt: WorkProductReceipt = {
            ...(result.receipt as WorkProductReceipt),
            product_type: "redline",
            product_ref: productRef,
            brain_id: ctx.brainId,
            user_id: (result.receipt as WorkProductReceipt).user_id ?? ctx.user.id,
          };
          await storeReceipt(scopedReceipt);
        } catch (err) {
          console.error(
            "[contract-redline] receipt store failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

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

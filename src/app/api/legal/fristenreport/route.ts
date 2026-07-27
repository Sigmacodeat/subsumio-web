import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, recordQuota, recordCreditConsumption } from "@/lib/api-handler";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";
import { storeReceipt, type WorkProductReceipt } from "@/lib/work-product-receipt-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const fristenreportSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  jurisdiction: z.enum(["at", "de", "ch"]).default("at"),
  language: z.enum(["de", "en"]).default("de"),
  include_overdue: z.boolean().default(true),
  include_upcoming_days: z.number().min(0).max(365).default(30),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    quota: "queries",
    credits: "deadline_detect",
    body: fristenreportSchema,
    audit: (_ctx, b) => ({
      action: "legal.fristenreport" as const,
      entityType: "deadline",
      details: {
        case_slug: b.case_slug,
        jurisdiction: b.jurisdiction,
        include_overdue: b.include_overdue,
        include_upcoming_days: b.include_upcoming_days,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    void recordQuota(ctx, "queries");
    void recordCreditConsumption(ctx, "deadline_detect", body.case_slug);

    const payload = sanitizeObjectStrings({
      case_slug: body.case_slug,
      jurisdiction: body.jurisdiction,
      language: body.language,
      include_overdue: body.include_overdue,
      include_upcoming_days: body.include_upcoming_days,
    });

    try {
      const upstream = await fetch(`${ENGINE_URL}/api/legal/fristenreport`, {
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

      const result = (await upstream.json()) as Record<string, unknown> & {
        receipt?: WorkProductReceipt;
      };

      const productRef = `${body.case_slug}/fristenreport`;
      if (result.receipt) {
        try {
          const scopedReceipt: WorkProductReceipt = {
            ...(result.receipt as WorkProductReceipt),
            product_type: "fristenreport",
            product_ref: productRef,
            brain_id: ctx.brainId,
            user_id: (result.receipt as WorkProductReceipt).user_id ?? ctx.user.id,
          };
          await storeReceipt(scopedReceipt);
        } catch (err) {
          console.error(
            "[fristenreport] receipt store failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      return Response.json(result);
    } catch (err) {
      console.error(
        "[fristenreport] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);

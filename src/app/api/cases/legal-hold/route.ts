import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  case_slug: z.string().min(1).max(300),
  legal_hold: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: toggleSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "legal_case",
      entityId: body.case_slug,
      details: {
        legal_hold: body.legal_hold,
        reason: body.reason,
        by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    // 1. Update case frontmatter
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.case_slug,
        merge: true,
        frontmatter: {
          legal_hold: body.legal_hold,
          legal_hold_reason: body.reason,
          legal_hold_set_at: new Date().toISOString(),
          legal_hold_set_by: ctx.user.email,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError("engine_error", "Akte konnte nicht aktualisiert werden", 502);
    }

    // 2. Broadcast SSE
    broadcastSseEvent(ctx.brainId, "case.legal_hold_toggled", {
      caseSlug: body.case_slug,
      legalHold: body.legal_hold,
      reason: body.reason,
    });

    // 3. Log audit
    await logAudit("case.update", "legal_case", {
      entityId: body.case_slug,
      brainId: ctx.brainId,
      details: {
        action: body.legal_hold ? "legal_hold_activated" : "legal_hold_released",
        reason: body.reason,
      },
    });

    return apiSuccess({
      ok: true,
      case_slug: body.case_slug,
      legal_hold: body.legal_hold,
    });
  }
);

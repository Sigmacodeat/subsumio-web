import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { readCurrentPage } from "@/lib/page-write-guards";

export const dynamic = "force-dynamic";

const toggleSchema = z.object({
  case_slug: z.string().min(1).max(300),
  legal_hold: z.boolean(),
  reason: z.string().max(500).optional(),
});

/** Lifting a hold ends a preservation duty: lawyer/admin only, with a reason. */
const LEGAL_HOLD_RELEASE_ROLES: ReadonlySet<string> = new Set(["admin", "lawyer"]);
const LEGAL_HOLD_RELEASE_REASON_MIN = 10;

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
        action: body.legal_hold ? "legal_hold_activated" : "legal_hold_released",
        legal_hold: body.legal_hold,
        reason: body.reason?.trim() || undefined,
        by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    const reason = body.reason?.trim() ?? "";
    if (!body.legal_hold) {
      if (!LEGAL_HOLD_RELEASE_ROLES.has(ctx.user.role)) {
        return apiError(
          "forbidden",
          "Eine Aufbewahrungssperre heben nur Anwältinnen/Anwälte oder Administratoren auf.",
          403
        );
      }
      if (reason.length < LEGAL_HOLD_RELEASE_REASON_MIN) {
        return apiError(
          "reason_required",
          `Bitte begründen Sie die Aufhebung (mindestens ${LEGAL_HOLD_RELEASE_REASON_MIN} Zeichen).`,
          400
        );
      }
    }

    // Only an existing matter carries a hold — a merge must never create a
    // page. Fail closed when the matter cannot be read.
    const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.case_slug);
    if (read.kind === "error") {
      return apiError("engine_error", "Die Akte konnte nicht geprüft werden", 503);
    }
    if (read.kind === "missing") return apiError("not_found", "Akte nicht gefunden", 404);
    const pageType = read.page.type ?? read.page.frontmatter?.type;
    if (pageType !== "legal_case") {
      return apiError("not_a_case", "Eine Aufbewahrungssperre gilt nur für Akten", 400);
    }

    // 1. Update case frontmatter
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.case_slug,
        merge: true,
        frontmatter: {
          legal_hold: body.legal_hold,
          legal_hold_reason: reason || undefined,
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
      reason: reason || undefined,
    });

    // 3. Audit: one entry, written by createHandler from the `audit:` spec.

    return apiSuccess({
      ok: true,
      case_slug: body.case_slug,
      legal_hold: body.legal_hold,
    });
  }
);

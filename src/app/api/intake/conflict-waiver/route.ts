import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { intakeFromPage } from "@/lib/intake";
import { canWaiveConflict } from "@/lib/conflict-gate";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  slug: z.string().min(1, "slug_required"),
  reason: z.string().trim().min(10, "Bitte die Freigabe begründen (mind. 10 Zeichen).").max(2000),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * Begründete Freigabe einer festgestellten Kollision (§ 10 Abs 1 RAO).
 * Nur Anwalt/Admin; nur für eine serverseitig festgestellte Kollision; der
 * freigebende Nutzer wird mit echter ID, E-Mail und Rolle protokolliert.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: schema,
    audit: (ctx, body) => ({
      action: "conflict.waive" as const,
      entityType: "intake_request",
      entityId: body.slug,
      details: { waived_by: ctx.user.email, role: ctx.user.role, reason: body.reason },
    }),
  },
  async (ctx, body) => {
    if (!canWaiveConflict(ctx.user.role)) {
      return apiError(
        "conflict_waiver_unauthorized",
        "Konflikt-Freigabe erfordert die Rolle Anwalt oder Admin.",
        403
      );
    }

    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(body.slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) return apiError("intake_not_found", "Intake konnte nicht geladen werden", 404);
    const intake = intakeFromPage((await getRes.json()) as BrainPage);
    if (!intake) return apiError("not_intake_request", "Die Seite ist kein Intake", 400);

    const acceptance = intake.frontmatter.acceptance;
    const check = acceptance?.conflict_check;
    if (!acceptance || !check || check.status !== "conflict" || !check.performed_by_id) {
      return apiError(
        "no_conflict_to_waive",
        "Es liegt keine serverseitig festgestellte Kollision vor, die freigegeben werden könnte.",
        409
      );
    }

    const now = new Date().toISOString();
    const conflictCheck = {
      ...check,
      waived: true,
      waived_by: ctx.user.email,
      waived_by_id: ctx.user.id,
      waived_by_role: ctx.user.role,
      waived_reason: body.reason,
      waived_at: now,
    };

    const writeRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.slug,
        title: intake.title,
        type: "intake_request",
        merge: true,
        frontmatter: {
          acceptance: { ...acceptance, conflict_check: conflictCheck },
          updated_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!writeRes.ok) {
      return apiError("intake_update_failed", "Freigabe konnte nicht gespeichert werden", 502);
    }

    broadcastSseEvent(ctx.brainId, "intake.updated", { slug: body.slug, by: ctx.user.email });
    return apiSuccess({ conflict_check: conflictCheck });
  }
);

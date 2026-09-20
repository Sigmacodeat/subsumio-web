import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { ENGINE_URL } from "@/lib/engine";
import { firmLearningState } from "@/lib/brain-learning";

/**
 * GET/PATCH /api/settings/brain-learning — firm setting "Kanzlei-Gehirn lernt mit".
 *
 * Everyone in the firm may read it; only a firm admin may change it (the
 * `settings.write` permission is admin-only, checked again below). Stored on
 * the org for teams and on the account for a lawyer working alone. The engine
 * is updated FIRST through the firm's own server-set headers, so the web never
 * shows "off" while the engine would still learn. See
 * docs/architecture/BRAIN_LEARNING.md.
 */

const patchSchema = z.object({ enabled: z.boolean() });

export const GET = createHandler({ action: "settings.read", rateTier: "standard" }, async (ctx) => {
  const user = await getStore().getById(ctx.user.id);
  if (!user) return apiError("user_not_found", "User not found", 404);
  // ctx.user carries the effective org (support sessions switch it).
  const state = await firmLearningState({ ...user, orgId: ctx.user.orgId ?? null });
  return apiSuccess({
    enabled: state.enabled,
    scope: state.scope,
    canEdit: ctx.user.role === "admin" && !ctx.supportSession,
  });
});

export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => ({
      action: "settings.brain_learning" as const,
      entityType: ctx.user.orgId ? "org" : "user",
      entityId: ctx.user.orgId ?? ctx.user.id,
      details: { enabled: body.enabled },
    }),
  },
  async (ctx, body) => {
    if (ctx.user.role !== "admin") {
      return apiError(
        "admin_only",
        "Nur Administratorinnen und Administratoren der Kanzlei können das ändern.",
        403
      );
    }
    // A platform operator inside a support session must not change a firm's
    // data-use decision on its behalf.
    if (ctx.supportSession) {
      return apiError(
        "support_session_read_only",
        "Diese Einstellung kann nur die Kanzlei selbst ändern.",
        403
      );
    }

    const user = await getStore().getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);
    const state = await firmLearningState({ ...user, orgId: ctx.user.orgId ?? null });

    // Engine first: the flag must be live where the learning happens before
    // the web reports it. ctx.headers carries this firm's own brain as source.
    let engineOk = false;
    try {
      const res = await fetch(`${ENGINE_URL}/api/brain/learning`, {
        method: "PUT",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: body.enabled }),
        signal: AbortSignal.timeout(10_000),
      });
      engineOk = res.ok;
    } catch {
      engineOk = false;
    }
    if (!engineOk) {
      return apiError(
        "engine_unavailable",
        "Die Einstellung konnte gerade nicht übernommen werden. Bitte versuchen Sie es in einigen Minuten erneut.",
        502
      );
    }

    if (state.scope === "org" && state.org) {
      const updated = await getOrgStore().update(state.org.id, { brainLearning: body.enabled });
      if (!updated) return apiError("org_not_found", "Organisation nicht gefunden", 404);
    } else {
      const updated = await getStore().update(user.id, { brainLearning: body.enabled });
      if (!updated) return apiError("user_not_found", "User not found", 404);
    }

    return apiSuccess({ enabled: body.enabled, scope: state.scope, canEdit: true });
  }
);

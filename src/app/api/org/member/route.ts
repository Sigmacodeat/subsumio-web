import { z } from "zod";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";

const memberSchema = z.object({
  userId: z.string().min(1, "missing_user"),
});

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: memberSchema,
    audit: (ctx, body) => ({
      action: "team.remove" as const,
      entityType: "org",
      entityId: body.userId,
      details: { removed_by: ctx.user.id },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (!ctx.user.orgId) return apiError("not_in_org", "Nicht in einer Organisation", 400);

    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org || org.ownerId !== ctx.user.id) {
      return apiError("owner_only", "Nur der Eigentümer kann Mitglieder entfernen", 403);
    }

    if (body.userId === ctx.user.id) {
      return apiError(
        "owner_cannot_remove_self",
        "Eigentümer kann sich nicht selbst entfernen",
        400
      );
    }

    const store = getStore();
    const target = await store.getById(body.userId);
    if (!target || target.orgId !== org.id) {
      return apiError("not_a_member", "Nutzer ist kein Mitglied", 404);
    }

    await store.update(target.id, { orgId: null });
    return Response.json({ ok: true });
  }
);

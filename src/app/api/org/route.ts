
import { z } from "zod";
import { getStore, getOrgStore, buildNewOrg, toPublic } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";

const orgPostSchema = z.object({
  name: z.string().trim().min(2, "invalid_name").max(80, "invalid_name"),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    if (!ctx.user.orgId) return Response.json({ org: null });

    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org) return Response.json({ org: null });

    const members = (await getStore().list())
      .filter((u) => u.orgId === org.id)
      .map((u) => ({ ...toPublic(u), isOwner: u.id === org.ownerId }));
    return Response.json({
      org: { id: org.id, name: org.name, ownerId: org.ownerId, createdAt: org.createdAt },
      members,
      isOwner: ctx.user.id === org.ownerId,
    });
  },
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: orgPostSchema,
    audit: (_ctx, body) => ({
      action: "team.invite" as const,
      entityType: "org",
      details: { name: body.name },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (ctx.user.orgId) return apiError("already_in_org", "Bereits in einer Organisation", 409);

    const org = await getOrgStore().create(buildNewOrg({ name: body.name, ownerId: ctx.user.id }));
    await getStore().update(ctx.user.id, { orgId: org.id });
    return Response.json({ org }, { status: 201 });
  },
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "team.remove" as const,
      entityType: "org",
      entityId: ctx.user.orgId ?? undefined,
    }),
  },
  async (ctx, _body, _query, _req) => {
    if (!ctx.user.orgId) return apiError("not_in_org", "Keine Organisation", 400);

    const orgs = getOrgStore();
    const org = await orgs.getById(ctx.user.orgId);
    if (!org) {
      await getStore().update(ctx.user.id, { orgId: null });
      return Response.json({ ok: true });
    }

    if (ctx.user.id === org.ownerId) {
      const memberCount = (await getStore().list()).filter((u) => u.orgId === org.id).length;
      if (memberCount > 1) {
        return apiError("owner_must_remove_members_first", "Zuerst Mitglieder entfernen", 409);
      }
      await getStore().update(ctx.user.id, { orgId: null });
      await orgs.delete(org.id);
      return Response.json({ ok: true });
    }

    await getStore().update(ctx.user.id, { orgId: null });
    return Response.json({ ok: true });
  },
);

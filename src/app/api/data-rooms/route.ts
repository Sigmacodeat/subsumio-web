import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getOrgStore } from "@/lib/auth/store";
import { logAudit } from "@/lib/audit";
import { getDataRoomStore, memberActive } from "@/lib/data-rooms";
import { mayManageCase, readCase } from "@/lib/data-room-access";
import { tenantIdForUser } from "@/lib/tenants";

export const dynamic = "force-dynamic";

const createSchema = z.object({ case_slug: z.string().min(1).max(300) });

/** The rooms the caller's firm hosts and the rooms other firms shared with it. */
export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  const tenant = tenantIdForUser(ctx.user);
  if (!tenant) return apiSuccess({ hosted: [], shared_with_us: [] });
  const store = getDataRoomStore();
  const hosted = await store.roomsHostedBy(tenant);
  const hostedOut = await Promise.all(
    hosted.map(async (room) => {
      const [docs, members] = await Promise.all([store.documents(room.id), store.members(room.id)]);
      return {
        id: room.id,
        title: room.title,
        case_slug: room.caseSlug,
        documents: docs.length,
        members: members.filter((m) => m.status !== "revoked").length,
        created_at: room.createdAt,
      };
    })
  );
  const guest = (await store.membershipsOf(tenant)).filter((m) => memberActive(m.member));
  const guestOut = await Promise.all(
    guest.map(async ({ room, member }) => ({
      id: room.id,
      title: room.title,
      host_firm: room.hostFirmName,
      documents: (await store.documents(room.id)).length,
      expires_at: member.expiresAt,
      accepted_at: member.acceptedAt,
    }))
  );
  return apiSuccess({ hosted: hostedOut, shared_with_us: guestOut });
});

/** Open the data room of a matter (idempotent: an existing room is returned). */
export const POST = createHandler(
  { action: "brain.write", rateTier: "standard", body: createSchema },
  async (ctx, body) => {
    const tenant = tenantIdForUser(ctx.user);
    if (!tenant) return apiError("forbidden", "Kein Kanzleikonto", 403);
    if (!(await mayManageCase(ctx, body.case_slug))) {
      return apiError("forbidden", "Sie dürfen diese Akte nicht freigeben.", 403);
    }
    const store = getDataRoomStore();
    const existing = await store.roomForCase(tenant, body.case_slug);
    if (existing) return apiSuccess({ id: existing.id, created: false });

    const matter = await readCase(ctx, body.case_slug);
    const org = ctx.user.orgId ? await getOrgStore().getById(ctx.user.orgId) : null;
    const room = await store.createRoom({
      hostTenantId: tenant,
      hostBrainId: ctx.brainId,
      hostFirmName: org?.name ?? (ctx.user.name ? `Kanzlei ${ctx.user.name}` : ctx.user.email),
      caseSlug: body.case_slug,
      title: matter?.title ?? body.case_slug,
      createdBy: ctx.user.id,
    });
    void logAudit("data_room.create", "data_room", {
      entityId: room.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { case_slug: body.case_slug },
    });
    return apiSuccess({ id: room.id, created: true });
  }
);

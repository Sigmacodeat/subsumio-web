import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone, type WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { isStaffWhatsAppRole } from "@/lib/whatsapp/identity";
import { getStore } from "@/lib/auth/store";
import { firmBrainIdFor } from "@/lib/engine";

export const dynamic = "force-dynamic";

const identityPostSchema = z.object({
  phone: z.string().min(6, "phone_required").max(40),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client", "external", "intake"]).default("lawyer"),
  status: z.enum(["active", "suspended", "revoked"]).default("active"),
  // Staff number: "all" = everything the member may see (the engine applies
  // their walls). Client/intake numbers start with no matter.
  matter_scope: z
    .union([z.literal("all"), z.array(z.string().min(1).max(200)).max(100)])
    .optional(),
  /** The firm member who owns a staff number (required for staff roles). */
  member_user_id: z.string().min(1).max(200).optional(),
});

const identityPatchSchema = z.object({
  id: z.string().min(1, "id_required"),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client", "external", "intake"]).optional(),
  status: z.enum(["active", "suspended", "revoked"]).optional(),
  matter_scope: z
    .union([z.literal("all"), z.array(z.string().min(1).max(200)).max(100)])
    .optional(),
  /** Reassign the owning member; "" removes the binding. */
  member_user_id: z.string().max(200).optional(),
});

const identityDeleteSchema = z.object({
  id: z.string().min(1, "id_required"),
});

/**
 * A member a staff number may be bound to: an active staff account that works
 * in the caller's brain. Returns an error response otherwise.
 */
async function checkMember(brainId: string, memberUserId: string): Promise<Response | null> {
  const user = await getStore().getById(memberUserId);
  const ok =
    user &&
    !user.deactivatedAt &&
    !user.deletedAt &&
    ["admin", "lawyer", "assistant"].includes(user.role) &&
    (await firmBrainIdFor(user)) === brainId;
  return ok
    ? null
    : apiError("member_not_found", "Dieses Kanzleimitglied wurde nicht gefunden.", 400);
}

function publicIdentity(identity: WhatsAppIdentity) {
  return {
    id: identity.id,
    orgId: identity.orgId,
    brainId: identity.brainId,
    userId: identity.userId,
    memberUserId: identity.memberUserId,
    name: identity.name,
    role: identity.role,
    matterScope: identity.matterScope,
    status: identity.status,
    verifiedAt: identity.verifiedAt,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    phoneHash: identity.phoneHash,
  };
}

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const identities = await getWhatsAppIdentityStore().listByOrg(ctx.user.orgId || ctx.brainId);
    return Response.json({ identities: identities.map(publicIdentity) });
  }
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: identityPostSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_identity",
      details: {
        role: body.role,
        status: body.status,
        phoneLast4: body.phone.slice(-4),
        by: ctx.user.email,
        member: body.member_user_id,
      },
    }),
  },
  async (ctx, body) => {
    const staff = isStaffWhatsAppRole(body.role);
    // A staff number acts for one person (KI4-04): walls and document ACL are
    // that person's. Without a member the engine could not apply them.
    if (staff && !body.member_user_id) {
      return apiError(
        "member_required",
        "Bitte wählen Sie das Kanzleimitglied, dem diese Nummer gehört.",
        400
      );
    }
    if (staff && body.member_user_id) {
      const refused = await checkMember(ctx.brainId, body.member_user_id);
      if (refused) return refused;
    }
    const phone = normalizePhone(body.phone);
    const hash = phoneHash(phone);
    const store = getWhatsAppIdentityStore();
    const existing = await store.getByPhoneHash(hash);
    if (existing && existing.orgId !== (ctx.user.orgId || ctx.brainId)) {
      return apiError(
        "phone_already_bound",
        "Diese WhatsApp-Nummer ist bereits einer anderen Kanzlei zugeordnet.",
        409
      );
    }
    const now = new Date().toISOString();
    const identity: WhatsAppIdentity = {
      id: existing?.id ?? `wa_${randomUUID()}`,
      orgId: ctx.user.orgId || ctx.brainId,
      brainId: ctx.brainId,
      phone,
      phoneHash: hash,
      // Who created the entry (audit) — not the owner of the number.
      userId: ctx.user.id,
      ...(staff ? { memberUserId: body.member_user_id } : {}),
      name: body.name || ctx.user.name || ctx.user.email,
      role: body.role,
      matterScope: body.matter_scope ?? (staff ? "all" : []),
      status: body.status,
      verifiedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const saved = existing
      ? await store.update(existing.id, identity)
      : await store.create(identity);
    return Response.json(
      { identity: publicIdentity(saved ?? identity) },
      { status: existing ? 200 : 201 }
    );
  }
);

export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: identityPatchSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_identity",
      entityId: body.id,
      details: { by: ctx.user.email, status: body.status, member: body.member_user_id },
    }),
  },
  async (ctx, body) => {
    const store = getWhatsAppIdentityStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.orgId !== (ctx.user.orgId || ctx.brainId)) {
      return apiError("identity_not_found", "WhatsApp-Identity nicht gefunden", 404);
    }
    if (body.member_user_id) {
      const refused = await checkMember(ctx.brainId, body.member_user_id);
      if (refused) return refused;
    }
    const updated = await store.update(body.id, {
      name: body.name,
      role: body.role,
      status: body.status,
      matterScope: body.matter_scope,
      // Only when sent: a status-only change must not drop the binding.
      ...(body.member_user_id !== undefined ? { memberUserId: body.member_user_id } : {}),
    });
    return Response.json({ identity: updated ? publicIdentity(updated) : null });
  }
);

export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: identityDeleteSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_identity",
      entityId: body.id,
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const store = getWhatsAppIdentityStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.orgId !== (ctx.user.orgId || ctx.brainId)) {
      return apiError("identity_not_found", "WhatsApp-Identity nicht gefunden", 404);
    }
    await store.delete(body.id);
    return Response.json({ ok: true });
  }
);

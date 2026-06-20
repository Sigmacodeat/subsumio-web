import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone, type WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";

export const dynamic = "force-dynamic";

const identityPostSchema = z.object({
  phone: z.string().min(6, "phone_required").max(40),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client", "external", "intake"]).default("lawyer"),
  status: z.enum(["active", "suspended", "revoked"]).default("active"),
  matter_scope: z.union([z.literal("all"), z.array(z.string().min(1))]).default("all"),
});

const identityPatchSchema = z.object({
  id: z.string().min(1, "id_required"),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client", "external", "intake"]).optional(),
  status: z.enum(["active", "suspended", "revoked"]).optional(),
  matter_scope: z.union([z.literal("all"), z.array(z.string().min(1))]).optional(),
});

const identityDeleteSchema = z.object({
  id: z.string().min(1, "id_required"),
});

function publicIdentity(identity: WhatsAppIdentity) {
  return {
    id: identity.id,
    orgId: identity.orgId,
    brainId: identity.brainId,
    userId: identity.userId,
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
  },
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: identityPostSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_identity",
      details: { role: body.role, status: body.status, phoneLast4: body.phone.slice(-4), by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const phone = normalizePhone(body.phone);
    const hash = phoneHash(phone);
    const store = getWhatsAppIdentityStore();
    const existing = await store.getByPhoneHash(hash);
    if (existing && existing.orgId !== (ctx.user.orgId || ctx.brainId)) {
      return apiError("phone_already_bound", "Diese WhatsApp-Nummer ist bereits einer anderen Kanzlei zugeordnet.", 409);
    }
    const now = new Date().toISOString();
    const identity: WhatsAppIdentity = {
      id: existing?.id ?? `wa_${randomUUID()}`,
      orgId: ctx.user.orgId || ctx.brainId,
      brainId: ctx.brainId,
      phone,
      phoneHash: hash,
      userId: ctx.user.id,
      name: body.name || ctx.user.name || ctx.user.email,
      role: body.role,
      matterScope: body.matter_scope,
      status: body.status,
      verifiedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const saved = existing
      ? await store.update(existing.id, identity)
      : await store.create(identity);
    return Response.json({ identity: publicIdentity(saved ?? identity) }, { status: existing ? 200 : 201 });
  },
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
      details: { by: ctx.user.email, status: body.status },
    }),
  },
  async (ctx, body) => {
    const store = getWhatsAppIdentityStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.orgId !== (ctx.user.orgId || ctx.brainId)) {
      return apiError("identity_not_found", "WhatsApp-Identity nicht gefunden", 404);
    }
    const updated = await store.update(body.id, {
      name: body.name,
      role: body.role,
      status: body.status,
      matterScope: body.matter_scope,
    });
    return Response.json({ identity: updated ? publicIdentity(updated) : null });
  },
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
  },
);

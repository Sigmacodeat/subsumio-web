import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore, type User } from "@/lib/auth/store";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone, phoneCountryFor, type WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { isWhatsAppStaffRole } from "@/lib/whatsapp/staff-account";
import {
  CLIENT_CONSENT_SCOPES,
  STAFF_CONSENT_SCOPES,
  grantWhatsAppConsent,
} from "@/lib/whatsapp/consent-grant";

export const dynamic = "force-dynamic";

const identityPostSchema = z.object({
  phone: z.string().min(6, "phone_required").max(40),
  /** The firm member this number belongs to (required for firm roles). */
  user_id: z.string().min(1).max(200).optional(),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client", "external", "intake"]).default("lawyer"),
  status: z.enum(["active", "suspended", "revoked"]).default("active"),
  matter_scope: z
    .union([z.literal("all"), z.array(z.string().min(1).max(200)).max(100)])
    .default("all"),
});

const identityPatchSchema = z.object({
  id: z.string().min(1, "id_required"),
  user_id: z.string().min(1).max(200).optional(),
  /** Record a consent obtained outside WhatsApp (e.g. signed form), with a note. */
  record_consent: z.object({ note: z.string().trim().min(3).max(500) }).optional(),
  name: z.string().max(120).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client", "external", "intake"]).optional(),
  status: z.enum(["active", "suspended", "revoked"]).optional(),
  matter_scope: z
    .union([z.literal("all"), z.array(z.string().min(1).max(200)).max(100)])
    .optional(),
});

const identityDeleteSchema = z.object({
  id: z.string().min(1, "id_required"),
});

type Ctx = { brainId: string; user: User };

function firmKey(ctx: Ctx): string {
  return ctx.user.orgId || ctx.brainId;
}

/**
 * A firm number belongs to one active member of this firm. Without a firm
 * (lawyer working alone) the only member is the signed-in person.
 */
async function firmMember(ctx: Ctx, userId: string | undefined): Promise<User | Response> {
  const id = userId ?? (ctx.user.orgId ? undefined : ctx.user.id);
  if (!id) {
    return apiError(
      "user_required",
      "Bitte wählen Sie das Benutzerkonto, dem diese Nummer gehört.",
      400
    );
  }
  const user = id === ctx.user.id ? ctx.user : await getStore().getById(id);
  const sameFirm = ctx.user.orgId ? user?.orgId === ctx.user.orgId : user?.id === ctx.user.id;
  if (!user || !sameFirm || user.deactivatedAt) {
    return apiError("user_not_found", "Benutzerkonto nicht gefunden oder nicht aktiv.", 404);
  }
  if (!isWhatsAppStaffRole(user.role)) {
    return apiError(
      "user_not_staff",
      "Nur Kanzleimitarbeiter:innen können Kanzlei-Befehle per WhatsApp nutzen.",
      400
    );
  }
  return user;
}

/** Clients reach only the matters named for them — never "all". */
function clientScope(scope: "all" | string[] | undefined): string[] {
  return Array.isArray(scope) ? scope : [];
}

function publicIdentity(identity: WhatsAppIdentity) {
  return {
    id: identity.id,
    orgId: identity.orgId,
    brainId: identity.brainId,
    userId: identity.userId,
    userLinked: identity.userLinked === true,
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
      },
    }),
  },
  async (ctx, body) => {
    const phone = normalizePhone(body.phone, phoneCountryFor(ctx.user.jurisdiction));
    const hash = phoneHash(phone);
    const store = getWhatsAppIdentityStore();
    const existing = await store.getByPhoneHash(hash);
    if (existing && existing.orgId !== firmKey(ctx)) {
      return apiError(
        "phone_already_bound",
        "Diese WhatsApp-Nummer ist bereits einer anderen Kanzlei zugeordnet.",
        409
      );
    }
    const staff = isWhatsAppStaffRole(body.role);
    let member: User | null = null;
    if (staff) {
      const found = await firmMember(ctx, body.user_id);
      if (found instanceof Response) return found;
      member = found;
    }
    const now = new Date().toISOString();
    const identity: WhatsAppIdentity = {
      id: existing?.id ?? `wa_${randomUUID()}`,
      orgId: firmKey(ctx),
      brainId: ctx.brainId,
      phone,
      phoneHash: hash,
      // Firm numbers belong to the member (never to whoever registered them);
      // the member's account decides role and matter access at every message.
      userId: member?.id,
      userLinked: !!member,
      name: body.name || member?.name || member?.email,
      role: member ? (member.role as WhatsAppIdentity["role"]) : body.role,
      // Firm members: "all" = the member's own access (the engine applies
      // walls/teams/ACLs to their identity); an explicit list narrows it.
      matterScope: staff ? body.matter_scope : clientScope(body.matter_scope),
      status: body.status,
      // A client number is verified by the client (invitation code), never here.
      verifiedAt: staff ? now : (existing?.verifiedAt ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const saved = existing
      ? await store.update(existing.id, identity)
      : await store.create(identity);
    if (member) {
      // Service messages to a firm member's business number (approvals,
      // deadlines, briefing) — recorded with the administrator as source.
      await grantWhatsAppConsent({
        brainId: ctx.brainId,
        orgId: ctx.user.orgId,
        phoneHash: hash,
        subjectType: "lawyer",
        subjectRef: member.id,
        scopes: STAFF_CONSENT_SCOPES,
        source: "staff_setup",
        proof: { recorded_by: ctx.user.id },
      });
    }
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
      details: {
        by: ctx.user.email,
        status: body.status,
        ...(body.record_consent ? { consentRecorded: true } : {}),
      },
    }),
  },
  async (ctx, body) => {
    const store = getWhatsAppIdentityStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.orgId !== firmKey(ctx)) {
      return apiError("identity_not_found", "WhatsApp-Identity nicht gefunden", 404);
    }
    const role = body.role ?? existing.role;
    const staff = isWhatsAppStaffRole(role);
    let member: User | null = null;
    if (staff && (body.user_id !== undefined || body.role !== undefined || !existing.userId)) {
      const found = await firmMember(ctx, body.user_id ?? existing.userId);
      if (found instanceof Response) return found;
      member = found;
    }
    const scope = body.matter_scope ?? existing.matterScope;
    const updated = await store.update(body.id, {
      name: body.name,
      role: member ? (member.role as WhatsAppIdentity["role"]) : body.role,
      ...(member ? { userId: member.id, userLinked: true } : {}),
      ...(!staff && body.role !== undefined ? { userId: "", userLinked: false } : {}),
      status: body.status,
      matterScope: staff ? body.matter_scope : clientScope(scope),
    });
    if (updated && body.record_consent) {
      await grantWhatsAppConsent({
        brainId: ctx.brainId,
        orgId: ctx.user.orgId,
        phoneHash: updated.phoneHash,
        subjectType: staff ? "lawyer" : "client",
        subjectRef: staff ? (updated.userId ?? updated.id) : updated.id,
        scopes: staff ? STAFF_CONSENT_SCOPES : CLIENT_CONSENT_SCOPES,
        source: "manual",
        proof: { recorded_by: ctx.user.id, note: body.record_consent.note },
      });
    }
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

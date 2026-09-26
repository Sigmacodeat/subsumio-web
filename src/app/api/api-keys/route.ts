import { z } from "zod";
import {
  API_KEY_DEFAULT_EXPIRY_DAYS,
  API_KEY_MAX_EXPIRY_DAYS,
  generateApiKey,
  hashApiKey,
  getApiKeyPrefix,
} from "@/lib/api-keys";
import { getApiKeyStore, type StoredApiKey } from "@/lib/api-key-store";
import { createHandler, apiError, type HandlerContext } from "@/lib/api-handler";
import { getStore, type User } from "@/lib/auth/store";
import { isStoredKeyUsable } from "@/lib/addin-token";
import { logAudit } from "@/lib/audit";

const VALID_SCOPES = ["read", "write", "admin"] as const;

const createKeySchema = z.object({
  name: z.string().trim().min(1, "name_required_or_too_long").max(80, "name_required_or_too_long"),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1, "invalid_scopes").default(["read"]),
  // Days until the key stops working; null = no expiry (chosen explicitly).
  expiresInDays: z
    .number()
    .int()
    .min(1, "invalid_expiry")
    .max(API_KEY_MAX_EXPIRY_DAYS, "invalid_expiry")
    .nullable()
    .default(API_KEY_DEFAULT_EXPIRY_DAYS),
});

const listQuerySchema = z.object({ scope: z.enum(["own", "firm"]).default("own") });

/** Members whose keys a firm admin oversees: the firm's members, or just themselves. */
async function firmMembers(ctx: HandlerContext): Promise<User[]> {
  if (ctx.user.orgId) return getStore().listByOrg(ctx.user.orgId);
  const self = await getStore().getById(ctx.user.id);
  return self ? [self] : [];
}

/** Firm-wide key administration: firm admins only, never inside a support session. */
function firmAdminError(ctx: HandlerContext): Response | null {
  if (ctx.user.role !== "admin") {
    return apiError("forbidden", "Nur Kanzlei-Administratoren sehen alle Schlüssel.", 403);
  }
  if (ctx.supportSession) {
    return apiError(
      "support_session_forbidden",
      "Die Schlüssel der Kanzlei verwaltet nur die Kanzlei selbst.",
      403
    );
  }
  return null;
}

function publicKey(k: StoredApiKey) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    active: k.active,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt ?? null,
    createdBy: k.createdBy,
    kind: k.kind ?? "api",
    expiresAt: k.expiresAt ?? null,
    expired: k.active && !isStoredKeyUsable(k),
  };
}

const patchKeySchema = z
  .object({
    id: z.string().min(1, "id_required"),
    name: z.string().trim().max(80).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.active !== undefined, "nothing_to_update");

const deleteKeySchema = z.object({
  id: z.string().min(1, "id_required"),
});

/**
 * Own keys by default. `?scope=firm`: every key of every member of the firm
 * (owner, name, last use, expiry) — firm admins only.
 */
export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const store = getApiKeyStore();
    if (query?.scope === "firm") {
      const denied = firmAdminError(ctx);
      if (denied) return denied;
      const members = await firmMembers(ctx);
      const keys = (
        await Promise.all(
          members.map(async (m) =>
            (await store.listByOwner(m.id)).map((k) => ({
              ...publicKey(k),
              owner: { id: m.id, name: m.name, email: m.email },
            }))
          )
        )
      )
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return Response.json({ keys });
    }
    const raw = await store.listByOwner(ctx.user.id);
    return Response.json({ keys: raw.map(publicKey) });
  }
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: createKeySchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      details: {
        operation: "create",
        name: body.name,
        scopes: body.scopes,
        expiresInDays: body.expiresInDays,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const { key, id } = generateApiKey();
    const secretHash = await hashApiKey(key);
    const now = new Date().toISOString();
    const expiresAt =
      body.expiresInDays === null
        ? undefined
        : new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString();

    const stored = await getApiKeyStore().create({
      id,
      name: body.name,
      prefix: getApiKeyPrefix(key),
      secretHash,
      scopes: body.scopes,
      active: true,
      createdAt: now,
      createdBy: ctx.user.email,
      ownerId: ctx.user.id,
      kind: "api",
      ...(expiresAt ? { expiresAt } : {}),
    });

    return Response.json(
      {
        key: {
          id: stored.id,
          name: stored.name,
          prefix: stored.prefix,
          scopes: stored.scopes,
          active: stored.active,
          createdAt: stored.createdAt,
          expiresAt: stored.expiresAt ?? null,
        },
        plaintextKey: key,
      },
      { status: 201 }
    );
  }
);

export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: patchKeySchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      entityId: body.id,
      details: { name: body.name, active: body.active },
    }),
  },
  async (ctx, body, _query, _req) => {
    const store = getApiKeyStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.ownerId !== ctx.user.id) {
      return apiError("not_found", "API-Key nicht gefunden", 404);
    }

    const patch: { name?: string; active?: boolean } = {};
    if (body.name) patch.name = body.name;
    if (body.active !== undefined) patch.active = body.active;

    const updated = await store.update(body.id, patch);
    return Response.json({ key: updated });
  }
);

export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: deleteKeySchema,
  },
  async (ctx, body, _query, _req) => {
    const store = getApiKeyStore();
    const existing = await store.getById(body.id);
    if (!existing) return apiError("not_found", "API-Key nicht gefunden", 404);

    if (existing.ownerId === ctx.user.id) {
      await store.delete(body.id);
      await logAudit("settings.update", "api_key", {
        entityId: body.id,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { operation: "delete", name: existing.name },
      });
      return Response.json({ ok: true });
    }

    // A firm admin revokes a member's key: it is deactivated (not deleted),
    // so the owner and the overview still show that it was revoked.
    if (firmAdminError(ctx)) return apiError("not_found", "API-Key nicht gefunden", 404);
    const members = await firmMembers(ctx);
    const owner = members.find((m) => m.id === existing.ownerId);
    if (!owner) return apiError("not_found", "API-Key nicht gefunden", 404);
    await store.update(body.id, { active: false });
    await logAudit("settings.update", "api_key", {
      entityId: body.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { operation: "revoke_by_admin", name: existing.name, ownerId: owner.id },
    });
    return Response.json({ ok: true, revoked: true });
  }
);

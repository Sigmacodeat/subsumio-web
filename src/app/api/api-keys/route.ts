
import { z } from "zod";
import { generateApiKey, hashApiKey, getApiKeyPrefix } from "@/lib/api-keys";
import { getApiKeyStore } from "@/lib/api-key-store";
import { createHandler, apiError } from "@/lib/api-handler";

const VALID_SCOPES = ["read", "write", "admin"] as const;

const createKeySchema = z.object({
  name: z.string().trim().min(1, "name_required_or_too_long").max(80, "name_required_or_too_long"),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1, "invalid_scopes").default(["read"]),
});

const patchKeySchema = z.object({
  id: z.string().min(1, "id_required"),
  name: z.string().trim().max(80).optional(),
  active: z.boolean().optional(),
}).refine((data) => data.name !== undefined || data.active !== undefined, "nothing_to_update");

const deleteKeySchema = z.object({
  id: z.string().min(1, "id_required"),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    const store = getApiKeyStore();
    const raw = await store.listByOwner(ctx.user.id);
    const keys = raw.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      active: k.active,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt ?? null,
      createdBy: k.createdBy,
    }));
    return Response.json({ keys });
  },
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: createKeySchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      details: { name: body.name, scopes: body.scopes },
    }),
  },
  async (ctx, body, _query, _req) => {
    const { key, id } = generateApiKey();
    const secretHash = await hashApiKey(key);
    const now = new Date().toISOString();

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
        },
        plaintextKey: key,
      },
      { status: 201 },
    );
  },
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
  },
);

export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: deleteKeySchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      entityId: body.id,
      details: { deleted: true },
    }),
  },
  async (ctx, body, _query, _req) => {
    const store = getApiKeyStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.ownerId !== ctx.user.id) {
      return apiError("not_found", "API-Key nicht gefunden", 404);
    }

    await store.delete(body.id);
    return Response.json({ ok: true });
  },
);

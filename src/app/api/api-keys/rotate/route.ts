import { z } from "zod";
import { generateApiKey, hashApiKey, getApiKeyPrefix } from "@/lib/api-keys";
import { getApiKeyStore } from "@/lib/api-key-store";
import { createHandler, apiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const rotateSchema = z.object({
  id: z.string().min(1, "id_required"),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: rotateSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      entityId: body.id,
      details: { rotated: true },
    }),
  },
  async (ctx, body, _query, _req) => {
    const store = getApiKeyStore();
    const existing = await store.getById(body.id);
    if (!existing || existing.ownerId !== ctx.user.id) {
      return apiError("not_found", "API-Key nicht gefunden", 404);
    }

    const { key: newKey } = generateApiKey();
    const newSecretHash = await hashApiKey(newKey);
    const newPrefix = getApiKeyPrefix(newKey);

    await store.update(body.id, {
      secretHash: newSecretHash,
      prefix: newPrefix,
    });

    return Response.json({
      key: {
        id: existing.id,
        name: existing.name,
        prefix: newPrefix,
        scopes: existing.scopes,
        active: existing.active,
        createdAt: existing.createdAt,
      },
      plaintextKey: newKey,
    });
  },
);

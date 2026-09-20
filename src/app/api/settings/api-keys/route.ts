import { z } from "zod";
import { getStore } from "@/lib/auth/store";
import { encrypt, decrypt } from "@/lib/encryption";
import { maskApiKey } from "@/lib/api-keys";
import { planKeyUpdates } from "@/lib/api-key-updates";
import { isAppError } from "@/lib/errors";
import { createHandler, apiError } from "@/lib/api-handler";

const apiKeysPostSchema = z
  .object({
    openaiKey: z.string().nullish(),
    anthropicKey: z.string().nullish(),
    zeroEntropyKey: z.string().nullish(),
  })
  .passthrough();

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: apiKeysPostSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "api_keys",
      entityId: ctx.user.id,
      details: {
        fields_updated: [
          ...planKeyUpdates(body).set.map((entry) => entry.field),
          ...planKeyUpdates(body).remove,
        ],
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    // Only the fields that carry a new secret are written. Untouched fields
    // come back masked from GET and must not overwrite what is stored.
    const plan = planKeyUpdates(body);

    if (plan.invalid.length > 0) {
      const field = plan.invalid[0];
      return apiError("invalid_key_format", `Invalid key format: ${field}`, 400, { field });
    }

    const patch: Record<string, string | null> = {};
    try {
      for (const { field, value } of plan.set) {
        patch[field] = await encrypt(value);
      }
    } catch (err) {
      if (isAppError(err)) {
        return apiError(err.code, err.message, err.statusCode);
      }
      return apiError("encryption_failed", "Encryption failed", 500);
    }
    for (const field of plan.remove) {
      patch[field] = null;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true, updated: [] });
    }

    const store = getStore();
    await store.update(ctx.user.id, patch);

    return Response.json({ ok: true, updated: Object.keys(patch) });
  }
);

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    let openaiKey: string | null;
    let anthropicKey: string | null;
    let zeroEntropyKey: string | null;
    try {
      [openaiKey, anthropicKey, zeroEntropyKey] = await Promise.all([
        decrypt(user.openaiKey),
        decrypt(user.anthropicKey),
        decrypt(user.zeroEntropyKey),
      ]);
    } catch (err) {
      if (isAppError(err)) {
        return apiError(err.code, err.message, err.statusCode);
      }
      return apiError("decryption_failed", "Decryption failed", 500);
    }

    return Response.json({
      openaiKey: openaiKey ? maskApiKey(openaiKey) : "",
      anthropicKey: anthropicKey ? maskApiKey(anthropicKey) : "",
      zeroEntropyKey: zeroEntropyKey ? maskApiKey(zeroEntropyKey) : "",
      hasOpenaiKey: Boolean(openaiKey),
      hasAnthropicKey: Boolean(anthropicKey),
      hasZeroEntropyKey: Boolean(zeroEntropyKey),
    });
  }
);

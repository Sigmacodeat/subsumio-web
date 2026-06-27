import { z } from "zod";
import { getStore } from "@/lib/auth/store";
import { encrypt, decrypt } from "@/lib/encryption";
import { maskApiKey } from "@/lib/api-keys";
import { isAppError } from "@/lib/errors";
import { createHandler, apiError } from "@/lib/api-handler";

function looksLikeApiKey(key: string): boolean {
  return key.length >= 8 && /^[A-Za-z0-9_\-\.]+$/.test(key);
}

const apiKeysPostSchema = z
  .object({
    openaiKey: z.string().optional(),
    anthropicKey: z.string().optional(),
    zeroEntropyKey: z.string().optional(),
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
      details: { fields_updated: Object.keys(body).filter((k) => body[k as keyof typeof body]) },
    }),
  },
  async (ctx, body, _query, _req) => {
    const rawKeys = {
      openaiKey: typeof body.openaiKey === "string" ? body.openaiKey.trim() : "",
      anthropicKey: typeof body.anthropicKey === "string" ? body.anthropicKey.trim() : "",
      zeroEntropyKey: typeof body.zeroEntropyKey === "string" ? body.zeroEntropyKey.trim() : "",
    };

    for (const [name, val] of Object.entries(rawKeys)) {
      if (val && !looksLikeApiKey(val)) {
        return apiError("invalid_key_format", `Invalid key format: ${name}`, 400, { field: name });
      }
    }

    let encrypted: (string | null)[];
    try {
      encrypted = await Promise.all([
        rawKeys.openaiKey ? encrypt(rawKeys.openaiKey) : Promise.resolve(null),
        rawKeys.anthropicKey ? encrypt(rawKeys.anthropicKey) : Promise.resolve(null),
        rawKeys.zeroEntropyKey ? encrypt(rawKeys.zeroEntropyKey) : Promise.resolve(null),
      ]);
    } catch (err) {
      if (isAppError(err)) {
        return apiError(err.code, err.message, err.statusCode);
      }
      return apiError("encryption_failed", "Encryption failed", 500);
    }

    const store = getStore();
    await store.update(ctx.user.id, {
      openaiKey: encrypted[0],
      anthropicKey: encrypted[1],
      zeroEntropyKey: encrypted[2],
    });

    return Response.json({ ok: true });
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

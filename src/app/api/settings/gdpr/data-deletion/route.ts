import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { revokeAllSessions, SESSION_COOKIE } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 120;

const deletionSchema = z.object({
  confirm: z.literal("DELETE_MY_ACCOUNT"),
});

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "heavy",
    body: deletionSchema,
  },
  async (ctx, _body, _query, _req) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    try {
      const brain = createServerBrainClient(ctx.headers);
      const pages = await brain.listPages({ limit: 10000 });
      const BATCH_SIZE = 5;
      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        const batch = pages.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((p) => brain.deletePage(p.slug).catch(() => {})));
      }
    } catch {
      // Brain may not be available
    }

    const apiKeyStore = getApiKeyStore();
    const apiKeys = await apiKeyStore.listByOwner(ctx.user.id);
    await Promise.all(apiKeys.map((k) => apiKeyStore.delete(k.id).catch(() => {})));

    await revokeAllSessions(ctx.user.id);

    void logAudit("data.delete", "user", {
      entityId: ctx.user.id,
      userId: ctx.user.id,
      details: { api_keys_deleted: apiKeys.length },
    });

    await store.update(ctx.user.id, {
      email: `deleted-${user.id}@deleted.local`,
      name: "Deleted User",
      passwordHash: "",
      role: "client_viewer",
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
      pendingTwoFactorSecret: null,
      pendingTwoFactorExpiresAt: null,
      openaiKey: null,
      anthropicKey: null,
      zeroEntropyKey: null,
      docusignAccessToken: null,
      docusignRefreshToken: null,
      docusignTokenExpiresAt: null,
      workosUserId: null,
      ssoProvider: null,
      industry: null,
    });

    const res = NextResponse.json({ ok: true, deleted: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
);

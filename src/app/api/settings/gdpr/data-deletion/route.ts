import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { revokeAllSessions, SESSION_COOKIE } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { api } from "@/lib/api";
import { createHandler, apiError } from "@/lib/api-handler";

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
      const pages = await api.brain.listPages({ limit: 10000 });
      await Promise.all(
        pages.map((p) => api.brain.deletePage(p.slug).catch(() => {})),
      );
    } catch {
      // Brain may not be available
    }

    const apiKeyStore = getApiKeyStore();
    const apiKeys = await apiKeyStore.listByOwner(ctx.user.id);
    await Promise.all(
      apiKeys.map((k) => apiKeyStore.delete(k.id).catch(() => {})),
    );

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
  },
);

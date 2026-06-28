import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { revokeAllSessions, SESSION_COOKIE } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

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

    // A member account does not own the organisation's shared source. Erasing
    // it here would delete every colleague's matters. Personal sources, on the
    // other hand, must fail closed: anonymisation only happens after the engine
    // confirms that originals and derived pages were irreversibly removed.
    if (!user.orgId) {
      const purge = await fetch(`${ENGINE_URL}/api/source-data`, {
        method: "DELETE",
        headers: ctx.headers,
        signal: AbortSignal.timeout(120_000),
      });
      if (!purge.ok) {
        const detail = await purge.text().catch(() => "");
        return apiError(
          "data_purge_failed",
          `Account data could not be fully erased (${purge.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          503
        );
      }
    }

    const apiKeyStore = getApiKeyStore();
    const apiKeys = await apiKeyStore.listByOwner(ctx.user.id);
    await Promise.all(
      apiKeys.map((k) =>
        apiKeyStore
          .delete(k.id)
          .catch((err) =>
            console.warn(
              "[gdpr] Failed to delete API key",
              k.id,
              "during data deletion:",
              err instanceof Error ? err.message : err
            )
          )
      )
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
  }
);

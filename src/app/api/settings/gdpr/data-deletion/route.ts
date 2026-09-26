import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrgStore, getStore } from "@/lib/auth/store";
import { getApiKeyStore } from "@/lib/api-key-store";
import { revokeAllSessions, SESSION_COOKIE } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { verifySecondFactor } from "@/lib/auth/second-factor";
import { hit } from "@/lib/auth/rate-limit";
import { logAudit } from "@/lib/audit";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { deleteMemoriesOfUser } from "@/lib/copilot-memory";
import { checkFirmLegalHolds } from "@/lib/legal-hold-check";
import { checkFirmRetention, retainedMessage } from "@/lib/firm-retention-check";
import { USER_SOFT_DELETE_GRACE_DAYS } from "@/lib/user-purge";

import { logger } from "@/lib/logger";
const log = logger("api/settings/gdpr/data-deletion");

export const maxDuration = 120;

const deletionSchema = z.object({
  confirm: z.literal("DELETE_MY_ACCOUNT"),
  /** Re-authentication: the account password (accounts with a password). */
  password: z.string().max(1000).optional(),
  /** Re-authentication: current TOTP or backup code (accounts with 2FA). */
  code: z.string().max(20).optional(),
});

/**
 * Self-service account deletion (Art. 17 DSGVO).
 *
 * 1. Re-authentication — a session alone never deletes an account: the
 *    password (if the account has one) and the second factor (if enabled).
 * 2. Single-lawyer firm (no `orgId`, the brain is the firm's data): refused
 *    while a legal hold is set or records must still be kept (closed matters
 *    within § 12 RAO / § 132 BAO, stamped receipts), and refused outright
 *    when the brain belongs to a firm (a founder whose personal brain became
 *    the firm brain). Otherwise the brain is NOT destroyed now: it is purged
 *    with the account after the grace period by the trash-purge cron, which
 *    checks holds and retention again (src/lib/user-purge.ts).
 * 3. Every account: firm membership ends, and every credential stops at once
 *    — sessions, API keys, own MCP tokens, WebDAV and calendar-feed tokens —
 *    the account is deactivated and anonymised.
 */
export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "heavy",
    body: deletionSchema,
    audit: (ctx, _body) => ({
      action: "gdpr.data_deletion" as const,
      entityType: "user",
      entityId: ctx.user.id,
      details: { user: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const rl = await hit(`gdpr:delete:${ctx.user.id}`, 5, 15 * 60 * 1000);
    if (!rl.ok) {
      return apiError("rate_limited", "Zu viele Versuche. Bitte später erneut versuchen.", 429);
    }

    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "Nutzer nicht gefunden", 404);

    // 1. Re-authentication (fail-closed).
    if (user.passwordHash) {
      if (!body.password || !(await verifyPassword(body.password, user.passwordHash))) {
        return apiError(
          "reauth_required",
          "Bitte bestätigen Sie die Löschung mit Ihrem Passwort.",
          401
        );
      }
    } else if (!user.twoFactorEnabled) {
      // No local password and no second factor: nothing proves the person
      // behind the session. Deleting stays with a verified step.
      return apiError(
        "reauth_unavailable",
        "Ihr Konto hat kein Passwort. Richten Sie zuerst die Zwei-Faktor-Anmeldung ein oder wenden Sie sich an support@subsum.io.",
        403
      );
    }
    if (user.twoFactorEnabled) {
      if (!body.code) {
        return apiError(
          "code_required",
          "Bitte geben Sie den Code aus Ihrer Authenticator-App ein.",
          401
        );
      }
      const factor = await verifySecondFactor(user, body.code);
      if (!factor.ok) {
        return apiError(
          factor.reason === "locked" ? "two_factor_locked" : "invalid_token",
          factor.reason === "locked"
            ? "Zu viele Fehlversuche. Bitte später erneut versuchen."
            : "Der Code ist ungültig.",
          factor.reason === "locked" ? 429 : 401
        );
      }
    }

    // 2. Single-lawyer firm: the brain holds the firm's records.
    let purgeBrainOnDelete = false;
    if (!user.orgId) {
      const orgs = await getOrgStore().list();
      if (orgs.some((o) => o.brainId === user.brainId)) {
        return apiError(
          "firm_brain",
          "Ihr Konto ist mit dem Datenbestand einer Kanzlei verbunden. Er wird mit Ihrem Konto nicht gelöscht. Bitte wenden Sie sich an die Kanzlei-Administration oder an support@subsum.io.",
          409
        );
      }
      const holds = await checkFirmLegalHolds(ctx.headers);
      if (holds.status === "unknown") {
        return apiError(
          "legal_hold_unknown",
          "Der Legal-Hold-Status Ihrer Akten konnte nicht geprüft werden. Bitte später erneut versuchen.",
          503
        );
      }
      if (holds.status === "held") {
        return apiError(
          "legal_hold_active",
          `${holds.cases.length} Akte(n) stehen unter Legal Hold. Solange die Sperre besteht, kann das Konto nicht gelöscht werden.`,
          409
        );
      }
      const retention = await checkFirmRetention(ctx.headers);
      if (retention.status === "unknown") {
        return apiError(
          "retention_unknown",
          "Die Aufbewahrungsfristen Ihrer Akten konnten nicht geprüft werden. Bitte später erneut versuchen.",
          503
        );
      }
      if (retention.status === "retained") {
        return apiError("retention_period_running", retainedMessage(retention), 409);
      }
      purgeBrainOnDelete = true;
    }

    // 3. Every credential stops now.
    const apiKeyStore = getApiKeyStore();
    const apiKeys = await apiKeyStore.listByOwner(ctx.user.id);
    await Promise.all(
      apiKeys.map((k) =>
        apiKeyStore
          .delete(k.id)
          .catch((err) =>
            log.warn(
              "[gdpr] Failed to delete API key",
              k.id,
              "during data deletion:",
              err instanceof Error ? err.message : err
            )
          )
      )
    );

    // Own MCP tokens (the engine also asks the account status on every use,
    // which answers "inactive" once the account is deactivated below).
    let mcpTokensRevoked = 0;
    try {
      const res = await fetch(`${ENGINE_URL}/api/mcp-tokens`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          tokens?: Array<{ id: string; revoked?: boolean; ownedByCaller?: boolean }>;
        };
        for (const t of data.tokens ?? []) {
          if (!t.ownedByCaller || t.revoked) continue;
          const del = await fetch(`${ENGINE_URL}/api/mcp-tokens/${encodeURIComponent(t.id)}`, {
            method: "DELETE",
            headers: ctx.headers,
            signal: AbortSignal.timeout(15_000),
          });
          if (del.ok) mcpTokensRevoked++;
        }
      }
    } catch (err) {
      log.warn("[gdpr] MCP token revocation incomplete", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // WP-5.30 / Art. 17 DSGVO: personal copilot-memory entries live in the
    // (possibly shared firm) brain — erase the user's own rows even when the
    // firm brain itself is not purged.
    let memoriesDeleted = 0;
    try {
      memoriesDeleted = await deleteMemoriesOfUser(ctx.user.id, ctx.headers);
    } catch (err) {
      log.warn(
        "[gdpr] Failed to delete copilot memories for user",
        ctx.user.id,
        err instanceof Error ? err.message : err
      );
    }

    const now = new Date().toISOString();
    await store.update(ctx.user.id, {
      email: `deleted-${user.id}@deleted.local`,
      name: "Deleted User",
      passwordHash: "",
      role: "client_viewer",
      // Membership ends; the firm is kept for the grace-period hold re-check.
      orgId: null,
      deletedFromOrgId: user.orgId ?? null,
      deactivatedAt: now,
      deletedAt: now,
      purgeBrainOnDelete,
      calendarFeedTokenHash: null,
      calendarFeedCreatedAt: null,
      davTokenHash: null,
      davTokenCreatedAt: null,
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
      ms365AccessToken: null,
      ms365RefreshToken: null,
      ms365TokenExpiresAt: null,
      workosUserId: null,
      ssoProvider: null,
      scimExternalId: null,
      industry: null,
    });

    await revokeAllSessions(ctx.user.id);

    void logAudit("data.delete", "user", {
      entityId: ctx.user.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: {
        api_keys_deleted: apiKeys.length,
        mcp_tokens_revoked: mcpTokensRevoked,
        memories_deleted: memoriesDeleted,
        brain_purge_scheduled: purgeBrainOnDelete,
        grace_days: USER_SOFT_DELETE_GRACE_DAYS,
      },
    });

    const res = NextResponse.json({
      ok: true,
      deleted: true,
      data_purge_after_days: purgeBrainOnDelete ? USER_SOFT_DELETE_GRACE_DAYS : null,
    });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
);

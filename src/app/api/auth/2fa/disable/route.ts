import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getStore } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/disable
 * Disables 2FA for the authenticated user. Requires an active session.
 * After disabling, all sessions are revoked to force a fresh login.
 */
export async function POST() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const store = getStore();
  const user = await store.getById(me.id);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  if (!user.twoFactorEnabled) {
    return NextResponse.json({ error: "2fa_not_enabled" }, { status: 400 });
  }

  await store.update(me.id, {
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorBackupCodes: null,
    pendingTwoFactorSecret: null,
    pendingTwoFactorExpiresAt: null,
  });

  // Revoke all sessions so the user must re-authenticate without 2FA
  await revokeAllSessions(me.id);

  void logAudit("settings.update", "user", {
    entityId: me.id,
    details: { action: "2fa_disabled" },
  });

  return NextResponse.json({ ok: true, disabled: true });
}

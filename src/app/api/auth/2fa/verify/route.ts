import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/server";
import { getStore } from "@/lib/auth/store";
import { verifyTOTP } from "@/lib/totp";
import { hit } from "@/lib/auth/rate-limit";
import { generateBackupCodes, hashBackupCodes } from "@/lib/auth/backup-codes";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/verify
 * Verifiziert einen TOTP-Code gegen das server-seitig pending Secret
 * und aktiviert 2FA für den Nutzer.
 * Body: { token: string }
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Rate limit: 5 attempts per 5 minutes per user (TOTP brute-force protection)
  const rl = await hit(`2fa:verify:${me.id}`, 5, 5 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", message: "Zu viele Versuche. Bitte später erneut versuchen." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const { token } = (await req.json()) as { token?: string };
  if (!token) {
    return Response.json({ error: "token_required" }, { status: 400 });
  }

  const store = getStore();
  const user = await store.getById(me.id);
  if (!user) {
    return Response.json({ error: "user_not_found" }, { status: 404 });
  }

  const pendingSecret = user.pendingTwoFactorSecret;
  const pendingExpires = user.pendingTwoFactorExpiresAt;

  if (!pendingSecret) {
    return Response.json({ error: "setup_required" }, { status: 400 });
  }

  if (pendingExpires && new Date(pendingExpires) < new Date()) {
    // Clear expired pending secret
    await store.update(me.id, { pendingTwoFactorSecret: null, pendingTwoFactorExpiresAt: null });
    return Response.json({ error: "setup_expired" }, { status: 410 });
  }

  const valid = await verifyTOTP(token, pendingSecret);
  if (!valid) {
    return Response.json({ error: "invalid_token" }, { status: 400 });
  }

  // Generate backup/recovery codes — plaintext returned once, hashes stored
  const backupCodes = generateBackupCodes();
  const hashedCodes = await hashBackupCodes(backupCodes);

  // Promote pending to active and clear pending fields
  await store.update(me.id, {
    twoFactorSecret: pendingSecret,
    twoFactorEnabled: true,
    pendingTwoFactorSecret: null,
    pendingTwoFactorExpiresAt: null,
    twoFactorBackupCodes: hashedCodes,
  });

  return Response.json({ ok: true, enabled: true, backupCodes });
}

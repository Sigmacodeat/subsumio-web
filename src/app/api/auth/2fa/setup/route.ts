
import { getSessionUser } from "@/lib/auth/server";
import { getStore } from "@/lib/auth/store";
import { generateSecret, otpAuthURL } from "@/lib/totp";

export const dynamic = "force-dynamic";

const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * POST /api/auth/2fa/setup
 * Generiert ein neues TOTP-Secret, speichert es server-seitig als pending
 * und gibt nur die otpauth:// URL (QR-Code) zurück. Das Secret verlässt
 * den Server nie im Klartext.
 */
export async function POST() {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });

  const secret = generateSecret();
  const url = otpAuthURL(secret, me.email);

  // Server-side only: persist as pending, never leak to client
  const store = getStore();
  await store.update(me.id, {
    pendingTwoFactorSecret: secret,
    pendingTwoFactorExpiresAt: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
  });

  return Response.json({
    url,
    qrData: url, // Client kann QR-Code daraus generieren
  });
}

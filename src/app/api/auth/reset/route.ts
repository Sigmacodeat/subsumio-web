import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { getStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { revokeAllSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { passwordSchema } from "@/lib/api-validation";

export async function POST(req: NextRequest) {
  const ipLimit = await hit(`reset:ip:${clientIp(req.headers)}`, 10, 15 * 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const passwordResult = passwordSchema.safeParse(body.password ?? "");
  if (!passwordResult.success) {
    return NextResponse.json({ error: "weak_password", details: passwordResult.error.flatten() }, { status: 400 });
  }
  const password = passwordResult.data;

  const payload = await verifyActionToken(body.token, "reset");
  if (!payload) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }

  const store = getStore();
  const user = await store.getById(payload.uid);
  if (!user) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }

  // Binding check: the token was issued against the CURRENT password hash.
  // Once the password changes (by this or any other reset), the token dies.
  if ((await bindFragment(user.passwordHash)) !== payload.bind) {
    return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 400 });
  }

  await store.update(user.id, { passwordHash: await hashPassword(password) });
  revokeAllSessions(user.id);
  void logAudit("settings.update", "password_reset", { entityId: user.id });
  return NextResponse.json({ ok: true });
}

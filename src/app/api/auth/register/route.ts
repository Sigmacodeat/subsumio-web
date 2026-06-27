import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getStore, buildNewUser, toPublic, type PublicUser } from "@/lib/auth/store";
import { hashPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { provisionBrainAsync } from "@/lib/provision";
import { validateRequest, registerSchema } from "@/lib/api-validation";
import { hit, clientIp } from "@/lib/auth/rate-limit";

export async function POST(req: NextRequest) {
  const ipLimit = await hit(`register:ip:${clientIp(req.headers)}`, 5, 60 * 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const parsed = await validateRequest(req, registerSchema);
  if (!parsed.ok) return parsed.error;
  const { email: rawEmail, password, name, referredBy, industry } = parsed.data;
  const email = rawEmail.trim().toLowerCase();

  try {
    const store = getStore();
    const existing = await store.getByEmail(email);
    if (existing) {
      return Response.json({ error: "email_exists" }, { status: 409 });
    }

    const draft = await buildNewUser({
      email,
      name,
      passwordHash: await hashPassword(password),
      locale: "de",
      referredBy: referredBy || null,
      industry: industry || null,
    });

    const user = await store.create(draft);

    provisionBrainAsync(user.brainId, { industry: industry || null });

    const session = await createSession(user.id, user.email, user.role);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, session.token, session.cookieOptions);

    return Response.json({ user: toPublic(user) as PublicUser, success: true });
  } catch (err: unknown) {
    console.error("[auth/register]", err instanceof Error ? err.message : String(err));
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

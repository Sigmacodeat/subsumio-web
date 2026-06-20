import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/auth/store";
import { signActionToken, bindFragment, RESET_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { sendMail, siteUrl } from "@/lib/mail";

export async function POST(req: NextRequest) {
  const ipLimit = await hit(`forgot:ip:${clientIp(req.headers)}`, 5, 15 * 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const emailLimit = await hit(`forgot:email:${email}`, 3, 60 * 60_000);
  if (!emailLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } },
    );
  }

  const user = await getStore().getByEmail(email);

  // Always 200 — no account enumeration via this endpoint.
  if (!user) return NextResponse.json({ ok: true });

  const token = await signActionToken(
    { uid: user.id, purpose: "reset", bind: await bindFragment(user.passwordHash) },
    RESET_TOKEN_TTL_SECONDS,
  );
  const lang = user.locale === "de" ? "de" : "en";
  const resetUrl = `${siteUrl()}${lang === "de" ? "/de" : ""}/reset?token=${encodeURIComponent(token)}`;

  const subject = lang === "de" ? "Subsumio — Passwort zurücksetzen" : "Subsumio — reset your password";
  const text =
    lang === "de"
      ? `Hallo ${user.name},\n\njemand (hoffentlich du) hat ein neues Passwort für dieses Konto angefordert.\n\nLink (1 Stunde gültig):\n${resetUrl}\n\nWenn du das nicht warst, ignoriere diese Mail — dein Passwort bleibt unverändert.\n\n— Subsumio`
      : `Hi ${user.name},\n\nsomeone (hopefully you) requested a new password for this account.\n\nLink (valid for 1 hour):\n${resetUrl}\n\nIf this wasn't you, ignore this email — your password stays unchanged.\n\n— Subsumio`;

  const result = await sendMail({ to: user.email, subject, text });

  // Dev convenience: without a mail provider, hand the link to the UI so
  // local / first-customer testing works end to end. NEVER in production.
  if (!result.sent && process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true, devResetUrl: resetUrl });
  }
  return NextResponse.json({ ok: true });
}

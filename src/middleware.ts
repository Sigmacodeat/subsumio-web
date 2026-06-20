// Edge middleware: Subsumio-only routing plus protected dashboard/admin.
// Also sets CSRF cookie for double-submit pattern and validates it on
// state-changing API requests.
//
// Referral capture (?ref=) is NOT done here anymore: a persistent
// attribution cookie is not "strictly necessary" under § 25 TTDSG, so it
// requires consent. The RefConsentBanner client component asks and sets
// the 90-day sb_ref cookie only after the visitor agrees.

import { NextRequest, NextResponse } from "next/server";
import { verifySessionCore, SESSION_COOKIE } from "@/lib/auth/session-core";
import { generateCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // --- CSRF validation for state-changing API requests ---
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(method)) {
    // Auth endpoints are exempt (login/signup don't have a CSRF cookie yet)
    // Cron endpoints use CRON_SECRET header auth, not browser cookies.
    // Webhook endpoints use signature verification, not browser cookies.
    const isExempt =
      pathname.startsWith("/api/auth/login") ||
      pathname.startsWith("/api/auth/signup") ||
      pathname.startsWith("/api/auth/register") ||
      pathname.startsWith("/api/auth/forgot") ||
      pathname.startsWith("/api/auth/reset") ||
      pathname.startsWith("/api/auth/2fa/login-verify") ||
      pathname.startsWith("/api/cron/") ||
      pathname.startsWith("/api/webhook/");

    if (!isExempt) {
      const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
      const headerToken = req.headers.get(CSRF_HEADER_NAME);
      if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return NextResponse.json(
          { error: "csrf_token_invalid" },
          { status: 403 },
        );
      }
    }
  }

  // --- Protected areas ---
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    const session = await verifySessionCore(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/login", req.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    if (pathname.startsWith("/admin") && session.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Set CSRF cookie if not present
    const res = NextResponse.next();
    if (!req.cookies.has(CSRF_COOKIE_NAME)) {
      res.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 3600,
      });
    }
    return res;
  }

  // Set x-pathname header so server components (root layout) can read the
  // current path to set <html lang> correctly for SEO without client-side JS.
  const res = NextResponse.next();
  res.headers.set("x-pathname", pathname);
  return res;
}

export const config = {
  // Match everything except Next internals and static files.
  // API routes ARE included for CSRF validation.
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};

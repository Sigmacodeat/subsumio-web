// Edge-safe: imported by middleware.ts AND by requireEngineContext() in
// src/lib/engine.ts. No Node builtins.
//
// A session minted with must2fa (the firm requires 2FA and this user has not
// set it up — see src/app/api/auth/login/route.ts) may only reach what the
// 2FA setup flow on /dashboard/settings/security needs. Everything else
// answers 403 `two_factor_setup_required` until /api/auth/2fa/verify
// re-issues the session without the flag.

export const TWO_FACTOR_SETUP_REQUIRED = "two_factor_setup_required";

/** The page the setup flow lives on (middleware redirects pages here). */
export const TWO_FACTOR_SETUP_PAGE = "/dashboard/settings/security";

/**
 * API routes a must2fa session may call, with the methods it may use:
 *  - GET  /api/auth/me          — who am I (dashboard shell + security page)
 *  - POST /api/auth/2fa/setup   — start TOTP enrolment
 *  - POST /api/auth/2fa/verify  — confirm the code; re-issues the session
 *  - POST /api/2fa/qrcode       — render the enrolment QR code
 *  - POST /api/auth/logout      — always possible
 *  - POST /api/auth/legal-acceptance — the blocking contract dialog also
 *    covers the setup page, so it must be answerable there
 */
const ALLOWED: ReadonlyArray<readonly [path: string, methods: readonly string[]]> = [
  ["/api/auth/me", ["GET", "HEAD"]],
  ["/api/auth/2fa/setup", ["POST"]],
  ["/api/auth/2fa/verify", ["POST"]],
  ["/api/2fa/qrcode", ["POST"]],
  ["/api/auth/logout", ["POST"]],
  ["/api/auth/legal-acceptance", ["POST"]],
];

/**
 * Public sign-in endpoints that never use the session: a browser that still
 * holds a must2fa cookie must be able to sign in again (as itself or as
 * someone else), reset a password or finish an SSO round-trip. They create
 * a fresh session themselves and grant nothing on the strength of the old one.
 */
const PUBLIC_AUTH_PATHS: readonly string[] = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/register",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/auth/verify",
  "/api/auth/2fa/login-verify",
];
const PUBLIC_AUTH_PREFIXES: readonly string[] = ["/api/auth/sso/"];

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** May a must2fa session call this API route? CORS preflights always pass. */
export function isAllowedDuringTwoFactorSetup(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m === "OPTIONS") return true;
  const path = normalizePath(pathname);
  if (PUBLIC_AUTH_PATHS.includes(path)) return true;
  if (PUBLIC_AUTH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return ALLOWED.some(([p, methods]) => p === path && methods.includes(m));
}

export function twoFactorSetupRequiredBody() {
  return {
    error: TWO_FACTOR_SETUP_REQUIRED,
    code: TWO_FACTOR_SETUP_REQUIRED,
    message: "Ihre Kanzlei verlangt Zwei-Faktor-Anmeldung. Bitte richten Sie sie zuerst ein.",
    setupUrl: `${TWO_FACTOR_SETUP_PAGE}?require2fa=1`,
  };
}

export function twoFactorSetupRequiredResponse(): Response {
  return Response.json(twoFactorSetupRequiredBody(), { status: 403 });
}

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
import { env } from "@/lib/env";

// --- CSP nonce generation ---
function generateCspNonce(): string {
  // Edge runtime supports crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCspHeader(nonce: string): string {
  const isDev = env("NODE_ENV") !== "production";
  return [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.stripe.com https://*.sentry.io https://app.posthog.com https://api.subsum.io",
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "upgrade-insecure-requests",
  ].join("; ");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const APP_HOSTS = new Set(
  ["app.subsum.io", "cockpit.subsum.io", ...(env("SUBSUMIO_APP_HOSTS")?.split(",") ?? [])]
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

// --- IP Allow-listing (G8: Enterprise Security) ---
// When SUBSUMIO_IP_ALLOWLIST is set, only requests from these IPs/CIDRs
// can access dashboard/api/admin paths. Health endpoints are always allowed.
// Read dynamically so env changes (e.g. via admin UI) take effect without restart.
const HEALTH_PATHS = new Set(["/api/health", "/api/readiness", "/health", "/healthz"]);

function getIpAllowlist(): string[] {
  return (env("SUBSUMIO_IP_ALLOWLIST") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTrustedProxyHops(): number {
  const raw = env("SUBSUMIO_TRUSTED_PROXY_HOPS");
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

function getClientIp(req: NextRequest): string | undefined {
  // x-real-ip is set by the outermost trusted load balancer. Prefer it when present.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return undefined;

  const hops = forwarded
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops.length === 0) return undefined;

  // Without trusted-proxy configuration the first hop is the client IP
  // (single-proxy setup). With N trusted proxies, the client is the hop just
  // before the trusted proxy chain (i.e. drop the last N entries).
  const trusted = getTrustedProxyHops();
  if (trusted > 0) {
    // With N trusted proxies behind us, skip the last N hops and pick the
    // next one as the client-facing IP. Guard against over-trusting (idx < 0).
    const idx = Math.max(0, hops.length - trusted - 1);
    return hops[idx];
  }
  return hops[0];
}

function ipInAllowlist(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // not configured → allow all
  // Always allow localhost (container-internal health checks)
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  for (const entry of allowlist) {
    if (entry.includes("/")) {
      // CIDR notation
      if (cidrMatch(ip, entry)) return true;
    } else {
      if (ip === entry || ip === `::ffff:${entry}`) return true;
    }
  }
  return false;
}

function cidrMatch(ip: string, cidr: string): boolean {
  try {
    const [range, bitsStr] = cidr.split("/");
    const bits = parseInt(bitsStr, 10);
    if (isNaN(bits) || bits < 0 || bits > 32) return false;
    const ipParts = ip.replace("::ffff:", "").split(".").map(Number);
    const rangeParts = range.split(".").map(Number);
    if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
    if (ipParts.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
    if (rangeParts.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeNum =
      (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}
const WEBHOOK_CSRF_EXEMPT_PREFIXES = [
  "/api/webhook/",
  "/api/billing/webhook",
  "/api/whatsapp/webhook",
  "/api/email/webhook/resend",
  "/api/docusign/webhook",
] as const;
const API_CSRF_EXEMPT_PATHS = new Set([
  // Presence is an authenticated best-effort heartbeat endpoint. The route
  // handler also opts out so navigator.sendBeacon can report leave events.
  "/api/realtime/presence",
]);

function isWebhookCsrfExempt(pathname: string): boolean {
  return WEBHOOK_CSRF_EXEMPT_PREFIXES.some((prefix) => {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return pathname === prefix || pathname.startsWith(normalized);
  });
}

/**
 * Server-to-server calls (e.g. the post-upload pipeline firing
 * /api/legal/analyze) authenticate with the shared SUBSUMIO_INTERNAL_SECRET,
 * not a browser session — so they carry no CSRF cookie/header and must be
 * exempt from the double-submit check. We only exempt when the presented
 * secret MATCHES the configured one (timing-safe), so a forged header without
 * the secret still hits the CSRF wall. Mirrors createHandler's allowInternal
 * bypass, which runs one layer deeper.
 */
function hasValidInternalSecret(req: NextRequest): boolean {
  const presented = req.headers.get("x-internal-secret");
  const expected = process.env.SUBSUMIO_INTERNAL_SECRET;
  if (!expected || !presented || presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// Language preference cookie set when user explicitly switches language.
// Prevents the browser-language redirect from overriding an explicit choice.
const LANG_PREF_COOKIE = "sb_lang";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const host = req.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";

  // --- CSP nonce: generate per-request and pass to Next.js via request headers ---
  const nonce = generateCspNonce();
  const cspHeader = buildCspHeader(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  function applyCsp(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", cspHeader);
    return response;
  }

  // --- IP Allow-listing (G8) ---
  // Block non-whitelisted IPs from all paths except health endpoints.
  const allowlist = getIpAllowlist();
  if (allowlist.length > 0 && !HEALTH_PATHS.has(pathname)) {
    const clientIp = getClientIp(req) ?? "";
    if (clientIp && !ipInAllowlist(clientIp, allowlist)) {
      return applyCsp(
        NextResponse.json(
          { error: "ip_not_allowed", message: "Access denied: IP not in allowlist." },
          { status: 403 }
        )
      );
    }
  }

  if (APP_HOSTS.has(host) && pathname === "/") {
    const dashboard = req.nextUrl.clone();
    dashboard.pathname = "/dashboard";
    return applyCsp(NextResponse.redirect(dashboard));
  }

  // --- Browser language detection: redirect non-German speakers to /en ---
  // Only on the root path, only for GET requests.
  // Skipped when the user has explicitly set a language preference (sb_lang cookie).
  if (pathname === "/" && method === "GET") {
    const langPref = req.cookies.get(LANG_PREF_COOKIE)?.value;
    if (langPref !== "de") {
      const acceptLang = req.headers.get("accept-language") ?? "";
      // Primary language tag only (before first comma), strip quality weight
      const primaryLang = acceptLang.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
      const isGerman =
        primaryLang === "de" ||
        primaryLang.startsWith("de-") ||
        // Fallback: any de-* among top languages (handles de,en-US;q=0.9)
        acceptLang
          .split(",")
          .slice(0, 3)
          .some((s) => s.trim().toLowerCase().startsWith("de"));
      if (!isGerman) {
        const enUrl = req.nextUrl.clone();
        enUrl.pathname = "/en";
        return applyCsp(NextResponse.redirect(enUrl, { status: 302 }));
      }
    }
  }

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
      pathname.startsWith("/api/portal/") ||
      API_CSRF_EXEMPT_PATHS.has(pathname) ||
      isWebhookCsrfExempt(pathname) ||
      hasValidInternalSecret(req);

    if (!isExempt) {
      const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;
      const headerToken = req.headers.get(CSRF_HEADER_NAME);
      if (!cookieToken || !headerToken) {
        return applyCsp(NextResponse.json({ error: "csrf_token_invalid" }, { status: 403 }));
      }
      // Timing-safe comparison (same pattern as csrf.ts validateCsrf)
      if (cookieToken.length !== headerToken.length) {
        return applyCsp(NextResponse.json({ error: "csrf_token_invalid" }, { status: 403 }));
      }
      let diff = 0;
      for (let i = 0; i < cookieToken.length; i++) {
        diff |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
      }
      if (diff !== 0) {
        return applyCsp(NextResponse.json({ error: "csrf_token_invalid" }, { status: 403 }));
      }
    }
  }

  // --- Protected areas ---
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    const session = await verifySessionCore(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/login", req.url);
      login.searchParams.set("next", pathname);
      return applyCsp(NextResponse.redirect(login));
    }
    if (pathname.startsWith("/admin") && session.role !== "admin") {
      return applyCsp(NextResponse.redirect(new URL("/dashboard", req.url)));
    }

    // Set CSRF cookie if not present
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (!req.cookies.has(CSRF_COOKIE_NAME)) {
      res.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
        httpOnly: false,
        sameSite: "lax",
        secure: env("NODE_ENV") === "production",
        path: "/",
        maxAge: 30 * 24 * 3600,
      });
    }
    // Set x-pathname header so server components (root layout) can read the
    // current path to determine if MarketingShell should wrap the page.
    res.headers.set("x-pathname", pathname);
    return applyCsp(res);
  }

  // Set x-pathname header so server components (root layout) can read the
  // current path to set <html lang> correctly for SEO without client-side JS.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-pathname", pathname);
  return applyCsp(res);
}

export const config = {
  // Match everything except Next internals and static files.
  // API routes ARE included for CSRF validation.
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};

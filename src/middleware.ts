// Edge middleware: Subsumio-only routing plus protected dashboard.
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
import { hasValidInternalSecret } from "@/lib/auth/internal";
import { LEGACY_TAXUMIO_HOSTS, SUBSUMIO_SITE_URL } from "@/lib/brand";
import { isOpsHost } from "@/lib/auth/platform-operator";

// --- CSP nonce generation ---
function generateCspNonce(): string {
  // Edge runtime supports crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildCspHeader(nonce: string): string {
  const isDev = env("NODE_ENV") !== "production";
  const engineUrl = env("SUBSUMIO_API_URL");
  const engineOrigin = engineUrl
    ? (() => {
        try {
          return new URL(engineUrl).origin;
        } catch {
          return "https://api.subsum.io";
        }
      })()
    : "https://api.subsum.io";
  return [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com`
      : `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://api.stripe.com https://*.sentry.io https://app.posthog.com ${engineOrigin}`,
    "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const APP_HOSTS = new Set(
  ["app.subsum.io", "cockpit.subsum.io", ...(env("SUBSUMIO_APP_HOSTS")?.split(",") ?? [])]
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

const LEGACY_PRODUCT_HOSTS = new Set(LEGACY_TAXUMIO_HOSTS.map((host) => host.toLowerCase()));

// --- Operator console host split ---
// The ops host (OPS_HOSTS, production: ops.subsum.io) serves only the operator
// console plus what it needs to sign in; /ops is invisible on every other host.
// The sign-in pages live under /at (the legacy paths redirect there); without
// them the console would bounce between /ops and the login page forever.
const OPS_HOST_PASSTHROUGH_PREFIXES = [
  "/ops",
  "/api/",
  "/login",
  "/forgot",
  "/reset",
  "/at/login",
  "/at/forgot",
  "/at/reset",
];

function isOpsPath(pathname: string): boolean {
  return pathname === "/ops" || pathname.startsWith("/ops/");
}

function isOpsHostPassthrough(pathname: string): boolean {
  return OPS_HOST_PASSTHROUGH_PREFIXES.some(
    (prefix) =>
      pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

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
  // Engine-to-web credit reservations authenticate with ENGINE_WEBHOOK_API_KEY
  // inside the route. They have no browser cookie and must not be stopped by
  // the global double-submit CSRF guard before that signature is verified.
  "/api/billing/pipeline-reserve",
  // Same server-to-server authentication as the reservation endpoint; this
  // reconciliation call must remain reachable even after a worker failure.
  "/api/billing/pipeline-settle",
  // Website concierge: anonymous, session-less, no ambient credentials to
  // forge — visitors on marketing pages have no CSRF cookie. Abuse is bounded
  // by per-IP rate limits and (for leads) a honeypot inside the routes.
  "/api/concierge",
  "/api/concierge/lead",
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
// hasValidInternalSecret is imported at the top of this file from @/lib/auth/internal.

/**
 * Requests authenticated with a firm API key (`Authorization: Bearer
 * sk_live_…`, used by the Word/Outlook add-ins and customer integrations)
 * carry no CSRF cookie. CSRF abuses a cookie the browser attaches on its own;
 * a request WITHOUT a session cookie has nothing to abuse, and createHandler
 * authenticates it by the key (or rejects it). A request that has a session
 * cookie still needs the CSRF token, so adding a fake Authorization header
 * does not unlock cookie-authenticated calls.
 */
function isApiKeyCsrfExempt(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer sk_live_")) return false;
  return !req.cookies.get(SESSION_COOKIE)?.value;
}

const RETIRED_PUBLIC_LOCALE_PREFIXES = ["/de", "/ch", "/en"] as const;
const AUSTRIA_PUBLIC_ALIASES = new Set([
  "/",
  "/about",
  "/contact",
  "/docs",
  "/download",
  "/dpa",
  "/features",
  "/forgot",
  "/imprint",
  "/join",
  "/login",
  "/partners",
  "/pricing",
  "/privacy",
  "/reset",
  "/security",
  "/signup",
  "/solutions/in-house",
  "/solutions/law-firms",
  "/solutions/solo",
  "/superbrain",
  "/terms",
  "/whatsapp",
]);

const RETIRED_PILOT_DASHBOARD_PREFIXES = [
  "/dashboard/bea",
  "/dashboard/datev-export",
  "/dashboard/datev-direct",
  "/dashboard/fao-tracking",
  "/dashboard/cost-calculator",
] as const;
// Parked on 2026-09-17: areas that are not part of a lawyer's daily work and
// were never verified in practice. Source lives in src/app/_archive/parked,
// manifest in docs/archive/PARKED_AREAS_2026-09-17.md.
const PARKED_DASHBOARD_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ["/dashboard/analytics", "/dashboard/reports"],
  ["/dashboard/litigation-analytics", "/dashboard/reports"],
  ["/dashboard/portfolio-insights", "/dashboard/reports"],
  ["/dashboard/adoption-analytics", "/dashboard/reports"],
  ["/dashboard/chat/analytics", "/dashboard/chat"],
  ["/dashboard/chat/compare", "/dashboard/chat"],
  ["/dashboard/war-room", "/dashboard"],
  ["/dashboard/crypto-forensics", "/dashboard"],
  ["/dashboard/court-analytics", "/dashboard"],
  ["/dashboard/experience", "/dashboard"],
  ["/dashboard/autonomous", "/dashboard"],
  ["/dashboard/mobile", "/dashboard"],
  ["/dashboard/online-booking", "/dashboard"],
  ["/dashboard/team-meeting", "/dashboard"],
];
const RETIRED_PILOT_API_PREFIXES = [
  "/api/bea",
  "/api/datev",
  "/api/datev-direct",
  "/api/legal/rvg",
  "/api/pkh-beratungshilfe",
  "/api/fachrechner",
  "/api/fao-tracking",
  "/api/court-directory",
  "/api/court-analytics",
] as const;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function austriaCanonicalPath(pathname: string): string | null {
  for (const prefix of RETIRED_PUBLIC_LOCALE_PREFIXES) {
    if (pathname === prefix) return "/at";
    if (pathname.startsWith(`${prefix}/`)) {
      const suffix = pathname.slice(prefix.length);
      return suffix === "/subsumio" ? "/at" : `/at${suffix}`;
    }
  }
  if (AUSTRIA_PUBLIC_ALIASES.has(pathname)) {
    return pathname === "/" ? "/at" : `/at${pathname}`;
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const host = req.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";

  // --- CSP nonce: generate per-request and pass to Next.js via request headers ---
  const nonce = generateCspNonce();
  const cspHeader = buildCspHeader(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce for its own inline scripts (RSC payload, boot
  // scripts) from the *request* CSP header — without it every inline script
  // would be blocked under the strict production policy.
  requestHeaders.set("Content-Security-Policy", cspHeader);

  function applyCsp(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", cspHeader);
    // Other security headers (X-Frame-Options, X-Content-Type-Options,
    // Referrer-Policy, Permissions-Policy, HSTS, COOP, COEP) are set
    // globally in next.config.ts headers() — they apply to all routes
    // and overwrite any middleware-set values. Only CSP needs per-request
    // nonce generation, so it's the only header set here.
    return response;
  }

  // Austria-only pilot: retired market-specific or not yet legally validated
  // features must not remain reachable through stale bookmarks or direct API
  // calls. Their source stays in the private archive for later revalidation.
  if (RETIRED_PILOT_API_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix))) {
    return applyCsp(
      NextResponse.json(
        {
          error: "market_feature_retired",
          message: "Diese Funktion ist derzeit nicht verfügbar.",
        },
        { status: 410 }
      )
    );
  }
  const parked = PARKED_DASHBOARD_REDIRECTS.find(([prefix]) =>
    matchesRoutePrefix(pathname, prefix)
  );
  if (parked) {
    const target = req.nextUrl.clone();
    target.pathname = parked[1];
    target.search = "";
    return applyCsp(NextResponse.redirect(target, 307));
  }
  if (RETIRED_PILOT_DASHBOARD_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix))) {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return applyCsp(NextResponse.redirect(dashboardUrl, 308));
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

  const onOpsHost = isOpsHost(req.headers.get("host"));
  if (isOpsPath(pathname) && !onOpsHost) {
    return applyCsp(new NextResponse("Not found", { status: 404 }));
  }
  if (onOpsHost && !isOpsHostPassthrough(pathname)) {
    const opsUrl = req.nextUrl.clone();
    opsUrl.pathname = "/ops";
    opsUrl.search = "";
    return applyCsp(NextResponse.redirect(opsUrl));
  }

  if (APP_HOSTS.has(host) && pathname === "/") {
    const dashboard = req.nextUrl.clone();
    dashboard.pathname = "/dashboard";
    return applyCsp(NextResponse.redirect(dashboard));
  }

  // Former product domains now have one canonical destination: Subsumio.
  if (LEGACY_PRODUCT_HOSTS.has(host)) {
    const canonical = new URL(SUBSUMIO_SITE_URL, req.url);
    canonical.pathname = "/";
    canonical.search = "";
    return applyCsp(NextResponse.redirect(canonical, { status: 308 }));
  }

  // Austria-only pilot: preserve old bookmarks while exposing one canonical
  // public market. App-host root routing above remains /dashboard.
  const austriaPath = austriaCanonicalPath(pathname);
  if (austriaPath) {
    const canonical = req.nextUrl.clone();
    canonical.pathname = austriaPath;
    return applyCsp(NextResponse.redirect(canonical, { status: 308 }));
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
      isApiKeyCsrfExempt(req) ||
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
  if (pathname.startsWith("/dashboard") || isOpsPath(pathname)) {
    const session = await verifySessionCore(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const login = new URL("/at/login", req.url);
      login.searchParams.set("next", pathname);
      return applyCsp(NextResponse.redirect(login));
    }

    // Set CSRF cookie if not present
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (!req.cookies.has(CSRF_COOKIE_NAME)) {
      res.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
        httpOnly: false,
        sameSite: "lax",
        secure: env("NODE_ENV") === "production" && env("SUBSUMIO_E2E") !== "1",
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

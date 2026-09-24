import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";
import { withEnv } from "../test/helpers/with-env";
import { signSession } from "@/lib/auth/session-core";

function request(
  pathname: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
): NextRequest {
  return new NextRequest(`https://subsumio.test${pathname}`, init);
}

async function run(pathname: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return middleware(request(pathname, init));
}

describe("middleware retired-locale public routing", () => {
  it.each([
    ["/", "/at"],
    ["/pricing", "/at/pricing"],
    ["/ch/solutions/solo", "/at/solutions/solo"],
    ["/en/login", "/at/login"],
    ["/en/subsumio", "/at"],
  ])("redirects %s permanently to %s", async (source, destination) => {
    const res = await run(source);

    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location") ?? "https://invalid.test").pathname).toBe(
      destination
    );
  });

  it("serves /de as a live market (no redirect to /at)", async () => {
    const res = await run("/de/security");
    expect(res.headers.get("location")).toBeNull();
  });

  it("preserves reset tokens and other query parameters", async () => {
    const res = await run("/en/reset?token=secret-token&next=%2Fdashboard");
    const location = new URL(res.headers.get("location") ?? "https://invalid.test");

    expect(location.pathname).toBe("/at/reset");
    expect(location.searchParams.get("token")).toBe("secret-token");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });

  it("keeps the app host root pointed at the authenticated product", async () => {
    const res = await middleware(
      new NextRequest("https://app.subsum.io/", { headers: { host: "app.subsum.io" } })
    );

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "https://invalid.test").pathname).toBe(
      "/dashboard"
    );
  });

  it("does not locale-rewrite APIs or shared Austrian resources", async () => {
    for (const path of ["/api/health", "/blog", "/cities/wien", "/at"]) {
      const res = await run(path);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("keeps dashboard authentication on the product flow", async () => {
    const res = await run("/dashboard");
    expect(new URL(res.headers.get("location") ?? "https://invalid.test").pathname).toBe(
      "/at/login"
    );
  });
});

describe("middleware parked product areas", () => {
  it.each([
    ["/dashboard/war-room", "/dashboard"],
    ["/dashboard/crypto-forensics", "/dashboard"],
    ["/dashboard/analytics", "/dashboard/reports"],
    ["/dashboard/chat/compare", "/dashboard/chat"],
    ["/dashboard/autonomous/run/7", "/dashboard"],
  ])("sends %s to %s", async (source, destination) => {
    const res = await run(source);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "https://invalid.test").pathname).toBe(
      destination
    );
  });

  it("leaves neighbouring areas alone", async () => {
    for (const path of ["/dashboard/chat", "/dashboard/reports", "/dashboard/analyze"]) {
      const res = await run(path);
      expect(
        new URL(res.headers.get("location") ?? "https://x.test/other").pathname,
        path
      ).not.toBe("/dashboard");
    }
  });
});

describe("middleware operator console host", () => {
  const onOps = (pathname: string) =>
    middleware(
      new NextRequest(`https://ops.subsum.io${pathname}`, { headers: { host: "ops.subsum.io" } })
    );

  it("serves the sign-in pages the legacy paths redirect to — no loop with /ops", async () => {
    const legacy = await onOps("/login");
    expect(new URL(legacy.headers.get("location") ?? "https://invalid.test").pathname).toBe(
      "/at/login"
    );
    for (const path of ["/at/login", "/at/forgot", "/at/reset"]) {
      const res = await onOps(path);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("keeps everything else on the ops host inside the console", async () => {
    const res = await onOps("/at/pricing");
    expect(new URL(res.headers.get("location") ?? "https://invalid.test").pathname).toBe("/ops");
  });

  it("hides the console on every other host", async () => {
    const res = await middleware(
      new NextRequest("https://app.subsum.io/ops/kanzleien", { headers: { host: "app.subsum.io" } })
    );
    expect(res.status).toBe(404);
  });
});

describe("middleware retired pilot product surfaces", () => {
  it.each([
    "/dashboard/bea",
    "/dashboard/datev-export",
    "/dashboard/datev-direct",
    "/dashboard/fao-tracking",
    "/dashboard/cost-calculator",
  ])("redirects %s out of the active AT product", async (path) => {
    const res = await run(path);
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location") ?? "https://invalid.test").pathname).toBe(
      "/dashboard"
    );
  });

  it.each([
    "/api/bea/send",
    "/api/datev/import",
    "/api/datev-direct",
    "/api/legal/rvg",
    "/api/pkh-beratungshilfe",
    "/api/fachrechner",
    "/api/fao-tracking",
    "/api/court-directory",
  ])("retires %s at the edge", async (path) => {
    const res = await run(path, { method: "POST" });
    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toMatchObject({ error: "market_feature_retired" });
  });
});

describe("middleware CSRF webhook exemptions", () => {
  const providerWebhooks = [
    "/api/billing/webhook",
    "/api/whatsapp/webhook",
    // Meta POSTs RSA-encrypted flow payloads here — server-to-server, no
    // browser cookie exists to protect.
    "/api/whatsapp/flow-endpoint",
    "/api/email/webhook/resend",
    "/api/docusign/webhook",
    "/api/webhook/incoming",
  ];

  it.each(providerWebhooks)("%s bypasses browser CSRF", async (path) => {
    const res = await run(path, { method: "POST" });

    expect(res.status).not.toBe(403);
  });

  it.each(["/api/concierge", "/api/concierge/lead", "/api/intake/public"])(
    "anonymous public endpoint %s bypasses browser CSRF",
    async (path) => {
      const res = await run(path, { method: "POST" });

      expect(res.status).not.toBe(403);
    }
  );

  it("still rejects normal state-changing API requests without CSRF", async () => {
    const res = await run("/api/legal/analyze", { method: "POST" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "csrf_token_invalid" });
  });

  it("allows presence heartbeats without browser CSRF", async () => {
    const res = await run("/api/realtime/presence", { method: "POST" });

    expect(res.status).not.toBe(403);
  });

  it("lets API-key requests without a session cookie through to the key check", async () => {
    const headers = new Headers({ authorization: "Bearer sk_live_example" });
    const res = await run("/api/legal/analyze", { method: "POST", headers });

    expect(res.status).not.toBe(403);
  });

  it("still requires CSRF when an API-key header comes with a session cookie", async () => {
    const headers = new Headers({
      authorization: "Bearer sk_live_example",
      cookie: "sb_session=anything",
    });
    const res = await run("/api/legal/analyze", { method: "POST", headers });

    expect(res.status).toBe(403);
  });

  it("does not exempt other bearer tokens", async () => {
    const headers = new Headers({ authorization: "Bearer something_else" });
    const res = await run("/api/legal/analyze", { method: "POST", headers });

    expect(res.status).toBe(403);
  });

  it("allows normal state-changing API requests with a matching CSRF token", async () => {
    const token = "csrf_test_token";
    const headers = new Headers({
      [CSRF_HEADER_NAME]: token,
      cookie: `${CSRF_COOKIE_NAME}=${token}`,
    });

    const res = await run("/api/legal/analyze", { method: "POST", headers });

    expect(res.status).not.toBe(403);
  });
});

describe("middleware IP allow-listing (G8)", () => {
  it("allows health endpoints regardless of IP (when allowlist is empty)", async () => {
    const res = await run("/api/health");
    expect(res.status).not.toBe(403);
  });

  it("does not block requests when SUBSUMIO_IP_ALLOWLIST is not set", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: undefined }, async () => {
      const res = await run("/dashboard", {
        headers: { "x-forwarded-for": "8.8.8.8" },
      });
      expect(res.status).not.toBe(403);
    });
  });

  it("blocks non-whitelisted IPs when allowlist is set", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: "10.0.0.1,192.168.1.0/24" }, async () => {
      const res = await run("/dashboard", {
        headers: { "x-forwarded-for": "8.8.8.8" },
      });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: "ip_not_allowed" });
    });
  });

  it("allows whitelisted IPs when allowlist is set", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: "10.0.0.1,192.168.1.0/24" }, async () => {
      const res = await run("/dashboard", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });
      expect(res.status).not.toBe(403);
    });
  });

  it("allows CIDR-matched IPs", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: "192.168.1.0/24" }, async () => {
      const res = await run("/dashboard", {
        headers: { "x-forwarded-for": "192.168.1.50" },
      });
      expect(res.status).not.toBe(403);
    });
  });

  it("always allows health endpoints even with allowlist", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: "10.0.0.1" }, async () => {
      const res = await run("/api/health", {
        headers: { "x-forwarded-for": "8.8.8.8" },
      });
      expect(res.status).not.toBe(403);
    });
  });

  it("denies requests without a determinable client IP when allowlist is set", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: "10.0.0.1" }, async () => {
      const res = await run("/dashboard");
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: "ip_not_allowed" });
    });
  });

  it("does not require a client IP when no allowlist is set", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: undefined }, async () => {
      const res = await run("/dashboard");
      expect(res.status).not.toBe(403);
    });
  });

  it("prioritizes x-real-ip over x-forwarded-for", async () => {
    await withEnv({ SUBSUMIO_IP_ALLOWLIST: "10.0.0.1" }, async () => {
      const res = await run("/dashboard", {
        headers: {
          "x-real-ip": "10.0.0.1",
          "x-forwarded-for": "8.8.8.8, 1.1.1.1",
        },
      });
      expect(res.status).not.toBe(403);
    });
  });

  it("uses trusted proxy hops to resolve client IP from x-forwarded-for", async () => {
    await withEnv(
      {
        SUBSUMIO_IP_ALLOWLIST: "8.8.8.8",
        SUBSUMIO_TRUSTED_PROXY_HOPS: "2",
      },
      async () => {
        // client(8.8.8.8), proxy1(1.1.1.1), proxy2(10.0.0.1) -> 2 trusted proxies,
        // so the client is the hop before the trusted chain: 8.8.8.8
        const res = await run("/dashboard", {
          headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1, 10.0.0.1" },
        });
        expect(res.status).not.toBe(403);
      }
    );
  });
});

describe("middleware CSP", () => {
  it("sets Content-Security-Policy on normal responses", async () => {
    const res = await run("/");
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  });

  it("passes the nonce through the request header", async () => {
    const res = await run("/dashboard");
    // NextResponse.next({ request: { headers } }) mirrors the request back.
    const requestHeaders = (res as unknown as { requestHeaders?: Headers }).requestHeaders;
    if (requestHeaders) {
      expect(requestHeaders.get("x-nonce")).toMatch(/[A-Za-z0-9+/=]+/);
      // Next.js derives its inline-script nonce from the request CSP header.
      expect(requestHeaders.get("Content-Security-Policy")).toContain(
        `nonce-${requestHeaders.get("x-nonce")}`
      );
    }
    // Response must still have a valid CSP.
    expect(res.headers.get("Content-Security-Policy")).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  });

  it("scopes production script-src to self + nonce (no strict-dynamic)", async () => {
    await withEnv({ NODE_ENV: "production" }, async () => {
      const res = await run("/");
      const csp = res.headers.get("Content-Security-Policy") || "";
      const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? "";
      // strict-dynamic was removed: it blocked same-origin Turbopack chunks
      // in production (live-verified). 'self' + nonce stays the boundary.
      expect(scriptSrc).not.toContain("strict-dynamic");
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
      expect(scriptSrc).not.toContain("unsafe-inline");
      expect(scriptSrc).not.toContain("unsafe-eval");
    });
  });

  it("allows unsafe-eval in development script-src", async () => {
    await withEnv({ NODE_ENV: "development" }, async () => {
      const res = await run("/");
      const csp = res.headers.get("Content-Security-Policy") || "";
      expect(csp).toContain("unsafe-eval");
      expect(csp).toContain("unsafe-inline");
    });
  });
});

describe("middleware firm-wide 2FA on the API (must2fa sessions)", () => {
  async function sessionCookie(must2fa: boolean): Promise<string> {
    const token = await signSession({
      uid: "member",
      email: "member@firm.at",
      role: "lawyer",
      ...(must2fa ? { must2fa: true } : {}),
    });
    return `sb_session=${token}`;
  }

  it("refuses ordinary API routes with 403 two_factor_setup_required", async () => {
    const headers = new Headers({ cookie: await sessionCookie(true) });
    const res = await run("/api/pages", { headers });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "two_factor_setup_required" });
  });

  it("refuses state-changing API routes even with a valid CSRF token", async () => {
    const token = "csrf_test_token";
    const headers = new Headers({
      [CSRF_HEADER_NAME]: token,
      cookie: `${await sessionCookie(true)}; ${CSRF_COOKIE_NAME}=${token}`,
    });
    const res = await run("/api/legal/analyze", { method: "POST", headers });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "two_factor_setup_required" });
  });

  it.each([
    ["/api/auth/me", "GET"],
    ["/api/auth/2fa/setup", "POST"],
    ["/api/auth/2fa/verify", "POST"],
    ["/api/2fa/qrcode", "POST"],
    ["/api/auth/logout", "POST"],
    ["/api/auth/login", "POST"],
  ])("lets the setup flow through: %s %s", async (path, method) => {
    const token = "csrf_test_token";
    const headers = new Headers({
      [CSRF_HEADER_NAME]: token,
      cookie: `${await sessionCookie(true)}; ${CSRF_COOKIE_NAME}=${token}`,
    });
    const res = await run(path, { method, headers });

    expect(res.status).not.toBe(403);
  });

  it("leaves normal sessions alone", async () => {
    const headers = new Headers({ cookie: await sessionCookie(false) });
    const res = await run("/api/pages", { headers });

    expect(res.status).not.toBe(403);
  });

  it("ignores a forged must2fa claim without a valid signature (the route rejects it)", async () => {
    const forged = await sessionCookie(true);
    const headers = new Headers({ cookie: `${forged.slice(0, -4)}AAAA` });
    const res = await run("/api/pages", { headers });

    expect(res.status).not.toBe(403);
  });

  it("still redirects must2fa dashboard pages to the security settings", async () => {
    const headers = new Headers({ cookie: await sessionCookie(true) });
    const res = await run("/dashboard/cases", { headers });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard/settings/security?require2fa=1");
  });
});

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";
import { withEnv } from "../test/helpers/with-env";

function request(pathname: string, init?: RequestInit): NextRequest {
  return new NextRequest(`https://subsumio.test${pathname}`, init);
}

async function run(pathname: string, init?: RequestInit) {
  return middleware(request(pathname, init));
}

describe("middleware CSRF webhook exemptions", () => {
  const providerWebhooks = [
    "/api/billing/webhook",
    "/api/whatsapp/webhook",
    "/api/email/webhook/resend",
    "/api/docusign/webhook",
    "/api/webhook/incoming",
  ];

  it.each(providerWebhooks)("%s bypasses browser CSRF", async (path) => {
    const res = await run(path, { method: "POST" });

    expect(res.status).not.toBe(403);
  });

  it("still rejects normal state-changing API requests without CSRF", async () => {
    const res = await run("/api/legal/analyze", { method: "POST" });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "csrf_token_invalid" });
  });

  it("allows presence heartbeats without browser CSRF", async () => {
    const res = await run("/api/realtime/presence", { method: "POST" });

    expect(res.status).not.toBe(403);
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
    }
    // Response must still have a valid CSP.
    expect(res.headers.get("Content-Security-Policy")).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  });

  it("uses strict-dynamic in production script-src", async () => {
    await withEnv({ NODE_ENV: "production" }, async () => {
      const res = await run("/");
      const csp = res.headers.get("Content-Security-Policy") || "";
      const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? "";
      expect(scriptSrc).toContain("strict-dynamic");
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

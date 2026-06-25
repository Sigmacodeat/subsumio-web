import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";

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
    const orig = process.env.SUBSUMIO_IP_ALLOWLIST;
    delete process.env.SUBSUMIO_IP_ALLOWLIST;
    const res = await run("/dashboard", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    expect(res.status).not.toBe(403);
    if (orig !== undefined) process.env.SUBSUMIO_IP_ALLOWLIST = orig;
  });

  it("blocks non-whitelisted IPs when allowlist is set", async () => {
    const orig = process.env.SUBSUMIO_IP_ALLOWLIST;
    process.env.SUBSUMIO_IP_ALLOWLIST = "10.0.0.1,192.168.1.0/24";
    const res = await run("/dashboard", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "ip_not_allowed" });
    if (orig !== undefined) process.env.SUBSUMIO_IP_ALLOWLIST = orig;
    else delete process.env.SUBSUMIO_IP_ALLOWLIST;
  });

  it("allows whitelisted IPs when allowlist is set", async () => {
    const orig = process.env.SUBSUMIO_IP_ALLOWLIST;
    process.env.SUBSUMIO_IP_ALLOWLIST = "10.0.0.1,192.168.1.0/24";
    const res = await run("/dashboard", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res.status).not.toBe(403);
    if (orig !== undefined) process.env.SUBSUMIO_IP_ALLOWLIST = orig;
    else delete process.env.SUBSUMIO_IP_ALLOWLIST;
  });

  it("allows CIDR-matched IPs", async () => {
    const orig = process.env.SUBSUMIO_IP_ALLOWLIST;
    process.env.SUBSUMIO_IP_ALLOWLIST = "192.168.1.0/24";
    const res = await run("/dashboard", {
      headers: { "x-forwarded-for": "192.168.1.50" },
    });
    expect(res.status).not.toBe(403);
    if (orig !== undefined) process.env.SUBSUMIO_IP_ALLOWLIST = orig;
    else delete process.env.SUBSUMIO_IP_ALLOWLIST;
  });

  it("always allows health endpoints even with allowlist", async () => {
    const orig = process.env.SUBSUMIO_IP_ALLOWLIST;
    process.env.SUBSUMIO_IP_ALLOWLIST = "10.0.0.1";
    const res = await run("/api/health", {
      headers: { "x-forwarded-for": "8.8.8.8" },
    });
    expect(res.status).not.toBe(403);
    if (orig !== undefined) process.env.SUBSUMIO_IP_ALLOWLIST = orig;
    else delete process.env.SUBSUMIO_IP_ALLOWLIST;
  });
});

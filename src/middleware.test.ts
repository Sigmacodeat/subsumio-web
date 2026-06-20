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

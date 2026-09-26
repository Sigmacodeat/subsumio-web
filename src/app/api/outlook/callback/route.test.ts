// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ update: m.update }) }));
vi.mock("@/lib/msgraph-user", () => ({
  exchangeMs365Code: vi.fn(async () => ({
    access_token: "at",
    refresh_token: "rt",
    expires_in: 3600,
  })),
  fetchMs365Me: vi.fn(async () => "a@k.at"),
  isDelegatedMs365Configured: () => true,
}));
vi.mock("@/app/api/outlook/connect/route", () => ({ MS365_OAUTH_STATE_COOKIE: "ms365_state" }));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { query: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, b: unknown, q: unknown, r: unknown) => Promise<Response>
      ) =>
      async (req: NextRequest) =>
        handler(
          { user: { id: "u1" } },
          undefined,
          opts.query.parse(Object.fromEntries(req.nextUrl.searchParams)),
          req
        ),
  };
});

import { GET } from "./route";

const call = (qs: string) =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest(`http://localhost/api/outlook/callback${qs}`, {
      headers: { cookie: "ms365_state=st-1" },
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
});

describe("GET /api/outlook/callback (R8-18)", () => {
  it("a state mismatch redirects to the settings with the reason", async () => {
    const res = await call("?code=c&state=other");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.example/dashboard/settings?tab=kanzlei&outlook=state_mismatch"
    );
    expect(m.update).not.toHaveBeenCalled();
  });

  it("success redirects with outlook=connected", async () => {
    const res = await call("?code=c&state=st-1");
    expect(res.headers.get("location")).toContain("outlook=connected");
    expect(m.update).toHaveBeenCalledTimes(1);
  });
});

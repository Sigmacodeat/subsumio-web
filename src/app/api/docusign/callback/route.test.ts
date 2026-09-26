// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ update: m.update }) }));
vi.mock("@/lib/docusign", () => ({ DOCUSIGN_OAUTH_HOST: "account-d.docusign.com" }));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { query: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, b: unknown, q: unknown, r: unknown) => Promise<Response>
      ) =>
      async (req: import("next/server").NextRequest) =>
        handler(
          { user: { id: "u1" } },
          undefined,
          opts.query.parse(Object.fromEntries(req.nextUrl.searchParams)),
          req
        ),
  };
});

import { NextRequest } from "next/server";
import { GET } from "./route";

const call = (qs: string, cookie = "docusign_oauth_state=st-1") =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest(`http://localhost/api/docusign/callback${qs}`, { headers: { cookie } })
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOCUSIGN_INTEGRATION_KEY = "ik";
  process.env.DOCUSIGN_SECRET_KEY = "sk";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3600 }))
  );
});

describe("GET /api/docusign/callback (R8-11)", () => {
  it("success stores the tokens and redirects to the settings", async () => {
    const res = await call("?code=c&state=st-1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.example/dashboard/settings?docusign=connected"
    );
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("a state mismatch redirects with the reason instead of JSON", async () => {
    const res = await call("?code=c&state=other");
    expect(res.headers.get("location")).toContain("docusign=state_mismatch");
    expect(m.update).not.toHaveBeenCalled();
  });
});

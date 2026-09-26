// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  update: vi.fn(async (_id: string, _patch: Record<string, unknown>) => ({})),
  userInfo: vi.fn(
    async (_t: string): Promise<{ email: string | null; name: string | null } | null> => ({
      email: "anwalt@kanzlei.example",
      name: "A. Anwalt",
    })
  ),
  audit: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ update: m.update }) }));
vi.mock("@/lib/docusign", () => ({
  DOCUSIGN_OAUTH_HOST: "account-d.docusign.com",
  fetchDocusignUserInfo: m.userInfo,
}));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
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
          { user: { id: "u1", email: "u1@kanzlei.example" }, brainId: "b1" },
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
      "https://app.example/dashboard/settings?tab=signature&docusign=connected"
    );
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it("remembers which DocuSign account was connected and audits the connection", async () => {
    await call("?code=c&state=st-1");
    expect(m.userInfo).toHaveBeenCalledWith("at");
    expect(m.update.mock.calls[0][1]).toMatchObject({
      docusignAccessToken: "at",
      docusignUserEmail: "anwalt@kanzlei.example",
      docusignUserName: "A. Anwalt",
    });
    expect(m.audit).toHaveBeenCalledWith(
      "docusign.connect",
      "user",
      expect.objectContaining({ entityId: "u1", brainId: "b1" })
    );
  });

  it("a failed user-info lookup does not block the connection", async () => {
    m.userInfo.mockResolvedValueOnce(null);
    const res = await call("?code=c&state=st-1");
    expect(res.headers.get("location")).toContain("docusign=connected");
    expect(m.update.mock.calls[0][1]).toMatchObject({ docusignUserEmail: null });
  });

  it("a state mismatch redirects with the reason instead of JSON", async () => {
    const res = await call("?code=c&state=other");
    expect(res.headers.get("location")).toContain("docusign=state_mismatch");
    expect(m.update).not.toHaveBeenCalled();
  });
});

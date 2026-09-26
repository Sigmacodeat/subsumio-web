// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://mock-engine:3001" }));
vi.mock("@/lib/portal-token", () => ({
  signPortalToken: vi.fn(async () => "signed-token"),
  verifyPortalToken: vi.fn(async () => ({ case_slug: "cases/a", exp: 2_000_000_000 })),
}));
vi.mock("@/lib/portal-links", () => ({ registerPortalLink: vi.fn(async () => {}) }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (v: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "firm-a", "x-matter-scope": "caller-scope" },
        brainId: "firm-a",
        user: { id: "u1", email: "assistant@firm.example", role: "assistant" },
      };
      const body = opts.body ? opts.body.parse(await req.json()) : null;
      return handler(ctx, body, null, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST } from "./route";
import { signPortalToken } from "@/lib/portal-token";
import { registerPortalLink } from "@/lib/portal-links";

function stubCase(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body ?? {}), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function req(caseSlug: string) {
  return new Request("http://localhost/api/portal/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseSlug }),
  });
}

describe("POST /api/portal/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("refuses matters the caller cannot read (ethical wall → engine 404)", async () => {
    const fetchMock = stubCase(404);
    const res = await POST(req("cases/walled-off") as never);
    expect(res.status).toBe(404);
    expect(signPortalToken).not.toHaveBeenCalled();
    // The case is read with the CALLER's scoped headers, not a service identity.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-matter-scope"]).toBe("caller-scope");
  });

  it("refuses matters without portal_enabled", async () => {
    stubCase(200, { frontmatter: { portal_enabled: false } });
    const res = await POST(req("cases/a") as never);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("portal_disabled");
    expect(signPortalToken).not.toHaveBeenCalled();
  });

  it("the assistant issues links only on matters it may write (not with a read-only grant)", async () => {
    stubCase(200, {
      frontmatter: {
        portal_enabled: true,
        permissions: {
          visibility: "restricted",
          grants: [{ user_id: "u1", level: "read" }],
        },
      },
    });
    const res = await POST(req("cases/a") as never);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("portal_link_forbidden");
    expect(signPortalToken).not.toHaveBeenCalled();
  });

  it("refuses archived matters", async () => {
    stubCase(200, { frontmatter: { portal_enabled: true, status: "archived" } });
    const res = await POST(req("cases/a") as never);
    expect(res.status).toBe(409);
    expect(signPortalToken).not.toHaveBeenCalled();
  });

  it("signs a token for an enabled, readable matter", async () => {
    stubCase(200, { frontmatter: { portal_enabled: true, status: "open" } });
    const res = await POST(req("cases/a") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "signed-token", url: "/portal/signed-token" });
    expect(signPortalToken).toHaveBeenCalledWith("cases/a", undefined, "firm-a");
  });

  it("registers the issued link (hash only) on the matter for later revocation", async () => {
    stubCase(200, { frontmatter: { portal_enabled: true, status: "open" } });
    const res = await POST(req("cases/a") as never);
    expect(res.status).toBe(200);
    expect(registerPortalLink).toHaveBeenCalledWith(
      { "x-subsumio-source": "firm-a", "x-matter-scope": "caller-scope" },
      "cases/a",
      expect.objectContaining({ token: "signed-token", created_by: "assistant@firm.example" })
    );
  });
});

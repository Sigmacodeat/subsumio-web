// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://mock-engine:3001" }));
vi.mock("@/lib/portal-token", () => ({
  revokePortalToken: vi.fn(async () => {}),
  revokePortalTokenHash: vi.fn(async () => {}),
  verifyPortalToken: vi.fn(async () => ({ case_slug: "cases/a", exp: 2_000_000_000 })),
  portalTokenHash: vi.fn((t: string) => `hash-${t}`),
}));
const removeSubs = vi.fn(async () => {});
vi.mock("@/lib/portal-push", () => ({
  removePortalSubscriptionsFor: (...a: unknown[]) => removeSubs(...(a as [])),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (v: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        headers: { "x-matter-scope": "caller" },
        brainId: "firm-a",
        user: { id: "u1", email: "partner@firm.example" },
      };
      const body = opts.body ? opts.body.parse(await req.json()) : null;
      return handler(ctx, body, null, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json(data),
}));

import { POST } from "./route";
import { revokePortalToken, revokePortalTokenHash } from "@/lib/portal-token";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const registryFm = {
  portal_links: [
    {
      token_hash: HASH_A,
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    {
      token_hash: HASH_B,
      created_at: "2026-01-02T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
    },
  ],
};

function req(body: unknown) {
  return new Request("http://localhost/api/portal/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function stubCase(fm: unknown, status = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify({ frontmatter: fm }), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("POST /api/portal/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("revoking ends the push notifications of the revoked links", async () => {
    stubCase(registryFm);
    expect((await POST(req({ case_slug: "cases/a", all: true }) as never)).status).toBe(200);
    expect(removeSubs).toHaveBeenCalledWith("firm-a", "cases/a", undefined);

    removeSubs.mockClear();
    stubCase(registryFm);
    expect((await POST(req({ case_slug: "cases/a", token_hash: HASH_B }) as never)).status).toBe(
      200
    );
    expect(removeSubs).toHaveBeenCalledWith("firm-a", "cases/a", HASH_B);

    removeSubs.mockClear();
    stubCase(registryFm);
    expect((await POST(req({ token: "tok.abc" }) as never)).status).toBe(200);
    expect(removeSubs).toHaveBeenCalledWith("firm-a", "cases/a", "hash-tok.abc");
  });

  it("revokes a raw token directly", async () => {
    stubCase(registryFm);
    const res = await POST(req({ token: "tok.abc" }) as never);
    expect(res.status).toBe(200);
    expect(revokePortalToken).toHaveBeenCalledWith("tok.abc");
  });

  it("revokes a single link by registry hash", async () => {
    stubCase(registryFm);
    const res = await POST(req({ case_slug: "cases/a", token_hash: HASH_A }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 1 });
    expect(revokePortalTokenHash).toHaveBeenCalledWith(HASH_A);
    expect(revokePortalTokenHash).toHaveBeenCalledTimes(1);
  });

  it("revokes all active links of a matter and sets the reset cutoff", async () => {
    const fetchMock = stubCase(registryFm);
    const res = await POST(req({ case_slug: "cases/a", all: true }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 2 });
    expect(revokePortalTokenHash).toHaveBeenCalledWith(HASH_A);
    expect(revokePortalTokenHash).toHaveBeenCalledWith(HASH_B);
    // "Revoke all" writes portal_links_reset_at so unregistered legacy
    // tokens (issued before the registry existed) die too.
    const write = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse((write?.[1] as RequestInit).body as string) as {
      frontmatter: { portal_links_reset_at?: string };
    };
    expect(body.frontmatter.portal_links_reset_at).toBeDefined();
  });

  it("404s for a matter the caller cannot read (ethical wall)", async () => {
    stubCase(registryFm, 404);
    const res = await POST(req({ case_slug: "cases/walled", all: true }) as never);
    expect(res.status).toBe(404);
    expect(revokePortalTokenHash).not.toHaveBeenCalled();
  });

  it("404s when no registry entry matches", async () => {
    stubCase({ portal_links: [] });
    const res = await POST(req({ case_slug: "cases/a", token_hash: HASH_A }) as never);
    expect(res.status).toBe(404);
  });

  it("does not report success when the revocation list cannot be stored (token)", async () => {
    stubCase(registryFm);
    vi.mocked(revokePortalToken).mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req({ token: "tok.abc" }) as never);
    expect(res.status).toBe(502);
    expect(await res.json()).not.toHaveProperty("revoked");
  });

  it("does not report success when the revocation list cannot be stored (hash)", async () => {
    stubCase(registryFm);
    vi.mocked(revokePortalTokenHash).mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req({ case_slug: "cases/a", token_hash: HASH_A }) as never);
    expect(res.status).toBe(502);
  });

  it("'revoke all' fails when the reset cutoff cannot be written", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response("{}", { status: 500 })
        : new Response(JSON.stringify({ frontmatter: registryFm }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(req({ case_slug: "cases/a", all: true }) as never);
    expect(res.status).toBe(502);
    expect(await res.json()).not.toHaveProperty("revoked");
  });
});

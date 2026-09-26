// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const updates = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const orgs = vi.hoisted(() => ({ list: [] as Array<{ id: string; brainId: string }> }));
const holds = vi.hoisted(() => ({ result: { status: "clear" } as Record<string, unknown> }));
const retention = vi.hoisted(() => ({ result: { status: "clear" } as Record<string, unknown> }));
const revoked = vi.hoisted(() => [] as string[]);
const engineCalls = vi.hoisted(() => [] as Array<{ url: string; method: string }>);

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const raw = await req.json();
      const parsed = opts.body!.safeParse(raw);
      if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
      return handler(
        {
          user: { id: "u1", email: "anwalt@example.com", role: "admin" },
          brainId: "brain_u1",
          headers: { "x-subsumio-source": "brain_u1" },
        },
        parsed.data,
        {},
        req
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async () => user.current,
    update: async (_id: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...user.current, ...patch };
    },
  }),
  getOrgStore: () => ({ list: async () => orgs.list }),
}));
vi.mock("@/lib/api-key-store", () => ({
  getApiKeyStore: () => ({
    listByOwner: async () => [{ id: "k1" }],
    delete: async (id: string) => void revoked.push(`api:${id}`),
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  revokeAllSessions: async (id: string) => void revoked.push(`sessions:${id}`),
  SESSION_COOKIE: "sid",
}));
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: async (pw: string, hash: string) => hash === `hash:${pw}`,
}));
vi.mock("@/lib/auth/second-factor", () => ({
  verifySecondFactor: async (_u: unknown, code: string) =>
    code === "123456" ? { ok: true, method: "totp" } : { ok: false, reason: "invalid" },
}));
vi.mock("@/lib/auth/rate-limit", () => ({ hit: async () => ({ ok: true }) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine" }));
vi.mock("@/lib/copilot-memory", () => ({ deleteMemoriesOfUser: async () => 0 }));
vi.mock("@/lib/legal-hold-check", () => ({ checkFirmLegalHolds: async () => holds.result }));
vi.mock("@/lib/firm-retention-check", () => ({
  checkFirmRetention: async () => retention.result,
  retainedMessage: () => "Aufbewahrungspflicht (§ 12 RAO) — Export herunterladen",
}));
vi.mock("@/lib/user-purge", () => ({ USER_SOFT_DELETE_GRACE_DAYS: 30 }));
vi.mock("@/lib/logger", () => ({ logger: () => ({ warn: vi.fn(), error: vi.fn() }) }));

import { POST } from "./route";

beforeEach(() => {
  updates.length = 0;
  revoked.length = 0;
  engineCalls.length = 0;
  orgs.list = [];
  holds.result = { status: "clear" };
  retention.result = { status: "clear" };
  user.current = {
    id: "u1",
    brainId: "brain_u1",
    orgId: null,
    passwordHash: "hash:geheim",
    twoFactorEnabled: false,
    davTokenHash: "dav",
    calendarFeedTokenHash: "cal",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      engineCalls.push({ url: String(url), method: init?.method ?? "GET" });
      if (String(url).endsWith("/api/mcp-tokens") && (init?.method ?? "GET") === "GET") {
        return Response.json({
          tokens: [
            { id: "t-own", ownedByCaller: true, revoked: false },
            { id: "t-other", ownedByCaller: false, revoked: false },
          ],
        });
      }
      return Response.json({ ok: true });
    })
  );
});

function del(body: Record<string, unknown>) {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://x/api/settings/gdpr/data-deletion", {
      method: "POST",
      body: JSON.stringify({ confirm: "DELETE_MY_ACCOUNT", ...body }),
    })
  );
}

describe("POST /api/settings/gdpr/data-deletion", () => {
  it("requires the password — a session alone deletes nothing", async () => {
    const res = await del({});
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("reauth_required");
    expect(updates).toEqual([]);
    const wrong = await del({ password: "falsch" });
    expect(wrong.status).toBe(401);
    expect(updates).toEqual([]);
  });

  it("requires the second factor when 2FA is active", async () => {
    user.current!.twoFactorEnabled = true;
    expect((await del({ password: "geheim" })).status).toBe(401);
    expect((await del({ password: "geheim", code: "000000" })).status).toBe(401);
    expect(updates).toEqual([]);
    expect((await del({ password: "geheim", code: "123456" })).status).toBe(200);
  });

  it("refuses a single-lawyer firm with a matter under legal hold — nothing purged", async () => {
    holds.result = { status: "held", cases: ["legal/cases/a"] };
    const res = await del({ password: "geheim" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("legal_hold_active");
    expect(updates).toEqual([]);
    expect(engineCalls.some((c) => c.url.includes("/api/source-data"))).toBe(false);
  });

  it("refuses while records must be kept, with the export hint", async () => {
    retention.result = { status: "retained", cases: ["legal/cases/a"], receipts: 0, until: null };
    const res = await del({ password: "geheim" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("retention_period_running");
    expect(body.error).toMatch(/Export/);
    expect(updates).toEqual([]);
  });

  it("never touches a firm's data when the personal brain is the firm brain", async () => {
    orgs.list = [{ id: "org1", brainId: "brain_u1" }];
    const res = await del({ password: "geheim" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("firm_brain");
    expect(updates).toEqual([]);
    expect(engineCalls.some((c) => c.url.includes("/api/source-data"))).toBe(false);
  });

  it("success: no immediate purge; the brain purge is scheduled after the grace period", async () => {
    const res = await del({ password: "geheim" });
    expect(res.status).toBe(200);
    expect((await res.json()).data_purge_after_days).toBe(30);
    expect(engineCalls.some((c) => c.url.includes("/api/source-data"))).toBe(false);
    expect(updates[0]).toMatchObject({ purgeBrainOnDelete: true, orgId: null });
    expect(typeof updates[0]!.deletedAt).toBe("string");
  });

  it("every credential stops: sessions, API keys, own MCP tokens, DAV and feed tokens, membership", async () => {
    user.current!.orgId = "org9";
    const res = await del({ password: "geheim" });
    expect(res.status).toBe(200);
    const patch = updates[0]!;
    expect(patch).toMatchObject({
      orgId: null,
      deletedFromOrgId: "org9",
      davTokenHash: null,
      calendarFeedTokenHash: null,
      purgeBrainOnDelete: false,
    });
    expect(typeof patch.deactivatedAt).toBe("string");
    expect(revoked).toEqual(expect.arrayContaining(["api:k1", "sessions:u1"]));
    const mcpDeletes = engineCalls.filter((c) => c.method === "DELETE");
    expect(mcpDeletes.map((c) => c.url)).toEqual(["http://engine/api/mcp-tokens/t-own"]);
  });
});

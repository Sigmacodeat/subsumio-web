/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

type Key = Record<string, any>;
const keys = new Map<string, Key>();
vi.mock("@/lib/api-key-store", () => ({
  getApiKeyStore: () => ({
    getById: async (id: string) => keys.get(id) ?? null,
    listByOwner: async (owner: string) => [...keys.values()].filter((k) => k.ownerId === owner),
    create: async (k: Key) => {
      keys.set(k.id, k);
      return k;
    },
    update: async (id: string, patch: Key) => {
      const next = { ...keys.get(id)!, ...patch };
      keys.set(id, next);
      return next;
    },
    delete: async (id: string) => {
      keys.delete(id);
    },
  }),
}));

const members = [
  { id: "admin-1", name: "Admin", email: "admin@a.example", orgId: "org-a" },
  { id: "lawyer-1", name: "Anwältin", email: "anw@a.example", orgId: "org-a" },
];
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    listByOrg: async (orgId: string) => members.filter((m) => m.orgId === orgId),
    getById: async (id: string) => members.find((m) => m.id === id) ?? null,
  }),
}));

import { DELETE, GET, POST } from "./route";
import { API_KEY_DEFAULT_EXPIRY_DAYS } from "@/lib/api-keys";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

const ADMIN = { id: "admin-1", email: "admin@a.example", role: "admin", orgId: "org-a" };

function asUser(user: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "brain-a",
    plan: "team",
    user,
    ...extra,
  } as any);
}

function req(method: string, body?: unknown, query = "") {
  return new NextRequest(`http://localhost:3000/api/api-keys${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function key(id: string, ownerId: string, extra: Key = {}): Key {
  return {
    id,
    ownerId,
    name: `Key ${id}`,
    prefix: "sk_live_x",
    secretHash: `h-${id}`,
    scopes: ["read"],
    active: true,
    createdAt: "2099-01-01T00:00:00.000Z",
    createdBy: "x",
    kind: "api",
    ...extra,
  };
}

describe("/api/api-keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    keys.clear();
    asUser(ADMIN);
  });

  it("new keys expire after 365 days by default", async () => {
    const res = await POST(req("POST", { name: "Zapier" }));
    expect(res.status).toBe(201);
    const stored = [...keys.values()][0];
    const days = (Date.parse(stored.expiresAt) - Date.now()) / 86_400_000;
    expect(API_KEY_DEFAULT_EXPIRY_DAYS).toBe(365);
    expect(days).toBeGreaterThan(364.9);
    expect(days).toBeLessThanOrEqual(365);
  });

  it("the term is selectable, and no expiry only when chosen explicitly", async () => {
    await POST(req("POST", { name: "Kurz", expiresInDays: 30 }));
    await POST(req("POST", { name: "Dauer", expiresInDays: null }));
    const byName = Object.fromEntries([...keys.values()].map((k) => [k.name, k]));
    expect((Date.parse(byName.Kurz.expiresAt) - Date.now()) / 86_400_000).toBeLessThanOrEqual(30);
    expect(byName.Dauer.expiresAt).toBeUndefined();
    expect((await POST(req("POST", { name: "Zu lang", expiresInDays: 5000 }))).status).toBe(400);
  });

  it("the firm overview lists every member's keys with owner, last use and expiry — admins only", async () => {
    keys.set("k1", key("k1", "lawyer-1", { lastUsedAt: "2099-01-02T00:00:00.000Z" }));
    keys.set("k2", key("k2", "outsider"));
    const res = await GET(req("GET", undefined, "?scope=firm"));
    const { keys: listed } = await res.json();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: "k1",
      owner: { id: "lawyer-1", email: "anw@a.example" },
      lastUsedAt: "2099-01-02T00:00:00.000Z",
    });

    asUser({ ...ADMIN, id: "lawyer-1", role: "lawyer" });
    expect((await GET(req("GET", undefined, "?scope=firm"))).status).toBe(403);
  });

  it("an expired key shows as expired", async () => {
    keys.set("k1", key("k1", "admin-1", { expiresAt: "2000-01-01T00:00:00.000Z" }));
    const { keys: listed } = await (await GET(req("GET"))).json();
    expect(listed[0].expired).toBe(true);
  });

  it("a firm admin revokes a member's key (deactivated, audited)", async () => {
    keys.set("k1", key("k1", "lawyer-1"));
    const res = await DELETE(req("DELETE", { id: "k1" }));
    expect(res.status).toBe(200);
    expect(keys.get("k1")?.active).toBe(false);
    expect(logAudit).toHaveBeenCalledWith(
      "settings.update",
      "api_key",
      expect.objectContaining({
        details: expect.objectContaining({ operation: "revoke_by_admin", ownerId: "lawyer-1" }),
      })
    );
  });

  it("never touches keys of people outside the firm, nor inside a support session", async () => {
    keys.set("k2", key("k2", "outsider"));
    expect((await DELETE(req("DELETE", { id: "k2" }))).status).toBe(404);
    expect(keys.get("k2")?.active).toBe(true);

    keys.set("k1", key("k1", "lawyer-1"));
    asUser(ADMIN, { supportSession: { id: "s", mode: "write" } });
    expect((await DELETE(req("DELETE", { id: "k1" }))).status).toBe(404);
    expect((await GET(req("GET", undefined, "?scope=firm"))).status).toBe(403);
    expect(keys.get("k1")?.active).toBe(true);
  });
});

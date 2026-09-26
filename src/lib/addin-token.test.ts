// @vitest-environment node
/**
 * Office add-in tokens: at most 24 hours, only read/write, revocable, one
 * active per person, and verified like API keys — never a permanent key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKeyStore, StoredApiKey } from "@/lib/api-key-store";

const keys: StoredApiKey[] = [];
const memoryStore: ApiKeyStore = {
  getById: async (id) => keys.find((k) => k.id === id) ?? null,
  listByOwner: async (owner) => keys.filter((k) => k.ownerId === owner),
  listAll: async () => [...keys],
  findByHash: async (hash) => keys.find((k) => k.secretHash === hash && k.active) ?? null,
  create: async (k) => {
    keys.push(k);
    return k;
  },
  update: async (id, patch) => {
    const k = keys.find((x) => x.id === id);
    if (!k) return null;
    Object.assign(k, patch);
    return k;
  },
  delete: async (id) => {
    const i = keys.findIndex((k) => k.id === id);
    if (i >= 0) keys.splice(i, 1);
  },
};

vi.mock("@/lib/api-key-store", () => ({ getApiKeyStore: () => memoryStore }));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) =>
      id === "user-1"
        ? { id, email: "a@firm.example", brainId: "brain-1", orgId: null, role: "lawyer" }
        : null,
  }),
  getOrgStore: () => ({ getById: async () => null, getByBrainId: async () => null }),
}));
vi.mock("@/lib/env", () => ({ env: () => null }));

import {
  ADDIN_TOKEN_SCOPES,
  ADDIN_TOKEN_TTL_MS,
  issueAddinToken,
  isStoredKeyUsable,
  revokeAddinTokens,
} from "./addin-token";
import { verifyApiKey } from "./auth/api-key-auth";
import { apiKeyHasScope } from "./auth/api-key-scopes";
import { hashApiKey } from "./api-keys";

const owner = { id: "user-1", email: "a@firm.example" };

beforeEach(() => {
  keys.length = 0;
});

describe("add-in tokens", () => {
  it("expire after at most 24 hours and carry only read/write", async () => {
    const now = Date.UTC(2026, 8, 26, 8, 0, 0);
    const t = await issueAddinToken(memoryStore, owner, now);
    expect(t.token.startsWith("sk_addin_")).toBe(true);
    expect(Date.parse(t.expiresAt) - now).toBeLessThanOrEqual(ADDIN_TOKEN_TTL_MS);
    const stored = keys[0];
    expect(stored.kind).toBe("addin");
    expect(stored.scopes).toEqual(["write"]);
    expect(stored.secretHash).not.toContain(t.token);
    expect(apiKeyHasScope(ADDIN_TOKEN_SCOPES, "write")).toBe(true);
    expect(apiKeyHasScope(ADDIN_TOKEN_SCOPES, "admin")).toBe(false);
  });

  it("a new token replaces the earlier one; revoking removes all", async () => {
    await issueAddinToken(memoryStore, owner);
    await issueAddinToken(memoryStore, owner);
    expect(keys.filter((k) => k.kind === "addin")).toHaveLength(1);
    expect(await revokeAddinTokens(memoryStore, owner.id)).toBe(1);
    expect(keys).toHaveLength(0);
  });

  it("expired tokens and add-in tokens without expiry are not usable", () => {
    const base: StoredApiKey = {
      id: "k",
      name: "n",
      prefix: "p",
      secretHash: "h",
      scopes: ["write"],
      active: true,
      createdAt: "",
      createdBy: "",
      ownerId: "user-1",
      kind: "addin",
    };
    const now = Date.now();
    expect(isStoredKeyUsable({ ...base, expiresAt: new Date(now + 1000).toISOString() }, now)).toBe(
      true
    );
    expect(isStoredKeyUsable({ ...base, expiresAt: new Date(now - 1).toISOString() }, now)).toBe(
      false
    );
    expect(isStoredKeyUsable(base, now)).toBe(false);
    expect(isStoredKeyUsable({ ...base, kind: "api" }, now)).toBe(true);
  });

  it("verification accepts a live add-in token and refuses an expired or revoked one", async () => {
    const t = await issueAddinToken(memoryStore, owner);
    const ok = await verifyApiKey(`Bearer ${t.token}`);
    expect(ok?.ctx.apiKey).toEqual({ id: t.id, kind: "addin" });

    keys[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(await verifyApiKey(`Bearer ${t.token}`)).toBeNull();

    const t2 = await issueAddinToken(memoryStore, owner);
    await revokeAddinTokens(memoryStore, owner.id);
    expect(await verifyApiKey(`Bearer ${t2.token}`)).toBeNull();
  });

  it("a permanent key can never pass as an add-in token (and vice versa)", async () => {
    const liveKey = ["sk", "live", "x".repeat(32)].join("_");
    keys.push({
      id: "x",
      name: "n",
      prefix: "p",
      secretHash: await hashApiKey(liveKey),
      scopes: ["write"],
      active: true,
      createdAt: "",
      createdBy: "",
      ownerId: "user-1",
      kind: "addin",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await verifyApiKey(`Bearer ${liveKey}`)).toBeNull();
  });
});

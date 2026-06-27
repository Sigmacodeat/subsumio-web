import { describe, test, expect, vi, beforeEach } from "vitest";
import { extractBearerToken, verifyApiKey } from "./api-key-auth";

vi.mock("@/lib/api-keys", () => ({
  hashApiKey: vi.fn(async (key: string) => `hash_${key}`),
}));

vi.mock("@/lib/api-key-store", () => {
  const mockStore = {
    findByHash: vi.fn(),
    update: vi.fn(async () => ({})),
  };
  return {
    getApiKeyStore: () => mockStore,
    mockStore,
  };
});

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: vi.fn(async (id: string) => {
      if (id === "user-1") {
        return {
          id: "user-1",
          email: "test@example.com",
          name: "Test User",
          brainId: "brain-1",
          plan: "pro",
          orgId: null,
          role: "user",
        };
      }
      return null;
    }),
  }),
  getOrgStore: () => ({
    getById: vi.fn(async () => null),
  }),
}));

vi.mock("@/lib/env", () => ({
  env: () => null,
}));

describe("extractBearerToken", () => {
  test("extracts token from valid Bearer header", () => {
    expect(extractBearerToken("Bearer sk_live_abc123")).toBe("sk_live_abc123");
  });

  test("returns null for missing header", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  test("returns null for non-Bearer header", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  test("returns null for empty Bearer", () => {
    expect(extractBearerToken("Bearer ")).toBeNull();
  });

  test("trims whitespace around token", () => {
    expect(extractBearerToken("Bearer   sk_live_xyz  ")).toBe("sk_live_xyz");
  });
});

describe("verifyApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null for missing auth header", async () => {
    expect(await verifyApiKey(null)).toBeNull();
  });

  test("returns null for non-sk_live token", async () => {
    expect(await verifyApiKey("Bearer someothertoken")).toBeNull();
  });

  test("returns null when key not found in store", async () => {
    const { mockStore } = await import("@/lib/api-key-store");
    mockStore.findByHash.mockResolvedValue(null);
    expect(await verifyApiKey("Bearer sk_live_notfound")).toBeNull();
  });

  test("returns EngineContext for valid API key", async () => {
    const { mockStore } = await import("@/lib/api-key-store");
    mockStore.findByHash.mockResolvedValue({
      id: "key-1",
      ownerId: "user-1",
      name: "Outlook Add-in",
      prefix: "sk_live_abc12",
      secretHash: "hash_sk_live_abc123",
      scopes: ["read", "write"],
      active: true,
      createdAt: "2024-01-01T00:00:00Z",
      createdBy: "test@example.com",
    });

    const result = await verifyApiKey("Bearer sk_live_abc123");
    expect(result).not.toBeNull();
    expect(result!.ctx.user.id).toBe("user-1");
    expect(result!.ctx.brainId).toBe("brain-1");
    expect(result!.ctx.headers["x-subsumio-source"]).toBe("brain-1");
    expect(result!.key.id).toBe("key-1");
  });

  test("updates lastUsedAt on successful auth", async () => {
    const { mockStore } = await import("@/lib/api-key-store");
    mockStore.findByHash.mockResolvedValue({
      id: "key-1",
      ownerId: "user-1",
      name: "Outlook Add-in",
      prefix: "sk_live_abc12",
      secretHash: "hash_sk_live_abc123",
      scopes: ["read"],
      active: true,
      createdAt: "2024-01-01T00:00:00Z",
      createdBy: "test@example.com",
    });

    await verifyApiKey("Bearer sk_live_abc123");
    // Wait for fire-and-forget
    await new Promise((r) => setTimeout(r, 10));
    expect(mockStore.update).toHaveBeenCalledWith(
      "key-1",
      expect.objectContaining({
        lastUsedAt: expect.any(String),
      })
    );
  });

  test("returns null when owner user not found", async () => {
    const { mockStore } = await import("@/lib/api-key-store");
    mockStore.findByHash.mockResolvedValue({
      id: "key-2",
      ownerId: "nonexistent-user",
      name: "Outlook Add-in",
      prefix: "sk_live_def34",
      secretHash: "hash_sk_live_def456",
      scopes: ["read"],
      active: true,
      createdAt: "2024-01-01T00:00:00Z",
      createdBy: "test@example.com",
    });

    expect(await verifyApiKey("Bearer sk_live_def456")).toBeNull();
  });
});

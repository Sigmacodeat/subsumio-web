// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StoredApiKey, ApiKeyStore } from "./api-key-store";

// We test the FileApiKeyStore directly by importing the class via the module.
// In dev mode (no DATABASE_URL), getApiKeyStore() returns a FileApiKeyStore.

const TEST_DIR = path.join(process.cwd(), ".data-test-api-key-store");
const TEST_FILE = path.join(TEST_DIR, "api-keys.json");

function makeKey(overrides: Partial<StoredApiKey> = {}): StoredApiKey {
  return {
    id: "key-1",
    name: "Test Key",
    prefix: "subsum_test1234",
    secretHash: "abc123hash",
    scopes: ["read", "write"],
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    createdBy: "user-1",
    ownerId: "owner-1",
    ...overrides,
  };
}

describe("FileApiKeyStore (dev mode)", () => {
  let store: ApiKeyStore;

  beforeEach(async () => {
    // Clean up any previous test data
    try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch {}
    process.env.SUBSUMIO_DATA_DIR = TEST_DIR;
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    vi.resetModules();
    // Clear singleton
    (globalThis as Record<string, unknown>).__subsumioApiKeyStore = undefined;
    const mod = await import("./api-key-store");
    store = mod.getApiKeyStore();
  });

  afterEach(async () => {
    try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch {}
    (globalThis as Record<string, unknown>).__subsumioApiKeyStore = undefined;
  });

  test("create and getById", async () => {
    const key = makeKey();
    await store.create(key);
    const found = await store.getById("key-1");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("key-1");
    expect(found!.name).toBe("Test Key");
  });

  test("getById returns null for non-existent key", async () => {
    expect(await store.getById("nonexistent")).toBeNull();
  });

  test("listByOwner returns only keys for that owner", async () => {
    await store.create(makeKey({ id: "k1", ownerId: "owner-a" }));
    await store.create(makeKey({ id: "k2", ownerId: "owner-b" }));
    await store.create(makeKey({ id: "k3", ownerId: "owner-a" }));
    const result = await store.listByOwner("owner-a");
    expect(result).toHaveLength(2);
    expect(result.every((k) => k.ownerId === "owner-a")).toBe(true);
  });

  test("listAll returns all keys", async () => {
    await store.create(makeKey({ id: "k1" }));
    await store.create(makeKey({ id: "k2" }));
    await store.create(makeKey({ id: "k3" }));
    expect((await store.listAll()).length).toBe(3);
  });

  test("update modifies fields", async () => {
    await store.create(makeKey({ id: "k1", name: "Original" }));
    const updated = await store.update("k1", { name: "Updated", active: false });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
    expect(updated!.active).toBe(false);
  });

  test("update preserves id", async () => {
    await store.create(makeKey({ id: "k1" }));
    const updated = await store.update("k1", { id: "should-not-change" } as Partial<StoredApiKey>);
    expect(updated!.id).toBe("k1");
  });

  test("update returns null for non-existent key", async () => {
    expect(await store.update("nonexistent", { name: "X" })).toBeNull();
  });

  test("delete removes key", async () => {
    await store.create(makeKey({ id: "k1" }));
    await store.delete("k1");
    expect(await store.getById("k1")).toBeNull();
  });

  test("delete is no-op for non-existent key", async () => {
    await expect(store.delete("nonexistent")).resolves.not.toThrow();
  });

  test("findByHash returns active key with matching hash", async () => {
    await store.create(makeKey({ id: "k1", secretHash: "hash-abc", active: true }));
    const found = await store.findByHash("hash-abc");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("k1");
  });

  test("findByHash returns null for inactive key", async () => {
    await store.create(makeKey({ id: "k1", secretHash: "hash-abc", active: false }));
    expect(await store.findByHash("hash-abc")).toBeNull();
  });

  test("findByHash returns null for non-existent hash", async () => {
    expect(await store.findByHash("nonexistent")).toBeNull();
  });

  test("persists across store instances", async () => {
    await store.create(makeKey({ id: "k1" }));
    // Create a new store instance — should load from file
    (globalThis as Record<string, unknown>).__subsumioApiKeyStore = undefined;
    const mod = await import("./api-key-store");
    const newStore = mod.getApiKeyStore();
    const found = await newStore.getById("k1");
    expect(found).not.toBeNull();
  });

  test("handles multiple keys with same owner", async () => {
    for (let i = 0; i < 5; i++) {
      await store.create(makeKey({ id: `k${i}`, ownerId: "same-owner" }));
    }
    const keys = await store.listByOwner("same-owner");
    expect(keys).toHaveLength(5);
  });

  test("update scopes replaces array", async () => {
    await store.create(makeKey({ id: "k1", scopes: ["read"] }));
    const updated = await store.update("k1", { scopes: ["read", "write", "admin"] });
    expect(updated!.scopes).toEqual(["read", "write", "admin"]);
  });

  test("update lastUsedAt", async () => {
    await store.create(makeKey({ id: "k1" }));
    const updated = await store.update("k1", { lastUsedAt: "2024-06-01T00:00:00Z" });
    expect(updated!.lastUsedAt).toBe("2024-06-01T00:00:00Z");
  });
});

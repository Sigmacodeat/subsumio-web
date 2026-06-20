// @vitest-environment node

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { vi } from "vitest";

// We test the FileUserStore encryption integration by creating a temp data dir,
// writing users with sensitive fields, and verifying the on-disk file contains
// encrypted values while the in-memory store returns plaintext.

describe("FileUserStore encryption at rest", () => {
  let tmpDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "subsumio-test-"));
    originalDataDir = process.env.SUBSUMIO_DATA_DIR;
    process.env.SUBSUMIO_DATA_DIR = tmpDir;
    // Clear the module cache so the store picks up the new data dir
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalDataDir !== undefined) {
      process.env.SUBSUMIO_DATA_DIR = originalDataDir;
    } else {
      delete process.env.SUBSUMIO_DATA_DIR;
    }
    vi.resetModules();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test("sensitive fields are encrypted on disk (sbplain: marker in dev)", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      passwordHash: "hash",
      role: "admin",
      plan: "pro",
      locale: "de",
      referralCode: "REF001",
      referredBy: null,
      brainId: "brain-1",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      docusignAccessToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9",
      docusignRefreshToken: "rt-abcdef123456",
      openaiKey: "sk-test-1234567890",
    });

    // Read the raw file from disk
    const usersFile = path.join(tmpDir, "users.json");
    const raw = await fs.readFile(usersFile, "utf8");
    const onDisk = JSON.parse(raw) as Array<Record<string, unknown>>;

    expect(onDisk).toHaveLength(1);
    const user = onDisk[0];

    // Sensitive fields should have the sbplain: marker (dev mode, no encryption key)
    expect(user.twoFactorSecret).toMatch(/^sbplain:/);
    expect(user.twoFactorSecret).not.toBe("JBSWY3DPEHPK3PXP");
    expect(user.docusignAccessToken).toMatch(/^sbplain:/);
    expect(user.docusignAccessToken).not.toBe("eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9");
    expect(user.docusignRefreshToken).toMatch(/^sbplain:/);
    expect(user.openaiKey).toMatch(/^sbplain:/);

    // Non-sensitive fields should be plaintext
    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.passwordHash).toBe("hash");
  });

  test("sensitive fields are decrypted on read", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-2",
      email: "decrypt@example.com",
      name: "Decrypt Test",
      passwordHash: "hash2",
      role: "lawyer",
      plan: "team",
      locale: "de",
      referralCode: "REF002",
      referredBy: null,
      brainId: "brain-2",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: "KRSXG5BAONUGC4TFFY",
      docusignAccessToken: "token-abc-123",
      openaiKey: "sk-openai-key",
      anthropicKey: "sk-anthropic-key",
    });

    // Read back through the store — should get plaintext
    const user = await store.getById("user-2");
    expect(user).not.toBeNull();
    if (!user) return;

    expect(user.twoFactorSecret).toBe("KRSXG5BAONUGC4TFFY");
    expect(user.docusignAccessToken).toBe("token-abc-123");
    expect(user.openaiKey).toBe("sk-openai-key");
    expect(user.anthropicKey).toBe("sk-anthropic-key");
  });

  test("update encrypts sensitive fields on persist", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-3",
      email: "update@example.com",
      name: "Update Test",
      passwordHash: "hash3",
      role: "admin",
      plan: "free",
      locale: "en",
      referralCode: "REF003",
      referredBy: null,
      brainId: "brain-3",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    });

    // Update with sensitive fields
    await store.update("user-3", {
      twoFactorSecret: "NEWSECRET123",
      docusignAccessToken: "new-token-xyz",
    });

    // Verify on disk
    const usersFile = path.join(tmpDir, "users.json");
    const raw = await fs.readFile(usersFile, "utf8");
    const onDisk = JSON.parse(raw) as Array<Record<string, unknown>>;
    const user = onDisk.find((u) => u.id === "user-3");
    expect(user).toBeDefined();
    if (!user) return;

    expect(user.twoFactorSecret).toMatch(/^sbplain:/);
    expect(user.twoFactorSecret).not.toBe("NEWSECRET123");
    expect(user.docusignAccessToken).toMatch(/^sbplain:/);
    expect(user.docusignAccessToken).not.toBe("new-token-xyz");

    // Read back through store
    const retrieved = await store.getById("user-3");
    expect(retrieved?.twoFactorSecret).toBe("NEWSECRET123");
    expect(retrieved?.docusignAccessToken).toBe("new-token-xyz");
  });

  test("round-trip: create → read → update → read preserves exact values", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    const secret = "GEZDGNBVGY3TQOJQ";
    const token = "eyJhbGciOiJSUzI1NiJ9.payload.signature";
    const refreshToken = "rt-xyz789";
    const apiKey = "sk-test-roundtrip";

    await store.create({
      id: "user-rt",
      email: "rt@example.com",
      name: "Round Trip",
      passwordHash: "hash-rt",
      role: "lawyer",
      plan: "pro",
      locale: "de",
      referralCode: "REFRT",
      referredBy: null,
      brainId: "brain-rt",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: secret,
      docusignAccessToken: token,
      docusignRefreshToken: refreshToken,
      openaiKey: apiKey,
    });

    // First read
    const u1 = await store.getById("user-rt");
    expect(u1?.twoFactorSecret).toBe(secret);
    expect(u1?.docusignAccessToken).toBe(token);
    expect(u1?.docusignRefreshToken).toBe(refreshToken);
    expect(u1?.openaiKey).toBe(apiKey);

    // Update with new values
    const newSecret = "NEWGEZDGNBVGY3TQOJQ";
    await store.update("user-rt", { twoFactorSecret: newSecret });

    // Second read
    const u2 = await store.getById("user-rt");
    expect(u2?.twoFactorSecret).toBe(newSecret);
    expect(u2?.docusignAccessToken).toBe(token); // unchanged
    expect(u2?.docusignRefreshToken).toBe(refreshToken); // unchanged
    expect(u2?.openaiKey).toBe(apiKey); // unchanged
  });

  test("null sensitive fields stay null through encryption", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-null",
      email: "null@example.com",
      name: "Null Test",
      passwordHash: "hash-null",
      role: "assistant",
      plan: "free",
      locale: "de",
      referralCode: "REFNULL",
      referredBy: null,
      brainId: "brain-null",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: null,
      docusignAccessToken: null,
      openaiKey: null,
    });

    const user = await store.getById("user-null");
    expect(user?.twoFactorSecret).toBeNull();
    expect(user?.docusignAccessToken).toBeNull();
    expect(user?.openaiKey).toBeNull();
  });

  test("pendingTwoFactorSecret is also encrypted", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-pending",
      email: "pending@example.com",
      name: "Pending Test",
      passwordHash: "hash-pending",
      role: "admin",
      plan: "pro",
      locale: "de",
      referralCode: "REFPEND",
      referredBy: null,
      brainId: "brain-pending",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    });

    await store.update("user-pending", {
      pendingTwoFactorSecret: "PENDINGSECRET456",
      pendingTwoFactorExpiresAt: new Date(Date.now() + 600000).toISOString(),
    });

    // Verify on disk
    const usersFile = path.join(tmpDir, "users.json");
    const raw = await fs.readFile(usersFile, "utf8");
    const onDisk = JSON.parse(raw) as Array<Record<string, unknown>>;
    const user = onDisk.find((u) => u.id === "user-pending");
    expect(user?.pendingTwoFactorSecret).toMatch(/^sbplain:/);
    expect(user?.pendingTwoFactorSecret).not.toBe("PENDINGSECRET456");

    // Read back
    const retrieved = await store.getById("user-pending");
    expect(retrieved?.pendingTwoFactorSecret).toBe("PENDINGSECRET456");
  });

  test("zeroEntropyKey is encrypted", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-ze",
      email: "ze@example.com",
      name: "ZeroEntropy Test",
      passwordHash: "hash-ze",
      role: "lawyer",
      plan: "enterprise",
      locale: "en",
      referralCode: "REFZE",
      referredBy: null,
      brainId: "brain-ze",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      zeroEntropyKey: "ze-key-secret-789",
    });

    const usersFile = path.join(tmpDir, "users.json");
    const raw = await fs.readFile(usersFile, "utf8");
    const onDisk = JSON.parse(raw) as Array<Record<string, unknown>>;
    const user = onDisk.find((u) => u.id === "user-ze");
    expect(user?.zeroEntropyKey).toMatch(/^sbplain:/);
    expect(user?.zeroEntropyKey).not.toBe("ze-key-secret-789");

    const retrieved = await store.getById("user-ze");
    expect(retrieved?.zeroEntropyKey).toBe("ze-key-secret-789");
  });

  test("list() returns decrypted users", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-list-1",
      email: "list1@example.com",
      name: "List 1",
      passwordHash: "hash-l1",
      role: "admin",
      plan: "pro",
      locale: "de",
      referralCode: "REFL1",
      referredBy: null,
      brainId: "brain-l1",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: "SECRET-L1",
    });

    await store.create({
      id: "user-list-2",
      email: "list2@example.com",
      name: "List 2",
      passwordHash: "hash-l2",
      role: "lawyer",
      plan: "free",
      locale: "en",
      referralCode: "REFL2",
      referredBy: null,
      brainId: "brain-l2",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      openaiKey: "sk-list-2",
    });

    const users = await store.list();
    expect(users).toHaveLength(2);
    const u1 = users.find((u) => u.id === "user-list-1");
    const u2 = users.find((u) => u.id === "user-list-2");
    expect(u1?.twoFactorSecret).toBe("SECRET-L1");
    expect(u2?.openaiKey).toBe("sk-list-2");
  });

  test("getByEmail returns decrypted user", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-email",
      email: "email.test@example.com",
      name: "Email Test",
      passwordHash: "hash-email",
      role: "admin",
      plan: "pro",
      locale: "de",
      referralCode: "REFEMAIL",
      referredBy: null,
      brainId: "brain-email",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: "SECRET-EMAIL",
      docusignAccessToken: "token-email",
    });

    const user = await store.getByEmail("email.test@example.com");
    expect(user?.twoFactorSecret).toBe("SECRET-EMAIL");
    expect(user?.docusignAccessToken).toBe("token-email");
  });

  test("getByReferralCode returns decrypted user", async () => {
    const { getStore } = await import("./store");
    const store = getStore();

    await store.create({
      id: "user-ref",
      email: "ref@example.com",
      name: "Ref Test",
      passwordHash: "hash-ref",
      role: "admin",
      plan: "pro",
      locale: "de",
      referralCode: "REFREF",
      referredBy: null,
      brainId: "brain-ref",
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      twoFactorSecret: "SECRET-REF",
    });

    const user = await store.getByReferralCode("REFREF");
    expect(user?.twoFactorSecret).toBe("SECRET-REF");
  });
});

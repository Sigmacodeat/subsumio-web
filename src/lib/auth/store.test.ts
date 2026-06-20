// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

// Mock encryption to be identity in test
vi.mock("@/lib/encryption", () => ({
  encryptFields: vi.fn(async (obj: Record<string, unknown>) => obj),
  decryptFields: vi.fn(async (obj: Record<string, unknown>) => obj),
}));

// Mock env to return test values
vi.mock("@/lib/env", () => ({
  env: vi.fn((key: string) => {
    if (key === "SUBSUMIO_DATA_DIR") return "";
    return process.env[key] || "";
  }),
}));

// Mock pg
vi.mock("pg", () => ({
  Pool: vi.fn(),
}));

import {
  generateReferralCode,
  buildNewUser,
  buildNewOrg,
  toPublic,
  getStore,
  getOrgStore,
  getSharedPgPool,
  type User,
  type Org,
  type KanzleiRole,
  type Plan,
} from "./store";

const TMP_DIR = path.join(process.cwd(), ".data-test-" + Date.now());

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-" + Math.random().toString(36).slice(2, 8),
    email: "test@example.com",
    name: "Test User",
    passwordHash: "hash",
    role: "lawyer",
    plan: "free",
    locale: "en",
    referralCode: "CODE" + Math.random().toString(36).slice(2, 6),
    referredBy: null,
    brainId: "brain_test",
    stripeCustomerId: null,
    emailVerifiedAt: null,
    orgId: null,
    industry: null,
    onboardingCompletedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("generateReferralCode", () => {
  test("returns 8-character string", () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(8);
  });

  test("uses only safe alphabet (no ambiguous chars)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
    }
  });

  test("generates unique codes (probabilistic)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) codes.add(generateReferralCode());
    // With 31^8 space, collisions in 1000 are near-impossible
    expect(codes.size).toBeGreaterThan(990);
  });
});

describe("toPublic", () => {
  test("removes passwordHash", () => {
    const user = makeUser({ passwordHash: "secret-hash" });
    const pub = toPublic(user);
    expect((pub as any).passwordHash).toBeUndefined();
  });

  test("preserves other fields", () => {
    const user = makeUser({ name: "Max", email: "max@example.com", role: "admin" });
    const pub = toPublic(user);
    expect(pub.name).toBe("Max");
    expect(pub.email).toBe("max@example.com");
    expect(pub.role).toBe("admin");
    expect(pub.id).toBe(user.id);
    expect(pub.brainId).toBe(user.brainId);
  });

  test("preserves nested optional fields", () => {
    const user = makeUser({
      twoFactorEnabled: true,
      twoFactorSecret: "secret",
      industry: "legal",
      orgId: "org-1",
    });
    const pub = toPublic(user);
    expect(pub.twoFactorEnabled).toBe(true);
    expect(pub.industry).toBe("legal");
    expect(pub.orgId).toBe("org-1");
  });
});

describe("buildNewOrg", () => {
  test("creates org with UUID id", () => {
    const org = buildNewOrg({ name: "Test Org", ownerId: "user-1" });
    expect(org.id).toBeTruthy();
    expect(org.id).toMatch(/^[0-9a-f-]+$/);
  });

  test("trims name", () => {
    const org = buildNewOrg({ name: "  Spaced Org  ", ownerId: "user-1" });
    expect(org.name).toBe("Spaced Org");
  });

  test("generates brainId with org_ prefix", () => {
    const org = buildNewOrg({ name: "Test", ownerId: "user-1" });
    expect(org.brainId).toMatch(/^org_/);
  });

  test("sets ownerId and createdAt", () => {
    const org = buildNewOrg({ name: "Test", ownerId: "user-1" });
    expect(org.ownerId).toBe("user-1");
    expect(org.createdAt).toBeTruthy();
  });

  test("generates unique IDs", () => {
    const org1 = buildNewOrg({ name: "A", ownerId: "u1" });
    const org2 = buildNewOrg({ name: "B", ownerId: "u2" });
    expect(org1.id).not.toBe(org2.id);
    expect(org1.brainId).not.toBe(org2.brainId);
  });
});

describe("FileUserStore (dev mode)", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    process.env.NODE_ENV = "development";
    process.env.SUBSUMIO_DATA_DIR = TMP_DIR;
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    try {
      await fs.rm(TMP_DIR, { recursive: true, force: true });
    } catch {}
  });

  test("getStore returns a store instance", () => {
    // getStore uses module-level singleton, so we need to work with it
    const store = getStore();
    expect(store).toBeDefined();
    expect(typeof store.getById).toBe("function");
    expect(typeof store.getByEmail).toBe("function");
    expect(typeof store.create).toBe("function");
    expect(typeof store.update).toBe("function");
    expect(typeof store.list).toBe("function");
  });

  test("create and getById round-trip", async () => {
    const store = getStore();
    const user = makeUser({ id: "test-create-1", email: "create@test.com" });
    await store.create(user);
    const found = await store.getById("test-create-1");
    expect(found).not.toBeNull();
    expect(found?.email).toBe("create@test.com");
  });

  test("getByEmail normalizes email", async () => {
    const store = getStore();
    const user = makeUser({ id: "test-email-1", email: "email@test.com" });
    await store.create(user);
    const found = await store.getByEmail("  Email@Test.com  ");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("test-email-1");
  });

  test("getByEmail returns null for unknown", async () => {
    const store = getStore();
    expect(await store.getByEmail("nonexistent@test.com")).toBeNull();
  });

  test("getById returns null for unknown", async () => {
    const store = getStore();
    expect(await store.getById("nonexistent-id")).toBeNull();
  });

  test("getByReferralCode finds user", async () => {
    const store = getStore();
    const user = makeUser({ id: "test-ref-1", email: "ref@test.com", referralCode: "UNIQUE1" });
    await store.create(user);
    const found = await store.getByReferralCode("UNIQUE1");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("test-ref-1");
  });

  test("getByReferralCode returns null for unknown", async () => {
    const store = getStore();
    expect(await store.getByReferralCode("NOTFOUND")).toBeNull();
  });

  test("getByScimExternalId finds user", async () => {
    const store = getStore();
    const user = makeUser({
      id: "test-scim-1", email: "scim@test.com",
      scimExternalId: "ext-123",
    });
    await store.create(user);
    const found = await store.getByScimExternalId("ext-123");
    expect(found).not.toBeNull();
    expect(found?.id).toBe("test-scim-1");
  });

  test("update modifies user fields", async () => {
    const store = getStore();
    const user = makeUser({ id: "test-upd-1", email: "upd@test.com", name: "Original" });
    await store.create(user);
    const updated = await store.update("test-upd-1", { name: "Updated" });
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Updated");
  });

  test("update preserves id", async () => {
    const store = getStore();
    const user = makeUser({ id: "test-upd-id", email: "updid@test.com" });
    await store.create(user);
    const updated = await store.update("test-upd-id", { id: "different-id" } as any);
    expect(updated?.id).toBe("test-upd-id");
  });

  test("update returns null for unknown user", async () => {
    const store = getStore();
    expect(await store.update("nonexistent", { name: "X" })).toBeNull();
  });

  test("list returns all users", async () => {
    const store = getStore();
    await store.create(makeUser({ id: "test-list-1", email: "list1@test.com" }));
    await store.create(makeUser({ id: "test-list-2", email: "list2@test.com" }));
    const all = await store.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((u) => u.id === "test-list-1")).toBe(true);
    expect(all.some((u) => u.id === "test-list-2")).toBe(true);
  });

  test("countReferrals counts users with matching referredBy", async () => {
    const store = getStore();
    await store.create(makeUser({ id: "test-ref-a", email: "refa@test.com", referredBy: "CODE1234" }));
    await store.create(makeUser({ id: "test-ref-b", email: "refb@test.com", referredBy: "CODE1234" }));
    await store.create(makeUser({ id: "test-ref-c", email: "refc@test.com", referredBy: "OTHER" }));
    const count = await store.countReferrals("CODE1234");
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("countReferrals returns 0 for unknown code", async () => {
    const store = getStore();
    expect(await store.countReferrals("NONEXISTENT")).toBe(0);
  });
});

describe("FileOrgStore (dev mode)", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    process.env.NODE_ENV = "development";
    process.env.SUBSUMIO_DATA_DIR = TMP_DIR + "-orgs";
  });

  afterEach(async () => {
    process.env = { ...origEnv };
    try {
      await fs.rm(TMP_DIR + "-orgs", { recursive: true, force: true });
    } catch {}
  });

  test("getOrgStore returns a store instance", () => {
    const store = getOrgStore();
    expect(store).toBeDefined();
    expect(typeof store.getById).toBe("function");
    expect(typeof store.create).toBe("function");
  });

  test("create and getById round-trip", async () => {
    const store = getOrgStore();
    const org: Org = {
      id: "org-test-1", name: "Test Org", brainId: "brain-org-1",
      ownerId: "user-1", createdAt: new Date().toISOString(),
    };
    await store.create(org);
    const found = await store.getById("org-test-1");
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Test Org");
  });

  test("getById returns null for unknown", async () => {
    const store = getOrgStore();
    expect(await store.getById("nonexistent")).toBeNull();
  });

  test("update modifies org", async () => {
    const store = getOrgStore();
    const org: Org = {
      id: "org-upd-1", name: "Original", brainId: "brain-1",
      ownerId: "user-1", createdAt: new Date().toISOString(),
    };
    await store.create(org);
    const updated = await store.update("org-upd-1", { name: "Updated" });
    expect(updated?.name).toBe("Updated");
  });

  test("update returns null for unknown", async () => {
    const store = getOrgStore();
    expect(await store.update("nonexistent", { name: "X" })).toBeNull();
  });

  test("delete removes org", async () => {
    const store = getOrgStore();
    const org: Org = {
      id: "org-del-1", name: "Delete Me", brainId: "brain-del",
      ownerId: "user-1", createdAt: new Date().toISOString(),
    };
    await store.create(org);
    await store.delete("org-del-1");
    expect(await store.getById("org-del-1")).toBeNull();
  });

  test("delete non-existent does not throw", async () => {
    const store = getOrgStore();
    await expect(store.delete("nonexistent")).resolves.toBeUndefined();
  });

  test("list returns all orgs", async () => {
    const store = getOrgStore();
    await store.create({
      id: "org-list-1", name: "A", brainId: "b1",
      ownerId: "u1", createdAt: new Date().toISOString(),
    });
    await store.create({
      id: "org-list-2", name: "B", brainId: "b2",
      ownerId: "u2", createdAt: new Date().toISOString(),
    });
    const all = await store.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});

describe("getSharedPgPool", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.SUBSUMIO_AUTH_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test("returns null when no DB URL is configured", () => {
    expect(getSharedPgPool()).toBeNull();
  });
});

describe("Type exports", () => {
  test("KanzleiRole has 4 roles", () => {
    const roles: KanzleiRole[] = ["admin", "lawyer", "assistant", "client_viewer"];
    expect(roles).toHaveLength(4);
  });

  test("Plan has 4 tiers", () => {
    const plans: Plan[] = ["free", "pro", "team", "enterprise"];
    expect(plans).toHaveLength(4);
  });
});

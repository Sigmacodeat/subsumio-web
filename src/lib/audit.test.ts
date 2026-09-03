// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Audit module falls back to brain pages in dev mode (no Postgres pool).
// We mock the `api` module to capture brain-page calls.

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      createPage: vi.fn(async () => ({})),
      listPages: vi.fn(async () => []),
    },
  },
}));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => null, // Force dev fallback
}));

import { logAudit, listAuditLogs, auditLabel, verifyAuditChain } from "./audit";
import { api } from "@/lib/api";

const mockCreatePage = vi.mocked(api.brain.createPage);
const mockListPages = vi.mocked(api.brain.listPages);

describe("logAudit (dev fallback — brain pages)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates a brain page with audit log content", async () => {
    await logAudit("user.login", "user", {
      entityId: "user-1",
      userId: "user-1",
      userEmail: "test@example.com",
      brainId: "brain-1",
      details: { method: "password" },
      ip: "127.0.0.1",
    });

    expect(mockCreatePage).toHaveBeenCalledOnce();
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.type).toBe("audit_log");
    expect(call.slug).toContain("audit/");
    expect(call.slug).toContain("user-login");
    expect(call.frontmatter).toHaveProperty("action", "user.login");
    expect(call.frontmatter).toHaveProperty("entity_type", "user");
  });

  test("uses 'system' as brainId when not provided", async () => {
    await logAudit("system.cleanup", "system");
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.frontmatter).toHaveProperty("action", "system.cleanup");
  });

  test("includes details in frontmatter", async () => {
    await logAudit("case.created", "case", {
      details: { caseSlug: "case-2024-001" },
    });
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.frontmatter).toHaveProperty("details");
  });

  test("includes timestamp in frontmatter", async () => {
    await logAudit("doc.uploaded", "document");
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.frontmatter).toHaveProperty("timestamp");
    expect(call.frontmatter).toHaveProperty("date");
  });

  test("uses auditLabel for page title", async () => {
    await logAudit("user.login", "user");
    const call = mockCreatePage.mock.calls[0][0];
    expect(call.title).toBe(auditLabel("user.login"));
  });

  test("does not throw when api.brain.createPage fails", async () => {
    mockCreatePage.mockRejectedValueOnce(new Error("network error"));
    await expect(logAudit("test.action", "test")).resolves.not.toThrow();
  });
});

describe("listAuditLogs (dev fallback — brain pages)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns empty array when no pages exist", async () => {
    mockListPages.mockResolvedValueOnce([]);
    const result = await listAuditLogs({ brainId: "brain-1" });
    expect(result).toEqual([]);
  });

  test("maps brain pages to AuditEntry format", async () => {
    mockListPages.mockResolvedValueOnce([
      {
        slug: "audit/2024-01-01/user-login-123",
        title: "User Login",
        type: "audit_log",
        content: JSON.stringify({
          action: "user.login",
          entityType: "user",
          entityId: "user-1",
          details: { method: "password" },
          timestamp: "2024-01-01T00:00:00Z",
        }),
        frontmatter: {
          action: "user.login",
          entity_type: "user",
          entity_id: "user-1",
          details: { method: "password" },
          timestamp: "2024-01-01T00:00:00Z",
          date: "2024-01-01",
        },
        created_at: "2024-01-01T00:00:00Z",
      },
    ]);
    const result = await listAuditLogs({ brainId: "brain-1" });
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("user.login");
    expect(result[0].entityType).toBe("user");
    expect(result[0].entityId).toBe("user-1");
  });

  test("filters by action", async () => {
    mockListPages.mockResolvedValueOnce([
      {
        slug: "a1",
        frontmatter: { action: "user.login", entity_type: "user", timestamp: "2024-01-01" },
        content: "{}",
      },
      {
        slug: "a2",
        frontmatter: { action: "case.created", entity_type: "case", timestamp: "2024-01-01" },
        content: "{}",
      },
    ]);
    const result = await listAuditLogs({ brainId: "b1", action: "user" });
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("user.login");
  });

  test("filters by entityType", async () => {
    mockListPages.mockResolvedValueOnce([
      {
        slug: "a1",
        frontmatter: { action: "x", entity_type: "user", timestamp: "2024-01-01" },
        content: "{}",
      },
      {
        slug: "a2",
        frontmatter: { action: "y", entity_type: "case", timestamp: "2024-01-01" },
        content: "{}",
      },
    ]);
    const result = await listAuditLogs({ brainId: "b1", entityType: "case" });
    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("case");
  });

  test("filters by date range (from/to)", async () => {
    mockListPages.mockResolvedValueOnce([
      {
        slug: "a1",
        frontmatter: { action: "x", entity_type: "y", timestamp: "2024-01-01" },
        content: "{}",
      },
      {
        slug: "a2",
        frontmatter: { action: "x", entity_type: "y", timestamp: "2024-06-01" },
        content: "{}",
      },
      {
        slug: "a3",
        frontmatter: { action: "x", entity_type: "y", timestamp: "2024-12-01" },
        content: "{}",
      },
    ]);
    const result = await listAuditLogs({ brainId: "b1", from: "2024-03-01", to: "2024-09-01" });
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe("2024-06-01");
  });

  test("returns empty array on error", async () => {
    mockListPages.mockRejectedValueOnce(new Error("fail"));
    const result = await listAuditLogs({ brainId: "b1" });
    expect(result).toEqual([]);
  });

  test("passes limit to listPages", async () => {
    mockListPages.mockResolvedValueOnce([]);
    await listAuditLogs({ brainId: "b1", limit: 50 });
    expect(mockListPages).toHaveBeenCalledWith({ type: "audit_log", limit: 50 });
  });
});

// ── verifyAuditChain tests (Postgres mode with mock pool) ─────────────

import { createHash } from "node:crypto";

function mockPoolWithRows(
  rows: Array<{
    id: string;
    hash: string | null;
    prev_hash: string | null;
    hash_payload: string | null;
  }>
) {
  return {
    query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows })),
  };
}

describe("verifyAuditChain", () => {
  test("returns empty ok result when no pool available", async () => {
    const result = await verifyAuditChain("brain-1");
    expect(result.ok).toBe(true);
    expect(result.totalEntries).toBe(0);
    expect(result.verified).toBe(0);
    expect(result.broken).toEqual([]);
  });

  test("verifies a clean chain with hash_payload", async () => {
    // Build a valid 3-entry chain
    const payload1 = "user.login:user:user-1:u1:a@b.c:{}:127.0.0.1:2024-01-01T00:00:00.000Z";
    const hash1 = createHash("sha256")
      .update("" + payload1)
      .digest("hex");
    const payload2 =
      'case.create:case:case-1:u1:a@b.c:{"slug":"c1"}:127.0.0.1:2024-01-01T00:00:01.000Z';
    const hash2 = createHash("sha256")
      .update(hash1 + payload2)
      .digest("hex");
    const payload3 =
      'case.update:case:case-1:u1:a@b.c:{"field":"x"}:127.0.0.1:2024-01-01T00:00:02.000Z';
    const hash3 = createHash("sha256")
      .update(hash2 + payload3)
      .digest("hex");

    const rows = [
      { id: "1", hash: hash1, prev_hash: null, hash_payload: payload1 },
      { id: "2", hash: hash2, prev_hash: hash1, hash_payload: payload2 },
      { id: "3", hash: hash3, prev_hash: hash2, hash_payload: payload3 },
    ];

    vi.doMock("@/lib/auth/store", () => ({
      getSharedPgPool: () => mockPoolWithRows(rows),
    }));
    vi.resetModules();

    const { verifyAuditChain: verify } = await import("./audit");
    const result = await verify("brain-1");

    expect(result.ok).toBe(true);
    expect(result.totalEntries).toBe(3);
    expect(result.verified).toBe(3);
    expect(result.broken).toEqual([]);
    expect(result.unverifiable).toBe(0);

    vi.doUnmock("@/lib/auth/store");
  });

  test("detects hash_mismatch when payload is tampered", async () => {
    const payload1 = "user.login:user:user-1:u1:a@b.c:{}:127.0.0.1:2024-01-01T00:00:00.000Z";
    const hash1 = createHash("sha256")
      .update("" + payload1)
      .digest("hex");
    // Tampered: payload says "admin.login" but hash was computed with "user.login"
    const tamperedPayload =
      "admin.login:user:user-1:u1:a@b.c:{}:127.0.0.1:2024-01-01T00:00:00.000Z";

    const rows = [{ id: "1", hash: hash1, prev_hash: null, hash_payload: tamperedPayload }];

    vi.doMock("@/lib/auth/store", () => ({
      getSharedPgPool: () => mockPoolWithRows(rows),
    }));
    vi.resetModules();

    const { verifyAuditChain: verify } = await import("./audit");
    const result = await verify("brain-1");

    expect(result.ok).toBe(false);
    expect(result.totalEntries).toBe(1);
    expect(result.verified).toBe(0);
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0].reason).toBe("hash_mismatch");
    expect(result.broken[0].id).toBe("1");

    vi.doUnmock("@/lib/auth/store");
  });

  test("detects chain_break when prev_hash doesn't match", async () => {
    const payload1 = "user.login:user:user-1:u1:a@b.c:{}:127.0.0.1:2024-01-01T00:00:00.000Z";
    const hash1 = createHash("sha256")
      .update("" + payload1)
      .digest("hex");
    const payload2 = "case.create:case:case-1:u1:a@b.c:{}:127.0.0.1:2024-01-01T00:00:01.000Z";
    const hash2 = createHash("sha256")
      .update(hash1 + payload2)
      .digest("hex");
    // Entry 3 claims prev_hash is "fake-hash" instead of hash2
    const payload3 = "case.update:case:case-1:u1:a@b.c:{}:127.0.0.1:2024-01-01T00:00:02.000Z";
    const hash3 = createHash("sha256")
      .update("fake-hash" + payload3)
      .digest("hex");

    const rows = [
      { id: "1", hash: hash1, prev_hash: null, hash_payload: payload1 },
      { id: "2", hash: hash2, prev_hash: hash1, hash_payload: payload2 },
      { id: "3", hash: hash3, prev_hash: "fake-hash", hash_payload: payload3 },
    ];

    vi.doMock("@/lib/auth/store", () => ({
      getSharedPgPool: () => mockPoolWithRows(rows),
    }));
    vi.resetModules();

    const { verifyAuditChain: verify } = await import("./audit");
    const result = await verify("brain-1");

    expect(result.ok).toBe(false);
    expect(result.verified).toBe(2);
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0].reason).toBe("chain_break");
    expect(result.broken[0].id).toBe("3");

    vi.doUnmock("@/lib/auth/store");
  });

  test("marks pre-fix entries (no hash_payload) as unverifiable, not broken", async () => {
    const rows = [
      { id: "1", hash: "some-old-hash", prev_hash: null, hash_payload: null },
      { id: "2", hash: "another-hash", prev_hash: "some-old-hash", hash_payload: null },
    ];

    vi.doMock("@/lib/auth/store", () => ({
      getSharedPgPool: () => mockPoolWithRows(rows),
    }));
    vi.resetModules();

    const { verifyAuditChain: verify } = await import("./audit");
    const result = await verify("brain-1");

    expect(result.ok).toBe(true); // unverifiable != broken
    expect(result.unverifiable).toBe(2);
    expect(result.verified).toBe(0);
    expect(result.broken).toEqual([]);

    vi.doUnmock("@/lib/auth/store");
  });

  test("handles empty audit log", async () => {
    vi.doMock("@/lib/auth/store", () => ({
      getSharedPgPool: () => mockPoolWithRows([]),
    }));
    vi.resetModules();

    const { verifyAuditChain: verify } = await import("./audit");
    const result = await verify("brain-empty");

    expect(result.ok).toBe(true);
    expect(result.totalEntries).toBe(0);
    expect(result.verified).toBe(0);

    vi.doUnmock("@/lib/auth/store");
  });
});

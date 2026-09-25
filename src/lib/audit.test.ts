// @vitest-environment node

import { describe, test, expect, vi } from "vitest";

// No Postgres pool by default. Write/list behaviour against a (mock) pool is
// covered in audit-chain-write.test.ts; here: label helper + chain verifier.
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => null,
}));

import { auditLabel, verifyAuditChain } from "./audit";

describe("auditLabel", () => {
  test("returns a human label for known actions", () => {
    expect(typeof auditLabel("user.login")).toBe("string");
    expect(auditLabel("user.login").length).toBeGreaterThan(0);
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

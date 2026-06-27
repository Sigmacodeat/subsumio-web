// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockConnect = vi.fn(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: vi.fn(() => ({
    query: mockQuery,
    connect: mockConnect,
  })),
}));

import { getAppliedMigrations, applyMigration, runMigrations } from "./migrate";

describe("getAppliedMigrations", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns empty array when no pool", async () => {
    const { getSharedPgPool } = await import("@/lib/auth/store");
    vi.mocked(getSharedPgPool).mockReturnValueOnce(null);
    const result = await getAppliedMigrations();
    expect(result).toEqual([]);
  });

  test("returns migrations from database", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ensureMigrationsTable
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: "initial", applied_at: "2024-01-01" },
        { id: 2, name: "add_audit", applied_at: "2024-02-01" },
      ],
    });
    const result = await getAppliedMigrations();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].name).toBe("add_audit");
  });
});

describe("applyMigration", () => {
  beforeEach(() => vi.clearAllMocks());

  test("throws when no pool", async () => {
    const { getSharedPgPool } = await import("@/lib/auth/store");
    vi.mocked(getSharedPgPool).mockReturnValueOnce(null);
    await expect(applyMigration(1, "test", "SELECT 1")).rejects.toThrow("No database configured");
  });

  test("executes migration in transaction", async () => {
    const clientQuery = vi.fn().mockResolvedValue({});
    mockConnect.mockReturnValueOnce({
      query: clientQuery,
      release: vi.fn(),
    });
    await applyMigration(1, "test_migration", "CREATE TABLE test ();");
    // BEGIN, SQL, INSERT, COMMIT
    expect(clientQuery).toHaveBeenCalledTimes(4);
    expect(clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(clientQuery.mock.calls[1][0]).toBe("CREATE TABLE test ();");
    expect(clientQuery.mock.calls[2][0]).toContain("INSERT INTO _migrations");
    expect(clientQuery.mock.calls[3][0]).toBe("COMMIT");
  });

  test("rolls back on error", async () => {
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error("SQL syntax error")); // SQL fails
    mockConnect.mockReturnValueOnce({
      query: clientQuery,
      release: vi.fn(),
    });
    await expect(applyMigration(1, "bad", "INVALID SQL")).rejects.toThrow("SQL syntax error");
    expect(clientQuery.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
  });
});

describe("runMigrations", () => {
  beforeEach(() => vi.clearAllMocks());

  test("skips already-applied migrations", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ensureMigrationsTable
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "first", applied_at: "2024-01-01" }],
    });
    const clientQuery = vi.fn().mockResolvedValue({});
    mockConnect.mockReturnValueOnce({ query: clientQuery, release: vi.fn() });

    await runMigrations([
      { id: 1, name: "first", sql: "SELECT 1" },
      { id: 2, name: "second", sql: "SELECT 2" },
    ]);

    // Only migration 2 should be applied (1 is already applied)
    expect(clientQuery.mock.calls.some((c) => c[0] === "SELECT 2")).toBe(true);
    expect(clientQuery.mock.calls.some((c) => c[0] === "SELECT 1")).toBe(false);
  });

  test("applies all when none are applied", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // ensureMigrationsTable
    mockQuery.mockResolvedValueOnce({ rows: [] }); // getAppliedMigrations
    const clientQuery = vi.fn().mockResolvedValue({});
    mockConnect.mockReturnValueOnce({ query: clientQuery, release: vi.fn() });

    await runMigrations([{ id: 1, name: "first", sql: "SELECT 1" }]);

    expect(clientQuery.mock.calls.some((c) => c[0] === "SELECT 1")).toBe(true);
  });
});

// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock getSharedPgPool to control dev/prod behavior
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

import { createSchemaInit } from "./schema-init";

describe("createSchemaInit (dev mode — no pool)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns a function", () => {
    const ensure = createSchemaInit("CREATE TABLE IF NOT EXISTS test ()");
    expect(typeof ensure).toBe("function");
  });

  test("resolves without error when no pool", async () => {
    const ensure = createSchemaInit("CREATE TABLE IF NOT EXISTS test ()");
    await expect(ensure()).resolves.toBeUndefined();
  });

  test("caches the promise (same reference on second call)", async () => {
    const ensure = createSchemaInit("CREATE TABLE IF NOT EXISTS test ()");
    const p1 = ensure();
    const p2 = ensure();
    expect(p1).toBe(p2);
  });

  test("accepts array of DDL strings", async () => {
    const ensure = createSchemaInit([
      "CREATE TABLE IF NOT EXISTS test1 ()",
      "CREATE TABLE IF NOT EXISTS test2 ()",
    ]);
    await expect(ensure()).resolves.toBeUndefined();
  });

  test("different createSchemaInit calls produce independent functions", async () => {
    const ensure1 = createSchemaInit("CREATE TABLE IF NOT EXISTS a ()");
    const ensure2 = createSchemaInit("CREATE TABLE IF NOT EXISTS b ()");
    const p1 = ensure1();
    const p2 = ensure2();
    expect(p1).not.toBe(p2);
  });
});

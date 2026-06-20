// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

vi.mock("@/lib/schema-init", () => ({
  createSchemaInit: vi.fn(() => vi.fn(async () => {})),
}));

import {
  getMinRevocationVersion,
  revokeAllSessions,
  isSessionVersionValid,
} from "./revocation-store";
import { getSharedPgPool } from "./store";

describe("revocation-store (in-memory dev mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSharedPgPool).mockReturnValue(null);
  });

  test("getMinRevocationVersion returns 0 for unknown user", async () => {
    const v = await getMinRevocationVersion("user-unknown");
    expect(v).toBe(0);
  });

  test("revokeAllSessions increments version", async () => {
    await revokeAllSessions("user-1");
    const v1 = await getMinRevocationVersion("user-1");
    expect(v1).toBe(1);

    await revokeAllSessions("user-1");
    const v2 = await getMinRevocationVersion("user-1");
    expect(v2).toBe(2);
  });

  test("revokeAllSessions for different users are independent", async () => {
    await revokeAllSessions("user-a");
    await revokeAllSessions("user-a");
    await revokeAllSessions("user-b");

    expect(await getMinRevocationVersion("user-a")).toBe(2);
    expect(await getMinRevocationVersion("user-b")).toBe(1);
  });

  test("isSessionVersionValid returns true when no revocation", async () => {
    expect(await isSessionVersionValid("user-x")).toBe(true);
    expect(await isSessionVersionValid("user-x", 1)).toBe(true);
  });

  test("isSessionVersionValid returns true when version > min", async () => {
    await revokeAllSessions("user-y"); // min=1
    expect(await isSessionVersionValid("user-y", 2)).toBe(true);
    expect(await isSessionVersionValid("user-y", 5)).toBe(true);
  });

  test("isSessionVersionValid returns false when version <= min", async () => {
    await revokeAllSessions("user-z"); // min=1
    expect(await isSessionVersionValid("user-z", 1)).toBe(false);
    expect(await isSessionVersionValid("user-z", 0)).toBe(false);
  });

  test("isSessionVersionValid returns false when version undefined and min > 0", async () => {
    await revokeAllSessions("user-w"); // min=1
    expect(await isSessionVersionValid("user-w")).toBe(false);
  });

  test("isSessionVersionValid returns true when min is 0 (no revocation)", async () => {
    expect(await isSessionVersionValid("user-noversion", undefined)).toBe(true);
  });
});

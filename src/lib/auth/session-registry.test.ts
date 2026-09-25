// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("./store", () => ({
  getSharedPgPool: vi.fn(() => null),
}));

vi.mock("@/lib/schema-init", () => ({
  createSchemaInit: vi.fn(() => vi.fn(async () => {})),
}));

vi.mock("./session-core", () => ({
  SESSION_TTL_SECONDS: 30 * 24 * 3600,
}));

import {
  registerSession,
  listActiveSessions,
  revokeSession,
  revokeSessionRows,
  isSidRevoked,
  listRevokedSids,
  touchSession,
  resetSessionRegistryForTests,
  isSessionRevokedOrIdle,
  sessionIdleLimitMs,
} from "./session-registry";

describe("session-registry (in-memory dev mode)", () => {
  beforeEach(() => {
    resetSessionRegistryForTests();
  });

  test("registerSession + listActiveSessions round-trips", async () => {
    await registerSession("s1", "u1", { userAgent: "Mozilla/5.0 Chrome", ip: "10.0.0.1" });
    const rows = await listActiveSessions("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].sid).toBe("s1");
    expect(rows[0].userAgent).toBe("Mozilla/5.0 Chrome");
  });

  test("listActiveSessions is scoped to the user", async () => {
    await registerSession("s1", "u1");
    await registerSession("s2", "u2");
    expect(await listActiveSessions("u1")).toHaveLength(1);
    expect((await listActiveSessions("u1"))[0].sid).toBe("s1");
  });

  test("revokeSession marks the row and hides it", async () => {
    await registerSession("s1", "u1");
    expect(await revokeSession("u1", "s1")).toBe(true);
    expect(await listActiveSessions("u1")).toHaveLength(0);
    expect(await isSidRevoked("u1", "s1")).toBe(true);
  });

  test("revokeSession is scoped to the owner — foreign sid is a miss", async () => {
    await registerSession("s1", "u1");
    expect(await revokeSession("u2", "s1")).toBe(false);
    expect(await isSidRevoked("u1", "s1")).toBe(false);
  });

  test("revokeSession twice returns false (already revoked)", async () => {
    await registerSession("s1", "u1");
    await revokeSession("u1", "s1");
    expect(await revokeSession("u1", "s1")).toBe(false);
  });

  test("revokeSessionRows keeps the current session", async () => {
    await registerSession("s1", "u1");
    await registerSession("s2", "u1");
    await registerSession("s3", "u1");
    const n = await revokeSessionRows("u1", "s2");
    expect(n).toBe(2);
    const rows = await listActiveSessions("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].sid).toBe("s2");
  });

  test("revokeSessionRows with null revokes everything", async () => {
    await registerSession("s1", "u1");
    await registerSession("s2", "u1");
    expect(await revokeSessionRows("u1", null)).toBe(2);
    expect(await listActiveSessions("u1")).toHaveLength(0);
  });

  test("listRevokedSids returns only revoked", async () => {
    await registerSession("s1", "u1");
    await registerSession("s2", "u1");
    await revokeSession("u1", "s1");
    expect(await listRevokedSids("u1")).toEqual(["s1"]);
  });

  test("isSidRevoked fails open on unknown sid", async () => {
    expect(await isSidRevoked("u1", "never-registered")).toBe(false);
  });

  test("touchSession updates last_seen only after the interval", async () => {
    await registerSession("s1", "u1");
    const before = (await listActiveSessions("u1"))[0].lastSeenAt;
    await touchSession("u1", "s1");
    // Inside the 15-minute throttle window — unchanged.
    expect((await listActiveSessions("u1"))[0].lastSeenAt).toBe(before);
  });

  test("touchSession does not touch another user's session", async () => {
    await registerSession("s1", "u1");
    await revokeSession("u1", "s1");
    await touchSession("u2", "s1");
    // Still revoked — the touch was scoped to u2's rows, none match.
    expect(await isSidRevoked("u1", "s1")).toBe(true);
  });

  test("metadata is truncated to bounds", async () => {
    await registerSession("s1", "u1", {
      userAgent: "x".repeat(500),
      ip: "y".repeat(200),
    });
    const row = (await listActiveSessions("u1"))[0];
    expect(row.userAgent).toHaveLength(256);
    expect(row.ip).toHaveLength(64);
  });
});

describe("session idle timeout (SEC-18)", () => {
  beforeEach(() => {
    resetSessionRegistryForTests();
    vi.useRealTimers();
    delete process.env.SUBSUMIO_SESSION_IDLE_HOURS;
  });

  test("default idle limit is 12 hours; 0 disables", () => {
    expect(sessionIdleLimitMs()).toBe(12 * 3600 * 1000);
    process.env.SUBSUMIO_SESSION_IDLE_HOURS = "0";
    expect(sessionIdleLimitMs()).toBe(0);
    process.env.SUBSUMIO_SESSION_IDLE_HOURS = "8";
    expect(sessionIdleLimitMs()).toBe(8 * 3600 * 1000);
  });

  test("a session idle longer than the limit is rejected and revoked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T08:00:00Z"));
    await registerSession("sid-idle", "u1");
    expect(await isSessionRevokedOrIdle("u1", "sid-idle", 12 * 3600 * 1000)).toBe(false);

    vi.setSystemTime(new Date("2026-09-25T20:30:00Z")); // 12.5 h later, no activity
    expect(await isSessionRevokedOrIdle("u1", "sid-idle", 12 * 3600 * 1000)).toBe(true);
    // Revoked for good: the device list and the edge check agree.
    expect(await isSidRevoked("u1", "sid-idle")).toBe(true);
    vi.useRealTimers();
  });

  test("activity keeps the session alive", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T08:00:00Z"));
    await registerSession("sid-active", "u1");
    vi.setSystemTime(new Date("2026-09-25T15:00:00Z"));
    await touchSession("u1", "sid-active");
    vi.setSystemTime(new Date("2026-09-25T22:00:00Z")); // 7 h after last activity
    expect(await isSessionRevokedOrIdle("u1", "sid-active", 12 * 3600 * 1000)).toBe(false);
    vi.useRealTimers();
  });

  test("unknown sid stays valid (registry is metadata, fail open)", async () => {
    expect(await isSessionRevokedOrIdle("u1", "nope", 1000)).toBe(false);
  });
});

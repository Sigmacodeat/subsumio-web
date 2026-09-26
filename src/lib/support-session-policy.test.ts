import { describe, expect, it } from "vitest";
import {
  matterAccessUserFor,
  supportGrantAllows,
  supportSessionExpiry,
  SUPPORT_GRANT_MAX_HOURS,
} from "./support-session-policy";
import { matterAccessLevel } from "./matter-access";

const NOW = Date.parse("2099-03-01T10:00:00.000Z");
const IN_A_DAY = new Date(NOW + 24 * 3600_000).toISOString();

describe("supportGrantAllows", () => {
  it("no approval, a revoked or an expired one allows nothing", () => {
    expect(supportGrantAllows(null, "read", NOW)).toBe(false);
    expect(
      supportGrantAllows({ mode: "write", expiresAt: IN_A_DAY, revokedAt: IN_A_DAY }, "read", NOW)
    ).toBe(false);
    expect(
      supportGrantAllows({ mode: "write", expiresAt: new Date(NOW).toISOString() }, "read", NOW)
    ).toBe(false);
  });

  it("a read approval allows read sessions only; a write approval allows both", () => {
    expect(supportGrantAllows({ mode: "read", expiresAt: IN_A_DAY }, "read", NOW)).toBe(true);
    expect(supportGrantAllows({ mode: "read", expiresAt: IN_A_DAY }, "write", NOW)).toBe(false);
    expect(supportGrantAllows({ mode: "write", expiresAt: IN_A_DAY }, "write", NOW)).toBe(true);
  });

  it("caps approvals at 7 days", () => {
    expect(SUPPORT_GRANT_MAX_HOURS).toBe(168);
  });
});

describe("supportSessionExpiry", () => {
  it("ends after the session TTL, or with the approval if that is earlier", () => {
    const now = new Date(NOW);
    expect(supportSessionExpiry(now, IN_A_DAY, 3600_000).getTime()).toBe(NOW + 3600_000);
    const soon = new Date(NOW + 5 * 60_000).toISOString();
    expect(supportSessionExpiry(now, soon, 3600_000).toISOString()).toBe(soon);
  });
});

describe("matterAccessUserFor — web-side matter checks in support sessions", () => {
  const operator = { id: "op_1", role: "admin" };

  it("a read session sees restricted matters like the engine does: not at all", () => {
    const who = matterAccessUserFor({ user: operator, supportSession: { mode: "read" } });
    expect(who.role).toBe("support");
    expect(matterAccessLevel(who, { visibility: "restricted" })).toBe("none");
    expect(matterAccessLevel(who, { visibility: "full" })).toBe("read");
  });

  it("a write session has lawyer level, still without the admin exception", () => {
    const who = matterAccessUserFor({ user: operator, supportSession: { mode: "write" } });
    expect(who.role).toBe("lawyer");
    expect(matterAccessLevel(who, { visibility: "restricted" })).toBe("none");
    expect(matterAccessLevel(who, { visibility: "full" })).toBe("write");
  });

  it("outside a support session the stored role applies", () => {
    expect(matterAccessUserFor({ user: operator })).toEqual({ userId: "op_1", role: "admin" });
    expect(
      matterAccessLevel(matterAccessUserFor({ user: operator }), { visibility: "restricted" })
    ).toBe("write");
  });
});

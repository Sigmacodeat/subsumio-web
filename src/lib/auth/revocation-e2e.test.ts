// @vitest-environment node
/**
 * T7.2 / WP7.2.3 — Token/Session Revocation Tests
 *
 * Runs the product session and revocation code (session.ts,
 * session-core.ts, revocation-store.ts — in-memory store, no database):
 * version increment, old token invalidation, concurrent sessions, edge cases.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createSession as createProductSession,
  isSessionVersionValid,
  revokeAllSessions,
  signSession,
  verifySession,
} from "./session";
import { verifySessionCore } from "./session-core";
import { getMinRevocationVersion } from "./revocation-store";

const AUTH_SECRET = "revocation-test-secret-32-chars-min!!";

beforeAll(() => {
  process.env.AUTH_SECRET = AUTH_SECRET;
});

// The in-memory store lives for the whole file: every test gets its own users.
let run = 0;
let prefix = "";
beforeEach(() => {
  run++;
  prefix = `rev-${run}-`;
});
const u = (name: string) => `${prefix}${name}`;

/** Product createSession; the version is read back from the signed token. */
async function createSession(userId: string, email: string, role: "user" | "admin" | "lawyer") {
  const { token } = await createProductSession(userId, email, role as never);
  const payload = await verifySessionCore(token, AUTH_SECRET);
  return { token, version: payload?.v ?? 0 };
}

describe("Revocation: Basic Version Increment", () => {
  it("initial user has min_version 0", async () => {
    expect(await getMinRevocationVersion(u("user-1"))).toBe(0);
  });

  it("revokeAllSessions increments min_version by 1", async () => {
    await revokeAllSessions(u("user-1"));
    expect(await getMinRevocationVersion(u("user-1"))).toBe(1);
  });

  it("multiple revocations increment correctly", async () => {
    await revokeAllSessions(u("user-1"));
    await revokeAllSessions(u("user-1"));
    await revokeAllSessions(u("user-1"));
    expect(await getMinRevocationVersion(u("user-1"))).toBe(3);
  });

  it("revocation is per-user", async () => {
    await revokeAllSessions(u("user-1"));
    expect(await getMinRevocationVersion(u("user-1"))).toBe(1);
    expect(await getMinRevocationVersion(u("user-2"))).toBe(0);
  });
});

describe("Revocation: Session Invalidation", () => {
  it("session before revocation is valid", async () => {
    const session = await createSession(u("user-revoke"), "test@test.com", "user");
    expect(await verifySession(session.token)).not.toBeNull();
  });

  it("session after revocation is invalid", async () => {
    const session = await createSession(u("user-revoke"), "test@test.com", "user");
    await revokeAllSessions(u("user-revoke"));
    expect(await verifySession(session.token)).toBeNull();
  });

  it("new session after revocation is valid", async () => {
    const _session1 = await createSession(u("user-revoke"), "test@test.com", "user");
    await revokeAllSessions(u("user-revoke"));
    const session2 = await createSession(u("user-revoke"), "test@test.com", "user");
    expect(await verifySession(session2.token)).not.toBeNull();
  });

  it("old and new sessions coexist — only new is valid", async () => {
    const session1 = await createSession(u("user-revoke"), "test@test.com", "user");
    await revokeAllSessions(u("user-revoke"));
    const session2 = await createSession(u("user-revoke"), "test@test.com", "user");

    expect(await verifySession(session1.token)).toBeNull();
    expect(await verifySession(session2.token)).not.toBeNull();
  });
});

describe("Revocation: Concurrent Sessions", () => {
  it("multiple sessions for same user — revocation invalidates all", async () => {
    const s1 = await createSession(u("user-concurrent"), "test@test.com", "user");
    const s2 = await createSession(u("user-concurrent"), "test@test.com", "user");
    const s3 = await createSession(u("user-concurrent"), "test@test.com", "user");

    // All valid before revocation
    expect(await verifySession(s1.token)).not.toBeNull();
    expect(await verifySession(s2.token)).not.toBeNull();
    expect(await verifySession(s3.token)).not.toBeNull();

    await revokeAllSessions(u("user-concurrent"));

    // All invalid after revocation
    expect(await verifySession(s1.token)).toBeNull();
    expect(await verifySession(s2.token)).toBeNull();
    expect(await verifySession(s3.token)).toBeNull();
  });

  it("revocation does not affect other users' sessions", async () => {
    const s1 = await createSession(u("user-a"), "a@test.com", "user");
    const s2 = await createSession(u("user-b"), "b@test.com", "user");

    await revokeAllSessions(u("user-a"));

    expect(await verifySession(s1.token)).toBeNull();
    expect(await verifySession(s2.token)).not.toBeNull();
  });
});

describe("Revocation: Edge Cases", () => {
  it("session with version 0 is valid when no revocation", async () => {
    // Simulate a legacy session without version
    const token = await signSession(
      { uid: u("user-edge"), email: "test@test.com", role: "user" },
      AUTH_SECRET,
      3600,
      0
    );
    const payload = await verifySessionCore(token, AUTH_SECRET);
    expect(payload).not.toBeNull();
    // Version 0 is valid when min_version is 0
    expect(await isSessionVersionValid(u("user-edge"), 0)).toBe(true);
  });

  it("session with version 0 is invalid after revocation", async () => {
    await revokeAllSessions(u("user-edge"));
    expect(await isSessionVersionValid(u("user-edge"), 0)).toBe(false);
  });

  it("expired session is invalid regardless of revocation", async () => {
    // Create session with 1 second TTL
    const token = await signSession(
      { uid: u("user-expired"), email: "test@test.com", role: "user" },
      AUTH_SECRET,
      -1,
      1
    );
    // Expired — verifySessionCore returns null
    expect(await verifySessionCore(token, AUTH_SECRET)).toBeNull();
  });

  it("null/undefined token returns null", async () => {
    expect(await verifySession(null)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("tampered token is rejected", async () => {
    const session = await createSession(u("user-tamper"), "test@test.com", "user");
    // Tamper with the token
    const tampered = session.token.slice(0, -5) + "XXXXX";
    expect(await verifySession(tampered)).toBeNull();
  });
});

describe("Revocation: Version Number Correctness", () => {
  it("first session gets version 1", async () => {
    const session = await createSession(u("user-ver"), "test@test.com", "user");
    expect(session.version).toBe(1);
  });

  it("session after 1 revocation gets version 2", async () => {
    await createSession(u("user-ver"), "test@test.com", "user");
    await revokeAllSessions(u("user-ver"));
    const session = await createSession(u("user-ver"), "test@test.com", "user");
    expect(session.version).toBe(2);
  });

  it("session after 3 revocations gets version 4", async () => {
    await createSession(u("user-ver"), "test@test.com", "user");
    await revokeAllSessions(u("user-ver"));
    await revokeAllSessions(u("user-ver"));
    await revokeAllSessions(u("user-ver"));
    const session = await createSession(u("user-ver"), "test@test.com", "user");
    expect(session.version).toBe(4);
  });
});

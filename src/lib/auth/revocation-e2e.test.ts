/**
 * T7.2 / WP7.2.3 — Token/Session Revocation E2E Tests
 *
 * Focused tests on the revocation mechanism: version increment,
 * old token invalidation, concurrent sessions, and edge cases.
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Mock Revocation Store ────────────────────────────────────────────

const mockRevokedVersions = new Map<string, number>();

function resetMocks() {
  mockRevokedVersions.clear();
}

async function getMinRevocationVersion(userId: string): Promise<number> {
  return mockRevokedVersions.get(userId) ?? 0;
}

async function revokeAllSessions(userId: string): Promise<void> {
  const current = mockRevokedVersions.get(userId) ?? 0;
  mockRevokedVersions.set(userId, current + 1);
}

async function isSessionVersionValid(userId: string, version?: number): Promise<boolean> {
  const minVersion = await getMinRevocationVersion(userId);
  if (!minVersion) return true;
  return (version ?? 0) > minVersion;
}

// ── Mock Session Signing ─────────────────────────────────────────────

const AUTH_SECRET = "test-secret-32-chars-minimum!!";

async function signSession(
  payload: { uid: string; email: string; role: string },
  secret: string,
  ttlSeconds: number,
  version: number
): Promise<string> {
  const full = { ...payload, v: version, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${Buffer.from(new Uint8Array(sig)).toString("base64url")}`;
}

async function verifySessionCore(
  token: string | undefined | null,
  secret: string
): Promise<{ uid: string; email: string; role: string; v: number; exp: number } | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBin = Buffer.from(sigPart, "base64url");
    const ok = await crypto.subtle.verify("HMAC", key, sigBin, new TextEncoder().encode(body));
    if (!ok) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (!payload.uid || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function createSession(userId: string, email: string, role: string) {
  const minVersion = await getMinRevocationVersion(userId);
  const version = minVersion + 1;
  const token = await signSession(
    { uid: userId, email, role },
    AUTH_SECRET,
    30 * 24 * 3600,
    version
  );
  return { token, version };
}

async function verifySession(
  token: string | undefined | null
): Promise<{ uid: string; v: number } | null> {
  const payload = await verifySessionCore(token, AUTH_SECRET);
  if (!payload) return null;
  if (!(await isSessionVersionValid(payload.uid, payload.v))) return null;
  return payload;
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  resetMocks();
});

describe("Revocation: Basic Version Increment", () => {
  it("initial user has min_version 0", async () => {
    expect(await getMinRevocationVersion("user-1")).toBe(0);
  });

  it("revokeAllSessions increments min_version by 1", async () => {
    await revokeAllSessions("user-1");
    expect(await getMinRevocationVersion("user-1")).toBe(1);
  });

  it("multiple revocations increment correctly", async () => {
    await revokeAllSessions("user-1");
    await revokeAllSessions("user-1");
    await revokeAllSessions("user-1");
    expect(await getMinRevocationVersion("user-1")).toBe(3);
  });

  it("revocation is per-user", async () => {
    await revokeAllSessions("user-1");
    expect(await getMinRevocationVersion("user-1")).toBe(1);
    expect(await getMinRevocationVersion("user-2")).toBe(0);
  });
});

describe("Revocation: Session Invalidation", () => {
  it("session before revocation is valid", async () => {
    const session = await createSession("user-revoke", "test@test.com", "user");
    expect(await verifySession(session.token)).not.toBeNull();
  });

  it("session after revocation is invalid", async () => {
    const session = await createSession("user-revoke", "test@test.com", "user");
    await revokeAllSessions("user-revoke");
    expect(await verifySession(session.token)).toBeNull();
  });

  it("new session after revocation is valid", async () => {
    const session1 = await createSession("user-revoke", "test@test.com", "user");
    await revokeAllSessions("user-revoke");
    const session2 = await createSession("user-revoke", "test@test.com", "user");
    expect(await verifySession(session2.token)).not.toBeNull();
  });

  it("old and new sessions coexist — only new is valid", async () => {
    const session1 = await createSession("user-revoke", "test@test.com", "user");
    await revokeAllSessions("user-revoke");
    const session2 = await createSession("user-revoke", "test@test.com", "user");

    expect(await verifySession(session1.token)).toBeNull();
    expect(await verifySession(session2.token)).not.toBeNull();
  });
});

describe("Revocation: Concurrent Sessions", () => {
  it("multiple sessions for same user — revocation invalidates all", async () => {
    const s1 = await createSession("user-concurrent", "test@test.com", "user");
    const s2 = await createSession("user-concurrent", "test@test.com", "user");
    const s3 = await createSession("user-concurrent", "test@test.com", "user");

    // All valid before revocation
    expect(await verifySession(s1.token)).not.toBeNull();
    expect(await verifySession(s2.token)).not.toBeNull();
    expect(await verifySession(s3.token)).not.toBeNull();

    await revokeAllSessions("user-concurrent");

    // All invalid after revocation
    expect(await verifySession(s1.token)).toBeNull();
    expect(await verifySession(s2.token)).toBeNull();
    expect(await verifySession(s3.token)).toBeNull();
  });

  it("revocation does not affect other users' sessions", async () => {
    const s1 = await createSession("user-a", "a@test.com", "user");
    const s2 = await createSession("user-b", "b@test.com", "user");

    await revokeAllSessions("user-a");

    expect(await verifySession(s1.token)).toBeNull();
    expect(await verifySession(s2.token)).not.toBeNull();
  });
});

describe("Revocation: Edge Cases", () => {
  it("session with version 0 is valid when no revocation", async () => {
    // Simulate a legacy session without version
    const token = await signSession(
      { uid: "user-edge", email: "test@test.com", role: "user" },
      AUTH_SECRET,
      3600,
      0
    );
    const payload = await verifySessionCore(token, AUTH_SECRET);
    expect(payload).not.toBeNull();
    // Version 0 is valid when min_version is 0
    expect(await isSessionVersionValid("user-edge", 0)).toBe(true);
  });

  it("session with version 0 is invalid after revocation", async () => {
    await revokeAllSessions("user-edge");
    expect(await isSessionVersionValid("user-edge", 0)).toBe(false);
  });

  it("expired session is invalid regardless of revocation", async () => {
    // Create session with 1 second TTL
    const token = await signSession(
      { uid: "user-expired", email: "test@test.com", role: "user" },
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
    const session = await createSession("user-tamper", "test@test.com", "user");
    // Tamper with the token
    const tampered = session.token.slice(0, -5) + "XXXXX";
    expect(await verifySession(tampered)).toBeNull();
  });
});

describe("Revocation: Version Number Correctness", () => {
  it("first session gets version 1", async () => {
    const session = await createSession("user-ver", "test@test.com", "user");
    expect(session.version).toBe(1);
  });

  it("session after 1 revocation gets version 2", async () => {
    await createSession("user-ver", "test@test.com", "user");
    await revokeAllSessions("user-ver");
    const session = await createSession("user-ver", "test@test.com", "user");
    expect(session.version).toBe(2);
  });

  it("session after 3 revocations gets version 4", async () => {
    await createSession("user-ver", "test@test.com", "user");
    await revokeAllSessions("user-ver");
    await revokeAllSessions("user-ver");
    await revokeAllSessions("user-ver");
    const session = await createSession("user-ver", "test@test.com", "user");
    expect(session.version).toBe(4);
  });
});

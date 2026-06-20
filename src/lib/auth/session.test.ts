// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  signSession,
  verifySession,
  revokeAllSessions,
  isSessionVersionValid,
  b64url,
  b64urlDecode,
  getAuthSecret,
  SESSION_TTL_SECONDS,
} from "./session";

describe("b64url / b64urlDecode", () => {
  test("roundtrip ASCII string", () => {
    const input = "hello world 123 !@#";
    const encoded = b64url(input);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    expect(b64urlDecode(encoded)).toBe(input);
  });

  test("roundtrip binary data", () => {
    const data = new Uint8Array([0, 255, 128, 64, 32]);
    const encoded = b64url(data.buffer);
    const decoded = b64urlDecode(encoded);
    expect(new Uint8Array(decoded.length).map((_, i) => decoded.charCodeAt(i))).toEqual(
      new Uint8Array([0, 255, 128, 64, 32]),
    );
  });
});

describe("getAuthSecret", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("returns env secret when set", () => {
    process.env.AUTH_SECRET = "my-production-secret";
    expect(getAuthSecret()).toBe("my-production-secret");
  });

  test("throws in production without secret", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    expect(() => getAuthSecret()).toThrow("AUTH_SECRET must be set in production");
  });

  test("returns fallback in dev", () => {
    process.env.NODE_ENV = "development";
    delete process.env.AUTH_SECRET;
    expect(getAuthSecret()).toBe("subsumio-dev-secret-change-me");
  });
});

describe("signSession + verifySession", () => {
  test("roundtrip with default TTL", async () => {
    const token = await signSession({ uid: "user-1", email: "a@b.com", role: "lawyer" });
    expect(token).toContain(".");

    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe("user-1");
    expect(payload!.email).toBe("a@b.com");
    expect(payload!.role).toBe("lawyer");
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(payload!.v).toBe(1);
  });

  test("custom TTL and version", async () => {
    const token = await signSession(
      { uid: "u2", email: "b@c.com", role: "admin" },
      getAuthSecret(),
      60,
      5,
    );
    const payload = await verifySession(token);
    expect(payload!.v).toBe(5);
    expect(payload!.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 61);
  });

  test("verify rejects tampered token", async () => {
    const token = await signSession({ uid: "u3", email: "c@d.com", role: "lawyer" });
    const tampered = token.slice(0, -5) + "xxxxx";
    const payload = await verifySession(tampered);
    expect(payload).toBeNull();
  });

  test("verify rejects expired token", async () => {
    const token = await signSession(
      { uid: "u4", email: "d@e.com", role: "lawyer" },
      getAuthSecret(),
      -1, // already expired
    );
    const payload = await verifySession(token);
    expect(payload).toBeNull();
  });

  test("verify rejects wrong secret", async () => {
    const token = await signSession(
      { uid: "u5", email: "e@f.com", role: "lawyer" },
      "secret-a",
    );
    const payload = await verifySession(token, "secret-b");
    expect(payload).toBeNull();
  });

  test("verify rejects malformed token", async () => {
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("no-dot")).toBeNull();
    expect(await verifySession("a.b.c.d")).toBeNull();
  });
});

describe("session revocation", () => {
  test("revoke invalidates all existing sessions", async () => {
    const token = await signSession({ uid: "u6", email: "f@g.com", role: "lawyer" });
    expect(await verifySession(token)).not.toBeNull();

    await revokeAllSessions("u6");
    expect(await verifySession(token)).toBeNull();
  });

  test("new session after revocation is valid", async () => {
    await revokeAllSessions("u7");
    const token = await signSession({ uid: "u7", email: "g@h.com", role: "lawyer" }, getAuthSecret(), SESSION_TTL_SECONDS, 2);
    expect(await verifySession(token)).not.toBeNull();
  });

  test("isSessionVersionValid tracks minimum version", async () => {
    expect(await isSessionVersionValid("u8", 1)).toBe(true);
    await revokeAllSessions("u8");
    expect(await isSessionVersionValid("u8", 0)).toBe(false);
    expect(await isSessionVersionValid("u8", 1)).toBe(false);
    expect(await isSessionVersionValid("u8", 2)).toBe(true);
  });
});

describe("Session Revocation Edge-Cases", () => {
  test("double revocation increments version further", async () => {
    const userId = `u-double-${Date.now()}`;

    await revokeAllSessions(userId);
    const min1 = await revokeAllSessions(userId); // second revoke

    // Session with version = min1 should be invalid; need version > min1
    const token1 = await signSession(
      { uid: userId, email: "a@b.com", role: "lawyer" },
      getAuthSecret(),
      SESSION_TTL_SECONDS,
      1,
    );
    expect(await verifySession(token1)).toBeNull(); // v=1, min >= 2

    // Session with version 3 should be valid
    const token3 = await signSession(
      { uid: userId, email: "a@b.com", role: "lawyer" },
      getAuthSecret(),
      SESSION_TTL_SECONDS,
      3,
    );
    expect(await verifySession(token3)).not.toBeNull();
  });

  test("revocation for one user does not affect another", async () => {
    const userA = `u-independent-a-${Date.now()}`;
    const userB = `u-independent-b-${Date.now()}`;

    const tokenA = await signSession({ uid: userA, email: "a@b.com", role: "lawyer" });
    const tokenB = await signSession({ uid: userB, email: "b@c.com", role: "lawyer" });

    await revokeAllSessions(userA);

    expect(await verifySession(tokenA)).toBeNull();
    expect(await verifySession(tokenB)).not.toBeNull();
  });

  test("session with version 0 is valid when no revocation exists", async () => {
    const userId = `u-v0-${Date.now()}`;
    expect(await isSessionVersionValid(userId, 0)).toBe(true);
    expect(await isSessionVersionValid(userId, undefined)).toBe(true);
  });

  test("session with undefined version is rejected after revocation", async () => {
    const userId = `u-undef-${Date.now()}`;
    await revokeAllSessions(userId);
    expect(await isSessionVersionValid(userId, undefined)).toBe(false);
  });

  test("new session after revocation has version > min", async () => {
    const userId = `u-new-${Date.now()}`;

    // Create initial session
    const token1 = await signSession({ uid: userId, email: "a@b.com", role: "lawyer" });
    expect(await verifySession(token1)).not.toBeNull();

    // Revoke all
    await revokeAllSessions(userId);
    expect(await verifySession(token1)).toBeNull();

    // Create new session — should have version > min
    const token2 = await signSession(
      { uid: userId, email: "a@b.com", role: "lawyer" },
      getAuthSecret(),
      SESSION_TTL_SECONDS,
      2,
    );
    expect(await verifySession(token2)).not.toBeNull();
  });

  test("expired token is rejected even without revocation", async () => {
    const userId = `u-exp-${Date.now()}`;
    const token = await signSession(
      { uid: userId, email: "a@b.com", role: "lawyer" },
      getAuthSecret(),
      -10, // already expired
    );
    expect(await verifySession(token)).toBeNull();
  });

  test("tampered token is rejected (payload modification)", async () => {
    const token = await signSession({ uid: "u-tamper", email: "a@b.com", role: "lawyer" });
    // Flip a character in the payload portion
    const dotIdx = token.indexOf(".");
    const payload = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const tamperedPayload = payload.slice(0, -2) + (payload.slice(-2) === "AA" ? "BB" : "AA");
    const tampered = `${tamperedPayload}.${sig}`;
    expect(await verifySession(tampered)).toBeNull();
  });
});

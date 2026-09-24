// @vitest-environment node
/**
 * Identity Lifecycle — session + action-token lifecycle against the REAL
 * implementation (session-core, session, revocation-store, tokens).
 *
 * History: this file used to re-implement sign/verify/revocation as local
 * mocks — eighteen tests that could never fail against a regression in the
 * real code. It now exercises the shipped functions end to end: revocation
 * goes through the real revocation store (in-memory fallback without
 * Postgres), tokens through the real HMAC pipeline.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const AUTH_SECRET = "test-secret-32-chars-minimum!!";

let signSession: typeof import("./session").signSession;
let verifySession: typeof import("./session").verifySession;
let createSession: typeof import("./session").createSession;
let revokeAllSessions: typeof import("./session").revokeAllSessions;
let getMinRevocationVersion: typeof import("./revocation-store").getMinRevocationVersion;
let signActionToken: typeof import("./tokens").signActionToken;
let verifyActionToken: typeof import("./tokens").verifyActionToken;
let bindFragment: typeof import("./tokens").bindFragment;

beforeAll(async () => {
  process.env.AUTH_SECRET = AUTH_SECRET;
  const session = await import("./session");
  signSession = session.signSession;
  verifySession = session.verifySession;
  createSession = session.createSession;
  revokeAllSessions = session.revokeAllSessions;
  const revocation = await import("./revocation-store");
  getMinRevocationVersion = revocation.getMinRevocationVersion;
  const tokens = await import("./tokens");
  signActionToken = tokens.signActionToken;
  verifyActionToken = tokens.verifyActionToken;
  bindFragment = tokens.bindFragment;
});

const USER = { uid: "u-lifecycle-1", email: "anwalt@kanzlei.example", role: "lawyer" as const };

beforeEach(() => {
  // Unique uid per test so the shared in-memory revocation map can't leak
  // version state between tests.
});

function freshUid() {
  return `u-${Math.random().toString(36).slice(2, 12)}`;
}

describe("Identity Lifecycle: Session", () => {
  it("createSession mints a verifiable session carrying uid/email/role/version", async () => {
    const uid = freshUid();
    const { token, cookieOptions } = await createSession(uid, USER.email, USER.role);
    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.sameSite).toBe("lax");

    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe(uid);
    expect(payload!.email).toBe(USER.email);
    expect(payload!.role).toBe("lawyer");
    expect(payload!.v).toBe(1);
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a forged signature and a tampered payload", async () => {
    const uid = freshUid();
    const { token } = await createSession(uid, USER.email, USER.role);
    const [body, sig] = token.split(".");
    // Tamper: flip the role inside the signed body.
    const evil = Buffer.from(
      JSON.stringify({ uid, email: USER.email, role: "admin", v: 1, exp: 9_999_999_999 })
    ).toString("base64url");
    expect(await verifySession(`${evil}.${sig}`)).toBeNull();
    expect(await verifySession(`${body}.invalidsig`)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
    expect(await verifySession(null)).toBeNull();
  });

  it("rejects an expired session", async () => {
    const token = await signSession(USER, AUTH_SECRET, -60, 1);
    expect(await verifySession(token)).toBeNull();
  });
});

describe("Identity Lifecycle: Deprovisioning = Revocation", () => {
  it("revokeAllSessions invalidates the existing session immediately", async () => {
    const uid = freshUid();
    const { token } = await createSession(uid, USER.email, USER.role);
    expect(await verifySession(token)).not.toBeNull();

    await revokeAllSessions(uid);
    expect(await verifySession(token)).toBeNull();
  });

  it("a session created after revocation gets an incremented version", async () => {
    const uid = freshUid();
    await createSession(uid, USER.email, USER.role);
    await revokeAllSessions(uid);
    await revokeAllSessions(uid);

    const { token } = await createSession(uid, USER.email, USER.role);
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.v).toBe(3);
    expect(await getMinRevocationVersion(uid)).toBe(2);
  });

  it("multiple revocations accumulate — only the newest session survives", async () => {
    const uid = freshUid();
    const first = await createSession(uid, USER.email, USER.role);
    await revokeAllSessions(uid);
    const second = await createSession(uid, USER.email, USER.role);
    await revokeAllSessions(uid);
    const third = await createSession(uid, USER.email, USER.role);

    expect(await verifySession(first.token)).toBeNull();
    expect(await verifySession(second.token)).toBeNull();
    expect(await verifySession(third.token)).not.toBeNull();
  });
});

describe("Identity Lifecycle: Action tokens never act as sessions", () => {
  it("a reset token is rejected as a session (isSessionShaped guard)", async () => {
    const uid = freshUid();
    const reset = await signActionToken(
      { uid, purpose: "reset", bind: await bindFragment("hash") },
      3600
    );
    expect(await verifySession(reset)).toBeNull();
  });

  it("a session is rejected as an action token (missing purpose/bind)", async () => {
    const uid = freshUid();
    const { token } = await createSession(uid, USER.email, USER.role);
    expect(await verifyActionToken(token, "reset")).toBeNull();
    expect(await verifyActionToken(token, "verify")).toBeNull();
  });

  it("purpose separation: a verify token never satisfies reset", async () => {
    const uid = freshUid();
    const tok = await signActionToken(
      { uid, purpose: "verify", bind: await bindFragment(USER.email) },
      3600
    );
    expect(await verifyActionToken(tok, "verify")).not.toBeNull();
    expect(await verifyActionToken(tok, "reset")).toBeNull();
    expect(await verifyActionToken(tok, "invite")).toBeNull();
    expect(await verifyActionToken(tok, "2fa_challenge")).toBeNull();
  });

  it("reset token dies when the bound value changes (password change)", async () => {
    const uid = freshUid();
    const tok = await signActionToken(
      { uid, purpose: "reset", bind: await bindFragment("old-password-hash") },
      3600
    );
    const payload = await verifyActionToken(tok, "reset");
    expect(payload).not.toBeNull();
    // The route compares payload.bind against the CURRENT hash fragment.
    expect(payload!.bind).not.toBe(await bindFragment("new-password-hash"));
    expect(payload!.bind).toBe(await bindFragment("old-password-hash"));
  });

  it("invite tokens carry iat — the org-join cutoff can compare it", async () => {
    const before = Math.floor(Date.now() / 1000) - 1;
    const tok = await signActionToken(
      { uid: freshUid(), purpose: "invite", bind: await bindFragment("org:mail@x") },
      3600
    );
    const payload = await verifyActionToken(tok, "invite");
    expect(payload).not.toBeNull();
    expect(typeof payload!.iat).toBe("number");
    expect(payload!.iat!).toBeGreaterThanOrEqual(before);
    expect(payload!.iat!).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
  });
});

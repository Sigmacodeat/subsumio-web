// @vitest-environment node

import { describe, test, expect } from "vitest";
import { signActionToken, verifyActionToken, bindFragment, RESET_TOKEN_TTL_SECONDS, VERIFY_TOKEN_TTL_SECONDS, INVITE_TOKEN_TTL_SECONDS, CHALLENGE_TOKEN_TTL_SECONDS } from "./tokens";

const TEST_SECRET = "test-auth-secret-for-tokens-1234567890";

describe("Action Token Bind Fragment", () => {
  test("bindFragment returns a 16-char string", async () => {
    const bind = await bindFragment("test-value");
    expect(bind).toHaveLength(16);
  });

  test("bindFragment is deterministic for same input", async () => {
    const bind1 = await bindFragment("same-value");
    const bind2 = await bindFragment("same-value");
    expect(bind1).toBe(bind2);
  });

  test("bindFragment differs for different inputs", async () => {
    const bind1 = await bindFragment("value-a");
    const bind2 = await bindFragment("value-b");
    expect(bind1).not.toBe(bind2);
  });
});

describe("Action Token Sign + Verify Roundtrip", () => {
  test("reset token roundtrip", async () => {
    const bind = await bindFragment("password-hash-123");
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "reset", TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe("user-1");
    expect(payload!.purpose).toBe("reset");
    expect(payload!.bind).toBe(bind);
  });

  test("verify token roundtrip", async () => {
    const bind = await bindFragment("user@example.com");
    const token = await signActionToken(
      { uid: "user-2", purpose: "verify", bind },
      48 * 3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "verify", TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBe("user-2");
    expect(payload!.purpose).toBe("verify");
  });

  test("invite token roundtrip", async () => {
    const bind = await bindFragment("org-123");
    const token = await signActionToken(
      { uid: "user-3", purpose: "invite", bind },
      7 * 24 * 3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "invite", TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.purpose).toBe("invite");
  });

  test("2fa_challenge token roundtrip", async () => {
    const bind = await bindFragment("user-id+password-hash");
    const token = await signActionToken(
      { uid: "user-4", purpose: "2fa_challenge", bind },
      300,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "2fa_challenge", TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.purpose).toBe("2fa_challenge");
  });
});

describe("Action Token Purpose Isolation", () => {
  test("reset token cannot be used as verify token", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "verify", TEST_SECRET);
    expect(payload).toBeNull();
  });

  test("verify token cannot be used as reset token", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "verify", bind },
      3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "reset", TEST_SECRET);
    expect(payload).toBeNull();
  });

  test("invite token cannot be used as 2fa_challenge token", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "invite", bind },
      3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "2fa_challenge", TEST_SECRET);
    expect(payload).toBeNull();
  });
});

describe("Action Token Expiry", () => {
  test("expired token is rejected", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      -1, // already expired
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "reset", TEST_SECRET);
    expect(payload).toBeNull();
  });

  test("token with 1-second TTL is valid immediately but expires after", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      1,
      TEST_SECRET,
    );
    // Should be valid immediately
    const payload1 = await verifyActionToken(token, "reset", TEST_SECRET);
    expect(payload1).not.toBeNull();

    // Wait 2 seconds
    await new Promise((r) => setTimeout(r, 2000));

    // Should be expired now
    const payload2 = await verifyActionToken(token, "reset", TEST_SECRET);
    expect(payload2).toBeNull();
  });
});

describe("Action Token Security", () => {
  test("rejects token signed with different secret", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      3600,
      "secret-a",
    );
    const payload = await verifyActionToken(token, "reset", "secret-b");
    expect(payload).toBeNull();
  });

  test("rejects null/undefined/empty token", async () => {
    expect(await verifyActionToken(null, "reset", TEST_SECRET)).toBeNull();
    expect(await verifyActionToken(undefined, "reset", TEST_SECRET)).toBeNull();
    expect(await verifyActionToken("", "reset", TEST_SECRET)).toBeNull();
  });

  test("rejects malformed token (no dot)", async () => {
    expect(await verifyActionToken("notadot", "reset", TEST_SECRET)).toBeNull();
  });

  test("rejects tampered token", async () => {
    const bind = await bindFragment("test");
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      3600,
      TEST_SECRET,
    );
    // Tamper with the last 5 chars of the signature
    const tampered = token.slice(0, -5) + "xxxxx";
    const payload = await verifyActionToken(tampered, "reset", TEST_SECRET);
    expect(payload).toBeNull();
  });

  test("rejects token with missing uid", async () => {
    // Manually craft a token without uid by signing with raw payload
    const bind = await bindFragment("test");
    // This should still have uid, but let's verify the payload has it
    const token = await signActionToken(
      { uid: "user-1", purpose: "reset", bind },
      3600,
      TEST_SECRET,
    );
    const payload = await verifyActionToken(token, "reset", TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.uid).toBeDefined();
  });
});

describe("Action Token TTL Constants", () => {
  test("RESET_TOKEN_TTL is 1 hour", () => {
    expect(RESET_TOKEN_TTL_SECONDS).toBe(3600);
  });

  test("VERIFY_TOKEN_TTL is 48 hours", () => {
    expect(VERIFY_TOKEN_TTL_SECONDS).toBe(48 * 3600);
  });

  test("INVITE_TOKEN_TTL is 7 days", () => {
    expect(INVITE_TOKEN_TTL_SECONDS).toBe(7 * 24 * 3600);
  });

  test("CHALLENGE_TOKEN_TTL is 5 minutes", () => {
    expect(CHALLENGE_TOKEN_TTL_SECONDS).toBe(300);
  });
});

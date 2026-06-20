// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const origEnv = { ...process.env };

describe("session-core", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe("constants", () => {
    test("SESSION_COOKIE is 'sb_session'", async () => {
      const { SESSION_COOKIE } = await import("./session-core");
      expect(SESSION_COOKIE).toBe("sb_session");
    });

    test("REF_COOKIE is 'sb_ref'", async () => {
      const { REF_COOKIE } = await import("./session-core");
      expect(REF_COOKIE).toBe("sb_ref");
    });

    test("SESSION_TTL_SECONDS is 30 days", async () => {
      const { SESSION_TTL_SECONDS } = await import("./session-core");
      expect(SESSION_TTL_SECONDS).toBe(30 * 24 * 3600);
    });
  });

  describe("getAuthSecret", () => {
    test("returns AUTH_SECRET when set", async () => {
      process.env.AUTH_SECRET = "my-secret";
      const { getAuthSecret } = await import("./session-core");
      expect(getAuthSecret()).toBe("my-secret");
    });

    test("returns dev secret in non-production", async () => {
      delete process.env.AUTH_SECRET;
      process.env.NODE_ENV = "development";
      const { getAuthSecret } = await import("./session-core");
      expect(getAuthSecret()).toBe("subsumio-dev-secret-change-me");
    });

    test("throws in production without AUTH_SECRET", async () => {
      delete process.env.AUTH_SECRET;
      process.env.NODE_ENV = "production";
      const { getAuthSecret } = await import("./session-core");
      expect(() => getAuthSecret()).toThrow("AUTH_SECRET must be set");
    });

    test("throws in Vercel production without AUTH_SECRET", async () => {
      delete process.env.AUTH_SECRET;
      process.env.NODE_ENV = "development";
      process.env.VERCEL_ENV = "production";
      const { getAuthSecret } = await import("./session-core");
      expect(() => getAuthSecret()).toThrow("AUTH_SECRET must be set");
    });
  });

  describe("b64url / b64urlDecode", () => {
    test("round-trips ASCII string", async () => {
      const { b64url, b64urlDecode } = await import("./session-core");
      const input = "Hello World";
      const encoded = b64url(input);
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
      expect(b64urlDecode(encoded)).toBe(input);
    });

    test("round-trips empty string", async () => {
      const { b64url, b64urlDecode } = await import("./session-core");
      expect(b64urlDecode(b64url(""))).toBe("");
    });

    test("round-trips binary data", async () => {
      const { b64url, b64urlDecode } = await import("./session-core");
      const bytes = new Uint8Array([0, 1, 2, 254, 255]).buffer;
      const encoded = b64url(bytes);
      const decoded = b64urlDecode(encoded);
      expect(decoded.length).toBe(5);
    });
  });

  describe("b64urlDecodeUtf8", () => {
    test("decodes UTF-8 string correctly", async () => {
      const { b64url, b64urlDecodeUtf8 } = await import("./session-core");
      const input = '{"name":"Müller","city":"Wien"}';
      const encoded = b64url(input);
      const decoded = b64urlDecodeUtf8(encoded);
      expect(decoded).toBe(input);
    });
  });

  describe("hmacKey", () => {
    test("returns a CryptoKey", async () => {
      const { hmacKey } = await import("./session-core");
      const key = await hmacKey("test-secret");
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
    });
  });

  describe("signSession / verifySessionCore", () => {
    test("signs and verifies a valid session", async () => {
      process.env.AUTH_SECRET = "test-secret";
      const { signSession, verifySessionCore } = await import("./session-core");
      const token = await signSession({
        uid: "user-1",
        email: "test@example.com",
        role: "lawyer",
      });
      expect(token).toContain(".");
      const payload = await verifySessionCore(token);
      expect(payload).not.toBeNull();
      expect(payload?.uid).toBe("user-1");
      expect(payload?.email).toBe("test@example.com");
      expect(payload?.v).toBe(1);
    });

    test("returns null for null/undefined token", async () => {
      const { verifySessionCore } = await import("./session-core");
      expect(await verifySessionCore(null)).toBeNull();
      expect(await verifySessionCore(undefined)).toBeNull();
      expect(await verifySessionCore("")).toBeNull();
    });

    test("returns null for malformed token (no dot)", async () => {
      const { verifySessionCore } = await import("./session-core");
      expect(await verifySessionCore("invalidtoken")).toBeNull();
    });

    test("returns null for tampered payload", async () => {
      process.env.AUTH_SECRET = "test-secret";
      const { signSession, verifySessionCore } = await import("./session-core");
      const token = await signSession({
        uid: "user-1", email: "test@example.com", role: "lawyer",
      });
      // Tamper with the body
      const [body, sig] = token.split(".");
      const tampered = `${body}X.${sig}`;
      expect(await verifySessionCore(tampered)).toBeNull();
    });

    test("returns null for wrong secret", async () => {
      process.env.AUTH_SECRET = "secret-a";
      const { signSession, verifySessionCore } = await import("./session-core");
      const token = await signSession({
        uid: "user-1", email: "test@example.com", role: "lawyer",
      });
      expect(await verifySessionCore(token, "secret-b")).toBeNull();
    });

    test("returns null for expired token", async () => {
      process.env.AUTH_SECRET = "test-secret";
      const { signSession, verifySessionCore } = await import("./session-core");
      const token = await signSession(
        { uid: "user-1", email: "test@example.com", role: "lawyer" },
        "test-secret",
        -1, // already expired
      );
      expect(await verifySessionCore(token)).toBeNull();
    });

    test("includes version in payload", async () => {
      process.env.AUTH_SECRET = "test-secret";
      const { signSession, verifySessionCore } = await import("./session-core");
      const token = await signSession(
        { uid: "user-1", email: "test@example.com", role: "lawyer" },
        "test-secret",
        3600,
        5,
      );
      const payload = await verifySessionCore(token);
      expect(payload?.v).toBe(5);
    });
  });
});

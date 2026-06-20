import { describe, it, expect } from "vitest";
import { generateCsrfToken, validateCsrf, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";

describe("CSRF", () => {
  it("generates a 64-char hex token", () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique tokens", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
  });

  it("allows safe methods without token", () => {
    const req = new Request("https://example.com/api/test", { method: "GET" });
    expect(validateCsrf(req, undefined)).toBe(true);
  });

  it("rejects POST without cookie or header", () => {
    const req = new Request("https://example.com/api/test", { method: "POST" });
    expect(validateCsrf(req, undefined)).toBe(false);
  });

  it("rejects POST with mismatched token", () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { [CSRF_HEADER_NAME]: "abc" },
    });
    expect(validateCsrf(req, "def")).toBe(false);
  });

  it("accepts POST with matching token", () => {
    const token = generateCsrfToken();
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { [CSRF_HEADER_NAME]: token },
    });
    expect(validateCsrf(req, token)).toBe(true);
  });

  it("rejects tokens of different lengths (timing-safe)", () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { [CSRF_HEADER_NAME]: "short" },
    });
    expect(validateCsrf(req, "muchlongervalue")).toBe(false);
  });

  it("exports correct cookie and header names", () => {
    expect(CSRF_COOKIE_NAME).toBe("sb_csrf");
    expect(CSRF_HEADER_NAME).toBe("x-csrf-token");
  });

  it("allows HEAD without token", () => {
    const req = new Request("https://example.com/api/test", { method: "HEAD" });
    expect(validateCsrf(req, undefined)).toBe(true);
  });

  it("allows OPTIONS without token", () => {
    const req = new Request("https://example.com/api/test", { method: "OPTIONS" });
    expect(validateCsrf(req, undefined)).toBe(true);
  });

  it("accepts PUT with matching token", () => {
    const token = generateCsrfToken();
    const req = new Request("https://example.com/api/test", {
      method: "PUT",
      headers: { [CSRF_HEADER_NAME]: token },
    });
    expect(validateCsrf(req, token)).toBe(true);
  });

  it("accepts PATCH with matching token", () => {
    const token = generateCsrfToken();
    const req = new Request("https://example.com/api/test", {
      method: "PATCH",
      headers: { [CSRF_HEADER_NAME]: token },
    });
    expect(validateCsrf(req, token)).toBe(true);
  });

  it("accepts DELETE with matching token", () => {
    const token = generateCsrfToken();
    const req = new Request("https://example.com/api/test", {
      method: "DELETE",
      headers: { [CSRF_HEADER_NAME]: token },
    });
    expect(validateCsrf(req, token)).toBe(true);
  });

  it("rejects POST with empty header token", () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { [CSRF_HEADER_NAME]: "" },
    });
    expect(validateCsrf(req, "cookie-value")).toBe(false);
  });

  it("rejects POST with empty cookie value", () => {
    const req = new Request("https://example.com/api/test", {
      method: "POST",
      headers: { [CSRF_HEADER_NAME]: "some-token" },
    });
    expect(validateCsrf(req, "")).toBe(false);
  });

  it("generates 50 unique tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateCsrfToken()));
    expect(tokens.size).toBe(50);
  });
});

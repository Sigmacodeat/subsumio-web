import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Security headers test — verifies that next.config.ts declares
 * all required security headers. This prevents accidental removal
 * of critical headers during refactoring.
 */
describe("Security Headers (next.config.ts)", () => {
  const configPath = join(process.cwd(), "next.config.ts");
  const configSource = readFileSync(configPath, "utf8");

  function expectHeader(key: string, value: string) {
    expect(configSource).toContain(`"${key}"`);
    expect(configSource).toContain(`"${value}"`);
  }

  it("sets X-Frame-Options to DENY", () => {
    expectHeader("X-Frame-Options", "DENY");
  });

  it("sets Strict-Transport-Security with preload", () => {
    expect(configSource).toContain("Strict-Transport-Security");
    expect(configSource).toContain("max-age=31536000");
    expect(configSource).toContain("includeSubDomains");
    expect(configSource).toContain("preload");
  });

  it("sets X-Content-Type-Options to nosniff", () => {
    expectHeader("X-Content-Type-Options", "nosniff");
  });

  it("sets Referrer-Policy to strict-origin-when-cross-origin", () => {
    expectHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy with restricted camera/mic/geolocation", () => {
    expect(configSource).toContain("Permissions-Policy");
    expect(configSource).toContain("camera=(self)");
    expect(configSource).toContain("microphone=()");
    expect(configSource).toContain("geolocation=()");
  });

  it("sets Cross-Origin-Opener-Policy to same-origin", () => {
    expectHeader("Cross-Origin-Opener-Policy", "same-origin");
  });

  it("sets Cross-Origin-Embedder-Policy to credentialless", () => {
    expect(configSource).toContain("Cross-Origin-Embedder-Policy");
    expect(configSource).toContain("credentialless");
  });
});

describe("CSP in middleware", () => {
  const middlewarePath = join(process.cwd(), "src", "middleware.ts");
  const middlewareSource = readFileSync(middlewarePath, "utf8");

  it("uses per-request nonce for script-src", () => {
    expect(middlewareSource).toContain("generateCspNonce");
    expect(middlewareSource).toContain("nonce-");
    expect(middlewareSource).toContain("script-src");
  });

  it("sets frame-ancestors to none", () => {
    expect(middlewareSource).toContain("frame-ancestors 'none'");
  });

  it("sets object-src to none", () => {
    expect(middlewareSource).toContain("object-src 'none'");
  });

  it("sets base-uri to self", () => {
    expect(middlewareSource).toContain("base-uri 'self'");
  });

  it("includes upgrade-insecure-requests", () => {
    expect(middlewareSource).toContain("upgrade-insecure-requests");
  });

  it("uses strict-dynamic in production", () => {
    expect(middlewareSource).toContain("strict-dynamic");
  });
});

describe("CORS origin reflection (api-handler.ts)", () => {
  const handlerPath = join(process.cwd(), "src", "lib", "api-handler.ts");
  const handlerSource = readFileSync(handlerPath, "utf8");

  it("reflects request origin instead of wildcard", () => {
    expect(handlerSource).toContain("buildCorsHeaders");
    expect(handlerSource).toContain('req.headers.get("origin")');
    expect(handlerSource).toContain("Vary");
    expect(handlerSource).toContain("Origin");
  });

  it("does not hardcode Access-Control-Allow-Origin: *", () => {
    expect(handlerSource).not.toMatch(/"Access-Control-Allow-Origin"\s*:\s*"\*"/);
  });
});

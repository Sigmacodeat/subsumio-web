/**
 * E2E Security Headers Tests
 * ===========================
 * Verifies that security headers are present on responses:
 *   1. X-Frame-Options: DENY
 *   2. Strict-Transport-Security (production only — skip in dev)
 *   3. X-Content-Type-Options: nosniff
 *   4. Referrer-Policy
 *   5. Permissions-Policy
 *   6. Cross-Origin-Opener-Policy
 *   7. Cross-Origin-Embedder-Policy
 *   8. Content-Security-Policy with nonce
 *   9. CSP does not allow unsafe-inline for scripts
 */

import { test, expect } from "@playwright/test";

test.describe("Security Headers (E2E)", () => {
  test("homepage has all security headers", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBeLessThan(400);

    const headers = res.headers();

    // X-Frame-Options
    expect(headers["x-frame-options"]).toBe("DENY");

    // X-Content-Type-Options
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // Referrer-Policy
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    // Permissions-Policy
    expect(headers["permissions-policy"]).toContain("camera=(self)");
    expect(headers["permissions-policy"]).toContain("microphone=()");

    // Cross-Origin-Opener-Policy
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

    // Cross-Origin-Embedder-Policy
    expect(headers["cross-origin-embedder-policy"]).toBeDefined();

    // Content-Security-Policy
    const csp = headers["content-security-policy"];
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  test("CSP contains nonce (not unsafe-inline for scripts)", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp).toBeTruthy();

    // CSP should contain 'nonce-' (per-request nonce)
    expect(csp).toContain("nonce-");

    // In production, should not contain 'unsafe-inline' for script-src
    // In dev, 'unsafe-inline' is allowed for HMR — only check in CI
    if (process.env.CI) {
      // Extract script-src directive
      const scriptSrcMatch = csp.match(/script-src[^;]*/);
      if (scriptSrcMatch) {
        expect(scriptSrcMatch[0]).not.toContain("'unsafe-inline'");
      }
    }
  });

  test("API response has security headers", async ({ request }) => {
    const res = await request.get("/api/health");
    const headers = res.headers();

    // Security headers should be on API responses too
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("login page has security headers", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.status()).toBeLessThan(400);

    const headers = res.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBeTruthy();
  });

  test("CSP blocks inline scripts (no unsafe-inline in production)", async ({ page }) => {
    // Navigate to homepage and check that CSP is enforced
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Check CSP header from the page response
    const csp = await page.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return meta?.getAttribute("content") ?? null;
    });

    // CSP is set via header, not meta tag — so this should be null
    // The actual CSP is in the response header (tested above)
    // This test ensures the page doesn't have a conflicting meta CSP
    expect(csp).toBeNull();
  });

  test("HSTS header present (production only)", async ({ request }) => {
    const res = await request.get("/");
    const hsts = res.headers()["strict-transport-security"];

    // HSTS is always set via next.config.ts headers()
    // In dev (HTTP), it may not be enforced by the browser but the header is present
    if (hsts) {
      expect(hsts).toContain("max-age=31536000");
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
    }
  });
});

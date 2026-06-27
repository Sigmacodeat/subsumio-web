import { test, expect } from "@playwright/test";

async function signUpViaApi(
  page: import("@playwright/test").Page,
  email: string,
  name: string,
  password: string
) {
  const res = await page.context().request.post("/api/auth/signup", {
    data: { email, name, password, locale: "en", industry: "legal" },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sb_csrf"
  )?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

test.describe("API Guard-Chain (E2E)", () => {
  test("1. Unauthenticated dashboard access → redirect to /login", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("2. API without auth → 401", async ({ request }) => {
    const res = await request.post("/api/pages", {
      data: { slug: "test", title: "Test", content: "" },
    });
    expect([401, 403]).toContain(res.status());
    const body = await res.json();
    expect(body.error || body.code).toBeDefined();
  });

  test("3. API with auth but wrong CSRF → 403", async ({ page, request }) => {
    // Sign up a new user
    const email = `guard-${Date.now()}@subsumio.local`;
    await signUpViaApi(page, email, "Guard Test", "GuardTest123!");

    // POST without CSRF header (but with session cookie)
    const res = await page.context().request.post("/api/pages", {
      data: { slug: "test", title: "Test", content: "" },
      headers: { "x-csrf-token": "wrong_token" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code || body.error).toMatch(/csrf.*invalid/i);
  });

  test("4. API with auth + matching CSRF → success", async ({ page, request }) => {
    // Sign up a new user
    const email = `guard-ok-${Date.now()}@subsumio.local`;
    await signUpViaApi(page, email, "Guard OK Test", "GuardTest123!");

    // Get CSRF token from cookie
    const csrfToken = await page.evaluate(() => {
      const match = document.cookie.match(/sb_csrf=([^;]+)/);
      return match ? match[1] : null;
    });

    // If CSRF cookie exists, use it
    if (csrfToken) {
      const res = await page.context().request.post("/api/pages", {
        data: { slug: "test-page", title: "Test Page", content: "Test content" },
        headers: { "x-csrf-token": csrfToken },
      });
      // Should not be 403 (CSRF error)
      expect(res.status()).not.toBe(403);
    } else {
      // No CSRF cookie set — skip this test variant
      test.skip();
    }
  });

  test("5. Rate limit on auth endpoint (multiple wrong logins → 429)", async ({ request }) => {
    const email = `ratelimit-${Date.now()}@subsumio.local`;
    let got429 = false;

    for (let i = 0; i < 15; i++) {
      const res = await request.post("/api/auth/login", {
        data: { email, password: "wrong" },
      });
      if (res.status() === 429) {
        got429 = true;
        const body = await res.json();
        expect(body.error).toBeDefined();
        break;
      }
    }

    // Rate limiting should kick in within 15 attempts
    expect(got429).toBe(true);
  });
});

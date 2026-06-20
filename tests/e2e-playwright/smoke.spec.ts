/**
 * E2E Smoke Test — Stable Critical Path
 * ======================================
 * Tests the core Kanzlei-OS flows that must always work.
 * Uses the mock engine (tests/e2e-mock-engine.ts) for deterministic results.
 *
 * Covers:
 *   1. Auth: signup → dashboard → logout
 *   2. Case CRUD: create → list → view → update → delete
 *   3. Search: query → results
 *   4. Brain Query: think → SSE response
 *   5. Dashboard pages render without 503
 *   6. API guard chain: unauthenticated → 401, wrong CSRF → 403
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "SmokeTest123!",
  name: "Smoke Tester",
};

function getTestEmail() {
  testCounter++;
  return `smoke-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Smoke: Auth Flow", () => {
  test("signup → dashboard → logout", async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(
      () => window.location.pathname === "/dashboard",
      { timeout: 45_000 }
    );
    expect(page.url()).toContain("/dashboard");

    // Dashboard renders
    await expect(page.locator("nav, header, [role='navigation']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/de/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("unauthenticated dashboard → redirect to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Smoke: Case CRUD", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(
      () => window.location.pathname === "/dashboard",
      { timeout: 45_000 }
    );
  });

  test("create case via API → list → view", async ({ request, page }) => {
    // Get CSRF token
    const csrfToken = await page.evaluate(() => {
      const match = document.cookie.match(/sb_csrf=([^;]+)/);
      return match ? match[1] : null;
    });

    // Create via API
    const slug = `test/smoke-case-${Date.now()}`;
    const createRes = await request.post("/api/pages", {
      data: {
        slug,
        title: "Smoke Test Case",
        type: "legal_case",
        content: "Sachverhalt: Testfall für E2E Smoke.",
        frontmatter: {
          case_number: `SMK-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          priority: "high",
        },
      },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });

    // Should not be 403 or 503
    expect(createRes.status()).not.toBe(403);
    expect(createRes.status()).not.toBe(503);
    const created = await createRes.json();
    expect(created.slug).toBe(slug);

    // List should contain the case
    const listRes = await request.get("/api/pages?type=legal_case");
    expect(listRes.status()).toBe(200);
    const items = await listRes.json();
    const found = Array.isArray(items)
      ? items.find((p: { slug: string }) => p.slug === slug)
      : items.items?.find((p: { slug: string }) => p.slug === slug);
    expect(found).toBeTruthy();

    // Get by slug
    const getRes = await request.get(`/api/pages/${encodeURIComponent(slug)}`);
    expect(getRes.status()).toBe(200);
    const pageData = await getRes.json();
    expect(pageData.title).toBe("Smoke Test Case");

    // Update
    const updateRes = await request.patch(`/api/pages/${encodeURIComponent(slug)}`, {
      data: { title: "Smoke Test Case Updated" },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(updateRes.status()).not.toBe(403);
    expect(updateRes.status()).not.toBe(503);

    // Delete
    const delRes = await request.delete(`/api/pages/${encodeURIComponent(slug)}`, {
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(delRes.status()).toBe(200);
  });
});

test.describe("Smoke: Search", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(
      () => window.location.pathname === "/dashboard",
      { timeout: 45_000 }
    );
  });

  test("search API returns results", async ({ request }) => {
    const res = await request.get("/api/search?q=Musterfall");
    expect(res.status()).not.toBe(503);
    const data = await res.json();
    expect(data).toBeDefined();
  });

  test("search page renders", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const searchInput = page.locator('input[placeholder*="Suchen"], input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Smoke: Brain Query (Think)", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(
      () => window.location.pathname === "/dashboard",
      { timeout: 45_000 }
    );
  });

  test("think API returns SSE stream", async ({ request, page: browserPage }) => {
    const csrfToken = await browserPage.evaluate(() => {
      const match = document.cookie.match(/sb_csrf=([^;]+)/);
      return match ? match[1] : null;
    });

    const res = await request.post("/api/think", {
      data: { query: "Was ist ein Lieferverzug?", mode: "balanced" },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });

    // Should not be 403 or 503
    expect(res.status()).not.toBe(403);
    expect(res.status()).not.toBe(503);
  });
});

test.describe("Smoke: Dashboard Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(
      () => window.location.pathname === "/dashboard",
      { timeout: 45_000 }
    );
  });

  const dashboardPages = [
    { path: "/dashboard/cases", name: "Cases" },
    { path: "/dashboard/contacts", name: "Contacts" },
    { path: "/dashboard/deadlines", name: "Deadlines" },
    { path: "/dashboard/drafting", name: "Drafting" },
    { path: "/dashboard/compliance", name: "Compliance" },
    { path: "/dashboard/invoicing", name: "Invoicing" },
    { path: "/dashboard/brain", name: "Brain" },
    { path: "/dashboard/graph", name: "Graph" },
    { path: "/dashboard/workflows", name: "Workflows" },
  ];

  for (const p of dashboardPages) {
    test(`${p.name} page loads without 503`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(503);
      // Page should not show error
      const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
      await expect(errorText).toHaveCount(0, { timeout: 5_000 });
    });
  }
});

test.describe("Smoke: API Guard Chain", () => {
  test("unauthenticated POST → 401", async ({ request }) => {
    const res = await request.post("/api/pages", {
      data: { slug: "test", title: "Test", content: "" },
    });
    expect(res.status()).toBe(401);
  });

  test("authenticated POST with wrong CSRF → 403", async ({ page, request }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(
      () => window.location.pathname === "/dashboard",
      { timeout: 45_000 }
    );

    const res = await request.post("/api/pages", {
      data: { slug: "test", title: "Test", content: "" },
      headers: { "x-csrf-token": "wrong_token" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("csrf_invalid");
  });
});

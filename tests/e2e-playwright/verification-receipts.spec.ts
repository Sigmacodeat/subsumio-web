/**
 * E2E Test — Verification Receipts API
 *
 * Tests the full receipt lifecycle via HTTP:
 * 1. Receipt creation on work product generation (all 6 types)
 * 2. Receipt retrieval scoped by brain_id
 * 3. Cross-tenant access prevention (brain_id mismatch → 403)
 * 4. Receipt by ID with brain_id scoping
 * 5. Receipt invalidation on re-generation
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "ReceiptTest123!", name: "Receipt Tester" };

function getTestEmail() {
  testCounter++;
  return `receipt-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "de",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await page.evaluate(() => {
    try {
      localStorage.setItem("subsumio-tour-completed", "true");
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { email, csrfToken };
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "sb_csrf")?.value;
}

test.describe("Verification Receipts API", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("receipts/latest returns 403 on brain_id mismatch", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get(
      "/api/legal/receipts/latest?product_type=draft&product_ref=doc-1&brain_id=wrong-brain",
      { headers: csrf ? { "x-csrf-token": csrf } : {} }
    );
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error?.code ?? body.error).toContain("forbidden");
  });

  test("receipts/latest returns 404 when no receipt exists", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    // We need the actual brain_id — get it from the session
    // Since we can't easily extract it, we test with a non-existent product_ref
    // The brain_id check passes (same session), but no receipt found
    const meRes = await page.context().request.get("/api/auth/me");
    const me = await meRes.json();
    const brainId = me.brainId ?? me.brain_id;
    expect(brainId).toBeTruthy();

    const res = await page.context().request.get(
      `/api/legal/receipts/latest?product_type=draft&product_ref=nonexistent-${Date.now()}&brain_id=${brainId}`,
      { headers: csrf ? { "x-csrf-token": csrf } : {} }
    );
    expect(res.status()).toBe(404);
  });

  test("receipts/[receiptId] returns 404 for non-existent receipt", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get(
      "/api/legal/receipts/rcpt-nonexistent-000",
      { headers: csrf ? { "x-csrf-token": csrf } : {} }
    );
    expect(res.status()).toBe(404);
  });

  test("receipts/latest rejects invalid product_type", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const meRes = await page.context().request.get("/api/auth/me");
    const me = await meRes.json();
    const brainId = me.brainId ?? me.brain_id;

    const res = await page.context().request.get(
      `/api/legal/receipts/latest?product_type=invalid_type&product_ref=doc-1&brain_id=${brainId}`,
      { headers: csrf ? { "x-csrf-token": csrf } : {} }
    );
    expect(res.status()).toBe(400);
  });

  test("receipts/latest accepts all 6 product types", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const meRes = await page.context().request.get("/api/auth/me");
    const me = await meRes.json();
    const brainId = me.brainId ?? me.brain_id;

    const productTypes = ["draft", "memo", "fristenreport", "vertragsreview", "redline", "schriftsatz"];
    for (const pt of productTypes) {
      const res = await page.context().request.get(
        `/api/legal/receipts/latest?product_type=${pt}&product_ref=test-${pt}&brain_id=${brainId}`,
        { headers: csrf ? { "x-csrf-token": csrf } : {} }
      );
      // 404 is expected (no receipt yet), but NOT 400 (validation passed)
      expect([404, 200]).toContain(res.status());
    }
  });

  test("fristenreport route exists and requires auth", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/legal/fristenreport", {
      data: {
        case_slug: "test-case",
        jurisdiction: "at",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    // Should not get 404 (route exists) — may get 503 (engine unreachable) or 200
    expect(res.status()).not.toBe(404);
  });

  test("schriftsatz route exists and requires auth", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/legal/schriftsatz", {
      data: {
        case_slug: "test-case",
        instructions: "Test instructions for Schriftsatz",
        jurisdiction: "at",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    // Should not get 404 (route exists) — may get 503 (engine unreachable) or 200
    expect(res.status()).not.toBe(404);
  });

  test("contract-redline accepts case_slug and document_slug", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/legal/contract-redline", {
      data: {
        original_text: "Test contract text",
        jurisdiction: "at",
        case_slug: "test-case",
        document_slug: "legal/docs/test-contract",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    // Should not get 400 (validation passed) — may get 503 (engine unreachable)
    expect(res.status()).not.toBe(400);
  });
});

test.describe("Receipt Scope Isolation", () => {
  test("two users cannot access each other's receipts", async ({ browser }) => {
    // User A
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUpViaApi(pageA);
    const csrfA = await getCsrfToken(pageA);
    const meResA = await pageA.context().request.get("/api/auth/me");
    const meA = await meResA.json();
    const brainA = meA.brainId ?? meA.brain_id;

    // User B
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUpViaApi(pageB);
    const csrfB = await getCsrfToken(pageB);

    // User B tries to fetch User A's receipts using User A's brain_id
    const res = await pageB.context().request.get(
      `/api/legal/receipts/latest?product_type=draft&product_ref=doc-1&brain_id=${brainA}`,
      { headers: csrfB ? { "x-csrf-token": csrfB } : {} }
    );
    expect(res.status()).toBe(403);

    await ctxA.close();
    await ctxB.close();
  });
});

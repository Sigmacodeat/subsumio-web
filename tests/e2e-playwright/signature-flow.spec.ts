/**
 * E2E Signature Flow Tests
 * =========================
 * Tests the DocuSign integration endpoints:
 *   1. Signature page renders
 *   2. DocuSign auth endpoint
 *   3. DocuSign webhook signature verification
 *   4. Envelope status endpoint
 *   5. Callback endpoint
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "SigTest123!",
  name: "Sig Tester",
};

function getTestEmail() {
  testCounter++;
  return `sig-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "en",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sb_csrf"
  )?.value;
  await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
}

test.describe("Signature Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("signature page renders", async ({ page }) => {
    await page.goto("/dashboard/signature", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("404");
  });

  test("docusign auth endpoint requires auth", async ({ request }) => {
    const res = await request.get("/api/docusign/auth");
    expect([401, 403, 302, 307]).toContain(res.status());
  });

  test("docusign callback handles missing code", async ({ request }) => {
    const res = await request.get("/api/docusign/callback");
    // Should redirect or show error, not crash
    expect([400, 401, 302, 307]).toContain(res.status());
  });

  test("docusign webhook without signature → rejected", async ({ request }) => {
    const res = await request.post("/api/docusign/webhook", {
      data: { event: "envelope-completed" },
    });
    // Should require auth or valid signature
    expect([401, 403, 400]).toContain(res.status());
  });

  test("docusign status requires auth", async ({ request }) => {
    const res = await request.get("/api/docusign/status");
    expect([401, 403]).toContain(res.status());
  });

  test("docusign envelopes requires auth", async ({ request }) => {
    const res = await request.get("/api/docusign/envelopes");
    expect([401, 403]).toContain(res.status());
  });

  test("docusign disconnect requires auth", async ({ request }) => {
    const res = await request.post("/api/docusign/disconnect", {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });
});

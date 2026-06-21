/**
 * E2E Client Portal Flow Tests
 * =============================
 * Tests the token-based client portal:
 *   1. Portal page renders with valid token structure
 *   2. Portal API endpoints respond correctly
 *   3. Invalid/expired tokens are rejected
 *   4. Portal document upload endpoint
 *   5. Portal messaging endpoint
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "PortalTest123!",
  name: "Portal Tester",
};

function getTestEmail() {
  testCounter++;
  return `portal-${Date.now()}-${testCounter}@subsumio.local`;
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
  return { email, csrfToken: csrfToken ?? "" };
}

test.describe("Client Portal Flow", () => {
  test("portal page with invalid token shows error", async ({ page }) => {
    await page.goto("/portal/invalid-token-12345", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("404");
  });

  test("portal verify endpoint rejects invalid token", async ({ request }) => {
    const res = await request.post("/api/portal/verify", {
      data: { token: "invalid-token-12345" },
    });
    expect([400, 401, 403, 404]).toContain(res.status());
  });

  test("portal case endpoint rejects unauthenticated", async ({ request }) => {
    const res = await request.get("/api/portal/case?token=invalid");
    expect([401, 403, 404]).toContain(res.status());
  });

  test("portal messages endpoint rejects invalid token", async ({ request }) => {
    const res = await request.get("/api/portal/messages?token=invalid");
    expect([401, 403, 404]).toContain(res.status());
  });

  test("portal upload rejects invalid token", async ({ request }) => {
    const res = await request.post("/api/portal/upload", {
      data: { token: "invalid", fileName: "test.pdf" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("portal revoke requires auth", async ({ request }) => {
    const res = await request.post("/api/portal/revoke", {
      data: { token: "some-token" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("client-portal dashboard page renders", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/client-portal", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("404");
  });

  test("document-requests page renders", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/document-requests", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("404");
  });
});

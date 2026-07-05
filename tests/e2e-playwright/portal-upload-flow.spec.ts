/**
 * E2E Test — Mandantenportal-Upload
 * ==================================
 * Verifies the full portal upload flow:
 *   1. Lawyer creates a case with portal_enabled
 *   2. Lawyer generates a portal token via /api/portal/generate
 *   3. Client visits /portal/:token → case details render
 *   4. Client uploads a document via /api/portal/upload
 *   5. Verify document appears in the engine (linked to case)
 *   6. Verify invalid token is rejected
 *   7. Verify archived case rejects portal access
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "PortalUpload1234!", name: "Portal Upload Tester" };

function getTestEmail() {
  testCounter++;
  return `portalup-${Date.now()}-${testCounter}@subsumio.local`;
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
  return { email };
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
}

test.describe("Mandantenportal-Upload", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("full portal flow: generate token → visit portal → upload document", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/portal-upload-${Date.now()}`;
    const caseTitle = "Portal Upload Test Case";

    // ── Step 1: Create a case with portal_enabled ──────────────────────
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: caseTitle,
        content: "Case for portal upload test",
        type: "legal_case",
        frontmatter: {
          case_number: `AZ-PORT-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          portal_enabled: true,
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // ── Step 2: Generate a portal token ────────────────────────────────
    const tokenRes = await page.context().request.post("/api/portal/generate", {
      data: { caseSlug },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(tokenRes.status()).toBe(200);
    const tokenData = await tokenRes.json();
    expect(tokenData.token).toBeDefined();
    expect(tokenData.url).toContain("/portal/");
    const portalToken = tokenData.token;

    // ── Step 3: Visit the portal page ──────────────────────────────────
    await page.goto(`/portal/${portalToken}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Portal page should render (not 404, not error)
    const errorText = page.locator("text=/Token.*ungültig|invalid.*token|404|Fehler/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });

    // ── Step 4: Verify portal case API returns case data ───────────────
    const caseApiRes = await page.context().request.get(`/api/portal/case?token=${portalToken}`);
    expect(caseApiRes.status()).toBe(200);
    const caseApiData = await caseApiRes.json();
    expect(caseApiData.page).toBeDefined();
    expect(caseApiData.page.slug).toBe(caseSlug);

    // ── Step 5: Upload a document via portal ───────────────────────────
    const uploadRes = await page.context().request.post("/api/portal/upload", {
      multipart: {
        token: portalToken,
        file: {
          name: "test_document.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
          ),
        },
      },
    });
    expect(uploadRes.status()).toBe(200);
    const uploadData = await uploadRes.json();
    expect(uploadData.ok).toBe(true);
    expect(uploadData.slug).toBeDefined();

    // ── Step 6: Verify document exists in engine and is linked to case ──
    const docRes = await page
      .context()
      .request.get(`/api/pages/${encodeURIComponent(uploadData.slug)}`);
    expect(docRes.status()).toBe(200);
    const docData = await docRes.json();
    expect(docData.type).toBe("document");
    expect(docData.frontmatter.case_slug).toBe(caseSlug);
    expect(docData.frontmatter.source).toBe("portal");
    expect(docData.frontmatter.filename).toBe("test_document.pdf");
  });

  test("invalid token is rejected for portal upload", async ({ request }) => {
    const res = await request.post("/api/portal/upload", {
      multipart: {
        token: "invalid-token-xyz",
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("test content"),
        },
      },
    });
    expect(res.status()).toBe(403);
  });

  test("portal access rejected for archived case", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/portal-archived-${Date.now()}`;

    // Create a case with portal_enabled
    await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Archived Portal Case",
        content: "Test",
        type: "legal_case",
        frontmatter: {
          status: "open",
          portal_enabled: true,
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    // Generate token
    const tokenRes = await page.context().request.post("/api/portal/generate", {
      data: { caseSlug },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    const { token: portalToken } = await tokenRes.json();

    // Archive the case
    const delRes = await page
      .context()
      .request.delete(`/api/pages/${encodeURIComponent(caseSlug)}`);
    expect(delRes.status()).toBe(200);

    // Portal case API should reject for archived case
    const caseRes = await page.context().request.get(`/api/portal/case?token=${portalToken}`);
    expect(caseRes.status()).toBe(403);
    const caseData = await caseRes.json();
    expect(caseData.error).toContain("archived");
  });

  test("portal upload rejected when portal_enabled is false", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/portal-disabled-${Date.now()}`;

    // Create a case with portal_enabled = false
    await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Portal Disabled Case",
        content: "Test",
        type: "legal_case",
        frontmatter: {
          status: "open",
          portal_enabled: false,
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    // Generate token (token generation works regardless of portal_enabled)
    const tokenRes = await page.context().request.post("/api/portal/generate", {
      data: { caseSlug },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    const { token: portalToken } = await tokenRes.json();

    // Portal case API should reject
    const caseRes = await page.context().request.get(`/api/portal/case?token=${portalToken}`);
    expect(caseRes.status()).toBe(403);
    const caseData = await caseRes.json();
    expect(caseData.error).toContain("portal_disabled");

    // Upload should also be rejected
    const uploadRes = await page.context().request.post("/api/portal/upload", {
      multipart: {
        token: portalToken,
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("test"),
        },
      },
    });
    expect(uploadRes.status()).toBe(403);
  });

  test("portal page renders with upload UI", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/portal-ui-${Date.now()}`;

    // Create case with portal_enabled
    await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Portal UI Test",
        content: "Test case for portal UI",
        type: "legal_case",
        frontmatter: {
          status: "open",
          portal_enabled: true,
          legal_area: "Zivilrecht",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    // Generate token
    const tokenRes = await page.context().request.post("/api/portal/generate", {
      data: { caseSlug },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    const { token: portalToken } = await tokenRes.json();

    // Visit portal page
    await page.goto(`/portal/${portalToken}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Should not show error
    const errorText = page.locator("text=/Token.*ungültig|invalid.*token|404/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });

    // Should show some portal-related content
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    // The portal page should mention the case or upload functionality
    const hasRelevantContent = bodyText!.match(/upload|Datei|Dokument|Portal|Akte|case/i);
    expect(hasRelevantContent).toBeTruthy();
  });
});

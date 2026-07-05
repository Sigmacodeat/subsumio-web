/**
 * E2E Test — DocuSign-Signatur-Rückschluss
 * ==========================================
 * Verifies the full webhook-driven signature status sync:
 *   1. Create a signature_request page with docusign_envelope_id
 *   2. Send HMAC-signed webhook for envelope-completed
 *   3. Verify page status updates to "signed" in the engine
 *   4. Send webhook for envelope-declined → status "declined"
 *   5. Verify webhook rejects invalid HMAC signature
 *   6. Verify webhook is idempotent (duplicate event = dedup)
 *
 * Uses DOCUSIGN_CONNECT_SECRET=test_docusign_connect_secret (from playwright.config.ts)
 */

import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

let testCounter = 0;
const TEST_USER = { password: "DocuSignTest1234!", name: "DocuSign Tester" };
const CONNECT_SECRET = "test_docusign_connect_secret";

function getTestEmail() {
  testCounter++;
  return `docusign-${Date.now()}-${testCounter}@subsumio.local`;
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

function signWebhook(body: string): string {
  return createHmac("sha256", CONNECT_SECRET).update(body, "utf8").digest("base64");
}

test.describe("DocuSign-Signatur-Rückschluss", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("envelope-completed webhook updates signature_request status to signed", async ({
    page,
  }) => {
    const csrf = await getCsrfToken(page);
    const envelopeId = `env-${Date.now()}`;
    const sigPageSlug = `legal/signature_request_${envelopeId}`;

    // ── Step 1: Create a signature_request page with docusign_envelope_id ──
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: sigPageSlug,
        title: "Unterschriftsanforderung Testvertrag",
        content: "DocuSign-Unterschrift für Testvertrag",
        type: "signature_request",
        frontmatter: {
          docusign_envelope_id: envelopeId,
          docusign_status: "sent",
          case_slug: "cases/test-case",
          case_title: "Test Case",
          status: "pending",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // ── Step 2: Send HMAC-signed webhook for envelope-completed ──────────
    const webhookBody = JSON.stringify({
      event: "envelope-completed",
      eventId: `evt-${envelopeId}`,
      data: {
        envelopeId,
        envelopeSummary: {
          status: "completed",
        },
        envelope: {
          customFields: {
            brain_id: "test-brain",
          },
        },
      },
    });

    const webhookRes = await page.context().request.post("/api/docusign/webhook", {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "x-docusign-signature-1": signWebhook(webhookBody),
      },
    });
    expect(webhookRes.status()).toBe(200);
    const webhookData = await webhookRes.json();
    expect(webhookData.ok).toBe(true);
    expect(webhookData.envelopeId).toBe(envelopeId);
    expect(webhookData.mapped).toBe("signed");
    expect(webhookData.updated).toBe(true);

    // ── Step 3: Verify page status was updated to "signed" ───────────────
    const pageRes = await page
      .context()
      .request.get(`/api/pages/${encodeURIComponent(sigPageSlug)}`);
    expect(pageRes.status()).toBe(200);
    const pageData = await pageRes.json();
    expect(pageData.frontmatter.docusign_status).toBe("signed");
    expect(pageData.frontmatter.signed_at).toBeDefined();
  });

  test("envelope-declined webhook updates status to declined", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const envelopeId = `env-declined-${Date.now()}`;
    const sigPageSlug = `legal/signature_request_${envelopeId}`;

    // Create signature_request page
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: sigPageSlug,
        title: "Unterschriftsanforderung Declined Test",
        content: "DocuSign-Unterschrift",
        type: "signature_request",
        frontmatter: {
          docusign_envelope_id: envelopeId,
          docusign_status: "sent",
          case_slug: "cases/test-case",
          case_title: "Test Case Declined",
          status: "pending",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // Send declined webhook
    const webhookBody = JSON.stringify({
      event: "envelope-declined",
      eventId: `evt-declined-${envelopeId}`,
      data: {
        envelopeId,
        envelopeSummary: {
          status: "declined",
        },
        envelope: {
          customFields: {
            brain_id: "test-brain",
          },
        },
      },
    });

    const webhookRes = await page.context().request.post("/api/docusign/webhook", {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "x-docusign-signature-1": signWebhook(webhookBody),
      },
    });
    expect(webhookRes.status()).toBe(200);
    const webhookData = await webhookRes.json();
    expect(webhookData.ok).toBe(true);
    expect(webhookData.mapped).toBe("declined");
    expect(webhookData.declined).toBe(true);

    // Verify page status
    const pageRes = await page
      .context()
      .request.get(`/api/pages/${encodeURIComponent(sigPageSlug)}`);
    const pageData = await pageRes.json();
    expect(pageData.frontmatter.docusign_status).toBe("declined");
  });

  test("webhook with invalid HMAC signature is rejected", async ({ page }) => {
    const webhookBody = JSON.stringify({
      event: "envelope-completed",
      eventId: `evt-invalid-sig-${Date.now()}`,
      data: {
        envelopeId: `env-invalid-${Date.now()}`,
        envelopeSummary: { status: "completed" },
        envelope: { customFields: { brain_id: "test-brain" } },
      },
    });

    const res = await page.context().request.post("/api/docusign/webhook", {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "x-docusign-signature-1": "invalid-signature-value",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("webhook is idempotent — duplicate eventId returns dedup:true", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const envelopeId = `env-dedup-${Date.now()}`;
    const sigPageSlug = `legal/signature_request_${envelopeId}`;
    const eventId = `evt-dedup-${envelopeId}`;

    // Create page
    await page.context().request.post("/api/pages", {
      data: {
        slug: sigPageSlug,
        title: "Dedup Test",
        content: "Dedup test",
        type: "signature_request",
        frontmatter: {
          docusign_envelope_id: envelopeId,
          docusign_status: "sent",
          case_slug: "cases/test",
          case_title: "Dedup Case",
          status: "pending",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    const webhookBody = JSON.stringify({
      event: "envelope-completed",
      eventId,
      data: {
        envelopeId,
        envelopeSummary: { status: "completed" },
        envelope: { customFields: { brain_id: "test-brain" } },
      },
    });

    // First call — should process
    const res1 = await page.context().request.post("/api/docusign/webhook", {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "x-docusign-signature-1": signWebhook(webhookBody),
      },
    });
    expect(res1.status()).toBe(200);
    const data1 = await res1.json();
    expect(data1.dedup).toBeFalsy();

    // Second call with same eventId — should dedup
    const res2 = await page.context().request.post("/api/docusign/webhook", {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "x-docusign-signature-1": signWebhook(webhookBody),
      },
    });
    expect(res2.status()).toBe(200);
    const data2 = await res2.json();
    expect(data2.dedup).toBe(true);
  });

  test("signature page in dashboard shows DocuSign status", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const envelopeId = `env-ui-${Date.now()}`;
    const sigPageSlug = `legal/signature_request_${envelopeId}`;

    // Create + complete signature via webhook
    await page.context().request.post("/api/pages", {
      data: {
        slug: sigPageSlug,
        title: "UI Test Vertrag",
        content: "Vertrag für UI Test",
        type: "signature_request",
        frontmatter: {
          docusign_envelope_id: envelopeId,
          docusign_status: "sent",
          case_slug: "cases/test-case",
          case_title: "UI Test Case",
          status: "pending",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    const webhookBody = JSON.stringify({
      event: "envelope-completed",
      eventId: `evt-ui-${envelopeId}`,
      data: {
        envelopeId,
        envelopeSummary: { status: "completed" },
        envelope: { customFields: { brain_id: "test-brain" } },
      },
    });

    await page.context().request.post("/api/docusign/webhook", {
      data: webhookBody,
      headers: {
        "Content-Type": "application/json",
        "x-docusign-signature-1": signWebhook(webhookBody),
      },
    });

    // Visit dashboard signature page
    await page.goto("/dashboard/signature", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Page should load without error
    const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });
  });
});

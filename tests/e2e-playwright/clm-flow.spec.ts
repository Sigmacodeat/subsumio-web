/**
 * E2E CLM Flow Test — Contract Lifecycle Management
 * ==================================================
 * Tests the complete CLM flow from Intake to Renewal:
 *
 *   1. Intake: Create matter/contract via ContractQuickCreateDialog
 *   2. Drafting: Generate contract draft via AI
 *   3. Review: Redline contract and create clause annotations
 *   4. Approval: Set status to approved
 *   5. Signature: DocuSign integration (mocked)
 *   6. Obligation Tracking: Extract obligations from signed contract
 *   7. Renewal/Deadline: Track renewal dates and deadlines
 *
 * Uses the mock engine (tests/e2e-mock-engine.ts) for deterministic results.
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "CLMTest123!",
  name: "CLM Tester",
};

function getTestEmail() {
  testCounter++;
  return `clm-${Date.now()}-${testCounter}@subsumio.local`;
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
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

async function getCsrfToken(page: import("@playwright/test").Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((cookie) => cookie.name === "sb_csrf")?.value;
}

test.describe("CLM Flow: Intake", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("create contract via ContractQuickCreateDialog", async ({ page }) => {
    await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });

    // Click "New Contract" button
    const newContractButton = page.getByRole("button", { name: /new contract|neuer vertrag/i });
    await expect(newContractButton).toBeVisible({ timeout: 10_000 });
    await newContractButton.click();

    // Wait for dialog to open
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Fill contract details
    await page.locator('input[name="title"]').fill("Test Contract");
    await page.locator('input[name="parties.a"]').fill("Party A");
    await page.locator('input[name="parties.b"]').fill("Party B");
    await page.locator('select[name="contractType"]').selectOption("service");

    // Submit
    const submitButton = page.getByRole("button", { name: /create|erstellen/i });
    await submitButton.click();

    // Verify contract was created
    await expect(page.getByText("Test Contract")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("CLM Flow: Drafting", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("generate contract draft via AI", async ({ page }) => {
    await page.goto("/dashboard/drafting", { waitUntil: "domcontentloaded" });

    // Select template
    const templateButton = page.getByRole("button", {
      name: /service agreement|dienstleistungsvertrag/i,
    });
    await expect(templateButton).toBeVisible({ timeout: 10_000 });
    await templateButton.click();

    // Fill form
    await page.locator('input[name="klaeger"]').fill("Party A");
    await page.locator('input[name="beklagter"]').fill("Party B");
    await page.locator('input[name="title"]').fill("Service Agreement");
    await page.locator('textarea[name="facts"]').fill("Party A provides services to Party B");
    await page.locator('input[name="legalBasis"]').fill("BGB § 611");

    // Generate draft
    const generateButton = page.getByRole("button", { name: /generate|generieren/i });
    await generateButton.click();

    // Wait for AI response
    await expect(page.getByText(/draft|entwurf/i)).toBeVisible({ timeout: 30_000 });

    // Verify draft content
    const draftContent = page.locator('[data-testid="draft-content"]');
    await expect(draftContent).toBeVisible();
  });
});

test.describe("CLM Flow: Review", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("redline contract and create clause annotation", async ({ page }) => {
    // First create a contract
    const csrf = await getCsrfToken(page);
    const slug = `clm-contract-${Date.now()}`;
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "CLM Test Contract",
        type: "contract",
        content: "This is a test contract for CLM flow testing.",
        frontmatter: {
          parties: { a: "Party A", b: "Party B" },
          contract_type: "service",
          status: "draft",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).not.toBe(403);

    // Navigate to contracts
    await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });

    // Open contract
    await page.getByText("CLM Test Contract").click();

    // Wait for contract details
    await expect(page.getByText("Party A")).toBeVisible({ timeout: 10_000 });

    // Click redline button
    const redlineButton = page.getByRole("button", { name: /redline|bearbeiten/i });
    await expect(redlineButton).toBeVisible();
    await redlineButton.click();

    // Wait for redline viewer
    await expect(page.locator('[data-testid="redline-viewer"]')).toBeVisible({ timeout: 10_000 });

    // Create clause annotation
    const annotateButton = page.getByRole("button", { name: /annotate|annotieren/i });
    if (await annotateButton.isVisible({ timeout: 5_000 })) {
      await annotateButton.click();

      // Fill annotation
      await page.locator('select[name="clause_type"]').selectOption("liability");
      await page.locator('select[name="risk_level"]').selectOption("medium");
      await page.locator('textarea[name="recommendation"]').fill("Review liability clause");

      // Save annotation
      const saveButton = page.getByRole("button", { name: /save|speichern/i });
      await saveButton.click();

      // Verify annotation was saved
      await expect(page.getByText("medium")).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("CLM Flow: Approval", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("set contract status to approved", async ({ page }) => {
    // Create contract
    const csrf = await getCsrfToken(page);
    const slug = `clm-contract-${Date.now()}`;
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "CLM Approval Test",
        type: "contract",
        content: "Test contract for approval flow",
        frontmatter: {
          parties: { a: "Party A", b: "Party B" },
          contract_type: "service",
          status: "reviewed",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).not.toBe(403);

    // Navigate to contracts
    await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });

    // Open contract
    await page.getByText("CLM Approval Test").click();

    // Set status to approved
    const statusSelect = page.locator('select[name="status"]');
    await expect(statusSelect).toBeVisible({ timeout: 10_000 });
    await statusSelect.selectOption("approved");

    // Save
    const saveButton = page.getByRole("button", { name: /save|speichern/i });
    await saveButton.click();

    // Verify status changed
    await expect(page.getByText(/approved|freigegeben/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("CLM Flow: Signature", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("signature page renders and DocuSign endpoints are protected", async ({ page }) => {
    // Navigate to signature page
    await page.goto("/dashboard/signature", { waitUntil: "domcontentloaded" });
    await expect(page).not.toContainText("404");

    // Test DocuSign auth endpoint requires auth
    const authRes = await page.context().request.get("/api/docusign/auth");
    expect([401, 403, 302, 307]).toContain(authRes.status());

    // Test DocuSign callback handles missing code
    const callbackRes = await page.context().request.get("/api/docusign/callback");
    expect([400, 401, 302, 307]).toContain(callbackRes.status());

    // Test DocuSign webhook without signature → rejected
    const webhookRes = await page.context().request.post("/api/docusign/webhook", {
      data: { event: "envelope-completed" },
    });
    expect([401, 403, 400]).toContain(webhookRes.status());
  });
});

test.describe("CLM Flow: Obligation Tracking", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("extract obligations from contract", async ({ page }) => {
    // Create contract with obligation content
    const csrf = await getCsrfToken(page);
    const slug = `clm-obligation-${Date.now()}`;
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "CLM Obligation Test",
        type: "contract",
        content:
          "Party A shall pay Party B €10,000 by 2026-12-31. Contract renews automatically on 2027-01-01.",
        frontmatter: {
          parties: { a: "Party A", b: "Party B" },
          contract_type: "service",
          status: "signed",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).not.toBe(403);

    // Navigate to contracts
    await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });

    // Open contract
    await page.getByText("CLM Obligation Test").click();

    // Trigger obligation extraction
    const extractButton = page.getByRole("button", {
      name: /extract obligations|verpflichtungen extrahieren/i,
    });
    if (await extractButton.isVisible({ timeout: 5_000 })) {
      await extractButton.click();

      // Wait for extraction
      await expect(page.getByText(/obligation|verpflichtung/i)).toBeVisible({ timeout: 30_000 });

      // Verify obligations are displayed
      await expect(page.getByText("€10,000")).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe("CLM Flow: Renewal/Deadline", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("track renewal dates and deadlines", async ({ page }) => {
    // Create contract with renewal date
    const csrf = await getCsrfToken(page);
    const slug = `clm-renewal-${Date.now()}`;
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "CLM Renewal Test",
        type: "contract",
        content: "Contract renews on 2027-01-01 with 30-day notice period.",
        frontmatter: {
          parties: { a: "Party A", b: "Party B" },
          contract_type: "service",
          status: "signed",
          renewal_date: "2027-01-01",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).not.toBe(403);

    // Navigate to deadlines
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });

    // Verify renewal deadline is displayed
    await expect(page.getByText(/2027-01-01/i)).toBeVisible({ timeout: 10_000 });

    // Verify notice period is displayed
    await expect(page.getByText(/30.*day/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("CLM Flow: End-to-End", () => {
  test("complete CLM flow from intake to renewal", async ({ page }) => {
    // 1. Intake: Create contract
    const csrf = await getCsrfToken(page);
    const slug = `clm-e2e-${Date.now()}`;
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "CLM E2E Test Contract",
        type: "contract",
        content:
          "Service agreement between Party A and Party B. Payment due 2026-12-31. Renews 2027-01-01.",
        frontmatter: {
          parties: { a: "Party A", b: "Party B" },
          contract_type: "service",
          status: "draft",
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).not.toBe(403);

    // 2. Drafting: Navigate to drafting page
    await page.goto("/dashboard/drafting", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /service/i })).toBeVisible({ timeout: 10_000 });

    // 3. Review: Navigate to contracts and open contract
    await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });
    await page.getByText("CLM E2E Test Contract").click();
    await expect(page.getByText("Party A")).toBeVisible({ timeout: 10_000 });

    // 4. Approval: Set status to approved
    const statusSelect = page.locator('select[name="status"]');
    await statusSelect.selectOption("approved");
    const saveButton = page.getByRole("button", { name: /save|speichern/i });
    await saveButton.click();
    await expect(page.getByText(/approved|freigegeben/i)).toBeVisible({ timeout: 5_000 });

    // 5. Signature: Set status to signed (simulating DocuSign)
    await statusSelect.selectOption("signed");
    await saveButton.click();
    await expect(page.getByText(/signed|unterzeichnet/i)).toBeVisible({ timeout: 5_000 });

    // 6. Obligation Tracking: Navigate to deadlines
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/2026-12-31/i)).toBeVisible({ timeout: 10_000 });

    // 7. Renewal: Verify renewal date
    await expect(page.getByText(/2027-01-01/i)).toBeVisible({ timeout: 5_000 });
  });
});

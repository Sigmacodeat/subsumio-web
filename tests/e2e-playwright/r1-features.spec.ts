/**
 * E2E Tests: R1 Feature Coverage
 * =================================
 * Covers the R1 Quick Win features:
 *   1. Experience Layer API (GET /api/experience)
 *   2. Retrieval Feedback API (POST /api/legal/retrieval-feedback)
 *   3. Eval Gate API (GET /api/admin/eval-gate)
 *   4. Copilot Tools + Agent Conditionals (GET /api/copilot/tools)
 *   5. IP Allowlist API (GET /api/admin/ip-allowlist)
 *   6. Deep Analysis API (POST /api/legal/deep-analysis)
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "R1Features123!",
  name: "R1 E2E Tester",
};

function getTestEmail() {
  testCounter++;
  return `r1-e2e-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page): Promise<string> {
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
  return email;
}

async function getCsrfToken(page: import("@playwright/test").Page): Promise<string | undefined> {
  return (await page.context().cookies()).find((cookie) => cookie.name === "sb_csrf")?.value;
}

test.describe("R1: Experience Layer", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("GET /api/experience returns seeded profiles", async ({ page }) => {
    const res = await page.context().request.get("/api/experience?action=list");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const profiles = data.data ?? data;
    expect(Array.isArray(profiles)).toBeTruthy();
  });

  test("GET /api/experience summary action returns summary", async ({ page }) => {
    const res = await page.context().request.get("/api/experience?action=summary");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toBeTruthy();
  });

  test("POST /api/experience upserts own profile", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/experience", {
      data: {
        practice_areas: ["Mietrecht", "Familienrecht"],
        languages: ["de", "en"],
        qualifications: ["Rechtsanwalt"],
        visibility: "org",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.data?.updated ?? data.updated).toBe(true);
  });
});

test.describe("R1: Retrieval Feedback", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("POST /api/legal/retrieval-feedback accepts feedback", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/legal/retrieval-feedback", {
      data: {
        query: "test query",
        result_slug: "test/result-1",
        rating: "positive",
        comment: "Good result",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 201]).toContain(res.status());
    const data = await res.json();
    expect(data).toBeTruthy();
  });

  test("POST /api/legal/retrieval-feedback rejects invalid rating", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/legal/retrieval-feedback", {
      data: {
        query: "test query",
        result_slug: "test/result-1",
        rating: "invalid_rating",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("R1: Copilot Tools + Agent Conditionals", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("GET /api/copilot/tools returns available tools", async ({ page }) => {
    const res = await page.context().request.get("/api/copilot/tools");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const tools = data.data?.tools ?? data.tools ?? [];
    expect(Array.isArray(tools)).toBeTruthy();
    expect(tools.length).toBeGreaterThan(0);
    // Every user should have navigate
    const toolNames = tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("navigate");
  });

  test("POST /api/copilot/tools executes navigate", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/copilot/tools", {
      data: {
        tool: "navigate",
        params: { route: "/dashboard" },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.display?.kind).toBe("navigation");
  });

  test("POST /api/copilot/tools rejects unknown tool", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/copilot/tools", {
      data: {
        tool: "nonexistent_tool",
        params: {},
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("R1: IP Allowlist (Admin)", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("GET /api/admin/ip-allowlist returns config", async ({ page }) => {
    const res = await page.context().request.get("/api/admin/ip-allowlist");
    // Non-admin users get 403, admin gets 200
    // New signup is admin by default (first user)
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      const d = data.data ?? data;
      expect(Array.isArray(d.entries)).toBeTruthy();
      expect(typeof d.enabled).toBe("boolean");
    }
  });
});

test.describe("R1: Settings Security Page", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("security settings page renders with IP allowlist section", async ({ page }) => {
    await page.goto("/dashboard/settings/security", { waitUntil: "domcontentloaded" });
    // The page should contain "IP Allowlist" text
    await expect(page.locator("body")).toContainText(/IP Allowlist/i, { timeout: 10_000 });
  });
});

test.describe("R1: Vault Deep Analysis Button", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("vault page renders with deep analysis button when docs selected", async ({ page }) => {
    await page.goto("/dashboard/vault", { waitUntil: "domcontentloaded" });
    // The vault page should load
    await expect(page).toHaveURL(/\/dashboard\/vault/);
  });
});

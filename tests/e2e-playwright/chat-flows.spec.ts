/**
 * E2E Chat Flow Tests
 * Covers: chat visibility, message sending, streaming, session management, and tool invocation.
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "ChatFlow123!",
  name: "Chat Flow Tester",
};

function getTestEmail() {
  testCounter++;
  return `chat-flow-${Date.now()}-${testCounter}@subsumio.local`;
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

async function openChat(page: import("@playwright/test").Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Meta+j");
  await page.waitForTimeout(800);
  const chatInput = page.locator("textarea[data-chat-input]").first();
  await expect(chatInput).toBeVisible({ timeout: 10_000 });
  return chatInput;
}

test.describe("Chat Flows", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("opens chat via ⌘J and sends a message", async ({ page }) => {
    const chatInput = await openChat(page);
    await chatInput.fill("Was ist die Kanzlei-Übersicht?");
    await chatInput.press("Enter");
    // Message appears in the chat panel
    await expect(page.getByText("Was ist die Kanzlei-Übersicht?")).toBeVisible({ timeout: 10_000 });
    // AI response starts streaming (the streaming indicator or assistant content shows up)
    await expect(page.locator("[role='article']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("stops generation during streaming", async ({ page }) => {
    const chatInput = await openChat(page);
    await chatInput.fill("Erkläre detailliert den gesamten Gesetzesentwurf zum KI-Vertrag.");
    await chatInput.press("Enter");
    const stopButton = page.getByRole("button", { name: /Stop|stop|Generierung/i }).first();
    await expect(stopButton).toBeVisible({ timeout: 10_000 });
    await stopButton.click();
    await expect(page.getByRole("button", { name: /Send|send/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("manages chat sessions via header", async ({ page }) => {
    await openChat(page);
    const chatInput = page.locator("textarea[data-chat-input]").first();
    await chatInput.fill("Erste Sitzung");
    await chatInput.press("Enter");
    await expect(page.getByText("Erste Sitzung")).toBeVisible({ timeout: 10_000 });

    // Open sessions dropdown and create a new session
    const sessionDropdown = page.getByRole("button", { name: /Neue|Sitzung|Session/i }).first();
    await expect(sessionDropdown).toBeVisible({ timeout: 10_000 });
    await sessionDropdown.click();
    await page.waitForTimeout(300);
    const newSessionButton = page
      .getByRole("button", { name: /Neue Sitzung|New Session/i })
      .first();
    await expect(newSessionButton).toBeVisible({ timeout: 10_000 });
    await newSessionButton.click();
    await page.waitForTimeout(500);

    // After creating a new session, the input should be empty and ready
    await expect(chatInput).toHaveValue("");
  });

  test("navigates to dedicated chat page with context", async ({ page }) => {
    const csrfToken = await page.evaluate(() => {
      const match = document.cookie.match(/sb_csrf=([^;]+)/);
      return match ? match[1] : null;
    });
    const slug = `chat-flow-case-${Date.now()}`;
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "Chat Flow Test Case",
        type: "legal_case",
        content: "Sachverhalt: E2E Chat Testfall.",
        frontmatter: {
          case_number: `CF-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
        },
      },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(createRes.status()).not.toBe(403);

    await page.goto(`/dashboard/chat?case=${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const chatInput = page.locator("textarea[data-chat-input]").first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });
  });

  test("sends a tool-related query and receives assistant response", async ({ page }) => {
    const chatInput = await openChat(page);
    await chatInput.fill("Öffne die Fristen-Seite.");
    await chatInput.press("Enter");
    // Assistant response appears after the user message
    await expect(page.locator("[role='article']").nth(1)).toBeVisible({ timeout: 15_000 });
  });
});

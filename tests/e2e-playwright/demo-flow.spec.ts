/**
 * Public live-demo E2E — the whole conversion journey without signup:
 *   /demo entry → session bootstrap → dashboard with banner + tour →
 *   guided question (real chat, mock-engine answer) → intake pipeline →
 *   ingest confirmation → reset → expiry redirect.
 *
 * Runs against the mock engine (tests/e2e-mock-engine.ts) which serves the
 * seeded demo-template source and answers /api/think with a canned SSE
 * stream — enough to prove the plumbing without LLM cost.
 */

import { test, expect, type Page } from "@playwright/test";

async function startDemo(page: Page) {
  await page.goto("/demo", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Live-Demo öffnen/ })).toBeVisible();
  await page.getByRole("button", { name: /Live-Demo öffnen/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe("public live demo", () => {
  test("entry page renders persona choice and start", async ({ page }) => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Kanzlei Berger/i)).toBeVisible();
    await expect(page.getByRole("radio", { name: /Anwältin/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Assistenz/ })).toBeVisible();
    // Trust claims — no registration, fictional data, EU hosting.
    await expect(page.getByText(/Keine Registrierung/)).toBeVisible();
    await expect(page.getByText(/Fiktive Daten/)).toBeVisible();
  });

  test("session bootstrap lands in a populated dashboard", async ({ page }) => {
    await startDemo(page);

    // Demo chrome: banner + guided tour card.
    await expect(page.getByRole("region", { name: "Live-Demo" })).toBeVisible();
    await expect(page.getByText(/fiktive/i).first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: /Fragen Sie die Akte/i })).toBeVisible();

    // Signup CTA is present.
    await expect(page.getByRole("link", { name: /Mit meiner Kanzlei starten/ })).toBeVisible();
  });

  test("guided step 1 sends the suggested question and gets an answer", async ({ page }) => {
    await startDemo(page);
    await page.getByRole("button", { name: /Erste Frage stellen/ }).click();
    await page.waitForURL(/\/dashboard\/chat/, { timeout: 15_000 });

    // The initial query auto-sends; the mock engine streams a canned answer.
    await expect(page.getByText(/anwaltliche Prüfung|KI-generierte Antwort/).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("intake card files the incoming brief", async ({ page }) => {
    await startDemo(page);
    // Dismiss the tour overlay so it can't cover the card on narrow layouts.
    await page.keyboard.press("Escape");

    await page.goto("/dashboard/intake", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Klagebeantwortung_MusterWerk/)).toBeVisible();

    await page.getByRole("button", { name: /In Akte aufnehmen/ }).click();
    // Pipeline runs at demo speed (~7 s) — wait for the done state.
    await expect(page.getByRole("link", { name: /Frist prüfen/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Beteiligte erkannt/)).toBeVisible();
    await expect(page.getByText(/Frist erkannt/)).toBeVisible();
  });

  test("reset purges and reclones the sandbox", async ({ page }) => {
    await startDemo(page);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Demo zurücksetzen/ }).click();
    await page
      .getByRole("button", { name: /Demo zurücksetzen/ })
      .last()
      .click();
    // After reset the demo is still live (fresh clone).
    await expect(page.getByRole("region", { name: "Live-Demo" })).toBeVisible();
  });

  test("expired session redirects to /demo?expired=1, not the login wall", async ({
    page,
    context,
  }) => {
    await startDemo(page);
    // Simulate expiry: drop the signed session, keep the sb_demo marker.
    const cookies = await context.cookies();
    await context.clearCookies();
    for (const c of cookies) {
      if (c.name === "sb_demo") await context.addCookies([c]);
    }
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/demo\?expired=1/, { timeout: 15_000 });
    await expect(page.getByText(/abgelaufen/)).toBeVisible();
  });

  test("jurisdiction deep link starts the German matter variant", async ({ page }) => {
    await page.goto("/demo?jur=de", { waitUntil: "domcontentloaded" });
    // The DE radio is preselected via the deep link.
    await expect(page.getByRole("radio", { name: /Deutschland/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await page.getByRole("button", { name: /Live-Demo öffnen/ }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await page.keyboard.press("Escape");
    // The staged incoming brief is the German beA variant, not the AT ERV one.
    await page.goto("/dashboard/intake", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Klageerwiderung_MusterWerk_beA/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("tour progress fires first-party beacon events", async ({ page }) => {
    const beacons: string[] = [];
    await page.route("**/api/demo/event", async (route) => {
      try {
        const body = route.request().postDataJSON() as { event?: string };
        if (body?.event) beacons.push(body.event);
      } catch {
        /* non-JSON body */
      }
      await route.fulfill({ status: 200, body: '{"ok":true}' });
    });
    await startDemo(page);
    // The tour card renders → step 0 beacon must have been sent.
    await expect.poll(() => beacons.includes("tour_step"), { timeout: 10_000 }).toBe(true);
  });

  test("ops analytics is gated for anonymous visitors", async ({ page }) => {
    // API: operator-only — anonymous must not see funnel data.
    const apiRes = await page.goto("/api/admin/demo?range=7d");
    expect(apiRes?.status()).toBeGreaterThanOrEqual(400);
    // Page: /ops/* only exists on the ops host — 404 everywhere else.
    const pageRes = await page.goto("/ops/demo", { waitUntil: "domcontentloaded" });
    expect([401, 403, 404]).toContain(pageRes?.status());
  });

  test("mobile viewport: banner stays usable and does not cover content", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startDemo(page);
    const banner = page.getByRole("region", { name: "Live-Demo" });
    await expect(banner).toBeVisible();
    // Primary CTA reachable on mobile.
    await expect(page.getByRole("link", { name: /Mit meiner Kanzlei starten/ })).toBeVisible();
    // Tour renders as bottom sheet — dismissable via Escape.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Fragen Sie die Akte/i })).toHaveCount(0);
  });
});

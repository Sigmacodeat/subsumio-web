/**
 * Website concierge — the visitor-facing chat on the marketing pages.
 *
 * Runs against the mock engine (tests/e2e-mock-engine.ts), which answers the
 * concierge with a fixed, correctly sourced JSON answer. What this pins:
 * the answer appears with its source, the keyboard works (accessibility), and
 * the hand-over form opens. The claim check itself is covered by unit tests;
 * here it must not swallow a correct answer on the way through the route.
 */
import { test, expect } from "@playwright/test";

test.describe("concierge chat (keyboard + accessibility)", () => {
  test.beforeEach(async ({ page }) => {
    // Decline analytics up front so the consent banner is out of the way.
    await page.addInitScript(() => localStorage.setItem("sb_analytics_consent", "declined"));
    await page.goto("/at/pricing");
    await page.mouse.wheel(0, 900);
  });

  test("answers a question with its source and hands over to a person", async ({ page }) => {
    const launcher = page.getByRole("button", { name: "Fragen zu Subsumio?" });
    await launcher.click();

    const dialog = page.getByRole("dialog", { name: "Subsumio-Assistent" });
    await expect(dialog).toBeVisible();
    // The visitor is told this is a machine (AI Act Art. 50).
    await expect(dialog).toContainText("KI-Assistent");

    // Typed, not clicked: the suggested questions differ per page.
    await page.getByPlaceholder("Ihre Frage zu Subsumio").fill("Was kostet Subsumio?");
    await page.keyboard.press("Enter");

    // Both sentences arrive — the last one only with the final, checked answer.
    await expect(dialog.getByText("249", { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("1.499", { exact: false })).toBeVisible({ timeout: 30_000 });
    // Every statement carries the page it came from.
    await expect(dialog.getByRole("link", { name: /Preise/ }).first()).toBeVisible();

    await dialog.getByRole("button", { name: "Mensch" }).click();
    await expect(dialog.getByRole("heading", { name: "Rückruf anfragen" })).toBeVisible();
    await expect(dialog.getByPlaceholder("E-Mail *")).toBeVisible();
  });

  test("keyboard: opens, types, closes with Escape and returns the focus", async ({ page }) => {
    const launcher = page.getByRole("button", { name: "Fragen zu Subsumio?" });
    await launcher.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Subsumio-Assistent" });
    await expect(dialog).toBeVisible();
    // Focus lands in the input, so a keyboard user can start writing at once.
    await expect(page.getByPlaceholder("Ihre Frage zu Subsumio")).toBeFocused();

    await page.keyboard.type("Was kostet Subsumio?");
    await page.keyboard.press("Enter");
    await expect(dialog.getByText("249", { exact: false })).toBeVisible({ timeout: 30_000 });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
  });

  test("the privacy note stays visible while typing", async ({ page }) => {
    await page.getByRole("button", { name: "Fragen zu Subsumio?" }).click();
    const dialog = page.getByRole("dialog", { name: "Subsumio-Assistent" });
    await expect(dialog).toContainText("Bitte keine Mandantendaten eingeben");
    await expect(dialog.getByRole("link", { name: "Datenschutz" })).toBeVisible();
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findQuoteRange } from "./highlight-quote";

function page(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe("findQuoteRange", () => {
  it("finds a quote across elements and differing whitespace", () => {
    const root = page(
      "<h2>§ 7 Kündigung</h2><p>Der Vertrag kann   mit einer Frist von\n<strong>drei Monaten</strong> zum Quartalsende gekündigt werden.</p>"
    );
    const range = findQuoteRange(root, "mit einer Frist von drei Monaten zum Quartalsende");
    expect(range?.toString().replace(/\s+/g, " ")).toBe(
      "mit einer Frist von drei Monaten zum Quartalsende"
    );
  });

  it("falls back to the quote's first words", () => {
    const root = page("<p>Die Kaution beträgt drei Monatsmieten und wird verzinst.</p>");
    const range = findQuoteRange(
      root,
      "Die Kaution beträgt drei Monatsmieten und wird nach Rückgabe der Wohnung ausbezahlt"
    );
    expect(range?.toString()).toContain("Die Kaution beträgt drei Monatsmieten");
  });

  it("returns null when the passage is not on the page", () => {
    const root = page("<p>Ganz anderer Text.</p>");
    expect(findQuoteRange(root, "Gewährleistungsfrist beträgt zwei Jahre")).toBeNull();
  });
});

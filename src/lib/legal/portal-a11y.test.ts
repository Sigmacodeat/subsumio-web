/**
 * Accessibility of the client portal page (BaFG / EAA): uploads work with the
 * keyboard, tabs follow the ARIA tab pattern, inputs have accessible names and
 * conversations announce new entries.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/app/portal/[token]/page.tsx"), "utf-8");

describe("client portal accessibility", () => {
  it("file inputs stay focusable (visually hidden, not display:none)", () => {
    const fileInputs = source.match(/<input\s+type="file"[\s\S]*?\/>/g) ?? [];
    expect(fileInputs.length).toBeGreaterThanOrEqual(3);
    for (const input of fileInputs) {
      expect(input).not.toMatch(/className="hidden"/);
      expect(input).toMatch(/className="sr-only"/);
    }
    // The wrapping label shows where the keyboard focus is.
    expect(source.match(/focus-within:ring-2/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("tabs use the ARIA tab pattern", () => {
    expect(source).toContain('role="tablist"');
    expect(source.match(/role="tab"/g)?.length).toBe(5);
    expect(source.match(/aria-selected=\{activeTab === "/g)?.length).toBe(5);
    expect(source.match(/onKeyDown=\{onTabKeyDown\}/g)?.length).toBe(5);
  });

  it("text inputs have accessible names and conversations are live regions", () => {
    const textInputs = source.match(/<input\s+type="text"[\s\S]*?\/>/g) ?? [];
    expect(textInputs.length).toBeGreaterThanOrEqual(2);
    for (const input of textInputs) expect(input).toMatch(/aria-label=/);
    expect(source.match(/aria-live="polite"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

// @vitest-environment node
/**
 * The Outlook add-in runs on the app's own origin, so browser storage it
 * writes is readable by every page of that origin. The API key may live only
 * in the taskpane's memory; keys stored by older versions are removed on
 * start.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.join(process.cwd(), "outlook-addin", "src", "taskpane.ts"), "utf8");

describe("Outlook add-in API key storage", () => {
  it("never writes or reads the key from browser storage", () => {
    expect(src).not.toMatch(/localStorage\.setItem|sessionStorage\.setItem/);
    expect(src).not.toMatch(/localStorage\.getItem|sessionStorage\.getItem/);
  });

  it("removes a key left by older versions on every start", () => {
    const onReady = src.slice(src.indexOf("Office.onReady("));
    expect(onReady).toMatch(/forgetStoredApiKey\(\)/);
    expect(src).toMatch(/localStorage\.removeItem\(LEGACY_API_KEY_STORAGE_KEY\)/);
  });
});

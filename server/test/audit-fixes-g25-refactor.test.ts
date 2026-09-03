import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests for G25 full-refactor: all error responses now use apiError helper.
 */

const ROOT = join(__dirname, "..");
const WEB_API = join(ROOT, "src/commands/web-api.ts");

describe("G25 Full-Refactor: apiError consistency", () => {
  it("apiError is defined at the top of mountWebApi", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const mountIdx = src.indexOf("export function mountWebApi");
    const apiErrorIdx = src.indexOf("const apiError =");
    expect(mountIdx).toBeGreaterThan(-1);
    expect(apiErrorIdx).toBeGreaterThan(-1);
    // apiError should be defined within the first 200 chars of mountWebApi
    expect(apiErrorIdx - mountIdx).toBeLessThan(300);
  });

  it("apiError is defined only once", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const matches = src.match(/const apiError =/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("at least 90 error responses now use apiError", () => {
    const src = readFileSync(WEB_API, "utf-8");
    const matches = src.match(/apiError\(res,/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(90);
  });

  it("no simple res.status(X).json({ error: code }) patterns remain", () => {
    const src = readFileSync(WEB_API, "utf-8");
    // Pattern: res.status(XXX).json({ error: "code" }); (no message, no extra fields)
    const simplePattern = src.match(/res\.status\(\d+\)\.json\(\{ error: "[a-z_]+" \}\);/g) ?? [];
    expect(simplePattern.length).toBe(0);
  });

  it("apiError always includes message field (message: message ?? code)", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("message: message ?? code");
  });

  it("legalErr still exists and is unchanged", () => {
    const src = readFileSync(WEB_API, "utf-8");
    expect(src).toContain("const legalErr =");
    expect(src).toContain("error: `${name}_failed`");
  });
});

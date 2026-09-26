// @vitest-environment node
/**
 * The add-ins run on the app's own origin, so localStorage they write is
 * readable by every page of that origin and survives restarts. The add-in
 * token lives only in memory plus this pane's sessionStorage (through
 * addin-auth.ts); keys stored by older versions are removed on start.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe.each(["outlook-addin", "word-addin"])("%s token storage", (addin) => {
  const src = read(addin, "src", "taskpane.ts");
  const auth = read(addin, "src", "addin-auth.ts");

  it("never writes the token to localStorage", () => {
    expect(src).not.toMatch(/localStorage|sessionStorage\./);
    expect(auth).not.toMatch(/localStorage\.setItem/);
    expect(auth).toMatch(/localStorage\.removeItem\(LEGACY_STORAGE_KEY\)/);
  });

  it("removes a key left by older versions on start when no session is running", () => {
    const onReady = src.slice(src.indexOf("Office.onReady("));
    expect(onReady).toMatch(/clearStoredSession\(storage\)/);
  });
});

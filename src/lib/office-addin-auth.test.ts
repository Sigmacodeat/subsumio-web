// @vitest-environment node
// Both Office add-ins sign in through the Office dialog and connect only with
// a short-lived add-in token — never a permanent API key.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe.each(["outlook-addin", "word-addin"])("%s connect", (addin) => {
  const src = read(addin, "src", "taskpane.ts");
  const html = read(addin, "src", "taskpane.html");
  const connect = src.slice(src.indexOf("async function connect()"));

  it("signs in through the Office dialog", () => {
    const signIn = src.slice(src.indexOf("async function signIn()"));
    expect(signIn.slice(0, 600)).toMatch(/openSignInDialog\(/);
    expect(html).toMatch(/id="signInBtn"/);
  });

  it("the manual fallback accepts only sk_addin_ tokens, never a permanent API key", () => {
    expect(connect.slice(0, 1500)).toMatch(/if \(!value\.startsWith\("sk_addin_"\)\)/);
    expect(html).not.toContain('placeholder="sk_live_');
    expect(html).toContain("sk_addin_");
  });

  it("authenticates API calls with the add-in token only, without cookies", () => {
    const apiFetch = src.slice(src.indexOf("async function apiFetch("));
    expect(apiFetch.slice(0, 800)).toMatch(/credentials: "omit"/);
    // No request bypasses apiFetch with its own Authorization header.
    expect(src).not.toMatch(/Authorization: `Bearer \$\{token\}`/);
    expect(src.match(/await fetch\(/g) ?? []).toHaveLength(1);
  });

  it("signing out revokes the add-in's token on the server", () => {
    expect(src).toMatch(/apiFetch\("\/api\/addin-token", \{ method: "DELETE" \}\)/);
  });
});

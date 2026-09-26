// @vitest-environment node
// Both Office add-ins connect only with a short-lived add-in token.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe.each(["outlook-addin", "word-addin"])("%s connect", (addin) => {
  const src = read(addin, "src", "taskpane.ts");
  const html = read(addin, "src", "taskpane.html");
  const connect = src.slice(src.indexOf("async function connect()"));

  it("accepts only sk_addin_ tokens, never a permanent API key", () => {
    expect(connect.slice(0, 1500)).toMatch(/if \(!token\.startsWith\("sk_addin_"\)\)/);
    expect(html).not.toContain('placeholder="sk_live_');
    expect(html).toContain("sk_addin_");
  });
});

import { describe, expect, test } from "bun:test";
import { scriptName } from "../scripts/ris-lock.ts";

/**
 * The RIS lock is what keeps us to one connection, which the OGD rules
 * require. It failed because the holder check compared paths: Bun records an
 * absolute path in argv while the process was launched relative, so every
 * live holder looked dead and every new job stole the lock. Three fetchers
 * ran at once on 2026-09-20.
 */
describe("scriptName", () => {
  test("reduces Bun's absolute argv path to the file name", () => {
    expect(scriptName("/app/scripts/fetch-entscheidungstexte.ts --court ogh")).toBe(
      "fetch-entscheidungstexte.ts"
    );
  });

  test("a relative launch yields the same name — that is the whole point", () => {
    const stored = "/app/scripts/fetch-at-landesrecht-xml.ts --page 261 --to-page 540";
    const live = "bun scripts/fetch-at-landesrecht-xml.ts --page 261 --to-page 540";
    expect(live.includes(scriptName(stored))).toBe(true);
  });

  test("a different script is still recognised as different", () => {
    const stored = "/app/scripts/fetch-at-landesrecht-xml.ts --page 1";
    const live = "bun scripts/reconcile-ris.ts";
    expect(live.includes(scriptName(stored))).toBe(false);
  });

  test("survives an empty or odd command without throwing", () => {
    expect(scriptName("")).toBe("");
    expect(scriptName("   ")).toBe("");
    expect(scriptName("bun")).toBe("bun");
  });
});

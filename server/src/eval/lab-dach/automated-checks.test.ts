/**
 * LAB-DACH v3 — Automated checks: jurisdiction_correct regression test.
 *
 * Guards the live-003 0/7 root cause: the cross-law-contamination check derives
 * its "retrieved laws" set from topSlugs. Two bugs made it flag EVERY cited law:
 *   (1) workflows.ts::evaluateCriteria never passed topSlugs (fixed there).
 *   (2) the guardrail only stripped `law/<jur>/` prefixes, so production slugs
 *       (`legal/statutes/<jur>/<abbr>/p-<N>`) never matched (fixed in guardrail).
 *
 * These tests pin the check against the REAL production slug shape.
 */

import { describe, test, expect } from "vitest";
import { checkJurisdictionCorrect, type CheckContext } from "./automated-checks.ts";

const AT_OUTPUT =
  "Die Berufungsfrist beträgt gemäß § 461 ZPO vier Wochen. Nach § 464 ZPO ist die Berufung beim Gericht einzubringen.";

function ctx(topSlugs: string[]): CheckContext {
  return { output: AT_OUTPUT, context: AT_OUTPUT, jurisdiction: "AT", topSlugs };
}

describe("checkJurisdictionCorrect — production slug shapes", () => {
  test("passes when the cited law's production statute slug is in topSlugs", () => {
    const res = checkJurisdictionCorrect(
      ctx(["legal/statutes/at/zpo/p-461", "legal/statutes/at/zpo/p-464"])
    );
    expect(res.passed).toBe(true);
    expect(res.details).toContain("No cross-law contamination");
  });

  test("passes for legacy law/<jur>/<abbr> slugs too", () => {
    const res = checkJurisdictionCorrect(ctx(["law/at/zpo"]));
    expect(res.passed).toBe(true);
  });

  test("passes for paragraph-level law/<jur>/<abbr>/p-N slugs", () => {
    const res = checkJurisdictionCorrect(ctx(["law/at/zpo/p-461"]));
    expect(res.passed).toBe(true);
  });

  test("flags genuine contamination: cited law NOT among retrieved slugs", () => {
    // Output cites ZPO, but only ABGB was retrieved → real contamination.
    const res = checkJurisdictionCorrect(ctx(["legal/statutes/at/abgb/p-1489"]));
    expect(res.passed).toBe(false);
    expect(res.details).toContain("ZPO");
  });

  test("empty topSlugs → flags (nothing retrieved is not a pass)", () => {
    const res = checkJurisdictionCorrect(ctx([]));
    expect(res.passed).toBe(false);
  });
});

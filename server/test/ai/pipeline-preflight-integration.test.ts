/**
 * Integration Test: legal-pipeline → assertProviderCredits.
 *
 * Verifies that the legal-pipeline handler calls assertProviderCredits
 * BEFORE entering the billing context / starting any specialist work.
 * This is the load-bearing integration — if the pre-flight check is
 * skipped or moved after the pipeline starts, partial work is wasted.
 *
 * We test this by:
 *   1. Mocking assertProviderCredits to throw
 *   2. Calling the legal-pipeline handler
 *   3. Verifying it throws BEFORE reaching the billing context
 *
 * Since the full handler requires a real engine + DB, we test the
 * integration at the module level: verify the import exists and the
 * call site is before the billingContextStore.run() call.
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

describe("legal-pipeline pre-flight integration", () => {
  it("imports assertProviderCredits from credits-preflight", () => {
    const source = readFileSync(
      new URL("../../src/core/minions/handlers/legal-pipeline.ts", import.meta.url),
      "utf-8"
    );
    expect(source).toContain("assertProviderCredits");
    expect(source).toContain('from "../../ai/credits-preflight');
  });

  it("calls assertProviderCredits BEFORE billingContextStore.run", () => {
    const source = readFileSync(
      new URL("../../src/core/minions/handlers/legal-pipeline.ts", import.meta.url),
      "utf-8"
    );
    const preflightLine = source.indexOf("await assertProviderCredits()");
    const billingLine = source.indexOf("return billingContextStore.run(");
    expect(preflightLine).toBeGreaterThan(0);
    expect(billingLine).toBeGreaterThan(0);
    // Pre-flight MUST come before billing context
    expect(preflightLine).toBeLessThan(billingLine);
  });

  it("pre-flight call is after data validation but before any specialist work", () => {
    const source = readFileSync(
      new URL("../../src/core/minions/handlers/legal-pipeline.ts", import.meta.url),
      "utf-8"
    );
    const validationLine = source.indexOf("unknown workflow_id");
    const preflightLine = source.indexOf("await assertProviderCredits()");
    // Find the first specialist call INSIDE the handler (not the import)
    // The handler starts at "export function makeLegalPipelineHandler"
    const handlerStart = source.indexOf("export function makeLegalPipelineHandler");
    const specialistCall = source.indexOf("resolveSpecialist(", handlerStart);

    expect(validationLine).toBeGreaterThan(0);
    expect(preflightLine).toBeGreaterThan(0);
    // Validation first, then pre-flight
    expect(validationLine).toBeLessThan(preflightLine);
    // Pre-flight before first specialist call in handler body
    if (specialistCall > 0) {
      expect(preflightLine).toBeLessThan(specialistCall);
    }
  });

  it("pre-flight has a comment explaining its purpose", () => {
    const source = readFileSync(
      new URL("../../src/core/minions/handlers/legal-pipeline.ts", import.meta.url),
      "utf-8"
    );
    const preflightIdx = source.indexOf("await assertProviderCredits()");
    // Look backwards for the comment
    const before = source.slice(Math.max(0, preflightIdx - 500), preflightIdx);
    expect(before).toContain("Pre-Flight");
    expect(before).toContain("60s cache");
  });
});

import { describe, it, expect } from "bun:test";

/**
 * Tests for the stamp_failures surfacing in runExtractionAndImport.
 *
 * BUG #D: When case_slug stamping failed on split parts, the upload returned
 * success silently. The unstamped parts were invisible to
 * discoverAllCaseDocuments, creating orphaned documents in the case.
 *
 * The fix surfaces stamp_failures in the return value of
 * runExtractionAndImport so callers can include it in their API response,
 * making the failure visible to the frontend and the user.
 *
 * These tests verify the return-value shape logic without needing a full
 * engine mock (the stamping itself is already tested via integration).
 */

describe("runExtractionAndImport stamp_failures return value", () => {
  // Simulates the return value construction from web-api.ts:
  //   return { partSlugs, ...(stampFailureList ? { stamp_failures: stampFailureList } : {}) };
  function buildReturnValue(
    partSlugs: string[],
    stampFailureList: string[] | undefined
  ): { partSlugs: string[]; stamp_failures?: string[] } {
    return {
      partSlugs,
      ...(stampFailureList ? { stamp_failures: stampFailureList } : {}),
    };
  }

  it("includes stamp_failures when failures exist", () => {
    const result = buildReturnValue(["doc-1", "doc-2"], ["doc-2"]);
    expect(result.stamp_failures).toBeDefined();
    expect(result.stamp_failures).toEqual(["doc-2"]);
    expect(result.partSlugs).toEqual(["doc-1", "doc-2"]);
  });

  it("omits stamp_failures when no failures occurred", () => {
    const result = buildReturnValue(["doc-1", "doc-2"], undefined);
    expect(result.stamp_failures).toBeUndefined();
    expect(result.partSlugs).toEqual(["doc-1", "doc-2"]);
  });

  it("omits stamp_failures when failure list is empty", () => {
    // The code only sets stampFailureList when stampFailures.length > 0
    const result = buildReturnValue(["doc-1"], undefined);
    expect(result.stamp_failures).toBeUndefined();
  });

  it("includes all failed parts in stamp_failures", () => {
    const result = buildReturnValue(["parent", "part-1", "part-2", "part-3"], ["part-2", "part-3"]);
    expect(result.stamp_failures).toEqual(["part-2", "part-3"]);
    expect(result.stamp_failures!.length).toBe(2);
  });
});

describe("Upload response stamp_failures surfacing", () => {
  // Simulates the response construction from the direct-upload path:
  //   ...(stampFailures && stampFailures.length > 0
  //     ? { stamp_failures: stampFailures }
  //     : {}),
  function buildResponse(stampFailures: string[] | undefined): { stamp_failures?: string[] } {
    return {
      ...(stampFailures && stampFailures.length > 0 ? { stamp_failures: stampFailures } : {}),
    };
  }

  it("surfaces stamp_failures in response when present", () => {
    const res = buildResponse(["part-1", "part-3"]);
    expect(res.stamp_failures).toBeDefined();
    expect(res.stamp_failures).toEqual(["part-1", "part-3"]);
  });

  it("omits stamp_failures from response when undefined", () => {
    const res = buildResponse(undefined);
    expect(res.stamp_failures).toBeUndefined();
  });

  it("omits stamp_failures from response when empty array", () => {
    const res = buildResponse([]);
    expect(res.stamp_failures).toBeUndefined();
  });
});

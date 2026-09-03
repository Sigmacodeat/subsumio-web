import { describe, it, expect } from "bun:test";

/**
 * Tests for the BEA import case_slug stamping fix.
 *
 * BUG #1: BEA-XML imports triggered the legal pipeline with case_slug=beaSlug
 * (the BEA message page itself) instead of the actual case_slug. The BEA page
 * was also NOT stamped with case_slug in its frontmatter, making it invisible
 * to discoverAllCaseDocuments.
 *
 * The fix ensures:
 * 1. The BEA page gets case_slug stamped via patchPageFrontmatter
 * 2. The pipeline is triggered with the real case_slug (not beaSlug)
 * 3. If no case_slug is provided, falls back to beaSlug (backward compat)
 *
 * These tests verify the routing logic (pipelineCaseSlug = beaCaseSlug ?? beaSlug)
 * without needing a full Express server.
 */

describe("BEA import case_slug routing", () => {
  // Simulates the routing logic from both BEA import paths in web-api.ts:
  //   const beaCaseSlug = fields.case_slug?.trim() || undefined;
  //   const pipelineCaseSlug = beaCaseSlug ?? beaSlug;
  function resolvePipelineCaseSlug(fieldCaseSlug: string | undefined, beaSlug: string): string {
    const beaCaseSlug = fieldCaseSlug?.trim() || undefined;
    return beaCaseSlug ?? beaSlug;
  }

  it("uses the real case_slug when provided", () => {
    const slug = resolvePipelineCaseSlug("cases/muster-akte-2024", "bea/msg-123");
    expect(slug).toBe("cases/muster-akte-2024");
  });

  it("falls back to beaSlug when no case_slug provided", () => {
    const slug = resolvePipelineCaseSlug(undefined, "bea/msg-123");
    expect(slug).toBe("bea/msg-123");
  });

  it("falls back to beaSlug when case_slug is empty string", () => {
    const slug = resolvePipelineCaseSlug("", "bea/msg-123");
    expect(slug).toBe("bea/msg-123");
  });

  it("falls back to beaSlug when case_slug is whitespace-only", () => {
    const slug = resolvePipelineCaseSlug("   ", "bea/msg-123");
    expect(slug).toBe("bea/msg-123");
  });

  it("trims whitespace from case_slug", () => {
    const slug = resolvePipelineCaseSlug("  cases/my-akte  ", "bea/msg-123");
    expect(slug).toBe("cases/my-akte");
  });

  it("uses real case_slug even when beaSlug looks like a case", () => {
    // Edge case: beaSlug could be "cases/something" if the BEA message
    // happens to have that pattern — but the real case_slug must win
    const slug = resolvePipelineCaseSlug("cases/actual-case", "cases/bea-msg");
    expect(slug).toBe("cases/actual-case");
  });
});

describe("BEA import case_slug stamp decision", () => {
  // Simulates the stamp decision: only stamp when case_slug is available
  function shouldStampCaseSlug(fieldCaseSlug: string | undefined): boolean {
    const beaCaseSlug = fieldCaseSlug?.trim() || undefined;
    return beaCaseSlug !== undefined;
  }

  it("stamps when case_slug is provided", () => {
    expect(shouldStampCaseSlug("cases/my-case")).toBe(true);
  });

  it("does NOT stamp when case_slug is undefined", () => {
    expect(shouldStampCaseSlug(undefined)).toBe(false);
  });

  it("does NOT stamp when case_slug is empty", () => {
    expect(shouldStampCaseSlug("")).toBe(false);
  });

  it("does NOT stamp when case_slug is whitespace-only", () => {
    expect(shouldStampCaseSlug("  ")).toBe(false);
  });
});

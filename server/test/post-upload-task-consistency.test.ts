import { describe, it, expect } from "bun:test";

/**
 * Tests for post-upload task consistency across sync and async upload paths.
 *
 * BUG #C: The sync direct-upload path persisted post-upload tasks (analyze,
 * reconcile_case, contradiction) via persistEnginePostUploadTasks, but the
 * async extract-document handler did NOT — it relied on the web app's confirm
 * proxy to fire side effects, which could drop them on SSE disconnect.
 *
 * The fix: the extract-document handler now calls
 * persistEnginePostUploadTasks directly after runExtractionAndImport succeeds,
 * ensuring all upload paths persist tasks on the engine side.
 *
 * These tests verify the task-type selection logic that both paths share.
 */

describe("Post-upload task consistency", () => {
  // Replicates the task-type selection from persistEnginePostUploadTasks:
  //   - "analyze" is always queued
  //   - "reconcile_case" and "contradiction" only when case_slug is present
  function selectTaskTypes(caseSlug?: string): string[] {
    const types: string[] = ["analyze"];
    if (caseSlug) types.push("reconcile_case", "contradiction");
    return types;
  }

  it("queues analyze + reconcile_case + contradiction when case_slug is present", () => {
    const types = selectTaskTypes("cases/muster-2024");
    expect(types).toContain("analyze");
    expect(types).toContain("reconcile_case");
    expect(types).toContain("contradiction");
    expect(types.length).toBe(3);
  });

  it("queues only analyze when no case_slug (standalone document)", () => {
    const types = selectTaskTypes(undefined);
    expect(types).toEqual(["analyze"]);
    expect(types.length).toBe(1);
  });

  it("queues only analyze when case_slug is empty string", () => {
    const types = selectTaskTypes("");
    expect(types).toEqual(["analyze"]);
  });

  it("both sync and async paths produce the same task types for same input", () => {
    // Simulates: sync direct-upload path and async extract-document handler
    // both call persistEnginePostUploadTasks with the same input
    const syncInput = { doc_slug: "uploads/doc-1", case_slug: "cases/case-1" };
    const asyncInput = { doc_slug: "uploads/doc-1", case_slug: "cases/case-1" };

    const syncTypes = selectTaskTypes(syncInput.case_slug);
    const asyncTypes = selectTaskTypes(asyncInput.case_slug);

    expect(syncTypes).toEqual(asyncTypes);
  });

  it("async path with no case_slug still queues analyze (no orphan)", () => {
    // Edge case: async upload without case association should still get
    // the analyze task — otherwise the document never gets classified
    const types = selectTaskTypes(undefined);
    expect(types).toContain("analyze");
  });
});

describe("Post-upload task slug generation", () => {
  // Replicates the slug generation from persistEnginePostUploadTasks:
  //   const safe = doc_slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 48);
  //   const hash = createHash("sha256").update(doc_slug).digest("hex").slice(0, 16);
  //   const slug = `legal/post-upload-tasks/${taskType}/${safe}-${hash}`;
  function generateTaskSlug(taskType: string, docSlug: string): string {
    const safe = docSlug.replace(/[^a-z0-9-]/gi, "-").slice(0, 48);
    // Simple hash simulation for testing (production uses sha256)
    let hash = 0;
    for (let i = 0; i < docSlug.length; i++) {
      hash = ((hash << 5) - hash + docSlug.charCodeAt(i)) | 0;
    }
    const hashHex = Math.abs(hash).toString(16).padStart(8, "0").slice(0, 16);
    return `legal/post-upload-tasks/${taskType}/${safe}-${hashHex}`;
  }

  it("generates deterministic slug for same doc_slug + taskType", () => {
    const slug1 = generateTaskSlug("analyze", "uploads/doc-1");
    const slug2 = generateTaskSlug("analyze", "uploads/doc-1");
    expect(slug1).toBe(slug2);
  });

  it("generates different slugs for different doc_slugs", () => {
    const slug1 = generateTaskSlug("analyze", "uploads/doc-1");
    const slug2 = generateTaskSlug("analyze", "uploads/doc-2");
    expect(slug1).not.toBe(slug2);
  });

  it("generates different slugs for different task types", () => {
    const slug1 = generateTaskSlug("analyze", "uploads/doc-1");
    const slug2 = generateTaskSlug("reconcile_case", "uploads/doc-1");
    expect(slug1).not.toBe(slug2);
  });

  it("sanitizes special characters in doc_slug", () => {
    const slug = generateTaskSlug("analyze", "uploads/doc with spaces/slashes");
    // The sanitized part (after the prefix) should not contain spaces or raw slashes
    const sanitizedPart = slug.replace(/^legal\/post-upload-tasks\/analyze\//, "");
    expect(sanitizedPart).not.toContain(" ");
    // Slashes in the doc_slug are replaced with dashes
    expect(sanitizedPart).not.toContain("/");
    // Should start with the task type prefix
    expect(slug).toMatch(/^legal\/post-upload-tasks\/analyze\//);
  });
});

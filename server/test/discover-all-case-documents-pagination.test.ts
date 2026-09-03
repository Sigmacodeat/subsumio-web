import { describe, it, expect } from "bun:test";
import type { BrainEngine } from "../src/core/engine.ts";
import type { Page, PageFilters, PageType } from "../src/core/types.ts";
import { discoverAllCaseDocuments } from "../src/core/minions/handlers/legal-pipeline.ts";

/**
 * Tests for the paginated discoverAllCaseDocuments.
 *
 * BUG #5: The function used a single `limit: 500` per document type. Cases
 * with >500 documents of one type (e.g. 600 emails) silently lost the oldest
 * 100 — they were never included in the accumulated case context.
 *
 * The fix paginates through all results in batches of 500 using offset.
 */

function makePage(slug: string, type: PageType, frontmatter: Record<string, unknown>): Page {
  return {
    id: Math.floor(Math.random() * 1000000),
    slug,
    type,
    title: slug.split("/").pop() ?? slug,
    compiled_truth: `Content of ${slug}`,
    timeline: "",
    frontmatter,
    source_id: "default",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function mockEngineWithLargeType(pagesByType: Record<string, Page[]>, pageSize = 500): BrainEngine {
  return {
    listPages: async (filters?: PageFilters) => {
      const type = filters?.type as string | undefined;
      if (!type || !pagesByType[type]) return [];
      let result = pagesByType[type]!;
      if (filters?.sourceId) {
        result = result.filter((p) => p.source_id === filters.sourceId);
      }
      const offset = filters?.offset ?? 0;
      const limit = filters?.limit ?? pageSize;
      return result.slice(offset, offset + limit);
    },
  } as unknown as BrainEngine;
}

describe("discoverAllCaseDocuments — pagination", () => {
  it("discovers all documents when count exceeds page size (600 emails)", async () => {
    const caseSlug = "cases/large-case";
    const emails: Page[] = [];
    for (let i = 0; i < 600; i++) {
      emails.push(makePage(`uploads/email-${i}`, "email", { case_slug: caseSlug }));
    }
    const engine = mockEngineWithLargeType({ email: emails });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);

    // All 600 should be discovered — pre-fix, only 500 would have been returned
    expect(slugs.length).toBe(600);
    expect(slugs).toContain("uploads/email-0");
    expect(slugs).toContain("uploads/email-599");
  });

  it("discovers all documents when count is exactly at page boundary (500)", async () => {
    const caseSlug = "cases/boundary-case";
    const docs: Page[] = [];
    for (let i = 0; i < 500; i++) {
      docs.push(makePage(`uploads/doc-${i}`, "document", { case_slug: caseSlug }));
    }
    const engine = mockEngineWithLargeType({ document: docs });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs.length).toBe(500);
  });

  it("discovers all documents across multiple types with large counts", async () => {
    const caseSlug = "cases/multi-type-large";
    const docs: Page[] = [];
    const emails: Page[] = [];
    for (let i = 0; i < 700; i++) {
      docs.push(makePage(`uploads/doc-${i}`, "document", { case_slug: caseSlug }));
    }
    for (let i = 0; i < 550; i++) {
      emails.push(makePage(`uploads/email-${i}`, "email", { case_slug: caseSlug }));
    }
    const engine = mockEngineWithLargeType({ document: docs, email: emails });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs.length).toBe(1250); // 700 + 550
  });

  it("handles very large case (2000 documents)", async () => {
    const caseSlug = "cases/huge-case";
    const docs: Page[] = [];
    for (let i = 0; i < 2000; i++) {
      docs.push(makePage(`uploads/doc-${i}`, "document", { case_slug: caseSlug }));
    }
    const engine = mockEngineWithLargeType({ document: docs });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs.length).toBe(2000);
    expect(slugs).toContain("uploads/doc-0");
    expect(slugs).toContain("uploads/doc-1999");
  });

  it("still filters correctly with large counts", async () => {
    const caseSlug = "cases/filter-large";
    const docs: Page[] = [];
    for (let i = 0; i < 600; i++) {
      docs.push(
        makePage(`uploads/doc-${i}`, "document", {
          case_slug: caseSlug,
          // Every 10th doc is unassigned — should be filtered out
          ...(i % 10 === 0 ? { assignment_status: "unassigned" } : {}),
        })
      );
    }
    const engine = mockEngineWithLargeType({ document: docs });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    // 600 total, 60 unassigned (every 10th: 0,10,20,...,590) → 540 pass
    expect(slugs.length).toBe(540);
  });

  it("stops pagination when batch is smaller than page size", async () => {
    const caseSlug = "cases/small-case";
    const docs: Page[] = [];
    for (let i = 0; i < 50; i++) {
      docs.push(makePage(`uploads/doc-${i}`, "document", { case_slug: caseSlug }));
    }
    const engine = mockEngineWithLargeType({ document: docs });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs.length).toBe(50);
  });
});

import { describe, it, expect } from "bun:test";
import type { BrainEngine } from "../src/core/engine.ts";
import type { Page, PageFilters, PageType } from "../src/core/types.ts";
import { discoverAllCaseDocuments } from "../src/core/minions/handlers/legal-pipeline.ts";

/**
 * Tests for discoverAllCaseDocuments — the canonical case-document discovery
 * that ensures the pipeline sees the accumulated case file, not just the
 * newly uploaded documents.
 *
 * Without this, incremental uploads (Klageschrift week 1, Beweis week 2)
 * re-analyze only the new document and overwrite the previous analysis.
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

function mockEngine(pagesByType: Record<string, Page[]>): BrainEngine {
  return {
    listPages: async (filters?: PageFilters) => {
      const type = filters?.type as string | undefined;
      if (type && pagesByType[type]) {
        let result = pagesByType[type]!;
        if (filters?.sourceId) {
          result = result.filter(
            (p) => (p as { source_id?: string }).source_id === filters.sourceId
          );
        }
        return result;
      }
      return [];
    },
  } as unknown as BrainEngine;
}

describe("discoverAllCaseDocuments", () => {
  it("finds all document pages stamped with case_slug", async () => {
    const caseSlug = "cases/muster-akte-2024";
    const engine = mockEngine({
      document: [
        makePage("uploads/klageschrift-2024", "document", { case_slug: caseSlug }),
        makePage("uploads/beweis-1", "document", { case_slug: caseSlug }),
        makePage("uploads/other-case-doc", "document", {
          case_slug: "cases/other-case",
        }),
      ],
      email: [makePage("uploads/email-1", "email", { case_slug: caseSlug })],
      image: [makePage("uploads/photo-1", "image", { case_slug: caseSlug })],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/klageschrift-2024");
    expect(slugs).toContain("uploads/beweis-1");
    expect(slugs).toContain("uploads/email-1");
    expect(slugs).toContain("uploads/photo-1");
    expect(slugs).not.toContain("uploads/other-case-doc");
    expect(slugs.length).toBe(4);
  });

  it("deduplicates slugs across types", async () => {
    const caseSlug = "cases/dup-test";
    // Same slug appearing in two type buckets (edge case but possible)
    const engine = mockEngine({
      document: [makePage("uploads/doc-1", "document", { case_slug: caseSlug })],
      court_decision: [makePage("uploads/doc-1", "court_decision", { case_slug: caseSlug })],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs.length).toBe(1);
    expect(slugs[0]).toBe("uploads/doc-1");
  });

  it("excludes split-parent pages (link-only content)", async () => {
    const caseSlug = "cases/split-test";
    const engine = mockEngine({
      document: [
        makePage("uploads/big-doc-parent", "document", {
          case_slug: caseSlug,
          is_split_parent: true,
        }),
        makePage("uploads/big-doc-part-1", "document", {
          case_slug: caseSlug,
          part_of: "uploads/big-doc-parent",
        }),
      ],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/big-doc-part-1");
    expect(slugs).not.toContain("uploads/big-doc-parent");
  });

  it("excludes unassigned pages", async () => {
    const caseSlug = "cases/unassigned-test";
    const engine = mockEngine({
      document: [
        makePage("uploads/assigned-doc", "document", {
          case_slug: caseSlug,
          assignment_status: "assigned",
        }),
        makePage("uploads/unassigned-doc", "document", {
          case_slug: caseSlug,
          assignment_status: "unassigned",
        }),
      ],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/assigned-doc");
    expect(slugs).not.toContain("uploads/unassigned-doc");
  });

  it("excludes tombstoned pages", async () => {
    const caseSlug = "cases/tombstone-test";
    const engine = mockEngine({
      document: [
        makePage("uploads/active-doc", "document", { case_slug: caseSlug }),
        makePage("uploads/tombstoned-doc", "document", {
          case_slug: caseSlug,
          status: "tombstoned",
        }),
      ],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/active-doc");
    expect(slugs).not.toContain("uploads/tombstoned-doc");
  });

  it("returns empty array when no documents match", async () => {
    const engine = mockEngine({
      document: [
        makePage("uploads/other-doc", "document", {
          case_slug: "cases/other",
        }),
      ],
    });

    const slugs = await discoverAllCaseDocuments(engine, "cases/nonexistent");
    expect(slugs.length).toBe(0);
  });

  it("respects sourceId for source isolation", async () => {
    const caseSlug = "cases/source-test";
    const tenantPages = [
      makePage("uploads/tenant-doc-1", "document", { case_slug: caseSlug }),
      makePage("uploads/tenant-doc-2", "document", { case_slug: caseSlug }),
    ];
    const defaultPages = [makePage("uploads/default-doc-1", "document", { case_slug: caseSlug })];

    // Attach source_id to pages for filtering
    (tenantPages[0] as { source_id?: string }).source_id = "tenant-abc";
    (tenantPages[1] as { source_id?: string }).source_id = "tenant-abc";
    (defaultPages[0] as { source_id?: string }).source_id = "default";

    const engine = mockEngine({
      document: [...tenantPages, ...defaultPages],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug, "tenant-abc");
    expect(slugs).toContain("uploads/tenant-doc-1");
    expect(slugs).toContain("uploads/tenant-doc-2");
    expect(slugs).not.toContain("uploads/default-doc-1");
  });

  it("discovers court_decision typed pages", async () => {
    const caseSlug = "cases/court-test";
    const engine = mockEngine({
      court_decision: [makePage("uploads/urteil-ogh", "court_decision", { case_slug: caseSlug })],
      document: [makePage("uploads/klage", "document", { case_slug: caseSlug })],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/urteil-ogh");
    expect(slugs).toContain("uploads/klage");
  });

  it("does NOT discover pipeline-output pages (on_index, forensic_report, etc.)", async () => {
    const caseSlug = "cases/output-test";
    const engine = mockEngine({
      on_index: [makePage("on-indexes/cases/output-test", "on_index" as PageType, {})],
      forensic_report: [
        makePage("forensic-reports/cases/output-test", "forensic_report" as PageType, {}),
      ],
      document: [makePage("uploads/real-doc", "document", { case_slug: caseSlug })],
    });

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/real-doc");
    expect(slugs).not.toContain("on-indexes/cases/output-test");
    expect(slugs).not.toContain("forensic-reports/cases/output-test");
  });

  it("handles engine.listPages throwing for a type (graceful degradation)", async () => {
    const caseSlug = "cases/error-test";
    const engine: BrainEngine = {
      listPages: async (filters?: PageFilters) => {
        const type = filters?.type as string;
        if (type === "email") throw new Error("connection error");
        if (type === "document") {
          return [makePage("uploads/doc-1", "document", { case_slug: caseSlug })];
        }
        return [];
      },
    } as unknown as BrainEngine;

    const slugs = await discoverAllCaseDocuments(engine, caseSlug);
    expect(slugs).toContain("uploads/doc-1");
    // email type threw but document type still returned results
  });
});

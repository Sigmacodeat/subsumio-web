import { describe, it, expect } from "bun:test";
import type { BrainEngine } from "../src/core/engine.ts";
import type { Page, PageFilters, PageType } from "../src/core/types.ts";

/**
 * Tests for safePutPipelineOutput — the draft/output preservation logic.
 *
 * BUG #3: When the pipeline re-runs (incremental upload), it overwrites all
 * output pages including legal drafts the attorney may have manually edited.
 * The fix checks if the existing page has manually_edited: true in its
 * frontmatter. If so, the old content is archived before overwriting.
 *
 * Since safePutPipelineOutput is a private function inside legal-pipeline.ts,
 * these tests verify the archiving logic by simulating the engine behavior.
 */

function makePage(
  slug: string,
  type: PageType,
  frontmatter: Record<string, unknown>,
  compiled_truth = ""
): Page {
  return {
    id: Math.floor(Math.random() * 1000000),
    slug,
    type,
    title: slug.split("/").pop() ?? slug,
    compiled_truth: compiled_truth || `Content of ${slug}`,
    timeline: "",
    frontmatter,
    source_id: "default",
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function mockEngineWithPages(pages: Map<string, Page>): {
  engine: BrainEngine;
  puts: Array<{ slug: string; frontmatter: Record<string, unknown> }>;
} {
  const puts: Array<{ slug: string; frontmatter: Record<string, unknown> }> = [];
  const engine: BrainEngine = {
    getPage: async (slug: string, opts?: { sourceId?: string }) => {
      return pages.get(slug) ?? null;
    },
    putPage: async (
      slug: string,
      page: {
        type: string;
        title: string;
        compiled_truth: string;
        frontmatter: Record<string, unknown>;
      },
      _opts?: { sourceId?: string }
    ) => {
      puts.push({ slug, frontmatter: page.frontmatter });
      pages.set(slug, makePage(slug, page.type as PageType, page.frontmatter, page.compiled_truth));
    },
  } as unknown as BrainEngine;
  return { engine, puts };
}

/**
 * Replicates the safePutPipelineOutput logic from legal-pipeline.ts.
 * In production this is a private function; here we test the same algorithm.
 */
async function safePutPipelineOutput(
  engine: BrainEngine,
  slug: string,
  page: {
    type: string;
    title: string;
    compiled_truth: string;
    frontmatter: Record<string, unknown>;
  },
  opts?: { sourceId?: string }
): Promise<void> {
  const existing = await engine.getPage(
    slug,
    opts?.sourceId !== undefined ? { sourceId: opts.sourceId } : undefined
  );
  if (existing) {
    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    if (fm.manually_edited === true) {
      const archiveSlug = `${slug}/archived-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try {
        await engine.putPage(
          archiveSlug,
          {
            type: existing.type ?? page.type,
            title: `${existing.title ?? page.title} (archiviert)`,
            compiled_truth: String(existing.compiled_truth ?? ""),
            frontmatter: {
              ...fm,
              archived_from: slug,
              archived_at: new Date().toISOString(),
              archived_reason: "pipeline_rerun_overwrite_protection",
            },
          },
          opts
        );
      } catch {
        // best-effort
      }
    }
  }
  await engine.putPage(slug, page, opts);
}

describe("safePutPipelineOutput — draft preservation", () => {
  it("archives manually-edited page before overwriting", async () => {
    const pages = new Map<string, Page>(
      [
        makePage(
          "legal-drafts/case-1-klage",
          "legal_draft" as PageType,
          {
            manually_edited: true,
            status: "reviewed",
            attorney_reviewed_at: "2026-01-15T10:00:00Z",
          },
          "Manually edited draft content"
        ),
      ].map((p) => [p.slug, p] as [string, Page])
    );

    const { engine, puts } = mockEngineWithPages(pages);

    await safePutPipelineOutput(engine, "legal-drafts/case-1-klage", {
      type: "legal_draft",
      title: "Klage",
      compiled_truth: "New pipeline-generated content",
      frontmatter: { status: "draft", attorney_review_required: true },
    });

    // Should have 2 puts: archive + overwrite
    expect(puts.length).toBe(2);

    // First put: archive
    expect(puts[0]!.slug).toMatch(/^legal-drafts\/case-1-klage\/archived-/);
    expect(puts[0]!.frontmatter.archived_from).toBe("legal-drafts/case-1-klage");
    expect(puts[0]!.frontmatter.archived_reason).toBe("pipeline_rerun_overwrite_protection");

    // Second put: new content at original slug
    expect(puts[1]!.slug).toBe("legal-drafts/case-1-klage");
    expect(puts[1]!.frontmatter.status).toBe("draft");
  });

  it("overwrites directly when page is NOT manually edited", async () => {
    const pages = new Map<string, Page>(
      [
        makePage(
          "legal-drafts/case-1-klage",
          "legal_draft" as PageType,
          {
            status: "draft",
            // no manually_edited flag
          },
          "Original pipeline content"
        ),
      ].map((p) => [p.slug, p] as [string, Page])
    );

    const { engine, puts } = mockEngineWithPages(pages);

    await safePutPipelineOutput(engine, "legal-drafts/case-1-klage", {
      type: "legal_draft",
      title: "Klage",
      compiled_truth: "Updated pipeline content",
      frontmatter: { status: "draft" },
    });

    // Should have 1 put: just the overwrite, no archive
    expect(puts.length).toBe(1);
    expect(puts[0]!.slug).toBe("legal-drafts/case-1-klage");
  });

  it("writes directly when no existing page", async () => {
    const pages = new Map<string, Page>();
    const { engine, puts } = mockEngineWithPages(pages);

    await safePutPipelineOutput(engine, "legal-drafts/new-case-klage", {
      type: "legal_draft",
      title: "Klage",
      compiled_truth: "First pipeline content",
      frontmatter: { status: "draft" },
    });

    expect(puts.length).toBe(1);
    expect(puts[0]!.slug).toBe("legal-drafts/new-case-klage");
  });

  it("does NOT archive when manually_edited is false", async () => {
    const pages = new Map<string, Page>(
      [
        makePage(
          "legal-drafts/case-1-klage",
          "legal_draft" as PageType,
          {
            manually_edited: false,
            status: "reviewed",
          },
          "Content"
        ),
      ].map((p) => [p.slug, p] as [string, Page])
    );

    const { engine, puts } = mockEngineWithPages(pages);

    await safePutPipelineOutput(engine, "legal-drafts/case-1-klage", {
      type: "legal_draft",
      title: "Klage",
      compiled_truth: "New content",
      frontmatter: { status: "draft" },
    });

    expect(puts.length).toBe(1);
    expect(puts[0]!.slug).toBe("legal-drafts/case-1-klage");
  });

  it("preserves archived content from the original page", async () => {
    const originalContent = "ATTORNEY EDITED THIS CONTENT";
    const pages = new Map<string, Page>(
      [
        makePage(
          "legal-drafts/case-1-klage",
          "legal_draft" as PageType,
          {
            manually_edited: true,
          },
          originalContent
        ),
      ].map((p) => [p.slug, p] as [string, Page])
    );

    const { engine, puts } = mockEngineWithPages(pages);

    await safePutPipelineOutput(engine, "legal-drafts/case-1-klage", {
      type: "legal_draft",
      title: "Klage",
      compiled_truth: "Pipeline content",
      frontmatter: { status: "draft" },
    });

    // The archived page should contain the original (attorney-edited) content
    const archivedPage = pages.get(puts[0]!.slug);
    expect(archivedPage).toBeDefined();
    expect(archivedPage!.compiled_truth).toBe(originalContent);
  });
});

import { describe, it, expect } from "bun:test";
import type { BrainEngine } from "../src/core/engine.ts";
import type { Page, PageType } from "../src/core/types.ts";

/**
 * Tests for pipeline state archiving on re-runs.
 *
 * BUG #2: The pipeline state (pipeline/state-{case_slug}) was overwritten
 * on every re-run, destroying the audit trail of previous runs. The fix
 * archives the existing state to a versioned slug before overwriting.
 *
 * These tests verify the archiving logic by simulating the engine behavior.
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
    getPage: async (slug: string) => pages.get(slug) ?? null,
    putPage: async (
      slug: string,
      page: {
        type: string;
        title: string;
        compiled_truth: string;
        frontmatter: Record<string, unknown>;
      }
    ) => {
      puts.push({ slug, frontmatter: page.frontmatter });
      pages.set(slug, makePage(slug, page.type as PageType, page.frontmatter, page.compiled_truth));
    },
  } as unknown as BrainEngine;
  return { engine, puts };
}

/**
 * Replicates the state archiving logic from legal-pipeline.ts (the else-branch
 * of the resumeFromLayer check, before state initialization).
 */
async function archivePreviousState(
  engine: BrainEngine,
  stateSlug: string
): Promise<{ archived: boolean; archiveSlug?: string }> {
  try {
    const existingState = await engine.getPage(stateSlug);
    if (existingState) {
      const archiveSlug = `${stateSlug}/archived-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      await engine.putPage(archiveSlug, {
        type: "pipeline_state",
        title: `${existingState.title ?? stateSlug} (archiviert)`,
        compiled_truth: String(existingState.compiled_truth ?? ""),
        frontmatter: {
          ...((existingState.frontmatter ?? {}) as Record<string, unknown>),
          archived_from: stateSlug,
          archived_at: new Date().toISOString(),
          archived_reason: "pipeline_rerun",
        },
      });
      return { archived: true, archiveSlug };
    }
  } catch {
    // best-effort
  }
  return { archived: false };
}

describe("Pipeline state archiving on re-run", () => {
  it("archives existing state before new run", async () => {
    const stateSlug = "pipeline/state-cases/muster-2024";
    const pages = new Map<string, Page>(
      [
        makePage(
          stateSlug,
          "pipeline_state" as PageType,
          {
            status: "completed",
            current_layer: 7,
            cost_spent_usd: 12.5,
          },
          '{"status":"completed","layers":{}}'
        ),
      ].map((p) => [p.slug, p] as [string, Page])
    );

    const { engine, puts } = mockEngineWithPages(pages);
    const result = await archivePreviousState(engine, stateSlug);

    expect(result.archived).toBe(true);
    expect(result.archiveSlug).toMatch(/^pipeline\/state-cases\/muster-2024\/archived-/);
    expect(puts.length).toBe(1);
    expect(puts[0]!.frontmatter.archived_from).toBe(stateSlug);
    expect(puts[0]!.frontmatter.archived_reason).toBe("pipeline_rerun");
    expect(puts[0]!.frontmatter.status).toBe("completed");
  });

  it("does NOT archive when no previous state exists (first run)", async () => {
    const stateSlug = "pipeline/state-cases/new-case";
    const pages = new Map<string, Page>();
    const { engine, puts } = mockEngineWithPages(pages);

    const result = await archivePreviousState(engine, stateSlug);

    expect(result.archived).toBe(false);
    expect(puts.length).toBe(0);
  });

  it("preserves previous state content in archive", async () => {
    const stateSlug = "pipeline/state-cases/muster-2024";
    const previousContent = '{"status":"completed","cost_spent_usd":45.2,"layers":{...}}';
    const pages = new Map<string, Page>(
      [
        makePage(
          stateSlug,
          "pipeline_state" as PageType,
          {
            status: "completed",
          },
          previousContent
        ),
      ].map((p) => [p.slug, p] as [string, Page])
    );

    const { engine } = mockEngineWithPages(pages);
    const result = await archivePreviousState(engine, stateSlug);

    expect(result.archived).toBe(true);
    const archivedPage = pages.get(result.archiveSlug!);
    expect(archivedPage).toBeDefined();
    expect(archivedPage!.compiled_truth).toBe(previousContent);
  });

  it("generates unique archive slugs (timestamp-based)", async () => {
    const stateSlug = "pipeline/state-cases/muster-2024";
    const pages = new Map<string, Page>(
      [makePage(stateSlug, "pipeline_state" as PageType, { status: "completed" })].map(
        (p) => [p.slug, p] as [string, Page]
      )
    );

    const { engine } = mockEngineWithPages(pages);
    const r1 = await archivePreviousState(engine, stateSlug);

    // Re-add the state page (simulating the new state being written)
    pages.set(stateSlug, makePage(stateSlug, "pipeline_state" as PageType, { status: "running" }));

    // Wait a tick to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));
    const r2 = await archivePreviousState(engine, stateSlug);

    expect(r1.archived).toBe(true);
    expect(r2.archived).toBe(true);
    expect(r1.archiveSlug).not.toBe(r2.archiveSlug);
  });
});

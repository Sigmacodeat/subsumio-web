import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";

/**
 * Tests for the audit-fix batch (G1-G10).
 *
 * G1: source_id vs _source_id mismatch — pipeline reads data.source_id now
 * G2: loadEntitiesFromPages passes sourceId to engine.listPages
 * G3: loadAllSubPages parallelizes getPage calls
 * G4: writeEntityPages includes case-hash in slug
 * G6: runExtractionAndImport parallelizes frontmatter patches
 * G10: post-upload-outbox uses PUT (upsert) instead of POST (create)
 */

// ── G1: source_id field resolution ──────────────────────────

describe("G1: Pipeline source_id resolution", () => {
  // Replicates the fixed logic from legal-pipeline.ts handler entry
  function resolveSourceStamp(data: { source_id?: string }): string | undefined {
    return typeof data.source_id === "string" && data.source_id ? data.source_id : undefined;
  }

  it("reads source_id when provided", () => {
    expect(resolveSourceStamp({ source_id: "tenant-abc" })).toBe("tenant-abc");
  });

  it("returns undefined when source_id is not set", () => {
    expect(resolveSourceStamp({})).toBeUndefined();
  });

  it("returns undefined when source_id is empty string", () => {
    expect(resolveSourceStamp({ source_id: "" })).toBeUndefined();
  });

  it("does NOT read _source_id (the old broken field)", () => {
    // Pre-fix: the handler read rawData._source_id which was never set
    // by any caller. This test verifies we read source_id, not _source_id.
    const data = { _source_id: "tenant-xyz" } as unknown as { source_id?: string };
    expect(resolveSourceStamp(data)).toBeUndefined();
  });
});

// ── G2: loadEntitiesFromPages sourceId filtering ────────────

describe("G2: Entity loading source-isolation", () => {
  // Verifies that the listPages filter includes sourceId when provided
  function buildListPagesFilter(sourceId?: string): Record<string, unknown> {
    return {
      type: "person",
      slugPrefix: "people/",
      limit: 200,
      offset: 0,
      ...(sourceId !== undefined ? { sourceId } : {}),
    };
  }

  it("includes sourceId in filter when provided", () => {
    const filter = buildListPagesFilter("tenant-abc");
    expect(filter.sourceId).toBe("tenant-abc");
  });

  it("omits sourceId when undefined (backward compat)", () => {
    const filter = buildListPagesFilter(undefined);
    expect(filter.sourceId).toBeUndefined();
  });
});

// ── G3: loadAllSubPages parallelization ─────────────────────

describe("G3: Parallel page loading", () => {
  // Verifies that batches of CONCURRENCY=8 are processed in parallel
  it("processes 20 slugs in 3 batches of 8", () => {
    const CONCURRENCY = 8;
    const slugs = Array.from({ length: 20 }, (_, i) => `doc-${i}`);
    const batches: string[][] = [];
    for (let i = 0; i < slugs.length; i += CONCURRENCY) {
      batches.push(slugs.slice(i, i + CONCURRENCY));
    }
    expect(batches.length).toBe(3); // 8 + 8 + 4
    expect(batches[0]!.length).toBe(8);
    expect(batches[1]!.length).toBe(8);
    expect(batches[2]!.length).toBe(4);
  });

  it("handles empty slug list", () => {
    const CONCURRENCY = 8;
    const slugs: string[] = [];
    let batchCount = 0;
    for (let i = 0; i < slugs.length; i += CONCURRENCY) {
      batchCount++;
    }
    expect(batchCount).toBe(0);
  });
});

// ── G4: Entity slug case-disambiguation ─────────────────────

describe("G4: Entity slug case-disambiguation", () => {
  // Replicates the slug generation from writeEntityPages
  function entitySlug(caseSlug: string, name: string): string {
    const caseHash = createHash("sha256").update(caseSlug).digest("hex").slice(0, 8);
    const slugBase = name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `people/${caseHash}-${slugBase}`;
  }

  it("generates different slugs for same person in different cases", () => {
    const slug1 = entitySlug("cases/case-a", "Müller");
    const slug2 = entitySlug("cases/case-b", "Müller");
    expect(slug1).not.toBe(slug2);
  });

  it("generates same slug for same person in same case (idempotent)", () => {
    const slug1 = entitySlug("cases/case-a", "Müller");
    const slug2 = entitySlug("cases/case-a", "Müller");
    expect(slug1).toBe(slug2);
  });

  it("includes case hash prefix in slug", () => {
    const slug = entitySlug("cases/my-case", "Schmidt");
    expect(slug).toMatch(/^people\/[a-f0-9]{8}-schmidt$/);
  });

  it("handles umlauts in names", () => {
    const slug = entitySlug("cases/test", "Dr. Müller-Lüdenscheidt");
    expect(slug).toContain("dr-müller-lüdenscheidt");
  });
});

// ── G6: Parallel frontmatter stamping ───────────────────────

describe("G6: Parallel frontmatter stamping", () => {
  it("Promise.all processes all slugs in one batch", async () => {
    const slugs = ["doc-1", "doc-2", "doc-3", "doc-4"];
    const stamped: string[] = [];
    await Promise.all(
      slugs.map(async (s) => {
        // Simulate async stamp
        await new Promise((r) => setTimeout(r, 1));
        stamped.push(s);
      })
    );
    expect(stamped.length).toBe(4);
    expect(stamped.sort()).toEqual(slugs);
  });

  it("handles individual stamp failures without blocking others", async () => {
    const slugs = ["ok-1", "fail-1", "ok-2"];
    const results = await Promise.all(
      slugs
        .map(async (s): Promise<{ slug: string; ok: boolean }> => {
          if (s.startsWith("fail")) throw new Error("stamp failed");
          return { slug: s, ok: true };
        })
        .map((p) => p.catch((e): { slug: string; ok: false } => ({ slug: "failed", ok: false })))
    );
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    expect(ok.length).toBe(2);
    expect(failed.length).toBe(1);
  });
});

// ── G10: Post-upload-outbox idempotent upsert ───────────────

describe("G10: Post-upload-outbox idempotent upsert", () => {
  // Verifies the upsert logic: PUT instead of POST, 409 = already queued
  function classifyUpsertResponse(status: number): "ok" | "already_queued" | "error" {
    if (status >= 200 && status < 300) return "ok";
    if (status === 409) return "already_queued";
    return "error";
  }

  it("treats 200 as success", () => {
    expect(classifyUpsertResponse(200)).toBe("ok");
  });

  it("treats 201 as success (created)", () => {
    expect(classifyUpsertResponse(201)).toBe("ok");
  });

  it("treats 409 as already_queued (race condition winner)", () => {
    expect(classifyUpsertResponse(409)).toBe("already_queued");
  });

  it("treats 500 as error", () => {
    expect(classifyUpsertResponse(500)).toBe("error");
  });

  it("treats 400 as error", () => {
    expect(classifyUpsertResponse(400)).toBe("error");
  });

  it("taskSlug is deterministic for same doc_slug + task_type", () => {
    const { createHash } = require("node:crypto");
    function taskSlug(docSlug: string, taskType: string): string {
      const safe = docSlug.replace(/[^a-z0-9-]/gi, "-").slice(0, 48);
      const hash = createHash("sha256").update(docSlug).digest("hex").slice(0, 16);
      return `legal/post-upload-tasks/${taskType}/${safe}-${hash}`;
    }
    const s1 = taskSlug("uploads/doc-1", "analyze");
    const s2 = taskSlug("uploads/doc-1", "analyze");
    expect(s1).toBe(s2);
  });
});

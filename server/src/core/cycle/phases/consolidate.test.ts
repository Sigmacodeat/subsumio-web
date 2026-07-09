import { describe, it, expect, vi } from "vitest";
import type { BrainEngine, FactRow } from "../../engine.ts";

const EMBED = new Float32Array([1, 0, 0]);

function makeFact(overrides: Partial<FactRow> = {}): FactRow {
  return {
    id: 1,
    fact: "test fact",
    kind: "event",
    entity_slug: "entities/test",
    visibility: "private",
    notability: "medium",
    valid_from: new Date(Date.now() - 48 * 60 * 60 * 1000),
    valid_until: null,
    expired_at: null,
    superseded_by: null,
    consolidated_at: null,
    consolidated_into: null,
    source: "test",
    source_session: null,
    confidence: 0.8,
    created_at: new Date(),
    activation_strength: 0.5,
    matured_at: null,
    labile_until: null,
    reconsolidation_count: 0,
    last_accessed_at: null,
    embedding: null,
    ...overrides,
  } as unknown as FactRow;
}

function mockEngine(opts: {
  buckets?: Array<{ source_id: string; entity_slug: string; count: number }>;
  facts?: FactRow[];
  pageExists?: boolean;
} = {}): BrainEngine {
  const buckets = opts.buckets ?? [];
  const facts = opts.facts ?? [];
  const pageExists = opts.pageExists ?? true;

  return {
    executeRaw: vi.fn(async (sql: string, params?: unknown[]) => {
      // Bucket query
      if (sql.includes("GROUP BY source_id, entity_slug")) {
        return buckets;
      }
      // Page lookup
      if (sql.includes("SELECT id FROM pages WHERE")) {
        return pageExists ? [{ id: 1 }] : [];
      }
      // Row num max
      if (sql.includes("COALESCE(MAX(row_num)")) {
        return [{ max: 0 }];
      }
      // Existing take lookup
      if (sql.includes("SELECT id FROM takes")) {
        return [];
      }
      // Valid until update
      if (sql.includes("UPDATE facts SET valid_until")) {
        return [];
      }
      // Update takes
      if (sql.includes("UPDATE takes SET")) {
        return [];
      }
      return [];
    }),
    listFactsByEntity: vi.fn(async () => facts),
    addTakesBatch: vi.fn(async () => 1),
    consolidateFact: vi.fn(async () => undefined),
  } as unknown as BrainEngine;
}

describe("runPhaseConsolidate — incremental mode (affectedSlugs)", () => {
  it("filters bucket query to affectedSlugs when set", async () => {
    const buckets = [
      { source_id: "default", entity_slug: "entities/foo", count: 5 },
      { source_id: "default", entity_slug: "entities/bar", count: 3 },
    ];
    const facts = Array.from({ length: 5 }, (_, i) =>
      makeFact({
        id: i + 1,
        entity_slug: "entities/foo",
        embedding: EMBED,
        valid_from: new Date(Date.now() - 48 * 60 * 60 * 1000),
      })
    );
    const engine = mockEngine({ buckets, facts });

    const { runPhaseConsolidate } = await import("./consolidate.ts");
    const result = await runPhaseConsolidate(engine, {
      affectedSlugs: ["entities/foo"],
    });

    expect(result.status).toBe("ok");
    expect(result.details).toMatchObject({
      incremental: true,
      affected_slugs: ["entities/foo"],
    });

    // Verify the bucket query used ANY($1) with the affected slugs
    const calls = (engine.executeRaw as ReturnType<typeof vi.fn>).mock.calls;
    const bucketCall = calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ANY($1)")
    );
    expect(bucketCall).toBeDefined();
    expect(bucketCall![1]).toEqual([["entities/foo"]]);
  });

  it("defaults age gate to 0 in incremental mode", async () => {
    const facts = Array.from({ length: 3 }, (_, i) =>
      makeFact({
        id: i + 1,
        entity_slug: "entities/fresh",
        valid_from: new Date(), // just now — would fail 24h gate
        embedding: EMBED,
      })
    );
    const engine = mockEngine({
      buckets: [{ source_id: "default", entity_slug: "entities/fresh", count: 3 }],
      facts,
    });

    const { runPhaseConsolidate } = await import("./consolidate.ts");
    const result = await runPhaseConsolidate(engine, {
      affectedSlugs: ["entities/fresh"],
    });

    // Should NOT skip due to age — incremental mode has 0 age gate
    expect(result.details).toMatchObject({
      buckets_processed: 1,
      buckets_skipped: 0,
    });
  });

  it("uses 24h age gate in full mode (no affectedSlugs)", async () => {
    const facts = Array.from({ length: 3 }, (_, i) =>
      makeFact({
        id: i + 1,
        entity_slug: "entities/fresh",
        valid_from: new Date(), // just now — should fail 24h gate
        embedding: EMBED,
      })
    );
    const engine = mockEngine({
      buckets: [{ source_id: "default", entity_slug: "entities/fresh", count: 3 }],
      facts,
    });

    const { runPhaseConsolidate } = await import("./consolidate.ts");
    const result = await runPhaseConsolidate(engine, {});

    // Should skip due to age — full mode has 24h gate
    expect(result.details).toMatchObject({
      buckets_skipped: 1,
      buckets_processed: 0,
    });
    expect(result.details).not.toHaveProperty("incremental");
  });

  it("does not use ANY($1) filter in full mode", async () => {
    const engine = mockEngine({ buckets: [] });

    const { runPhaseConsolidate } = await import("./consolidate.ts");
    await runPhaseConsolidate(engine, {});

    const calls = (engine.executeRaw as ReturnType<typeof vi.fn>).mock.calls;
    const anyCall = calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("ANY($1)")
    );
    expect(anyCall).toBeUndefined();
  });

  it("handles empty affectedSlugs array as full mode", async () => {
    const engine = mockEngine({ buckets: [] });

    const { runPhaseConsolidate } = await import("./consolidate.ts");
    const result = await runPhaseConsolidate(engine, { affectedSlugs: [] });

    expect(result.details).not.toHaveProperty("incremental");
  });
});

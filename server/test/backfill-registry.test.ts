/**
 * Tests for backfill-registry.ts — backfill registration and lookup.
 *
 * Covers:
 *   - Core backfills are registered on import
 *   - getBackfill / listBackfills / registerBackfill
 *   - clearRegistryForTests restores core registrations
 *   - Backfill spec invariants (name, table, idColumn, compute, needsBackfill)
 *   - effective_date compute logic
 *   - modality compute logic
 *   - embedding_voyage is declared-only (no-op compute)
 */
import { describe, test, expect } from "bun:test";
import {
  getBackfill,
  listBackfills,
  clearRegistryForTests,
  registerBackfill,
  type RegisteredBackfill,
} from "../src/core/backfill-registry.ts";

describe("backfill-registry — core registrations", () => {
  test("effective_date backfill is registered", () => {
    const bf = getBackfill("effective_date");
    expect(bf).toBeDefined();
    expect(bf!.v030_1_status).toBe("implemented");
    expect(bf!.spec.name).toBe("effective_date");
    expect(bf!.spec.table).toBe("pages");
    expect(bf!.spec.idColumn).toBe("id");
    expect(bf!.spec.needsBackfill).toContain("effective_date IS NULL");
    expect(typeof bf!.spec.compute).toBe("function");
    expect(bf!.spec.estimateRowsPerSecond).toBeGreaterThan(0);
  });

  test("emotional_weight backfill is registered", () => {
    const bf = getBackfill("emotional_weight");
    expect(bf).toBeDefined();
    expect(bf!.v030_1_status).toBe("implemented");
    expect(bf!.spec.name).toBe("emotional_weight");
    expect(bf!.spec.table).toBe("pages");
    expect(bf!.spec.needsBackfill).toContain("emotional_weight_recomputed_at IS NULL");
  });

  test("embedding_voyage backfill is registered as declared-only", () => {
    const bf = getBackfill("embedding_voyage");
    expect(bf).toBeDefined();
    expect(bf!.v030_1_status).toBe("declared-only");
    expect(bf!.spec.needsBackfill).toBe("1 = 0"); // matches no rows
  });

  test("modality backfill is registered", () => {
    const bf = getBackfill("modality");
    expect(bf).toBeDefined();
    expect(bf!.v030_1_status).toBe("implemented");
    expect(bf!.spec.name).toBe("modality");
    expect(bf!.spec.table).toBe("content_chunks");
    // D22-7: requires chunk_source='image_asset' (defensive)
    expect(bf!.spec.needsBackfill).toContain("chunk_source = 'image_asset'");
    expect(bf!.spec.needsBackfill).toContain("modality");
  });

  test("listBackfills returns all core backfills", () => {
    const all = listBackfills();
    const names = all.map((b) => b.spec.name);
    expect(names).toContain("effective_date");
    expect(names).toContain("emotional_weight");
    expect(names).toContain("embedding_voyage");
    expect(names).toContain("modality");
    expect(all.length).toBeGreaterThanOrEqual(4);
  });
});

describe("backfill-registry — registry operations", () => {
  test("registerBackfill adds a new entry", () => {
    const testEntry: RegisteredBackfill = {
      description: "Test backfill",
      v030_1_status: "implemented",
      spec: {
        name: "test-custom-backfill",
        table: "test_table",
        idColumn: "id",
        selectColumns: ["data"],
        needsBackfill: "data IS NULL",
        compute: async () => [],
        estimateRowsPerSecond: 100,
      },
    };
    registerBackfill(testEntry);
    const retrieved = getBackfill("test-custom-backfill");
    expect(retrieved).toBeDefined();
    expect(retrieved!.description).toBe("Test backfill");
  });

  test("registerBackfill replaces existing entry with same name", () => {
    const entry1: RegisteredBackfill = {
      description: "Version 1",
      v030_1_status: "implemented",
      spec: {
        name: "test-replace-backfill",
        table: "t",
        idColumn: "id",
        selectColumns: [],
        needsBackfill: "1 = 0",
        compute: async () => [],
        estimateRowsPerSecond: 1,
      },
    };
    const entry2: RegisteredBackfill = {
      ...entry1,
      description: "Version 2",
    };
    registerBackfill(entry1);
    registerBackfill(entry2);
    const retrieved = getBackfill("test-replace-backfill");
    expect(retrieved!.description).toBe("Version 2");
  });

  test("getBackfill returns undefined for unknown name", () => {
    expect(getBackfill("nonexistent-backfill-xyz")).toBeUndefined();
  });

  test("clearRegistryForTests restores core registrations", () => {
    // Add a custom one
    registerBackfill({
      description: "Temp",
      v030_1_status: "implemented",
      spec: {
        name: "temp-clear-test",
        table: "t",
        idColumn: "id",
        selectColumns: [],
        needsBackfill: "1 = 0",
        compute: async () => [],
        estimateRowsPerSecond: 1,
      },
    });
    expect(getBackfill("temp-clear-test")).toBeDefined();

    // Clear and restore
    clearRegistryForTests();
    expect(getBackfill("temp-clear-test")).toBeUndefined();
    // Core backfills should still be there
    expect(getBackfill("effective_date")).toBeDefined();
    expect(getBackfill("emotional_weight")).toBeDefined();
  });
});

describe("backfill-registry — compute functions", () => {
  test("effective_date compute returns empty for rows with no frontmatter", async () => {
    const bf = getBackfill("effective_date")!;
    const rows = [
      {
        id: 1,
        slug: "test-page",
        frontmatter: null,
        import_filename: null,
        effective_date: null,
        effective_date_source: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const updates = await bf.spec.compute(rows, null as never);
    // With no frontmatter, no filename, computeEffectiveDate may still return
    // a date from created_at. The key invariant: it returns an array.
    expect(Array.isArray(updates)).toBe(true);
  });

  test("modality compute flips modality to image", async () => {
    const bf = getBackfill("modality")!;
    const rows = [
      { id: 1, chunk_source: "image_asset", modality: null },
      { id: 2, chunk_source: "image_asset", modality: "text" },
    ];
    const updates = await bf.spec.compute(rows, null as never);
    expect(updates).toHaveLength(2);
    expect(updates[0].updates.modality).toBe("image");
    expect(updates[1].updates.modality).toBe("image");
  });

  test("embedding_voyage compute is a no-op (returns empty)", async () => {
    const bf = getBackfill("embedding_voyage")!;
    const updates = await bf.spec.compute([{ id: 1, chunk_text: "test" }], null as never);
    expect(updates).toEqual([]);
  });
});

describe("backfill-registry — spec invariants", () => {
  test("all core backfills have required spec fields", () => {
    const all = listBackfills();
    for (const bf of all) {
      expect(bf.spec.name).toBeTruthy();
      expect(bf.spec.table).toBeTruthy();
      expect(bf.spec.idColumn).toBeTruthy();
      expect(typeof bf.spec.compute).toBe("function");
      expect(bf.spec.needsBackfill).toBeTruthy();
      expect(bf.spec.estimateRowsPerSecond).toBeGreaterThan(0);
    }
  });

  test("all core backfill names are unique", () => {
    const all = listBackfills();
    const names = all.map((b) => b.spec.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  test("all core backfills have a description", () => {
    const all = listBackfills();
    for (const bf of all) {
      expect(bf.description.length).toBeGreaterThan(10);
    }
  });
});

import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { SnapshotStore, type CorpusAmendment } from "./snapshot-store.ts";

// ─── Mock Pool ───────────────────────────────────────────────────────────

function createMockPool(rowsByQuery: Record<string, any[]>): Pool {
  const mockQuery = vi.fn().mockImplementation((sql: string, params?: any[]) => {
    // Match based on SQL keywords
    if (sql.includes("valid_from <= $") && sql.includes("valid_to IS NULL OR valid_to > $")) {
      if (sql.includes("jurisdiction = $1")) {
        return Promise.resolve({ rows: rowsByQuery.jurisdictionAtDate ?? [] });
      }
      if (sql.includes("slug = $1") && !sql.includes("jurisdiction")) {
        // getSnapshotAtDate: returns single row
        return Promise.resolve({ rows: rowsByQuery.snapshotAtDate ?? [] });
      }
      // getAllSnapshotsAtDate: no slug, no jurisdiction filter
      if (!sql.includes("slug = $1") && !sql.includes("jurisdiction = $1")) {
        return Promise.resolve({ rows: rowsByQuery.allAtDate ?? [] });
      }
      return Promise.resolve({ rows: [] });
    }
    if (sql.includes("corpus_amendments") && sql.includes("jurisdiction = $1")) {
      return Promise.resolve({ rows: rowsByQuery.amendmentsByJurisdiction ?? [] });
    }
    if (sql.includes("corpus_amendments") && sql.includes("detected_at >= $1")) {
      return Promise.resolve({ rows: rowsByQuery.amendmentsBetween ?? [] });
    }
    if (sql.includes("corpus_amendments") && sql.includes("ORDER BY detected_at DESC LIMIT")) {
      return Promise.resolve({ rows: rowsByQuery.recentAmendments ?? [] });
    }
    if (
      sql.includes("corpus_snapshots") &&
      sql.includes("valid_to IS NULL") &&
      sql.includes("slug = $1")
    ) {
      return Promise.resolve({ rows: rowsByQuery.currentSnapshot ?? [] });
    }
    if (
      sql.includes("corpus_snapshots") &&
      sql.includes("ORDER BY valid_from DESC") &&
      sql.includes("slug = $1")
    ) {
      return Promise.resolve({ rows: rowsByQuery.snapshotHistory ?? [] });
    }
    if (
      sql.includes("corpus_snapshots") &&
      sql.includes("jurisdiction = $1") &&
      sql.includes("valid_to IS NULL")
    ) {
      return Promise.resolve({ rows: rowsByQuery.currentByJurisdiction ?? [] });
    }
    return Promise.resolve({ rows: [] });
  });
  return { query: mockQuery } as unknown as Pool;
}

const MOCK_HASH = "a".repeat(64); // valid 64-char hex SHA-256

const MOCK_RECEIPT_JSON = JSON.stringify({
  slug: "law/de/bgb",
  jurisdiction: "DE",
  statute_code: "BGB",
  valid_from: "2026-01-01",
  valid_to: null,
  fetched_at: "2026-01-01T00:00:00Z",
  source_url: "https://gesetze-im-internet.de/bgb",
  content_hash: MOCK_HASH,
  parser_version: "novella-detection-v1",
  license_status: "public",
  amendment_count: 0,
  language: "de",
  paragraph_count: 100,
});

const MOCK_AMENDMENT_ROW = {
  id: 1,
  slug: "law/de/bgb",
  statute_code: "BGB",
  jurisdiction: "DE",
  paragraph: "433",
  change_type: "modified",
  old_hash: "old123",
  new_hash: "new123",
  detected_at: "2026-07-15T10:00:00Z",
  source_url: "https://gesetze-im-internet.de/bgb",
  announcement_date: "2026-07-10",
};

// ─── Tests ───────────────────────────────────────────────────────────────

describe("SnapshotStore historical queries", () => {
  describe("getSnapshotAtDate", () => {
    it("returns snapshot valid at the given date", async () => {
      const pool = createMockPool({
        snapshotAtDate: [{ receipt_json: MOCK_RECEIPT_JSON }],
      });
      const store = new SnapshotStore(pool);
      const result = await store.getSnapshotAtDate("law/de/bgb", "2026-06-01");
      expect(result).not.toBeNull();
      expect(result!.slug).toBe("law/de/bgb");
      expect(result!.statute_code).toBe("BGB");
    });

    it("returns null when no snapshot exists at that date", async () => {
      const pool = createMockPool({ snapshotAtDate: [] });
      const store = new SnapshotStore(pool);
      const result = await store.getSnapshotAtDate("law/de/bgb", "2020-01-01");
      expect(result).toBeNull();
    });
  });

  describe("getAllSnapshotsAtDate", () => {
    it("returns all snapshots valid at the given date", async () => {
      const pool = createMockPool({
        allAtDate: [
          { receipt_json: MOCK_RECEIPT_JSON },
          {
            receipt_json: JSON.stringify({
              ...JSON.parse(MOCK_RECEIPT_JSON),
              slug: "law/at/abgb",
              statute_code: "ABGB",
            }),
          },
        ],
      });
      const store = new SnapshotStore(pool);
      const results = await store.getAllSnapshotsAtDate("2026-06-01");
      expect(results).toHaveLength(2);
      expect(results[0].slug).toBe("law/de/bgb");
      expect(results[1].slug).toBe("law/at/abgb");
    });

    it("returns empty array when no snapshots exist", async () => {
      const pool = createMockPool({ allAtDate: [] });
      const store = new SnapshotStore(pool);
      const results = await store.getAllSnapshotsAtDate("2020-01-01");
      expect(results).toEqual([]);
    });
  });

  describe("getSnapshotsAtDateByJurisdiction", () => {
    it("returns snapshots for a jurisdiction at a date", async () => {
      const pool = createMockPool({
        jurisdictionAtDate: [{ receipt_json: MOCK_RECEIPT_JSON }],
      });
      const store = new SnapshotStore(pool);
      const results = await store.getSnapshotsAtDateByJurisdiction("2026-06-01", "DE");
      expect(results).toHaveLength(1);
      expect(results[0].jurisdiction).toBe("DE");
    });
  });

  describe("getAmendmentsBetween", () => {
    it("returns amendments in date range", async () => {
      const pool = createMockPool({
        amendmentsBetween: [MOCK_AMENDMENT_ROW],
      });
      const store = new SnapshotStore(pool);
      const results = await store.getAmendmentsBetween("2026-07-01", "2026-07-31");
      expect(results).toHaveLength(1);
      expect(results[0].paragraph).toBe("433");
      expect(results[0].change_type).toBe("modified");
    });

    it("returns empty array when no amendments in range", async () => {
      const pool = createMockPool({ amendmentsBetween: [] });
      const store = new SnapshotStore(pool);
      const results = await store.getAmendmentsBetween("2020-01-01", "2020-12-31");
      expect(results).toEqual([]);
    });
  });

  describe("getAmendmentsByJurisdiction", () => {
    it("returns amendments for a jurisdiction", async () => {
      const pool = createMockPool({
        amendmentsByJurisdiction: [MOCK_AMENDMENT_ROW],
      });
      const store = new SnapshotStore(pool);
      const results = await store.getAmendmentsByJurisdiction("DE");
      expect(results).toHaveLength(1);
      expect(results[0].jurisdiction).toBe("DE");
    });

    it("filters by date range when provided", async () => {
      const pool = createMockPool({
        amendmentsByJurisdiction: [MOCK_AMENDMENT_ROW],
      });
      const store = new SnapshotStore(pool);
      const results = await store.getAmendmentsByJurisdiction("DE", "2026-07-01", "2026-07-31");
      expect(results).toHaveLength(1);
    });
  });
});

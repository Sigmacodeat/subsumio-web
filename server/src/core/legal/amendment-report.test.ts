import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import {
  generateAmendmentReport,
  formatAmendmentReport,
  type AmendmentReport,
} from "./amendment-report.ts";
import type { CorpusAmendment } from "./snapshot-store.ts";

// ─── Mock Pool ───────────────────────────────────────────────────────────

function createMockPool(amendments: CorpusAmendment[]): Pool {
  const mockQuery = vi.fn().mockImplementation((sql: string, params?: any[]) => {
    // getAmendmentsBetween or getAmendmentsByJurisdiction
    if (sql.includes("corpus_amendments")) {
      if (sql.includes("jurisdiction = $1")) {
        const jur = params?.[0];
        const filtered = amendments.filter((a) => a.jurisdiction === jur);
        return Promise.resolve({ rows: filtered.map((a) => ({ ...a, id: 1 })) });
      }
      return Promise.resolve({ rows: amendments.map((a) => ({ ...a, id: 1 })) });
    }
    return Promise.resolve({ rows: [] });
  });
  return { query: mockQuery } as unknown as Pool;
}

const SAMPLE_AMENDMENTS: CorpusAmendment[] = [
  {
    id: 1,
    slug: "law/de/bgb",
    statute_code: "BGB",
    jurisdiction: "DE",
    paragraph: "433",
    change_type: "modified",
    detected_at: "2026-07-15T10:00:00Z",
    source_url: "https://gesetze-im-internet.de/bgb",
  },
  {
    id: 2,
    slug: "law/de/bgb",
    statute_code: "BGB",
    jurisdiction: "DE",
    paragraph: "434",
    change_type: "added",
    detected_at: "2026-07-15T10:00:00Z",
    source_url: "https://gesetze-im-internet.de/bgb",
  },
  {
    id: 3,
    slug: "law/at/abgb",
    statute_code: "ABGB",
    jurisdiction: "AT",
    paragraph: "1295",
    change_type: "modified",
    detected_at: "2026-07-14T12:00:00Z",
    source_url: "https://www.ris.bka.gv.at",
  },
  {
    id: 4,
    slug: "law/ch/or",
    statute_code: "OR",
    jurisdiction: "CH",
    paragraph: "41",
    change_type: "removed",
    detected_at: "2026-07-13T08:00:00Z",
    source_url: "https://www.fedlex.ch",
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────

describe("amendment-report", () => {
  describe("generateAmendmentReport", () => {
    it("aggregates total amendments", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      expect(report.total_amendments).toBe(4);
    });

    it("aggregates by change type", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      expect(report.by_change_type.modified).toBe(2);
      expect(report.by_change_type.added).toBe(1);
      expect(report.by_change_type.removed).toBe(1);
    });

    it("aggregates by jurisdiction", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      expect(report.by_jurisdiction.DE.total).toBe(2);
      expect(report.by_jurisdiction.AT.total).toBe(1);
      expect(report.by_jurisdiction.CH.total).toBe(1);
      expect(report.by_jurisdiction.DE.statutes_affected).toBe(1);
    });

    it("aggregates by statute with paragraph list", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      const bgb = report.by_statute.find((s) => s.statute_code === "BGB");
      expect(bgb).toBeDefined();
      expect(bgb!.total).toBe(2);
      expect(bgb!.paragraphs_affected).toContain("433");
      expect(bgb!.paragraphs_affected).toContain("434");
      expect(bgb!.change_types.modified).toBe(1);
      expect(bgb!.change_types.added).toBe(1);
    });

    it("produces changed_slugs list", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      expect(report.changed_slugs).toContain("law/de/bgb");
      expect(report.changed_slugs).toContain("law/at/abgb");
      expect(report.changed_slugs).toContain("law/ch/or");
      expect(report.changed_slugs.length).toBe(3);
    });

    it("sorts by_statute by total descending", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      expect(report.by_statute[0].total).toBeGreaterThanOrEqual(
        report.by_statute[report.by_statute.length - 1].total
      );
    });

    it("handles empty amendments", async () => {
      const pool = createMockPool([]);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });
      expect(report.total_amendments).toBe(0);
      expect(report.changed_slugs).toEqual([]);
      expect(report.by_statute).toEqual([]);
    });

    it("filters by jurisdiction", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        jurisdiction: "DE",
      });
      expect(report.total_amendments).toBe(2);
      expect(report.by_jurisdiction.DE).toBeDefined();
      expect(report.by_jurisdiction.AT).toBeUndefined();
    });

    it("includes generated_at timestamp", async () => {
      const pool = createMockPool(SAMPLE_AMENDMENTS);
      const report = await generateAmendmentReport(pool);
      expect(report.generated_at).toBeTruthy();
      expect(() => new Date(report.generated_at)).not.toThrow();
    });
  });

  describe("formatAmendmentReport", () => {
    it("formats report with German labels", () => {
      const report: AmendmentReport = {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-31T00:00:00Z",
        total_amendments: 5,
        by_change_type: { added: 1, modified: 3, removed: 1 },
        by_jurisdiction: {
          DE: {
            total: 3,
            statutes_affected: 1,
            by_change_type: { added: 1, modified: 2, removed: 0 },
          },
          AT: {
            total: 2,
            statutes_affected: 1,
            by_change_type: { added: 0, modified: 1, removed: 1 },
          },
        },
        by_statute: [
          {
            slug: "law/de/bgb",
            statute_code: "BGB",
            jurisdiction: "DE",
            total: 3,
            paragraphs_affected: ["433", "434", "435"],
            change_types: { added: 1, modified: 2, removed: 0 },
            latest_detected_at: "2026-07-15T10:00:00Z",
          },
        ],
        changed_slugs: ["law/de/bgb"],
        generated_at: "2026-07-16T08:00:00Z",
      };

      const text = formatAmendmentReport(report);
      expect(text).toContain("Novellen-Report");
      expect(text).toContain("Gesamt: 5");
      expect(text).toContain("Geändert: 3");
      expect(text).toContain("Neu: 1");
      expect(text).toContain("Entfernt: 1");
      expect(text).toContain("DE: 3");
      expect(text).toContain("BGB");
      expect(text).toContain("§§ 433, 434, 435");
    });

    it("handles empty report", () => {
      const report: AmendmentReport = {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-31T00:00:00Z",
        total_amendments: 0,
        by_change_type: { added: 0, modified: 0, removed: 0 },
        by_jurisdiction: {},
        by_statute: [],
        changed_slugs: [],
        generated_at: "2026-07-16T08:00:00Z",
      };

      const text = formatAmendmentReport(report);
      expect(text).toContain("Keine Änderungen");
    });

    it("truncates long statute lists", () => {
      const statutes = Array.from({ length: 25 }, (_, i) => ({
        slug: `law/de/stat${i}`,
        statute_code: `STAT${i}`,
        jurisdiction: "DE" as const,
        total: 1,
        paragraphs_affected: ["1"],
        change_types: { added: 1, modified: 0, removed: 0 },
        latest_detected_at: "2026-07-15T10:00:00Z",
      }));

      const report: AmendmentReport = {
        from: "2026-07-01T00:00:00Z",
        to: "2026-07-31T00:00:00Z",
        total_amendments: 25,
        by_change_type: { added: 25, modified: 0, removed: 0 },
        by_jurisdiction: {
          DE: {
            total: 25,
            statutes_affected: 25,
            by_change_type: { added: 25, modified: 0, removed: 0 },
          },
        },
        by_statute: statutes,
        changed_slugs: statutes.map((s) => s.slug),
        generated_at: "2026-07-16T08:00:00Z",
      };

      const text = formatAmendmentReport(report);
      expect(text).toContain("... und 5 weitere");
    });
  });
});

// @vitest-environment node

import { describe, test, expect } from "vitest";
import { auditCoverage, type SourceDbStats } from "./corpus-completeness-audit";
import type { LegalSourceCoverageEntry } from "./legal-source-coverage";

const entry = (over: Partial<LegalSourceCoverageEntry>): LegalSourceCoverageEntry => ({
  source_id: "law-test",
  source_name: "Testquelle",
  jurisdiction: "DE",
  source_type: "primary_legislation",
  legal_areas: ["civil_law"],
  status: "available",
  item_count: 10,
  last_sync: null,
  sync_mode: "full",
  official_url: "",
  api_url: null,
  notes: "",
  ...over,
});

const stats = (over: Partial<SourceDbStats>): SourceDbStats => ({
  source_id: "law-test",
  pages: 0,
  chunks: 0,
  embedded: 0,
  last_updated: null,
  ...over,
});

describe("auditCoverage", () => {
  test("available + pages present + fully embedded → ok", () => {
    const r = auditCoverage(
      [entry({})],
      new Map([["law-test", stats({ pages: 10, chunks: 100, embedded: 95 })]])
    );
    expect(r.rows[0].audit_status).toBe("ok");
    expect(r.summary.ok).toBe(1);
  });

  test("available but empty DB → empty_available", () => {
    const r = auditCoverage([entry({})], new Map());
    expect(r.rows[0].audit_status).toBe("empty_available");
    expect(r.summary.empty_available).toBe(1);
  });

  test("planned/gap with data → unexpected_data", () => {
    const r = auditCoverage(
      [entry({ status: "planned" })],
      new Map([["law-test", stats({ pages: 5 })]])
    );
    expect(r.rows[0].audit_status).toBe("unexpected_data");
  });

  test("early_access counts as expecting data", () => {
    const r = auditCoverage([entry({ status: "early_access" })], new Map());
    expect(r.rows[0].audit_status).toBe("empty_available");
  });

  test("below 90% embed coverage → partially_embedded", () => {
    const r = auditCoverage(
      [entry({})],
      new Map([["law-test", stats({ pages: 10, chunks: 100, embedded: 50 })]])
    );
    expect(r.rows[0].audit_status).toBe("partially_embedded");
  });

  test("gap without data stays gap (not a deviation)", () => {
    const r = auditCoverage([entry({ status: "gap" })], new Map());
    expect(r.rows[0].audit_status).toBe("gap");
    expect(r.summary.gaps).toBe(1);
    expect(r.summary.completeness_pct).toBe(100);
  });

  test("jurisdiction filter", () => {
    const r = auditCoverage(
      [entry({}), entry({ source_id: "law-at-x", jurisdiction: "AT" })],
      new Map(),
      "DE"
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].source_id).toBe("law-test");
  });

  test("deviations sort first", () => {
    const r = auditCoverage(
      [entry({ source_id: "ok-one" }), entry({ source_id: "empty-one" })],
      new Map([["ok-one", stats({ source_id: "ok-one", pages: 5, chunks: 10, embedded: 10 })]])
    );
    expect(r.rows[0].audit_status).not.toBe("ok");
  });
});

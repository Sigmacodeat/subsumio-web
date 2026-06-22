/**
 * Tests für Case Understood Panel — "Akte verstanden?" Analyse-Modul.
 */

import { describe, it, expect } from "vitest";
import {
  buildFactSummary,
  buildGapSummary,
  buildRiskIndicators,
  buildFreshnessSummary,
  buildRecentSourcesSummary,
  computeAssessment,
  buildCaseUnderstoodPanel,
  RISK_LEVEL_LABELS,
  ASSESSMENT_LABELS,
} from "@/lib/case-understood";
import type { MatterContextBundle, MatterGap, MatterFactEntry } from "@/lib/matter-context-types";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeBundle(overrides: Partial<MatterContextBundle> = {}): MatterContextBundle {
  return {
    case_slug: "cases/test-1",
    case_title: "Test Akte",
    case_number: "AZ-2026-001",
    legal_area: "Zivilrecht",
    status: "open",
    parties: [],
    deadlines: [],
    documents: [],
    recent_activity: [],
    facts: [],
    communications: [],
    permissions: {
      visibility: "full",
      privileged: false,
      legal_hold: false,
      allowed_users: [],
      blocked_users: [],
      ethical_wall_active: false,
    },
    coverage: {
      sources: [],
      total_sources: 0,
      connected_sources: 0,
      fresh_sources: 0,
      stale_sources: 0,
      error_sources: 0,
      ocr_pending: 0,
      overall_freshness: "unknown",
      completeness_score: 0,
      warnings: [],
    },
    gaps: [],
    generated_at: "2026-06-20T12:00:00Z",
    engine_reachable: true,
    ...overrides,
  };
}

function makeFact(overrides: Partial<MatterFactEntry> = {}): MatterFactEntry {
  return {
    id: "fact-1",
    statement: "Der Kläger fordert Schadensersatz.",
    source: "klageschrift.pdf",
    confidence: "high",
    ...overrides,
  };
}

function makeGap(overrides: Partial<MatterGap> = {}): MatterGap {
  return {
    type: "missing_document",
    severity: "medium",
    title: "Dokument fehlt",
    description: "Ein wichtiges Dokument fehlt.",
    recommendation: "Dokument hochladen.",
    detected_at: "2026-06-20T12:00:00Z",
    ...overrides,
  };
}

// ── buildFactSummary ──────────────────────────────────────────────────

describe("buildFactSummary", () => {
  it("empty facts → all zeros", () => {
    const summary = buildFactSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.high_confidence).toBe(0);
    expect(summary.medium_confidence).toBe(0);
    expect(summary.low_confidence).toBe(0);
    expect(summary.contradicted).toBe(0);
    expect(summary.superseded).toBe(0);
    expect(summary.items).toHaveLength(0);
  });

  it("counts confidence levels correctly", () => {
    const facts = [
      makeFact({ id: "f1", confidence: "high" }),
      makeFact({ id: "f2", confidence: "high" }),
      makeFact({ id: "f3", confidence: "medium" }),
      makeFact({ id: "f4", confidence: "low" }),
    ];
    const summary = buildFactSummary(facts);
    expect(summary.total).toBe(4);
    expect(summary.high_confidence).toBe(2);
    expect(summary.medium_confidence).toBe(1);
    expect(summary.low_confidence).toBe(1);
  });

  it("counts contradicted facts", () => {
    const facts = [
      makeFact({ id: "f1", contradicts: ["f2"] }),
      makeFact({ id: "f2" }),
      makeFact({ id: "f3" }),
    ];
    const summary = buildFactSummary(facts);
    expect(summary.contradicted).toBe(1);
  });

  it("counts superseded facts", () => {
    const facts = [makeFact({ id: "f1", superseded_by: "f2" }), makeFact({ id: "f2" })];
    const summary = buildFactSummary(facts);
    expect(summary.superseded).toBe(1);
  });

  it("preserves items in order", () => {
    const facts = [makeFact({ id: "a" }), makeFact({ id: "b" })];
    const summary = buildFactSummary(facts);
    expect(summary.items).toEqual(facts);
  });
});

// ── buildGapSummary ───────────────────────────────────────────────────

describe("buildGapSummary", () => {
  it("empty gaps → all zeros", () => {
    const summary = buildGapSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.critical).toBe(0);
    expect(summary.high).toBe(0);
    expect(summary.medium).toBe(0);
    expect(summary.low).toBe(0);
    expect(summary.info).toBe(0);
  });

  it("counts severity levels correctly", () => {
    const gaps = [
      makeGap({ type: "missing_document", severity: "critical" }),
      makeGap({ type: "missing_deadline", severity: "high" }),
      makeGap({ type: "unclear_opponent", severity: "medium" }),
      makeGap({ type: "stale_knowledge_asset", severity: "low" }),
      makeGap({ type: "incomplete_coverage", severity: "info" }),
    ];
    const summary = buildGapSummary(gaps);
    expect(summary.total).toBe(5);
    expect(summary.critical).toBe(1);
    expect(summary.high).toBe(1);
    expect(summary.medium).toBe(1);
    expect(summary.low).toBe(1);
    expect(summary.info).toBe(1);
  });

  it("preserves items", () => {
    const gaps = [makeGap({ type: "missing_document" }), makeGap({ type: "missing_deadline" })];
    const summary = buildGapSummary(gaps);
    expect(summary.items).toEqual(gaps);
  });
});

// ── buildRiskIndicators ───────────────────────────────────────────────

describe("buildRiskIndicators", () => {
  it("empty bundle → no risks", () => {
    const bundle = makeBundle();
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(0);
  });

  it("critical gap → critical risk", () => {
    const bundle = makeBundle({
      gaps: [makeGap({ severity: "critical", title: "Vollmacht fehlt" })],
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(1);
    expect(risks[0].level).toBe("critical");
    expect(risks[0].category).toBe("gap");
    expect(risks[0].title).toBe("Vollmacht fehlt");
  });

  it("high gap → high risk", () => {
    const bundle = makeBundle({
      gaps: [makeGap({ severity: "high" })],
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(1);
    expect(risks[0].level).toBe("high");
  });

  it("medium gap → no risk (only critical/high gaps become risks)", () => {
    const bundle = makeBundle({
      gaps: [makeGap({ severity: "medium" })],
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(0);
  });

  it("overdue deadline → critical risk", () => {
    const bundle = makeBundle({
      deadlines: [
        {
          id: "d1",
          title: "Berufungsfrist",
          date: "2026-01-01",
          status: "open",
          urgency: "overdue",
          source: "engine",
        },
      ],
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(1);
    expect(risks[0].level).toBe("critical");
    expect(risks[0].category).toBe("deadline");
  });

  it("critical urgency deadline → high risk", () => {
    const bundle = makeBundle({
      deadlines: [
        {
          id: "d2",
          title: "Frist",
          date: "2026-07-01",
          status: "open",
          urgency: "critical",
          source: "engine",
        },
      ],
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(1);
    expect(risks[0].level).toBe("high");
  });

  it("normal urgency deadline → no risk", () => {
    const bundle = makeBundle({
      deadlines: [
        {
          id: "d3",
          title: "Frist",
          date: "2026-12-01",
          status: "open",
          urgency: "normal",
          source: "engine",
        },
      ],
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks).toHaveLength(0);
  });

  it("ethical wall violation → critical risk", () => {
    const bundle = makeBundle({
      permissions: {
        visibility: "restricted",
        privileged: false,
        legal_hold: false,
        allowed_users: ["user-1", "user-2"],
        blocked_users: ["user-2"],
        ethical_wall_active: true,
      },
    });
    const risks = buildRiskIndicators(bundle);
    const wallRisk = risks.find((r) => r.category === "permission");
    expect(wallRisk).toBeDefined();
    expect(wallRisk!.level).toBe("critical");
  });

  it("ethical wall active but no overlap → no risk", () => {
    const bundle = makeBundle({
      permissions: {
        visibility: "restricted",
        privileged: false,
        legal_hold: false,
        allowed_users: ["user-1"],
        blocked_users: ["user-2"],
        ethical_wall_active: true,
      },
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks.find((r) => r.category === "permission")).toBeUndefined();
  });

  it("low confidence facts → medium risk", () => {
    const bundle = makeBundle({
      facts: [
        makeFact({ id: "f1", confidence: "low" }),
        makeFact({ id: "f2", confidence: "low" }),
        makeFact({ id: "f3", confidence: "high" }),
      ],
    });
    const risks = buildRiskIndicators(bundle);
    const factRisk = risks.find(
      (r) => r.category === "fact_quality" && r.source === "facts:low_confidence"
    );
    expect(factRisk).toBeDefined();
    expect(factRisk!.level).toBe("medium");
    expect(factRisk!.title).toContain("2");
  });

  it("contradicted facts → medium risk", () => {
    const bundle = makeBundle({
      facts: [makeFact({ id: "f1", contradicts: ["f2"] }), makeFact({ id: "f2" })],
    });
    const risks = buildRiskIndicators(bundle);
    const contradictedRisk = risks.find((r) => r.source === "facts:contradicted");
    expect(contradictedRisk).toBeDefined();
    expect(contradictedRisk!.level).toBe("medium");
  });

  it("stale sources → low risk", () => {
    const bundle = makeBundle({
      coverage: {
        ...makeBundle().coverage,
        stale_sources: 3,
      },
    });
    const risks = buildRiskIndicators(bundle);
    const staleRisk = risks.find((r) => r.category === "freshness");
    expect(staleRisk).toBeDefined();
    expect(staleRisk!.level).toBe("low");
  });

  it("engine unreachable → critical risk", () => {
    const bundle = makeBundle({ engine_reachable: false });
    const risks = buildRiskIndicators(bundle);
    const engineRisk = risks.find((r) => r.category === "system");
    expect(engineRisk).toBeDefined();
    expect(engineRisk!.level).toBe("critical");
  });

  it("risks sorted by severity (critical first)", () => {
    const bundle = makeBundle({
      gaps: [makeGap({ severity: "high", title: "Gap High" })],
      deadlines: [
        {
          id: "d1",
          title: "Overdue",
          date: "2026-01-01",
          status: "open",
          urgency: "overdue",
          source: "engine",
        },
      ],
      coverage: {
        ...makeBundle().coverage,
        stale_sources: 2,
      },
    });
    const risks = buildRiskIndicators(bundle);
    expect(risks[0].level).toBe("critical");
    expect(risks[1].level).toBe("high");
    expect(risks[2].level).toBe("low");
  });
});

// ── buildFreshnessSummary ─────────────────────────────────────────────

describe("buildFreshnessSummary", () => {
  it("empty coverage → unknown freshness", () => {
    const bundle = makeBundle();
    const summary = buildFreshnessSummary(bundle.coverage, bundle.recent_activity);
    expect(summary.overall).toBe("unknown");
    expect(summary.completeness_score).toBe(0);
    expect(summary.oldest_sync).toBeNull();
    expect(summary.newest_activity).toBeNull();
  });

  it("computes oldest sync from sources", () => {
    const coverage = {
      sources: [
        {
          source_id: "s1",
          source_label: "Source 1",
          source_type: "upload" as const,
          connected: true,
          last_sync_at: "2026-06-15T10:00:00Z",
          document_count: 5,
          index_fresh: true,
          ocr_complete: true,
        },
        {
          source_id: "s2",
          source_label: "Source 2",
          source_type: "dms" as const,
          connected: true,
          last_sync_at: "2026-06-10T10:00:00Z",
          document_count: 3,
          index_fresh: false,
          ocr_complete: true,
        },
      ],
      total_sources: 2,
      connected_sources: 2,
      fresh_sources: 1,
      stale_sources: 1,
      error_sources: 0,
      ocr_pending: 0,
      overall_freshness: "stale" as const,
      completeness_score: 0.7,
      warnings: [],
    };
    const summary = buildFreshnessSummary(coverage, []);
    expect(summary.oldest_sync).toBe("2026-06-10T10:00:00Z");
  });

  it("computes newest activity from recent_activity", () => {
    const activity = [
      { at: "2026-06-18T10:00:00Z", action: "updated", description: "Doc updated" },
      { at: "2026-06-20T10:00:00Z", action: "created", description: "Doc created" },
      { at: "2026-06-19T10:00:00Z", action: "viewed", description: "Doc viewed" },
    ];
    const summary = buildFreshnessSummary(makeBundle().coverage, activity);
    expect(summary.newest_activity).toBe("2026-06-20T10:00:00Z");
  });

  it("null sync dates are filtered", () => {
    const coverage = {
      sources: [
        {
          source_id: "s1",
          source_label: "S1",
          source_type: "upload" as const,
          connected: true,
          last_sync_at: null,
          document_count: 0,
          index_fresh: false,
          ocr_complete: true,
        },
        {
          source_id: "s2",
          source_label: "S2",
          source_type: "dms" as const,
          connected: true,
          last_sync_at: "2026-06-12T10:00:00Z",
          document_count: 1,
          index_fresh: true,
          ocr_complete: true,
        },
      ],
      total_sources: 2,
      connected_sources: 2,
      fresh_sources: 1,
      stale_sources: 1,
      error_sources: 0,
      ocr_pending: 0,
      overall_freshness: "fresh" as const,
      completeness_score: 0.5,
      warnings: [],
    };
    const summary = buildFreshnessSummary(coverage, []);
    expect(summary.oldest_sync).toBe("2026-06-12T10:00:00Z");
  });
});

// ── buildRecentSourcesSummary ─────────────────────────────────────────

describe("buildRecentSourcesSummary", () => {
  it("empty coverage → empty sources", () => {
    const bundle = makeBundle();
    const summary = buildRecentSourcesSummary(bundle.coverage, bundle.recent_activity);
    expect(summary.sources).toHaveLength(0);
    expect(summary.recent_activity).toHaveLength(0);
  });

  it("sources sorted by last_sync_at descending", () => {
    const coverage = {
      sources: [
        {
          source_id: "old",
          source_label: "Old",
          source_type: "dms" as const,
          connected: true,
          last_sync_at: "2026-01-01T00:00:00Z",
          document_count: 1,
          index_fresh: false,
          ocr_complete: true,
        },
        {
          source_id: "new",
          source_label: "New",
          source_type: "upload" as const,
          connected: true,
          last_sync_at: "2026-06-01T00:00:00Z",
          document_count: 5,
          index_fresh: true,
          ocr_complete: true,
        },
      ],
      total_sources: 2,
      connected_sources: 2,
      fresh_sources: 1,
      stale_sources: 1,
      error_sources: 0,
      ocr_pending: 0,
      overall_freshness: "stale" as const,
      completeness_score: 0.5,
      warnings: [],
    };
    const summary = buildRecentSourcesSummary(coverage, []);
    expect(summary.sources[0].source_id).toBe("new");
    expect(summary.sources[1].source_id).toBe("old");
  });

  it("null sync dates sort last", () => {
    const coverage = {
      sources: [
        {
          source_id: "never",
          source_label: "Never",
          source_type: "email" as const,
          connected: false,
          last_sync_at: null,
          document_count: 0,
          index_fresh: false,
          ocr_complete: true,
        },
        {
          source_id: "synced",
          source_label: "Synced",
          source_type: "upload" as const,
          connected: true,
          last_sync_at: "2026-06-01T00:00:00Z",
          document_count: 3,
          index_fresh: true,
          ocr_complete: true,
        },
      ],
      total_sources: 2,
      connected_sources: 1,
      fresh_sources: 1,
      stale_sources: 0,
      error_sources: 0,
      ocr_pending: 0,
      overall_freshness: "fresh" as const,
      completeness_score: 0.5,
      warnings: [],
    };
    const summary = buildRecentSourcesSummary(coverage, []);
    expect(summary.sources[0].source_id).toBe("synced");
    expect(summary.sources[1].source_id).toBe("never");
  });

  it("recent_activity limited to 10 items", () => {
    const activity = Array.from({ length: 15 }, (_, i) => ({
      at: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      action: "updated",
      description: `Activity ${i}`,
    }));
    const summary = buildRecentSourcesSummary(makeBundle().coverage, activity);
    expect(summary.recent_activity).toHaveLength(10);
  });

  it("recent_activity sorted by date descending", () => {
    const activity = [
      { at: "2026-06-18T10:00:00Z", action: "a", description: "mid" },
      { at: "2026-06-20T10:00:00Z", action: "b", description: "newest" },
      { at: "2026-06-15T10:00:00Z", action: "c", description: "oldest" },
    ];
    const summary = buildRecentSourcesSummary(makeBundle().coverage, activity);
    expect(summary.recent_activity[0].description).toBe("newest");
    expect(summary.recent_activity[2].description).toBe("oldest");
  });
});

// ── computeAssessment ─────────────────────────────────────────────────

describe("computeAssessment", () => {
  it("engine unreachable → unknown", () => {
    const facts = buildFactSummary([]);
    const gaps = buildGapSummary([]);
    const risks = buildRiskIndicators(makeBundle());
    const freshness = buildFreshnessSummary(makeBundle().coverage, []);
    const assessment = computeAssessment(facts, gaps, risks, freshness, false);
    expect(assessment).toBe("unknown");
  });

  it("clean bundle with facts and sources → well_understood", () => {
    const bundle = makeBundle({
      coverage: {
        ...makeBundle().coverage,
        overall_freshness: "fresh",
        completeness_score: 0.9,
        fresh_sources: 5,
        total_sources: 5,
      },
      facts: [
        makeFact({ id: "f1", confidence: "high" }),
        makeFact({ id: "f2", confidence: "high" }),
      ],
    });
    const facts = buildFactSummary(bundle.facts);
    const gaps = buildGapSummary([]);
    const risks = buildRiskIndicators(bundle);
    const freshness = buildFreshnessSummary(bundle.coverage, []);
    const assessment = computeAssessment(facts, gaps, risks, freshness, true);
    expect(assessment).toBe("well_understood");
  });

  it("critical gap → score drops significantly", () => {
    const facts = buildFactSummary([makeFact({ id: "f1", confidence: "high" })]);
    const gaps = buildGapSummary([
      makeGap({ severity: "critical" }),
      makeGap({ severity: "medium" }),
    ]);
    const risks: ReturnType<typeof buildRiskIndicators> = [];
    const freshness: Parameters<typeof computeAssessment>[3] = {
      overall: "fresh",
      completeness_score: 0.8,
      fresh_sources: 2,
      stale_sources: 0,
      error_sources: 0,
      ocr_pending: 0,
      oldest_sync: null,
      newest_activity: null,
    };
    const assessment = computeAssessment(facts, gaps, risks, freshness, true);
    expect(assessment).toBe("partially_understood");
  });

  it("multiple critical gaps → poorly_understood", () => {
    const facts = buildFactSummary([]);
    const gaps = buildGapSummary([
      makeGap({ severity: "critical" }),
      makeGap({ severity: "critical" }),
      makeGap({ severity: "critical" }),
      makeGap({ severity: "critical" }),
    ]);
    const risks: ReturnType<typeof buildRiskIndicators> = [];
    const freshness = buildFreshnessSummary(makeBundle().coverage, []);
    const assessment = computeAssessment(facts, gaps, risks, freshness, true);
    expect(assessment).toBe("poorly_understood");
  });

  it("low completeness → poorly_understood", () => {
    const facts = buildFactSummary([]);
    const gaps = buildGapSummary([]);
    const risks: ReturnType<typeof buildRiskIndicators> = [];
    const freshness: Parameters<typeof computeAssessment>[3] = {
      overall: "stale",
      completeness_score: 0.1,
      fresh_sources: 0,
      stale_sources: 5,
      error_sources: 0,
      ocr_pending: 0,
      oldest_sync: null,
      newest_activity: null,
    };
    const assessment = computeAssessment(facts, gaps, risks, freshness, true);
    expect(assessment).toBe("poorly_understood");
  });

  it("contradicted facts reduce score", () => {
    const facts = buildFactSummary([
      makeFact({ id: "f1", contradicts: ["f2"] }),
      makeFact({ id: "f2" }),
    ]);
    const gaps = buildGapSummary([]);
    const risks: ReturnType<typeof buildRiskIndicators> = [];
    const freshness = buildFreshnessSummary(makeBundle().coverage, []);
    const assessment = computeAssessment(facts, gaps, risks, freshness, true);
    expect(assessment).toBe("partially_understood");
  });

  it("stale + error sources reduce score", () => {
    const facts = buildFactSummary([]);
    const gaps = buildGapSummary([]);
    const risks: ReturnType<typeof buildRiskIndicators> = [];
    const freshness: Parameters<typeof computeAssessment>[3] = {
      overall: "stale",
      completeness_score: 0.6,
      fresh_sources: 2,
      stale_sources: 5,
      error_sources: 3,
      ocr_pending: 0,
      oldest_sync: null,
      newest_activity: null,
    };
    const assessment = computeAssessment(facts, gaps, risks, freshness, true);
    expect(assessment).toBe("poorly_understood");
  });
});

// ── buildCaseUnderstoodPanel ──────────────────────────────────────────

describe("buildCaseUnderstoodPanel", () => {
  it("builds complete panel from bundle", () => {
    const bundle = makeBundle({
      case_title: "Müller vs. Schmidt",
      case_number: "AZ-2026-42",
      status: "open",
    });
    const panel = buildCaseUnderstoodPanel(bundle);
    expect(panel.case_slug).toBe("cases/test-1");
    expect(panel.case_title).toBe("Müller vs. Schmidt");
    expect(panel.case_number).toBe("AZ-2026-42");
    expect(panel.status).toBe("open");
    expect(panel.facts).toBeDefined();
    expect(panel.gaps).toBeDefined();
    expect(panel.risks).toBeDefined();
    expect(panel.freshness).toBeDefined();
    expect(panel.recent_sources).toBeDefined();
    expect(panel.overall_assessment).toBeDefined();
  });

  it("empty bundle → poorly_understood", () => {
    const bundle = makeBundle();
    const panel = buildCaseUnderstoodPanel(bundle);
    expect(panel.overall_assessment).toBe("poorly_understood");
  });

  it("engine unreachable → unknown assessment", () => {
    const bundle = makeBundle({ engine_reachable: false });
    const panel = buildCaseUnderstoodPanel(bundle);
    expect(panel.overall_assessment).toBe("unknown");
  });

  it("well-covered bundle → well_understood", () => {
    const bundle = makeBundle({
      coverage: {
        sources: [
          {
            source_id: "s1",
            source_label: "Upload",
            source_type: "upload",
            connected: true,
            last_sync_at: "2026-06-19T10:00:00Z",
            document_count: 10,
            index_fresh: true,
            ocr_complete: true,
          },
          {
            source_id: "s2",
            source_label: "DMS",
            source_type: "dms",
            connected: true,
            last_sync_at: "2026-06-18T10:00:00Z",
            document_count: 5,
            index_fresh: true,
            ocr_complete: true,
          },
        ],
        total_sources: 2,
        connected_sources: 2,
        fresh_sources: 2,
        stale_sources: 0,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "fresh",
        completeness_score: 0.95,
        warnings: [],
      },
      facts: [
        makeFact({ id: "f1", confidence: "high" }),
        makeFact({ id: "f2", confidence: "high" }),
        makeFact({ id: "f3", confidence: "medium" }),
      ],
    });
    const panel = buildCaseUnderstoodPanel(bundle);
    expect(panel.overall_assessment).toBe("well_understood");
    expect(panel.facts.total).toBe(3);
    expect(panel.facts.high_confidence).toBe(2);
  });
});

// ── Label Maps ────────────────────────────────────────────────────────

describe("Label Maps", () => {
  it("RISK_LEVEL_LABELS has all 5 levels", () => {
    expect(Object.keys(RISK_LEVEL_LABELS)).toHaveLength(5);
    expect(RISK_LEVEL_LABELS.critical).toBe("Kritisch");
    expect(RISK_LEVEL_LABELS.high).toBe("Hoch");
    expect(RISK_LEVEL_LABELS.medium).toBe("Mittel");
    expect(RISK_LEVEL_LABELS.low).toBe("Niedrig");
    expect(RISK_LEVEL_LABELS.info).toBe("Info");
  });

  it("ASSESSMENT_LABELS has all 4 assessments", () => {
    expect(Object.keys(ASSESSMENT_LABELS)).toHaveLength(4);
    expect(ASSESSMENT_LABELS.well_understood).toBe("Akte gut verstanden");
    expect(ASSESSMENT_LABELS.partially_understood).toBe("Akte teilweise verstanden");
    expect(ASSESSMENT_LABELS.poorly_understood).toBe("Akte unvollständig");
    expect(ASSESSMENT_LABELS.unknown).toBe("Akte nicht bewertbar");
  });
});

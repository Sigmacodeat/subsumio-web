// @vitest-environment node

import { describe, test, expect } from "vitest";
import { buildCaseComprehensionPanel } from "@/lib/case-comprehension";
import type { MatterContextBundle } from "@/lib/matter-context-types";

function makeBundle(overrides: Partial<MatterContextBundle> = {}): MatterContextBundle {
  return {
    case_slug: "cases/test-001",
    case_title: "Test Case",
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
    generated_at: new Date().toISOString(),
    engine_reachable: true,
    ...overrides,
  };
}

describe("buildCaseComprehensionPanel", () => {
  test("empty bundle → not understood, low comprehension", () => {
    const panel = buildCaseComprehensionPanel(makeBundle());
    expect(panel.understood).toBe(false);
    expect(panel.comprehension_score).toBeLessThan(0.7);
    expect(panel.facts_summary.total).toBe(0);
    expect(panel.gaps_summary.total).toBe(0);
  });

  test("well-populated bundle → understood", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "Klage eingereicht am 01.03.2026", source: "dms", confidence: "high", date: "2026-03-01" },
        { id: "f2", statement: "Mandant ist Schuldner", source: "dms", confidence: "high", date: "2026-02-15" },
      ],
      coverage: {
        sources: [{ source_id: "s1", source_label: "DMS", source_type: "dms", connected: true, last_sync_at: new Date().toISOString(), document_count: 10, index_fresh: true, ocr_complete: true }],
        total_sources: 1,
        connected_sources: 1,
        fresh_sources: 1,
        stale_sources: 0,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "fresh",
        completeness_score: 0.9,
        warnings: [],
      },
    }));
    expect(panel.understood).toBe(true);
    expect(panel.comprehension_score).toBeGreaterThanOrEqual(0.6);
  });

  test("critical gap → not understood", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [{ id: "f1", statement: "Fact", source: "dms", confidence: "high" }],
      gaps: [{
        type: "missing_power_of_attorney",
        severity: "critical",
        title: "Vollmacht fehlt",
        description: "Keine Vollmacht vorhanden",
        recommendation: "Vollmacht einholen",
        detected_at: new Date().toISOString(),
      }],
    }));
    expect(panel.understood).toBe(false);
    expect(panel.gaps_summary.critical).toBe(1);
  });
});

describe("facts_summary", () => {
  test("counts high confidence facts", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "A", source: "dms", confidence: "high" },
        { id: "f2", statement: "B", source: "dms", confidence: "medium" },
        { id: "f3", statement: "C", source: "dms", confidence: "low" },
      ],
    }));
    expect(panel.facts_summary.total).toBe(3);
    expect(panel.facts_summary.high_confidence).toBe(1);
  });

  test("counts contradictions", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "A", source: "dms", confidence: "high", contradicts: ["f2"] },
        { id: "f2", statement: "B", source: "dms", confidence: "high", contradicts: ["f1"] },
      ],
    }));
    expect(panel.facts_summary.contradictions).toBe(2);
  });

  test("counts superseded facts", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "Old", source: "dms", confidence: "high", superseded_by: "f2" },
        { id: "f2", statement: "New", source: "dms", confidence: "high" },
      ],
    }));
    expect(panel.facts_summary.superseded).toBe(1);
  });

  test("counts recent changes within 72h", () => {
    const now = new Date();
    const recentDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "Recent", source: "dms", confidence: "high", date: recentDate },
        { id: "f2", statement: "Old", source: "dms", confidence: "high", date: oldDate },
      ],
    }), now);
    expect(panel.facts_summary.recent_changes).toBe(1);
  });

  test("top_facts excludes superseded, sorted by confidence", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "Low", source: "dms", confidence: "low" },
        { id: "f2", statement: "High", source: "dms", confidence: "high" },
        { id: "f3", statement: "Medium", source: "dms", confidence: "medium" },
        { id: "f4", statement: "Superseded", source: "dms", confidence: "high", superseded_by: "f2" },
      ],
    }));
    expect(panel.facts_summary.top_facts).toHaveLength(3);
    expect(panel.facts_summary.top_facts[0].confidence).toBe("high");
    expect(panel.facts_summary.top_facts.every((f) => !f.is_superseded)).toBe(true);
  });
});

describe("gaps_summary", () => {
  test("counts by severity", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      gaps: [
        { type: "missing_document", severity: "critical", title: "A", description: "", recommendation: "", detected_at: "" },
        { type: "missing_deadline", severity: "high", title: "B", description: "", recommendation: "", detected_at: "" },
        { type: "incomplete_coverage", severity: "medium", title: "C", description: "", recommendation: "", detected_at: "" },
        { type: "stale_knowledge_asset", severity: "low", title: "D", description: "", recommendation: "", detected_at: "" },
        { type: "unreviewed_document", severity: "info", title: "E", description: "", recommendation: "", detected_at: "" },
      ],
    }));
    expect(panel.gaps_summary.critical).toBe(1);
    expect(panel.gaps_summary.high).toBe(1);
    expect(panel.gaps_summary.medium).toBe(1);
    expect(panel.gaps_summary.low).toBe(1);
    expect(panel.gaps_summary.info).toBe(1);
  });

  test("top_gaps sorted by severity", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      gaps: [
        { type: "stale_knowledge_asset", severity: "low", title: "Low", description: "", recommendation: "R", detected_at: "" },
        { type: "missing_document", severity: "critical", title: "Critical", description: "", recommendation: "R", detected_at: "" },
      ],
    }));
    expect(panel.gaps_summary.top_gaps[0].severity).toBe("critical");
  });
});

describe("risks_summary", () => {
  test("overdue deadline → critical deadline risk", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      deadlines: [{ title: "Frist", date: "2026-01-01", status: "open", urgency: "overdue", source: "dms" }],
    }));
    expect(panel.risks_summary.deadline_risk).toBe("critical");
    expect(panel.risks_summary.overall_risk).toBe("critical");
  });

  test("critical deadline → high deadline risk", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      deadlines: [{ title: "Frist", date: "2026-12-01", status: "open", urgency: "critical", source: "dms" }],
    }));
    expect(panel.risks_summary.deadline_risk).toBe("high");
  });

  test("engine unreachable → critical coverage risk", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({ engine_reachable: false }));
    expect(panel.risks_summary.coverage_risk).toBe("critical");
  });

  test("low coverage → high coverage risk", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: { ...makeBundle().coverage, completeness_score: 0.2 },
    }));
    expect(panel.risks_summary.coverage_risk).toBe("high");
  });

  test("contradictory facts → medium contradiction risk", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      gaps: [{ type: "contradictory_facts", severity: "high", title: "Widerspruch", description: "", recommendation: "", detected_at: "" }],
    }));
    expect(panel.risks_summary.contradiction_risk).toBe("medium");
  });

  test("privilege violation → critical privilege risk", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      gaps: [{ type: "unprivileged_communication", severity: "critical", title: "Privileg", description: "", recommendation: "", detected_at: "" }],
    }));
    expect(panel.risks_summary.privilege_risk).toBe("critical");
  });

  test("no risks → overall none", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [{ id: "f1", statement: "Fact", source: "dms", confidence: "high" }],
      coverage: { ...makeBundle().coverage, completeness_score: 0.9, overall_freshness: "fresh" },
    }));
    expect(panel.risks_summary.overall_risk).toBe("none");
  });
});

describe("freshness_summary", () => {
  test("fresh sources → fresh overall", () => {
    const now = new Date();
    const recentActivity = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: {
        sources: [],
        total_sources: 2,
        connected_sources: 2,
        fresh_sources: 2,
        stale_sources: 0,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "fresh",
        completeness_score: 0.9,
        warnings: [],
      },
      recent_activity: [{ at: recentActivity, action: "upload", description: "Doc uploaded" }],
    }), now);
    expect(panel.freshness_summary.overall_freshness).toBe("fresh");
    expect(panel.freshness_summary.staleness_days).toBe(5);
  });

  test("stale sources → stale overall", () => {
    const now = new Date();
    const oldActivity = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: {
        sources: [],
        total_sources: 2,
        connected_sources: 2,
        fresh_sources: 0,
        stale_sources: 2,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "stale",
        completeness_score: 0.5,
        warnings: [],
      },
      recent_activity: [{ at: oldActivity, action: "upload", description: "Old" }],
    }), now);
    expect(panel.freshness_summary.overall_freshness).toBe("stale");
    expect(panel.freshness_summary.staleness_days).toBeGreaterThanOrEqual(60);
  });

  test("no activity → unknown freshness, null staleness", () => {
    const panel = buildCaseComprehensionPanel(makeBundle());
    expect(panel.freshness_summary.last_activity).toBeNull();
    expect(panel.freshness_summary.staleness_days).toBeNull();
  });

  test("ocr_pending reported", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: { ...makeBundle().coverage, ocr_pending: 3 },
    }));
    expect(panel.freshness_summary.ocr_pending).toBe(3);
  });
});

describe("recently_changed_sources", () => {
  test("returns sources sorted by last_sync_at descending", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString();
    const older = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: {
        sources: [
          { source_id: "s1", source_label: "DMS", source_type: "dms", connected: true, last_sync_at: older, document_count: 5, index_fresh: false, ocr_complete: true },
          { source_id: "s2", source_label: "Email", source_type: "email", connected: true, last_sync_at: recent, document_count: 10, index_fresh: true, ocr_complete: true },
        ],
        total_sources: 2,
        connected_sources: 2,
        fresh_sources: 1,
        stale_sources: 1,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "fresh",
        completeness_score: 0.8,
        warnings: [],
      },
    }), now);
    expect(panel.recently_changed_sources).toHaveLength(2);
    expect(panel.recently_changed_sources[0].source_id).toBe("s2");
  });

  test("excludes sources with null last_sync_at", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: {
        sources: [
          { source_id: "s1", source_label: "DMS", source_type: "dms", connected: false, last_sync_at: null, document_count: 0, index_fresh: false, ocr_complete: false },
        ],
        total_sources: 1,
        connected_sources: 0,
        fresh_sources: 0,
        stale_sources: 0,
        error_sources: 0,
        ocr_pending: 0,
        overall_freshness: "unknown",
        completeness_score: 0,
        warnings: [],
      },
    }));
    expect(panel.recently_changed_sources).toHaveLength(0);
  });

  test("error source → change_type error", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: {
        sources: [
          { source_id: "s1", source_label: "DMS", source_type: "dms", connected: false, last_sync_at: new Date().toISOString(), document_count: 0, index_fresh: false, ocr_complete: false, error: "Connection failed" },
        ],
        total_sources: 1,
        connected_sources: 0,
        fresh_sources: 0,
        stale_sources: 0,
        error_sources: 1,
        ocr_pending: 0,
        overall_freshness: "unknown",
        completeness_score: 0,
        warnings: [],
      },
    }));
    expect(panel.recently_changed_sources[0].change_type).toBe("error");
  });
});

describe("recommendations", () => {
  test("critical gaps → recommendation to fix", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      gaps: [{ type: "missing_power_of_attorney", severity: "critical", title: "Vollmacht", description: "", recommendation: "Einholen", detected_at: "" }],
    }));
    expect(panel.recommendations.some((r) => r.includes("kritische"))).toBe(true);
  });

  test("overdue deadlines → recommendation", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      deadlines: [{ title: "Frist", date: "2026-01-01", status: "open", urgency: "overdue", source: "dms" }],
    }));
    expect(panel.recommendations.some((r) => r.includes("Frist"))).toBe(true);
  });

  test("ocr pending → recommendation", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      coverage: { ...makeBundle().coverage, ocr_pending: 5 },
    }));
    expect(panel.recommendations.some((r) => r.includes("OCR"))).toBe(true);
  });

  test("good state → positive recommendation", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [{ id: "f1", statement: "Fact", source: "dms", confidence: "high" }],
      coverage: { ...makeBundle().coverage, completeness_score: 0.9, overall_freshness: "fresh" },
    }));
    expect(panel.recommendations.some((r) => r.includes("gutem Zustand"))).toBe(true);
  });
});

describe("comprehension_score", () => {
  test("perfect bundle → high score", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      facts: [
        { id: "f1", statement: "A", source: "dms", confidence: "high" },
        { id: "f2", statement: "B", source: "dms", confidence: "high" },
      ],
      coverage: { ...makeBundle().coverage, completeness_score: 0.95, overall_freshness: "fresh" },
    }));
    expect(panel.comprehension_score).toBeGreaterThanOrEqual(0.8);
  });

  test("many gaps → low score", () => {
    const panel = buildCaseComprehensionPanel(makeBundle({
      gaps: [
        { type: "missing_document", severity: "critical", title: "", description: "", recommendation: "", detected_at: "" },
        { type: "missing_deadline", severity: "critical", title: "", description: "", recommendation: "", detected_at: "" },
        { type: "incomplete_coverage", severity: "high", title: "", description: "", recommendation: "", detected_at: "" },
      ],
    }));
    expect(panel.comprehension_score).toBeLessThan(0.5);
  });

  test("score is between 0 and 1", () => {
    const panel = buildCaseComprehensionPanel(makeBundle());
    expect(panel.comprehension_score).toBeGreaterThanOrEqual(0);
    expect(panel.comprehension_score).toBeLessThanOrEqual(1);
  });
});

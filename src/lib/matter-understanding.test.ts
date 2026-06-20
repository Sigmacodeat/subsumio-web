/**
 * Matter Understanding Panel Tests — "Akte verstanden?"
 *
 * Verifiziert das Understanding Panel:
 *   1. buildUnderstandingPanel — strukturiert Fakten, Lücken, Risiken
 *   2. deriveRisks — kritische/high gaps, überfällige Fristen, unreviewed docs
 *   3. assessFreshness — fresh/stale/unknown, source counts
 *   4. deriveRecentlyChangedSources — sortiert nach last_sync_at, max 10
 *   5. calculateUnderstandingScore — gewichtete Score-Berechnung
 *   6. buildSummary — menschenlesbare Zusammenfassung
 *   7. Edge cases: empty bundle, engine unreachable, all gaps
 */

import { describe, it, expect } from "vitest";
import { buildUnderstandingPanel } from "@/lib/matter-context";
import type { MatterContextBundle, MatterUnderstandingPanel } from "@/lib/matter-context-types";

// ── Helpers ───────────────────────────────────────────────────────────

function makeBundle(overrides: Partial<MatterContextBundle> = {}): MatterContextBundle {
  return {
    case_slug: "cases/test-001",
    case_title: "Test Case",
    case_number: "AZ-2024-001",
    legal_area: "Zivilrecht",
    status: "open",
    parties: [
      { slug: "contacts/client-1", name: "Max Mustermann", role: "client" },
      { slug: "contacts/opponent-1", name: "Anna Schmidt", role: "opponent" },
    ],
    deadlines: [
      { id: "d1", title: "Klageantwort", date: "2024-08-15", urgency: "upcoming" },
    ],
    documents: [
      { slug: "docs/1", name: "Vertrag.pdf", ocr_status: "ocr_complete" },
      { slug: "docs/2", name: "Klage.pdf", ocr_status: "text_layer" },
    ],
    recent_activity: [
      { at: "2024-07-01T10:00:00Z", action: "document_uploaded", actor: "lawyer" },
    ],
    facts: [
      { id: "f1", fact: "Schadensersatz claim", source: "strategy", confidence: "high" },
    ],
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
      completeness_score: 0.75,
      sources: [
        { source_id: "upload", source_type: "upload", connected: true, index_fresh: true, document_count: 5, last_sync_at: "2024-07-01T10:00:00Z" },
        { source_id: "email", source_type: "email", connected: true, index_fresh: false, document_count: 3, last_sync_at: "2024-06-15T08:00:00Z" },
      ],
      stale_sources: 1,
      fresh_sources: 1,
      total_sources: 2,
    },
    gaps: [
      { type: "missing_power_of_attorney", severity: "high", title: "Vollmacht fehlt", recommendation: "Vollmacht anfordern." },
    ],
    generated_at: "2024-07-01T12:00:00Z",
    engine_reachable: true,
    ...overrides,
  };
}

// ── 1. buildUnderstandingPanel — Basic Structure ─────────────────────

describe("buildUnderstandingPanel — Basic Structure", () => {
  it("returns a MatterUnderstandingPanel with all required fields", () => {
    const panel = buildUnderstandingPanel(makeBundle());
    expect(panel.case_slug).toBe("cases/test-001");
    expect(panel.case_title).toBe("Test Case");
    expect(panel.understanding_score).toBeGreaterThanOrEqual(0);
    expect(panel.understanding_score).toBeLessThanOrEqual(1);
    expect(panel.summary).toBeTruthy();
    expect(panel.facts).toHaveLength(1);
    expect(panel.gaps).toHaveLength(1);
    expect(panel.risks).toBeDefined();
    expect(panel.freshness).toBeDefined();
    expect(panel.recently_changed_sources).toBeDefined();
    expect(panel.engine_reachable).toBe(true);
    expect(panel.generated_at).toBe("2024-07-01T12:00:00Z");
  });

  it("preserves case_slug and case_title from bundle", () => {
    const panel = buildUnderstandingPanel(makeBundle({ case_slug: "cases/2024-xyz", case_title: "Complex Litigation" }));
    expect(panel.case_slug).toBe("cases/2024-xyz");
    expect(panel.case_title).toBe("Complex Litigation");
  });

  it("preserves facts from bundle", () => {
    const bundle = makeBundle({
      facts: [
        { id: "f1", fact: "Claim A", source: "strategy", confidence: "high" },
        { id: "f2", fact: "Claim B", source: "evidence", confidence: "medium" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.facts).toHaveLength(2);
    expect(panel.facts[0].fact).toBe("Claim A");
  });

  it("preserves gaps from bundle", () => {
    const bundle = makeBundle({
      gaps: [
        { type: "missing_power_of_attorney", severity: "high", title: "Vollmacht fehlt" },
        { type: "overdue_deadline", severity: "critical", title: "Frist abgelaufen" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.gaps).toHaveLength(2);
  });
});

// ── 2. deriveRisks ────────────────────────────────────────────────────

describe("deriveRisks", () => {
  it("derives risks from critical and high gaps", () => {
    const bundle = makeBundle({
      gaps: [
        { type: "missing_power_of_attorney", severity: "high", title: "Vollmacht fehlt", recommendation: "Anfordern." },
        { type: "overdue_deadline", severity: "critical", title: "Frist abgelaufen" },
        { type: "missing_client_info", severity: "low", title: "Klient info fehlt" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.risks).toHaveLength(2);
    expect(panel.risks.find((r) => r.severity === "critical")).toBeDefined();
    expect(panel.risks.find((r) => r.severity === "high")).toBeDefined();
  });

  it("does not derive risks from low/medium gaps", () => {
    const bundle = makeBundle({
      gaps: [
        { type: "missing_client_info", severity: "low", title: "Info fehlt" },
        { type: "unreviewed_document", severity: "medium", title: "Dokument nicht geprüft" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.risks.filter((r) => r.source === "gap_detection")).toHaveLength(0);
  });

  it("derives risk from overdue deadlines", () => {
    const bundle = makeBundle({
      deadlines: [
        { id: "d1", title: "Berufungsfrist", date: "2024-01-01", urgency: "overdue" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    const deadlineRisk = panel.risks.find((r) => r.source === "deadline_monitor");
    expect(deadlineRisk).toBeDefined();
    expect(deadlineRisk?.severity).toBe("critical");
    expect(deadlineRisk?.title).toContain("Berufungsfrist");
  });

  it("does not derive risk from non-overdue deadlines", () => {
    const bundle = makeBundle({
      deadlines: [
        { id: "d1", title: "Klageantwort", date: "2024-12-01", urgency: "upcoming" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.risks.find((r) => r.source === "deadline_monitor")).toBeUndefined();
  });

  it("derives risk when more than 3 unreviewed documents", () => {
    const bundle = makeBundle({
      documents: [
        { slug: "d1", name: "A.pdf", ocr_status: "unknown" },
        { slug: "d2", name: "B.pdf", ocr_status: "ocr_needed" },
        { slug: "d3", name: "C.pdf", ocr_status: "unknown" },
        { slug: "d4", name: "D.pdf", ocr_status: "ocr_needed" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    const docRisk = panel.risks.find((r) => r.source === "document_review");
    expect(docRisk).toBeDefined();
    expect(docRisk?.severity).toBe("medium");
    expect(docRisk?.title).toContain("4");
  });

  it("does not derive risk when 3 or fewer unreviewed documents", () => {
    const bundle = makeBundle({
      documents: [
        { slug: "d1", name: "A.pdf", ocr_status: "unknown" },
        { slug: "d2", name: "B.pdf", ocr_status: "ocr_needed" },
        { slug: "d3", name: "C.pdf", ocr_status: "ocr_complete" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.risks.find((r) => r.source === "document_review")).toBeUndefined();
  });

  it("carries recommendation from gaps to risks", () => {
    const bundle = makeBundle({
      gaps: [
        { type: "missing_power_of_attorney", severity: "high", title: "Vollmacht", recommendation: "Sofort anfordern." },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    const risk = panel.risks.find((r) => r.id === "gap-missing_power_of_attorney");
    expect(risk?.recommendation).toBe("Sofort anfordern.");
  });
});

// ── 3. assessFreshness ────────────────────────────────────────────────

describe("assessFreshness", () => {
  it("returns fresh when majority of sources are fresh", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.8,
        sources: [
          { source_id: "s1", source_type: "upload", connected: true, index_fresh: true, document_count: 1 },
          { source_id: "s2", source_type: "email", connected: true, index_fresh: true, document_count: 1 },
          { source_id: "s3", source_type: "dms", connected: true, index_fresh: false, document_count: 1 },
        ],
        stale_sources: 1,
        fresh_sources: 2,
        total_sources: 3,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.freshness.overall).toBe("fresh");
    expect(panel.freshness.fresh_sources).toBe(2);
    expect(panel.freshness.stale_sources).toBe(1);
    expect(panel.freshness.total_sources).toBe(3);
  });

  it("returns stale when majority of sources are stale", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.3,
        sources: [
          { source_id: "s1", source_type: "upload", connected: true, index_fresh: false, document_count: 1 },
          { source_id: "s2", source_type: "email", connected: true, index_fresh: false, document_count: 1 },
          { source_id: "s3", source_type: "dms", connected: true, index_fresh: false, document_count: 1 },
          { source_id: "s4", source_type: "portal", connected: true, index_fresh: true, document_count: 1 },
        ],
        stale_sources: 3,
        fresh_sources: 1,
        total_sources: 4,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.freshness.overall).toBe("stale");
  });

  it("returns unknown when no sources exist", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0,
        sources: [],
        stale_sources: 0,
        fresh_sources: 0,
        total_sources: 0,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.freshness.overall).toBe("unknown");
    expect(panel.freshness.total_sources).toBe(0);
  });

  it("uses last activity timestamp from recent_activity", () => {
    const bundle = makeBundle({
      recent_activity: [
        { at: "2024-07-15T14:00:00Z", action: "document_uploaded", actor: "user" },
        { at: "2024-07-10T10:00:00Z", action: "deadline_updated", actor: "lawyer" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.freshness.last_activity).toBe("2024-07-15T14:00:00Z");
  });

  it("returns null last_activity when no recent activity", () => {
    const bundle = makeBundle({ recent_activity: [] });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.freshness.last_activity).toBeNull();
  });

  it("carries completeness_score from coverage", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.92,
        sources: [],
        stale_sources: 0,
        fresh_sources: 0,
        total_sources: 0,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.freshness.completeness_score).toBe(0.92);
  });
});

// ── 4. deriveRecentlyChangedSources ───────────────────────────────────

describe("deriveRecentlyChangedSources", () => {
  it("returns sources sorted by last_sync_at descending", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.5,
        sources: [
          { source_id: "old", source_type: "email", connected: true, index_fresh: false, document_count: 2, last_sync_at: "2024-01-01T00:00:00Z" },
          { source_id: "new", source_type: "upload", connected: true, index_fresh: true, document_count: 5, last_sync_at: "2024-07-01T00:00:00Z" },
          { source_id: "mid", source_type: "dms", connected: true, index_fresh: true, document_count: 3, last_sync_at: "2024-04-01T00:00:00Z" },
        ],
        stale_sources: 1,
        fresh_sources: 2,
        total_sources: 3,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.recently_changed_sources).toHaveLength(3);
    expect(panel.recently_changed_sources[0].source_id).toBe("new");
    expect(panel.recently_changed_sources[1].source_id).toBe("mid");
    expect(panel.recently_changed_sources[2].source_id).toBe("old");
  });

  it("limits to 10 sources", () => {
    const sources = Array.from({ length: 15 }, (_, i) => ({
      source_id: `s${i}`,
      source_type: "upload",
      connected: true,
      index_fresh: true,
      document_count: 1,
      last_sync_at: `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.5,
        sources,
        stale_sources: 0,
        fresh_sources: 15,
        total_sources: 15,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.recently_changed_sources).toHaveLength(10);
  });

  it("filters out sources without last_sync_at", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.5,
        sources: [
          { source_id: "with-sync", source_type: "upload", connected: true, index_fresh: true, document_count: 1, last_sync_at: "2024-07-01T00:00:00Z" },
          { source_id: "no-sync", source_type: "email", connected: true, index_fresh: true, document_count: 1 },
        ],
        stale_sources: 0,
        fresh_sources: 2,
        total_sources: 2,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.recently_changed_sources).toHaveLength(1);
    expect(panel.recently_changed_sources[0].source_id).toBe("with-sync");
  });

  it("returns empty array when no sources have last_sync_at", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0,
        sources: [
          { source_id: "s1", source_type: "upload", connected: true, index_fresh: true, document_count: 0 },
        ],
        stale_sources: 0,
        fresh_sources: 1,
        total_sources: 1,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.recently_changed_sources).toHaveLength(0);
  });

  it("includes change_type as synced", () => {
    const bundle = makeBundle();
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.recently_changed_sources.every((s) => s.change_type === "synced")).toBe(true);
  });

  it("includes fresh flag from source", () => {
    const bundle = makeBundle({
      coverage: {
        completeness_score: 0.5,
        sources: [
          { source_id: "fresh", source_type: "upload", connected: true, index_fresh: true, document_count: 1, last_sync_at: "2024-07-01T00:00:00Z" },
          { source_id: "stale", source_type: "email", connected: true, index_fresh: false, document_count: 1, last_sync_at: "2024-06-01T00:00:00Z" },
        ],
        stale_sources: 1,
        fresh_sources: 1,
        total_sources: 2,
      },
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.recently_changed_sources.find((s) => s.source_id === "fresh")?.fresh).toBe(true);
    expect(panel.recently_changed_sources.find((s) => s.source_id === "stale")?.fresh).toBe(false);
  });
});

// ── 5. calculateUnderstandingScore ───────────────────────────────────

describe("calculateUnderstandingScore", () => {
  it("returns higher score with more complete data", () => {
    const fullBundle = makeBundle();
    const emptyBundle = makeBundle({
      parties: [],
      deadlines: [],
      documents: [],
      facts: [],
      communications: [],
      coverage: { completeness_score: 0, sources: [], stale_sources: 0, fresh_sources: 0, total_sources: 0 },
      gaps: [],
    });
    const fullPanel = buildUnderstandingPanel(fullBundle);
    const emptyPanel = buildUnderstandingPanel(emptyBundle);
    expect(fullPanel.understanding_score).toBeGreaterThan(emptyPanel.understanding_score);
  });

  it("penalizes critical risks", () => {
    const bundleWithCriticalGap = makeBundle({
      gaps: [
        { type: "overdue_deadline", severity: "critical", title: "Frist abgelaufen" },
      ],
      deadlines: [
        { id: "d1", title: "Overdue", date: "2024-01-01", urgency: "overdue" },
      ],
    });
    const bundleWithoutGaps = makeBundle({ gaps: [], deadlines: [{ id: "d1", title: "OK", date: "2024-12-01", urgency: "upcoming" }] });
    const withRisk = buildUnderstandingPanel(bundleWithCriticalGap);
    const withoutRisk = buildUnderstandingPanel(bundleWithoutGaps);
    expect(withoutRisk.understanding_score).toBeGreaterThan(withRisk.understanding_score);
  });

  it("penalizes many gaps", () => {
    const manyGaps = makeBundle({
      gaps: Array.from({ length: 10 }, (_, i) => ({
        type: `gap_${i}`,
        severity: "low" as const,
        title: `Gap ${i}`,
      })),
    });
    const fewGaps = makeBundle({ gaps: [] });
    const manyPanel = buildUnderstandingPanel(manyGaps);
    const fewPanel = buildUnderstandingPanel(fewGaps);
    expect(fewPanel.understanding_score).toBeGreaterThan(manyPanel.understanding_score);
  });

  it("returns 0 when engine unreachable and no data", () => {
    const bundle = makeBundle({
      engine_reachable: false,
      parties: [],
      deadlines: [],
      documents: [],
      facts: [],
      communications: [],
      coverage: { completeness_score: 0, sources: [], stale_sources: 0, fresh_sources: 0, total_sources: 0 },
      gaps: [],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.understanding_score).toBe(0);
  });

  it("score is always between 0 and 1", () => {
    const excellent = makeBundle({
      parties: [{ slug: "c1", name: "A", role: "client" }],
      deadlines: [{ id: "d1", title: "F", date: "2024-12-01", urgency: "upcoming" }],
      documents: [{ slug: "d1", name: "Doc", ocr_status: "ocr_complete" }],
      facts: [{ id: "f1", fact: "F", source: "strategy", confidence: "high" }],
      communications: [{ id: "comm1", channel: "email", direction: "incoming", subject: "S", timestamp: "2024-07-01", privileged: false }],
      coverage: { completeness_score: 1, sources: [{ source_id: "s1", source_type: "upload", connected: true, index_fresh: true, document_count: 1 }], stale_sources: 0, fresh_sources: 1, total_sources: 1 },
      gaps: [],
      engine_reachable: true,
    });
    const panel = buildUnderstandingPanel(excellent);
    expect(panel.understanding_score).toBeGreaterThan(0.8);
    expect(panel.understanding_score).toBeLessThanOrEqual(1);
  });
});

// ── 6. buildSummary ───────────────────────────────────────────────────

describe("buildSummary", () => {
  it("includes counts of parties, deadlines, documents, facts", () => {
    const panel = buildUnderstandingPanel(makeBundle());
    expect(panel.summary).toContain("2 Parteien");
    expect(panel.summary).toContain("1 Fristen");
    expect(panel.summary).toContain("2 Dokumente");
    expect(panel.summary).toContain("1 Fakten");
  });

  it("includes communications count when present", () => {
    const bundle = makeBundle({
      communications: [
        { id: "c1", channel: "email", direction: "incoming", subject: "Test", timestamp: "2024-07-01", privileged: false },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.summary).toContain("1 Kommunikationen");
  });

  it("includes critical gaps count when present", () => {
    const bundle = makeBundle({
      gaps: [
        { type: "overdue_deadline", severity: "critical", title: "Frist" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.summary).toContain("kritische Lücke");
  });

  it("includes percentage in summary", () => {
    const panel = buildUnderstandingPanel(makeBundle());
    expect(panel.summary).toMatch(/\d+%/);
  });

  it("returns engine unreachable message when engine down", () => {
    const bundle = makeBundle({ engine_reachable: false });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.summary).toContain("Engine nicht erreichbar");
  });

  it("says 'gut verstanden' for high scores", () => {
    const bundle = makeBundle({
      parties: [{ slug: "c1", name: "A", role: "client" }],
      deadlines: [{ id: "d1", title: "F", date: "2024-12-01", urgency: "upcoming" }],
      documents: [{ slug: "d1", name: "Doc", ocr_status: "ocr_complete" }],
      facts: [{ id: "f1", fact: "F", source: "strategy", confidence: "high" }],
      coverage: { completeness_score: 1, sources: [{ source_id: "s1", source_type: "upload", connected: true, index_fresh: true, document_count: 1 }], stale_sources: 0, fresh_sources: 1, total_sources: 1 },
      gaps: [],
      engine_reachable: true,
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.summary).toContain("gut verstanden");
  });

  it("says 'lückenhaft' for low scores", () => {
    const bundle = makeBundle({
      parties: [],
      deadlines: [],
      documents: [],
      facts: [],
      communications: [],
      coverage: { completeness_score: 0, sources: [], stale_sources: 0, fresh_sources: 0, total_sources: 0 },
      gaps: [
        { type: "overdue_deadline", severity: "critical", title: "Frist" },
      ],
      engine_reachable: true,
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.summary).toContain("lückenhaft");
  });
});

// ── 7. Edge Cases ─────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("handles empty bundle gracefully", () => {
    const bundle = makeBundle({
      parties: [],
      deadlines: [],
      documents: [],
      facts: [],
      communications: [],
      coverage: { completeness_score: 0, sources: [], stale_sources: 0, fresh_sources: 0, total_sources: 0 },
      gaps: [],
      recent_activity: [],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.understanding_score).toBeGreaterThanOrEqual(0);
    expect(panel.risks).toHaveLength(0);
    expect(panel.freshness.overall).toBe("unknown");
    expect(panel.recently_changed_sources).toHaveLength(0);
  });

  it("handles engine unreachable", () => {
    const bundle = makeBundle({ engine_reachable: false });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.engine_reachable).toBe(false);
    expect(panel.summary).toContain("Engine nicht erreichbar");
  });

  it("handles all critical gaps", () => {
    const bundle = makeBundle({
      gaps: [
        { type: "g1", severity: "critical", title: "A" },
        { type: "g2", severity: "critical", title: "B" },
        { type: "g3", severity: "critical", title: "C" },
      ],
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.risks.filter((r) => r.severity === "critical").length).toBeGreaterThanOrEqual(3);
  });

  it("handles bundle with many documents all ocr_complete", () => {
    const bundle = makeBundle({
      documents: Array.from({ length: 20 }, (_, i) => ({
        slug: `doc-${i}`,
        name: `Doc${i}.pdf`,
        ocr_status: "ocr_complete" as const,
      })),
    });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.risks.find((r) => r.source === "document_review")).toBeUndefined();
  });

  it("preserves generated_at from bundle", () => {
    const bundle = makeBundle({ generated_at: "2024-01-01T00:00:00Z" });
    const panel = buildUnderstandingPanel(bundle);
    expect(panel.generated_at).toBe("2024-01-01T00:00:00Z");
  });
});

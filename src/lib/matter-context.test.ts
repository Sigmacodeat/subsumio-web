import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectGaps,
  mapQueryModeToEngineMode,
  buildDeadlineSummaries,
  buildDocumentSummaries,
  buildRecentActivity,
  buildFacts,
  detectContradictions,
  calculateCompletenessScore,
  inferOcrStatus,
  inferSearchMode,
  inferSourceType,
  calculateRecencyHours,
  normalizeCaseSlug,
} from "@/lib/matter-context";
import type {
  MatterCoverageStatus,
  SourceCoverageEntry,
  MatterParty,
  MatterDeadlineSummary,
  MatterDocumentSummary,
  QueryMode,
} from "@/lib/matter-context-types";
import type { CaseFrontmatter, DeadlineEntry, DocumentEntry, AuditLogEntry } from "@/lib/legal-types";

// ── detectGaps ────────────────────────────────────────────────────────

describe("detectGaps", () => {
  const emptyCoverage: MatterCoverageStatus = {
    sources: [],
    total_sources: 0,
    connected_sources: 0,
    fresh_sources: 0,
    stale_sources: 0,
    error_sources: 0,
    ocr_pending: 0,
    overall_freshness: "unknown",
    completeness_score: 1,
    warnings: [],
  };

  it("detects engine_unreachable gap", () => {
    const gaps = detectGaps({}, [], [], [], emptyCoverage, false);
    expect(gaps.some((g) => g.type === "engine_unreachable")).toBe(true);
    expect(gaps.find((g) => g.type === "engine_unreachable")?.severity).toBe("critical");
  });

  it("detects missing client", () => {
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "missing_client_info")).toBe(true);
  });

  it("does not detect missing opponent when case is closed", () => {
    const gaps = detectGaps({ status: "closed" }, [], [], [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unclear_opponent")).toBe(false);
  });

  it("detects unclear opponent for open cases", () => {
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unclear_opponent")).toBe(true);
  });

  it("detects missing power of attorney", () => {
    const parties: MatterParty[] = [{ slug: "c1", name: "Client", role: "client" }];
    const gaps = detectGaps({}, parties, [], [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "missing_power_of_attorney")).toBe(true);
  });

  it("does not detect missing power of attorney when client has vollmacht doc", () => {
    const parties: MatterParty[] = [{ slug: "c1", name: "Client", role: "client" }];
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "Vollmacht.pdf", uploaded_at: "2024-01-01" },
    ];
    const gaps = detectGaps({}, parties, [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "missing_power_of_attorney")).toBe(false);
  });

  it("detects overdue deadlines as critical", () => {
    const deadlines: MatterDeadlineSummary[] = [
      { title: "Klagefrist", date: "2020-01-01", status: "open", urgency: "overdue", source: "court" },
    ];
    const gaps = detectGaps({}, [], deadlines, [], emptyCoverage, true);
    const overdueGap = gaps.find((g) => g.type === "missing_deadline");
    expect(overdueGap).toBeDefined();
    expect(overdueGap?.severity).toBe("critical");
  });

  it("detects incomplete coverage when score < 0.5", () => {
    const lowCoverage = { ...emptyCoverage, completeness_score: 0.3 };
    const gaps = detectGaps({}, [], [], [], lowCoverage, true);
    expect(gaps.some((g) => g.type === "incomplete_coverage")).toBe(true);
  });

  it("does not detect incomplete coverage when score >= 0.5", () => {
    const goodCoverage = { ...emptyCoverage, completeness_score: 0.8 };
    const gaps = detectGaps({}, [], [], [], goodCoverage, true);
    expect(gaps.some((g) => g.type === "incomplete_coverage")).toBe(false);
  });

  it("detects unreviewed documents with unknown OCR status", () => {
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "scan.pdf", uploaded_at: "2024-01-01", ocr_status: "unknown" },
    ];
    const gaps = detectGaps({}, [], [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unreviewed_document")).toBe(true);
  });

  it("detects missing deadline confirmation for court deadlines", () => {
    const deadlines: MatterDeadlineSummary[] = [
      { title: "Frist", date: "2025-12-01", status: "open", urgency: "normal", source: "court", court: "LG Wien" },
    ];
    const gaps = detectGaps({}, [], deadlines, [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "missing_deadline_confirmation")).toBe(true);
  });

  it("detects unreviewed documents with extraction_status ocr_needed", () => {
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "scan.pdf", uploaded_at: "2024-01-01", extraction_status: "ocr_needed" },
    ];
    const gaps = detectGaps({}, [], [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unreviewed_document")).toBe(true);
  });

  it("detects unreviewed documents with extraction_status ocr_failed", () => {
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "scan.pdf", uploaded_at: "2024-01-01", extraction_status: "ocr_failed" },
    ];
    const gaps = detectGaps({}, [], [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unreviewed_document")).toBe(true);
  });

  it("detects unreviewed documents with extraction_status processing", () => {
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "doc.pdf", uploaded_at: "2024-01-01", extraction_status: "processing" },
    ];
    const gaps = detectGaps({}, [], [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unreviewed_document")).toBe(true);
  });

  it("does not detect unreviewed documents with extraction_status ready", () => {
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "doc.pdf", uploaded_at: "2024-01-01", extraction_status: "ready" },
    ];
    const gaps = detectGaps({}, [], [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unreviewed_document")).toBe(false);
  });

  it("does not detect unreviewed documents with extraction_status text_layer", () => {
    const docs: MatterDocumentSummary[] = [
      { slug: "d1", name: "doc.docx", uploaded_at: "2024-01-01", extraction_status: "text_layer" },
    ];
    const gaps = detectGaps({}, [], [], docs, emptyCoverage, true);
    expect(gaps.some((g) => g.type === "unreviewed_document")).toBe(false);
  });
});

// ── mapQueryModeToEngineMode ──────────────────────────────────────────

describe("mapQueryModeToEngineMode", () => {
  it("maps conservative → conservative", () => {
    expect(mapQueryModeToEngineMode("conservative")).toBe("conservative");
  });

  it("maps balanced → balanced", () => {
    expect(mapQueryModeToEngineMode("balanced")).toBe("balanced");
  });

  it("maps deep_matter → tokenmax", () => {
    expect(mapQueryModeToEngineMode("deep_matter")).toBe("tokenmax");
  });

  it("maps admin_audit → tokenmax", () => {
    expect(mapQueryModeToEngineMode("admin_audit")).toBe("tokenmax");
  });

  it("maps external_law → balanced", () => {
    expect(mapQueryModeToEngineMode("external_law")).toBe("balanced");
  });
});

// ── buildDeadlineSummaries ────────────────────────────────────────────

describe("buildDeadlineSummaries", () => {
  it("returns empty array for no deadlines", () => {
    expect(buildDeadlineSummaries([])).toEqual([]);
  });

  it("filters out deadlines without dates", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "No date", description: "test" },
    ];
    expect(buildDeadlineSummaries(deadlines)).toEqual([]);
  });

  it("marks overdue deadlines correctly", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "Old deadline", due_date: "2020-01-01", status: "open" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].urgency).toBe("overdue");
  });

  it("marks done deadlines correctly", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "Done deadline", due_date: "2025-12-01", status: "done" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].urgency).toBe("done");
  });

  it("sorts deadlines by date ascending", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "Later", due_date: "2025-12-01" },
      { title: "Earlier", due_date: "2025-01-01" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].title).toBe("Earlier");
    expect(result[1].title).toBe("Later");
  });
});

// ── buildDocumentSummaries ────────────────────────────────────────────

describe("buildDocumentSummaries", () => {
  it("returns empty array for no documents", () => {
    expect(buildDocumentSummaries([])).toEqual([]);
  });

  it("maps document fields correctly", () => {
    const docs: DocumentEntry[] = [
      { id: "d1", name: "contract.pdf", uploadedAt: "2024-06-01", size: 1024, slug: "docs/contract" },
    ];
    const result = buildDocumentSummaries(docs);
    expect(result[0].slug).toBe("docs/contract");
    expect(result[0].name).toBe("contract.pdf");
    expect(result[0].size).toBe(1024);
  });
});

// ── inferOcrStatus ────────────────────────────────────────────────────

describe("inferOcrStatus", () => {
  it("returns 'unknown' for PDF files", () => {
    expect(inferOcrStatus({ id: "1", name: "scan.pdf", uploadedAt: "2024-01-01" })).toBe("unknown");
  });

  it("returns 'unknown' for image files", () => {
    expect(inferOcrStatus({ id: "1", name: "scan.jpg", uploadedAt: "2024-01-01" })).toBe("unknown");
  });

  it("returns 'text_layer' for DOCX files", () => {
    expect(inferOcrStatus({ id: "1", name: "doc.docx", uploadedAt: "2024-01-01" })).toBe("text_layer");
  });

  it("returns 'text_layer' for TXT files", () => {
    expect(inferOcrStatus({ id: "1", name: "notes.txt", uploadedAt: "2024-01-01" })).toBe("text_layer");
  });

  it("returns 'not_applicable' for unknown extensions", () => {
    expect(inferOcrStatus({ id: "1", name: "data.json", uploadedAt: "2024-01-01" })).toBe("not_applicable");
  });
});

// ── buildRecentActivity ───────────────────────────────────────────────

describe("buildRecentActivity", () => {
  it("returns empty array for no inputs", () => {
    expect(buildRecentActivity([], [])).toEqual([]);
  });

  it("combines audit log and timeline entries", () => {
    const auditLog: AuditLogEntry[] = [
      { id: "a1", at: "2024-06-01T10:00:00Z", action: "created", actor: "user1" },
    ];
    const timeline = [
      { id: "t1", date: "2024-06-02T10:00:00Z", title: "Hearing" },
    ];
    const result = buildRecentActivity(auditLog, timeline);
    expect(result.length).toBe(2);
    // Sorted by date descending — hearing (June 2) should be first
    expect(result[0].description).toBe("Hearing");
  });

  it("limits to 30 entries", () => {
    const auditLog: AuditLogEntry[] = Array.from({ length: 40 }, (_, i) => ({
      id: `a${i}`,
      at: `2024-06-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      action: "updated" as const,
    }));
    const result = buildRecentActivity(auditLog, []);
    expect(result.length).toBe(20);
  });
});

// ── buildFacts ────────────────────────────────────────────────────────

describe("buildFacts", () => {
  it("returns empty array for empty frontmatter", () => {
    expect(buildFacts({})).toEqual([]);
  });

  it("extracts strategy summary as a fact", () => {
    const fm: CaseFrontmatter = {
      strategy: { summary: "Strong case for plaintiff" },
    };
    const facts = buildFacts(fm);
    expect(facts.some((f) => f.statement === "Strong case for plaintiff")).toBe(true);
  });

  it("extracts claims as facts", () => {
    const fm: CaseFrontmatter = {
      claims: ["Claim 1: Breach of contract", "Claim 2: Damages"],
    };
    const facts = buildFacts(fm);
    expect(facts.length).toBe(2);
    expect(facts[0].statement).toBe("Claim 1: Breach of contract");
  });

  it("extracts evidence with confidence based on weight", () => {
    const fm: CaseFrontmatter = {
      evidence: [
        { description: "Strong evidence", weight: 0.9 },
        { description: "Weak evidence", weight: 0.2 },
      ],
    };
    const facts = buildFacts(fm);
    expect(facts[0].confidence).toBe("high");
    expect(facts[1].confidence).toBe("low");
  });
});

// ── detectContradictions ──────────────────────────────────────────────

describe("detectContradictions", () => {
  it("detects contradictions between claims and defenses", () => {
    const fm: CaseFrontmatter = {
      claims: ["Der Beklagte hat den Vertrag nicht erfüllt"],
      defenses: ["Die Erfüllung wurde zugestanden"],
    };
    const gaps = detectContradictions(fm);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].type).toBe("contradictory_facts");
  });

  it("returns empty for non-contradictory claims/defenses", () => {
    const fm: CaseFrontmatter = {
      claims: ["Schadensersatz"],
      defenses: ["Mitverschulden"],
    };
    const gaps = detectContradictions(fm);
    expect(gaps).toEqual([]);
  });
});

// ── calculateCompletenessScore ────────────────────────────────────────

describe("calculateCompletenessScore", () => {
  it("returns 0 for empty sources", () => {
    expect(calculateCompletenessScore([])).toBe(0);
  });

  it("returns high score for fully connected, fresh, OCR-complete sources", () => {
    const sources: SourceCoverageEntry[] = [
      { source_id: "s1", source_label: "Source 1", source_type: "upload", connected: true, last_sync_at: null, document_count: 10, index_fresh: true, ocr_complete: true },
    ];
    const score = calculateCompletenessScore(sources);
    expect(score).toBeCloseTo(1, 5);
  });

  it("returns lower score for disconnected sources", () => {
    const sources: SourceCoverageEntry[] = [
      { source_id: "s1", source_label: "Source 1", source_type: "email", connected: false, last_sync_at: null, document_count: 0, index_fresh: false, ocr_complete: true },
    ];
    const score = calculateCompletenessScore(sources);
    expect(score).toBeLessThan(0.5);
  });

  it("averages across multiple sources", () => {
    const sources: SourceCoverageEntry[] = [
      { source_id: "s1", source_label: "Good", source_type: "upload", connected: true, last_sync_at: null, document_count: 5, index_fresh: true, ocr_complete: true },
      { source_id: "s2", source_label: "Bad", source_type: "email", connected: false, last_sync_at: null, document_count: 0, index_fresh: false, ocr_complete: false },
    ];
    const score = calculateCompletenessScore(sources);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.6);
  });
});

// ── inferSearchMode ───────────────────────────────────────────────────

describe("inferSearchMode", () => {
  it("returns 'hybrid' for high scores", () => {
    expect(inferSearchMode(0.9, "some snippet")).toBe("hybrid");
  });

  it("returns 'semantic' for long snippets", () => {
    expect(inferSearchMode(0.5, "a".repeat(150))).toBe("semantic");
  });

  it("returns 'keyword' for short snippets with low scores", () => {
    expect(inferSearchMode(0.3, "short")).toBe("keyword");
  });
});

// ── inferSourceType ───────────────────────────────────────────────────

describe("inferSourceType", () => {
  it("detects statute slugs", () => {
    expect(inferSourceType("legal/norms/bgb-280-1")).toBe("statute");
  });

  it("detects case slugs", () => {
    expect(inferSourceType("cases/2024-001")).toBe("case");
  });

  it("detects contact slugs", () => {
    expect(inferSourceType("contacts/john-doe")).toBe("contact");
  });

  it("detects document slugs", () => {
    expect(inferSourceType("documents/contract-001")).toBe("document");
  });

  it("returns undefined for unknown slug patterns", () => {
    expect(inferSourceType("random/slug")).toBeUndefined();
  });
});

// ── calculateRecencyHours ─────────────────────────────────────────────

describe("calculateRecencyHours", () => {
  it("calculates hours since given date", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const hours = calculateRecencyHours(twoHoursAgo);
    expect(hours).toBe(2);
  });

  it("returns 0 for future dates", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const hours = calculateRecencyHours(future);
    expect(hours).toBeLessThanOrEqual(0);
  });
});

// ── normalizeCaseSlug ─────────────────────────────────────────────────

describe("normalizeCaseSlug", () => {
  it("removes leading/trailing slashes", () => {
    expect(normalizeCaseSlug("/cases/2024-001/")).toBe("cases/2024-001");
  });

  it("decodes URL-encoded slashes", () => {
    expect(normalizeCaseSlug("cases%2F2024-001")).toBe("cases/2024-001");
  });
});

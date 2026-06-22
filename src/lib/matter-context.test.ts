import { describe, it, expect, vi } from "vitest";
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
  buildCommunications,
  buildPermissionSummary,
  buildDocumentRequestSummaries,
  summarizeUploadHealth,
} from "@/lib/matter-context";
import type {
  MatterCoverageStatus,
  SourceCoverageEntry,
  MatterParty,
  MatterDeadlineSummary,
  MatterDocumentSummary,
  MatterCommunicationEntry,
  MatterPermissionSummary,
  MatterDocumentRequestSummary,
} from "@/lib/matter-context-types";
import type {
  CaseFrontmatter,
  DeadlineEntry,
  DocumentEntry,
  AuditLogEntry,
  CommunicationEntry,
} from "@/lib/legal-types";

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
      {
        title: "Klagefrist",
        date: "2020-01-01",
        status: "open",
        urgency: "overdue",
        source: "court",
      },
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
      {
        title: "Frist",
        date: "2025-12-01",
        status: "open",
        urgency: "normal",
        source: "court",
        court: "LG Wien",
      },
    ];
    const gaps = detectGaps({}, [], deadlines, [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "missing_deadline_confirmation")).toBe(true);
  });

  it("detects missing required document request items", () => {
    const requests: MatterDocumentRequestSummary[] = [
      {
        slug: "legal/document-requests/1",
        status: "sent",
        channel: "whatsapp",
        created_at: "2026-06-20T10:00:00.000Z",
        updated_at: "2026-06-20T10:00:00.000Z",
        open_items: [{ key: "vollmacht", label: "Vollmacht", required: true }],
        fulfilled_items: [],
      },
    ];
    const gaps = detectGaps({}, [], [], [], emptyCoverage, true, [], null, requests);
    const gap = gaps.find(
      (g) => g.type === "missing_document" && g.related_entity === "legal/document-requests/1"
    );
    expect(gap?.title).toContain("Vollmacht");
  });

  it("does not detect fulfilled document request items as missing", () => {
    const requests: MatterDocumentRequestSummary[] = [
      {
        slug: "legal/document-requests/1",
        status: "fulfilled",
        channel: "portal",
        created_at: "2026-06-20T10:00:00.000Z",
        updated_at: "2026-06-20T10:00:00.000Z",
        open_items: [{ key: "vollmacht", label: "Vollmacht", required: true }],
        fulfilled_items: [],
      },
    ];
    const gaps = detectGaps({}, [], [], [], emptyCoverage, true, [], null, requests);
    expect(
      gaps.some(
        (g) => g.type === "missing_document" && g.related_entity === "legal/document-requests/1"
      )
    ).toBe(false);
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
});

// ── buildDeadlineSummaries ────────────────────────────────────────────

describe("buildDeadlineSummaries", () => {
  it("returns empty array for no deadlines", () => {
    expect(buildDeadlineSummaries([])).toEqual([]);
  });

  it("filters out deadlines without dates", () => {
    const deadlines: DeadlineEntry[] = [{ title: "No date", description: "test" }];
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
      {
        id: "d1",
        name: "contract.pdf",
        uploadedAt: "2024-06-01",
        size: 1024,
        slug: "docs/contract",
      },
    ];
    const result = buildDocumentSummaries(docs);
    expect(result[0].slug).toBe("docs/contract");
    expect(result[0].name).toBe("contract.pdf");
    expect(result[0].size).toBe(1024);
  });
});

// ── summarizeUploadHealth ────────────────────────────────────────────

describe("summarizeUploadHealth", () => {
  it("marks ready/text-layer documents as fresh and OCR-complete", () => {
    const result = summarizeUploadHealth([
      {
        slug: "d1",
        name: "Vertrag.docx",
        uploaded_at: "2024-06-01",
        extraction_status: "text_layer",
      },
      {
        slug: "d2",
        name: "Scan.pdf",
        uploaded_at: "2024-06-01",
        extraction_status: "ready",
      },
    ]);
    expect(result).toEqual({ indexFresh: true, ocrComplete: true });
  });

  it("does not claim freshness or OCR completeness for pending scan documents", () => {
    const result = summarizeUploadHealth([
      {
        slug: "d1",
        name: "Scan.pdf",
        uploaded_at: "2024-06-01",
        extraction_status: "ocr_needed",
        ocr_status: "unknown",
      },
    ]);
    expect(result.indexFresh).toBe(false);
    expect(result.ocrComplete).toBe(false);
  });

  it("surfaces failed extraction as upload coverage error", () => {
    const result = summarizeUploadHealth([
      {
        slug: "d1",
        name: "Kaputter Scan.pdf",
        uploaded_at: "2024-06-01",
        extraction_status: "ocr_failed",
      },
    ]);
    expect(result.indexFresh).toBe(false);
    expect(result.error).toContain("fehlgeschlagener");
  });
});

// ── buildDocumentRequestSummaries ────────────────────────────────────

describe("buildDocumentRequestSummaries", () => {
  it("maps open and fulfilled document request items for a case", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            pages: [
              {
                slug: "legal/document-requests/1",
                title: "Dokumentenanfrage",
                content: "Bitte Vollmacht und Bescheid hochladen",
                frontmatter: {
                  type: "document_request",
                  case_slug: "legal/cases/1",
                  status: "partially_fulfilled",
                  channel: "whatsapp",
                  created_at: "2026-06-20T10:00:00.000Z",
                  updated_at: "2026-06-20T11:00:00.000Z",
                  items: [
                    { key: "vollmacht", label: "Vollmacht", required: true },
                    {
                      key: "bescheid",
                      label: "Bescheid",
                      required: true,
                      received_document_slug: "uploads/bescheid",
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
    );
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await buildDocumentRequestSummaries("http://engine", {}, "legal/cases/1");
      expect(result).toHaveLength(1);
      expect(result[0].open_items[0].label).toBe("Vollmacht");
      expect(result[0].fulfilled_items[0].document_slug).toBe("uploads/bescheid");
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
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
    expect(inferOcrStatus({ id: "1", name: "doc.docx", uploadedAt: "2024-01-01" })).toBe(
      "text_layer"
    );
  });

  it("returns 'text_layer' for TXT files", () => {
    expect(inferOcrStatus({ id: "1", name: "notes.txt", uploadedAt: "2024-01-01" })).toBe(
      "text_layer"
    );
  });

  it("returns 'not_applicable' for unknown extensions", () => {
    expect(inferOcrStatus({ id: "1", name: "data.json", uploadedAt: "2024-01-01" })).toBe(
      "not_applicable"
    );
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
    const timeline = [{ id: "t1", date: "2024-06-02T10:00:00Z", title: "Hearing" }];
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
      {
        source_id: "s1",
        source_label: "Source 1",
        source_type: "upload",
        connected: true,
        last_sync_at: null,
        document_count: 10,
        index_fresh: true,
        ocr_complete: true,
      },
    ];
    const score = calculateCompletenessScore(sources);
    expect(score).toBeCloseTo(1, 5);
  });

  it("returns lower score for disconnected sources", () => {
    const sources: SourceCoverageEntry[] = [
      {
        source_id: "s1",
        source_label: "Source 1",
        source_type: "email",
        connected: false,
        last_sync_at: null,
        document_count: 0,
        index_fresh: false,
        ocr_complete: true,
      },
    ];
    const score = calculateCompletenessScore(sources);
    expect(score).toBeLessThan(0.5);
  });

  it("averages across multiple sources", () => {
    const sources: SourceCoverageEntry[] = [
      {
        source_id: "s1",
        source_label: "Good",
        source_type: "upload",
        connected: true,
        last_sync_at: null,
        document_count: 5,
        index_fresh: true,
        ocr_complete: true,
      },
      {
        source_id: "s2",
        source_label: "Bad",
        source_type: "email",
        connected: false,
        last_sync_at: null,
        document_count: 0,
        index_fresh: false,
        ocr_complete: false,
      },
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

  it("handles multiple leading slashes", () => {
    expect(normalizeCaseSlug("///cases/2024-001")).toBe("cases/2024-001");
  });

  it("handles multiple trailing slashes", () => {
    expect(normalizeCaseSlug("cases/2024-001///")).toBe("cases/2024-001");
  });

  it("handles mixed encoded and literal slashes", () => {
    expect(normalizeCaseSlug("/cases%2F2024-001/")).toBe("cases/2024-001");
  });

  it("returns empty string for slashes-only input", () => {
    expect(normalizeCaseSlug("///")).toBe("");
  });
});

// ── inferSourceType — additional slugs ─────────────────────────────────

describe("inferSourceType — additional slugs", () => {
  it("detects deadline slugs", () => {
    expect(inferSourceType("legal/deadlines/bgb-195")).toBe("deadline");
  });

  it("detects invoice slugs", () => {
    expect(inferSourceType("invoices/2024-001")).toBe("invoice");
  });

  it("returns undefined for root slug", () => {
    expect(inferSourceType("")).toBeUndefined();
  });
});

// ── buildDeadlineSummaries — additional edge cases ─────────────────────

describe("buildDeadlineSummaries — additional edge cases", () => {
  it("uses date field when due_date is not present", () => {
    const deadlines: DeadlineEntry[] = [{ title: "Using date", date: "2025-06-01" }];
    const result = buildDeadlineSummaries(deadlines);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2025-06-01");
  });

  it("prefers due_date over date when both are present", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "Both dates", date: "2025-01-01", due_date: "2025-12-01" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].date).toBe("2025-12-01");
  });

  it("marks critical urgency for deadlines within 3 days", () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const deadlines: DeadlineEntry[] = [{ title: "Soon", due_date: soon, status: "open" }];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].urgency).toBe("critical");
  });

  it("marks upcoming urgency for deadlines within 14 days", () => {
    const upcoming = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const deadlines: DeadlineEntry[] = [{ title: "Upcoming", due_date: upcoming, status: "open" }];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].urgency).toBe("upcoming");
  });

  it("marks completed status as done urgency", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "Completed", due_date: "2025-12-01", status: "completed" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].urgency).toBe("done");
  });

  it("uses description as title when title is missing", () => {
    const deadlines: DeadlineEntry[] = [
      { description: "Fristbeschreibung", due_date: "2025-12-01" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].title).toBe("Fristbeschreibung");
  });

  it("uses 'Unbenannte Frist' when neither title nor description", () => {
    const deadlines: DeadlineEntry[] = [{ due_date: "2025-12-01" }];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].title).toBe("Unbenannte Frist");
  });

  it("preserves court field", () => {
    const deadlines: DeadlineEntry[] = [
      { title: "Court deadline", due_date: "2025-12-01", court: "LG Wien" },
    ];
    const result = buildDeadlineSummaries(deadlines);
    expect(result[0].court).toBe("LG Wien");
  });
});

// ── buildFacts — additional edge cases ─────────────────────────────────

describe("buildFacts — additional edge cases", () => {
  it("extracts strategy.recommendedApproach as fact", () => {
    const fm: CaseFrontmatter = {
      strategy: { recommendedApproach: "Klage einreichen" },
    };
    const facts = buildFacts(fm);
    expect(facts.some((f) => f.statement === "Klage einreichen")).toBe(true);
  });

  it("extracts strategy.recommended as fact", () => {
    const fm: CaseFrontmatter = {
      strategy: { recommended: "Vergleich anstreben" },
    };
    const facts = buildFacts(fm);
    expect(facts.some((f) => f.statement === "Vergleich anstreben")).toBe(true);
  });

  it("assigns medium confidence to evidence with no weight", () => {
    const fm: CaseFrontmatter = {
      evidence: [{ description: "No weight evidence" }],
    };
    const facts = buildFacts(fm);
    expect(facts[0].confidence).toBe("medium");
  });

  it("assigns medium confidence to evidence with weight 0.5", () => {
    const fm: CaseFrontmatter = {
      evidence: [{ description: "Medium weight", weight: 0.5 }],
    };
    const facts = buildFacts(fm);
    expect(facts[0].confidence).toBe("medium");
  });

  it("skips evidence entries without description", () => {
    const fm: CaseFrontmatter = {
      evidence: [{ description: "" }, { description: "Valid" }],
    };
    const facts = buildFacts(fm);
    expect(facts).toHaveLength(1);
    expect(facts[0].statement).toBe("Valid");
  });

  it("uses evidence source when provided", () => {
    const fm: CaseFrontmatter = {
      evidence: [{ description: "Email evidence", source: "email_archive" }],
    };
    const facts = buildFacts(fm);
    expect(facts[0].source).toBe("email_archive");
  });
});

// ── detectContradictions — additional negation pairs ───────────────────

describe("detectContradictions — additional negation pairs", () => {
  it("detects 'bestreitet' vs 'zugestanden'", () => {
    const fm: CaseFrontmatter = {
      claims: ["Der Beklagte bestreitet die Forderung"],
      defenses: ["Die Forderung wurde zugestanden"],
    };
    expect(detectContradictions(fm).length).toBeGreaterThan(0);
  });

  it("detects 'leugnet' vs 'eingestanden'", () => {
    const fm: CaseFrontmatter = {
      claims: ["Der Kläger leugnet den Vertrag"],
      defenses: ["Der Vertrag wurde eingestanden"],
    };
    expect(detectContradictions(fm).length).toBeGreaterThan(0);
  });

  it("detects 'nicht' as negation", () => {
    const fm: CaseFrontmatter = {
      claims: ["Der Beklagte hat nicht gezahlt"],
      defenses: ["Die Zahlung wurde geleistet"],
    };
    expect(detectContradictions(fm).length).toBeGreaterThan(0);
  });

  it("returns empty when claims or defenses are empty", () => {
    expect(detectContradictions({ claims: [] })).toEqual([]);
    expect(detectContradictions({ defenses: [] })).toEqual([]);
    expect(detectContradictions({})).toEqual([]);
  });
});

// ── buildRecentActivity — additional edge cases ────────────────────────

describe("buildRecentActivity — additional edge cases", () => {
  it("handles only timeline entries (no audit log)", () => {
    const timeline = [
      { date: "2024-06-01T10:00:00Z", title: "Hearing" },
      { date: "2024-06-02T10:00:00Z", title: "Judgment" },
    ];
    const result = buildRecentActivity([], timeline);
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("Judgment"); // sorted desc
  });

  it("skips timeline entries without date", () => {
    const timeline = [
      { title: "No date entry" },
      { date: "2024-06-01T10:00:00Z", title: "With date" },
    ];
    const result = buildRecentActivity([], timeline);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("With date");
  });

  it("uses timeline type as action", () => {
    const timeline = [{ date: "2024-06-01T10:00:00Z", type: "hearing", title: "Court hearing" }];
    const result = buildRecentActivity([], timeline);
    expect(result[0].action).toBe("hearing");
  });

  it("uses 'timeline' as default action when type missing", () => {
    const timeline = [{ date: "2024-06-01T10:00:00Z", title: "Some event" }];
    const result = buildRecentActivity([], timeline);
    expect(result[0].action).toBe("timeline");
  });

  it("uses description when title is missing in timeline", () => {
    const timeline = [{ date: "2024-06-01T10:00:00Z", description: "Description only" }];
    const result = buildRecentActivity([], timeline);
    expect(result[0].description).toBe("Description only");
  });

  it("uses actorId as fallback when actor is missing in audit log", () => {
    const auditLog: AuditLogEntry[] = [
      { id: "a1", at: "2024-06-01T10:00:00Z", action: "updated", actorId: "user123" },
    ];
    const result = buildRecentActivity(auditLog, []);
    expect(result[0].actor).toBe("user123");
  });
});

// ── calculateCompletenessScore — edge cases ────────────────────────────

describe("calculateCompletenessScore — edge cases", () => {
  it("returns 0.1 for source with only no-error", () => {
    const sources: SourceCoverageEntry[] = [
      {
        source_id: "s1",
        source_label: "S1",
        source_type: "email",
        connected: false,
        last_sync_at: null,
        document_count: 0,
        index_fresh: false,
        ocr_complete: false,
        error: undefined,
      },
    ];
    expect(calculateCompletenessScore(sources)).toBeCloseTo(0.1, 5);
  });

  it("caps at 1.0 even if all sources are perfect", () => {
    const sources: SourceCoverageEntry[] = [
      {
        source_id: "s1",
        source_label: "S1",
        source_type: "upload",
        connected: true,
        last_sync_at: null,
        document_count: 0,
        index_fresh: true,
        ocr_complete: true,
        error: undefined,
      },
      {
        source_id: "s2",
        source_label: "S2",
        source_type: "upload",
        connected: true,
        last_sync_at: null,
        document_count: 0,
        index_fresh: true,
        ocr_complete: true,
        error: undefined,
      },
    ];
    expect(calculateCompletenessScore(sources)).toBeCloseTo(1, 10);
  });

  it("returns 0 for source with error and nothing else", () => {
    const sources: SourceCoverageEntry[] = [
      {
        source_id: "s1",
        source_label: "S1",
        source_type: "email",
        connected: false,
        last_sync_at: null,
        document_count: 0,
        index_fresh: false,
        ocr_complete: false,
        error: "broken",
      },
    ];
    expect(calculateCompletenessScore(sources)).toBe(0);
  });
});

// ── buildCommunications ───────────────────────────────────────────────

describe("buildCommunications", () => {
  const fixtureComms: CommunicationEntry[] = [
    {
      id: "c1",
      channel: "email",
      direction: "incoming",
      subject: "Mandatsbestätigung",
      timestamp: "2026-06-01T10:00:00Z",
      counterpart: "client@example.com",
      lawyer: "Dr. Schmidt",
      privileged: true,
      attachment_slugs: ["docs/contract.pdf"],
    },
    {
      id: "c2",
      channel: "whatsapp",
      direction: "outgoing",
      summary: "Termin bestätigt",
      timestamp: "2026-06-02T14:00:00Z",
      counterpart: "+43 123 456",
    },
    {
      id: "c3",
      channel: "phone",
      direction: "incoming",
      timestamp: "2026-06-03T09:00:00Z",
      counterpart: "Gegner Rechtsanwalt",
      privileged: false,
    },
  ];

  it("returns empty array for no entries", () => {
    expect(buildCommunications([])).toEqual([]);
  });

  it("maps all fields correctly", () => {
    const result = buildCommunications(fixtureComms);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("c3"); // sorted desc by timestamp
    expect(result[0].channel).toBe("phone");
    expect(result[0].direction).toBe("incoming");
    expect(result[0].subject).toBe("(kein Betreff)"); // no subject/summary
    expect(result[0].counterpart).toBe("Gegner Rechtsanwalt");
    expect(result[0].privileged).toBe(false);
    expect(result[0].has_attachments).toBe(false);
  });

  it("uses subject when available", () => {
    const result = buildCommunications(fixtureComms);
    const email = result.find((c) => c.id === "c1");
    expect(email?.subject).toBe("Mandatsbestätigung");
  });

  it("uses summary as fallback for subject", () => {
    const result = buildCommunications(fixtureComms);
    const wa = result.find((c) => c.id === "c2");
    expect(wa?.subject).toBe("Termin bestätigt");
  });

  it("defaults privileged to false when not set", () => {
    const entries: CommunicationEntry[] = [
      { id: "c1", channel: "email", direction: "outgoing", timestamp: "2026-01-01T00:00:00Z" },
    ];
    const result = buildCommunications(entries);
    expect(result[0].privileged).toBe(false);
  });

  it("detects has_attachments correctly", () => {
    const result = buildCommunications(fixtureComms);
    expect(result.find((c) => c.id === "c1")?.has_attachments).toBe(true);
    expect(result.find((c) => c.id === "c2")?.has_attachments).toBe(false);
  });

  it("sorts by timestamp descending", () => {
    const result = buildCommunications(fixtureComms);
    expect(result[0].timestamp).toBe("2026-06-03T09:00:00Z");
    expect(result[1].timestamp).toBe("2026-06-02T14:00:00Z");
    expect(result[2].timestamp).toBe("2026-06-01T10:00:00Z");
  });

  it("filters out entries without id", () => {
    const entries: CommunicationEntry[] = [
      { id: "", channel: "email", direction: "incoming", timestamp: "2026-01-01T00:00:00Z" },
      { id: "c1", channel: "email", direction: "incoming", timestamp: "2026-01-01T00:00:00Z" },
    ];
    const result = buildCommunications(entries);
    expect(result).toHaveLength(1);
  });

  it("filters out entries without timestamp", () => {
    const entries = [
      { id: "c1", channel: "email" as const, direction: "incoming" as const, timestamp: "" },
      {
        id: "c2",
        channel: "email" as const,
        direction: "incoming" as const,
        timestamp: "2026-01-01T00:00:00Z",
      },
    ];
    const result = buildCommunications(entries as CommunicationEntry[]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c2");
  });

  it("handles all channel types", () => {
    const channels: CommunicationEntry["channel"][] = [
      "email",
      "whatsapp",
      "phone",
      "letter",
      "portal",
      "bea",
      "other",
    ];
    const entries = channels.map((ch, i) => ({
      id: `c${i}`,
      channel: ch,
      direction: "incoming" as const,
      timestamp: `2026-06-0${i + 1}T00:00:00Z`,
    }));
    const result = buildCommunications(entries);
    expect(result).toHaveLength(7);
    expect(result.map((r) => r.channel)).toContain("bea");
    expect(result.map((r) => r.channel)).toContain("portal");
  });
});

// ── buildPermissionSummary ────────────────────────────────────────────

describe("buildPermissionSummary", () => {
  it("returns sensible defaults for undefined permissions", () => {
    const result = buildPermissionSummary(undefined);
    expect(result.visibility).toBe("full");
    expect(result.privileged).toBe(false);
    expect(result.legal_hold).toBe(false);
    expect(result.allowed_users).toEqual([]);
    expect(result.blocked_users).toEqual([]);
    expect(result.ethical_wall_active).toBe(false);
  });

  it("returns sensible defaults for empty permissions object", () => {
    const result = buildPermissionSummary({});
    expect(result.visibility).toBe("full");
    expect(result.privileged).toBe(false);
    expect(result.legal_hold).toBe(false);
  });

  it("maps visibility correctly", () => {
    const result = buildPermissionSummary({ visibility: "restricted" });
    expect(result.visibility).toBe("restricted");
  });

  it("maps privileged flag", () => {
    const result = buildPermissionSummary({ privileged: true });
    expect(result.privileged).toBe(true);
  });

  it("maps legal_hold flag", () => {
    const result = buildPermissionSummary({ legal_hold: true });
    expect(result.legal_hold).toBe(true);
  });

  it("maps allowed_users list", () => {
    const result = buildPermissionSummary({ allowed_users: ["user1", "user2"] });
    expect(result.allowed_users).toEqual(["user1", "user2"]);
  });

  it("maps blocked_users list", () => {
    const result = buildPermissionSummary({ blocked_users: ["user3"] });
    expect(result.blocked_users).toEqual(["user3"]);
    expect(result.ethical_wall_active).toBe(true);
  });

  it("ethical_wall_active is false when no blocked_users", () => {
    const result = buildPermissionSummary({ blocked_users: [] });
    expect(result.ethical_wall_active).toBe(false);
  });

  it("preserves all fields together", () => {
    const result = buildPermissionSummary({
      visibility: "confidential",
      privileged: true,
      legal_hold: true,
      allowed_users: ["user1"],
      blocked_users: ["user2"],
    });
    expect(result).toEqual({
      visibility: "confidential",
      privileged: true,
      legal_hold: true,
      allowed_users: ["user1"],
      blocked_users: ["user2"],
      ethical_wall_active: true,
    });
  });
});

// ── detectGaps — communication & permission gaps ──────────────────────

describe("detectGaps — communication & permission gaps", () => {
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

  it("detects missing_communication_log for open cases", () => {
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, [], null);
    expect(gaps.some((g) => g.type === "missing_communication_log")).toBe(true);
  });

  it("does not detect missing_communication_log for closed cases", () => {
    const gaps = detectGaps({ status: "closed" }, [], [], [], emptyCoverage, true, [], null);
    expect(gaps.some((g) => g.type === "missing_communication_log")).toBe(false);
  });

  it("does not detect missing_communication_log when communications exist", () => {
    const comms: MatterCommunicationEntry[] = [
      {
        id: "c1",
        channel: "email",
        direction: "incoming",
        subject: "Test",
        timestamp: "2026-01-01T00:00:00Z",
        privileged: false,
        has_attachments: false,
      },
    ];
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, comms, null);
    expect(gaps.some((g) => g.type === "missing_communication_log")).toBe(false);
  });

  it("detects unprivileged_communication in privileged case", () => {
    const comms: MatterCommunicationEntry[] = [
      {
        id: "c1",
        channel: "email",
        direction: "incoming",
        subject: "Test",
        timestamp: "2026-01-01T00:00:00Z",
        privileged: false,
        has_attachments: false,
      },
    ];
    const perms: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: true,
      legal_hold: false,
      allowed_users: [],
      blocked_users: [],
      ethical_wall_active: false,
    };
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, comms, perms);
    expect(gaps.some((g) => g.type === "unprivileged_communication")).toBe(true);
  });

  it("does not detect unprivileged_communication for phone calls", () => {
    const comms: MatterCommunicationEntry[] = [
      {
        id: "c1",
        channel: "phone",
        direction: "incoming",
        subject: "Call",
        timestamp: "2026-01-01T00:00:00Z",
        privileged: false,
        has_attachments: false,
      },
    ];
    const perms: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: true,
      legal_hold: false,
      allowed_users: [],
      blocked_users: [],
      ethical_wall_active: false,
    };
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, comms, perms);
    expect(gaps.some((g) => g.type === "unprivileged_communication")).toBe(false);
  });

  it("detects ethical_wall_violation when user is in both lists", () => {
    const perms: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: false,
      legal_hold: false,
      allowed_users: ["user1", "user2"],
      blocked_users: ["user2"],
      ethical_wall_active: true,
    };
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, [], perms);
    const violation = gaps.find((g) => g.type === "ethical_wall_violation");
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe("critical");
  });

  it("does not detect ethical_wall_violation when lists are disjoint", () => {
    const perms: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: false,
      legal_hold: false,
      allowed_users: ["user1"],
      blocked_users: ["user2"],
      ethical_wall_active: true,
    };
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, [], perms);
    expect(gaps.some((g) => g.type === "ethical_wall_violation")).toBe(false);
  });

  it("does not detect ethical_wall_violation when no blocked_users", () => {
    const perms: MatterPermissionSummary = {
      visibility: "full",
      privileged: false,
      legal_hold: false,
      allowed_users: ["user1"],
      blocked_users: [],
      ethical_wall_active: false,
    };
    const gaps = detectGaps({ status: "open" }, [], [], [], emptyCoverage, true, [], perms);
    expect(gaps.some((g) => g.type === "ethical_wall_violation")).toBe(false);
  });

  it("works with default parameters (no communications/permissions)", () => {
    const gaps = detectGaps({ status: "closed" }, [], [], [], emptyCoverage, true);
    expect(gaps.some((g) => g.type === "missing_communication_log")).toBe(false);
    expect(gaps.some((g) => g.type === "ethical_wall_violation")).toBe(false);
  });
});

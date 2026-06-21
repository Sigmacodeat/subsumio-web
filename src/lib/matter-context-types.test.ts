import { describe, test, expect } from "vitest";
import {
  QUERY_MODE_LABELS,
  type QueryMode,
  type MatterParty,
  type MatterDeadlineSummary,
  type MatterDocumentSummary,
  type MatterActivityEntry,
  type MatterFactEntry,
  type MatterCommunicationEntry,
  type MatterPermissionSummary,
  type MatterContextBundle,
  type SourceCoverageEntry,
  type MatterCoverageStatus,
  type MatterGap,
  type GapType,
  type GapSeverity,
  type RetrievalExplanation,
  type ExplainedSearchResult,
  type BrainQualitySummary,
  type MatterRiskItem,
  type MatterUnderstandingPanel,
  type RecentlyChangedSource,
} from "./matter-context-types";

describe("QUERY_MODE_LABELS", () => {
  const modes: QueryMode[] = ["conservative", "balanced", "deep_matter"];

  test("has entry for every QueryMode", () => {
    for (const mode of modes) {
      expect(QUERY_MODE_LABELS[mode]).toBeDefined();
      expect(QUERY_MODE_LABELS[mode].label).toBeTruthy();
      expect(QUERY_MODE_LABELS[mode].description).toBeTruthy();
    }
  });

  test("conservative has German label", () => {
    expect(QUERY_MODE_LABELS.conservative.label).toBe("Verlässlich");
  });

  test("balanced has label", () => {
    expect(QUERY_MODE_LABELS.balanced.label).toBe("Akten + Recht");
  });

  test("deep_matter has label", () => {
    expect(QUERY_MODE_LABELS.deep_matter.label).toBe("Tiefensuche");
  });

  test("all descriptions are non-empty strings", () => {
    for (const mode of modes) {
      expect(QUERY_MODE_LABELS[mode].description.length).toBeGreaterThan(5);
    }
  });
});

describe("Type instantiation", () => {
  test("MatterParty with all fields", () => {
    const party: MatterParty = {
      slug: "contact/1",
      name: "Max Mustermann",
      role: "client",
      contact_info: { email: "max@example.com", phone: "+43 123" },
    };
    expect(party.role).toBe("client");
  });

  test("MatterParty with all role types", () => {
    const roles: MatterParty["role"][] = [
      "client",
      "opponent",
      "lawyer",
      "court",
      "witness",
      "third_party",
      "other",
    ];
    expect(roles).toHaveLength(7);
  });

  test("MatterDeadlineSummary with urgency levels", () => {
    const deadline: MatterDeadlineSummary = {
      title: "Frist",
      date: "2024-12-01",
      status: "open",
      urgency: "critical",
      source: "engine",
    };
    expect(deadline.urgency).toBe("critical");
  });

  test("MatterDocumentSummary with OCR status", () => {
    const doc: MatterDocumentSummary = {
      slug: "doc/1",
      name: "Klage.pdf",
      uploaded_at: "2024-01-01",
      ocr_status: "ocr_complete",
    };
    expect(doc.ocr_status).toBe("ocr_complete");
  });

  test("MatterFactEntry with contradiction fields", () => {
    const fact: MatterFactEntry = {
      id: "f1",
      statement: "Der Beklagte hat gezahlt",
      source: "email",
      confidence: "high",
      contradicts: ["f2"],
    };
    expect(fact.contradicts).toContain("f2");
  });

  test("MatterCommunicationEntry with channels", () => {
    const channels: MatterCommunicationEntry["channel"][] = [
      "email",
      "whatsapp",
      "phone",
      "letter",
      "portal",
      "bea",
      "other",
    ];
    expect(channels).toHaveLength(7);
  });

  test("MatterPermissionSummary with ethical wall", () => {
    const perm: MatterPermissionSummary = {
      visibility: "restricted",
      privileged: true,
      legal_hold: false,
      allowed_users: ["u1"],
      blocked_users: ["u2"],
      ethical_wall_active: true,
    };
    expect(perm.ethical_wall_active).toBe(true);
  });

  test("MatterContextBundle with all fields", () => {
    const bundle: MatterContextBundle = {
      case_slug: "cases/1",
      case_title: "Test Case",
      parties: [],
      deadlines: [],
      documents: [],
      recent_activity: [],
      facts: [],
      communications: [],
      document_requests: [],
      intake_requests: [],
      conversation_events: [],
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
      generated_at: "2024-01-01",
      engine_reachable: true,
    };
    expect(bundle.case_slug).toBe("cases/1");
    expect(bundle.engine_reachable).toBe(true);
  });

  test("SourceCoverageEntry with source types", () => {
    const sourceTypes: SourceCoverageEntry["source_type"][] = [
      "statute_corpus",
      "judgement_api",
      "dms",
      "email",
      "whatsapp",
      "portal",
      "upload",
      "regulatory_feed",
      "commercial",
    ];
    expect(sourceTypes).toHaveLength(9);
  });

  test("MatterCoverageStatus with freshness levels", () => {
    const freshness: MatterCoverageStatus["overall_freshness"][] = ["fresh", "stale", "unknown"];
    expect(freshness).toHaveLength(3);
  });

  test("GapType has all expected types", () => {
    const gapTypes: GapType[] = [
      "missing_document",
      "missing_deadline",
      "missing_power_of_attorney",
      "missing_attachment",
      "missing_deadline_confirmation",
      "unclear_opponent",
      "unreviewed_document",
      "contradictory_facts",
      "stale_knowledge_asset",
      "missing_client_info",
      "engine_unreachable",
      "incomplete_coverage",
      "missing_communication_log",
      "unprivileged_communication",
      "ethical_wall_violation",
    ];
    expect(gapTypes).toHaveLength(15);
  });

  test("GapSeverity has all levels", () => {
    const severities: GapSeverity[] = ["critical", "high", "medium", "low", "info"];
    expect(severities).toHaveLength(5);
  });

  test("MatterGap with all fields", () => {
    const gap: MatterGap = {
      type: "missing_document",
      severity: "high",
      title: "Missing document",
      description: "Klage fehlt",
      recommendation: "Upload needed",
      detected_at: "2024-01-01",
      related_entity: "cases/1",
    };
    expect(gap.type).toBe("missing_document");
  });

  test("RetrievalExplanation with search modes", () => {
    const modes: RetrievalExplanation["search_mode"][] = [
      "hybrid",
      "semantic",
      "keyword",
      "graph",
      "unknown",
    ];
    expect(modes).toHaveLength(5);
  });

  test("ExplainedSearchResult with explanation", () => {
    const result: ExplainedSearchResult = {
      slug: "cases/1",
      title: "Case 1",
      snippet: "Test",
      score: 0.9,
      explanation: {
        slug: "cases/1",
        title: "Case 1",
        score: 0.9,
        search_mode: "hybrid",
        source: "internal",
        permission_filtered: false,
      },
    };
    expect(result.explanation.search_mode).toBe("hybrid");
  });

  test("BrainQualitySummary with source breakdown", () => {
    const summary: BrainQualitySummary = {
      total_pages: 100,
      total_entities: 50,
      total_edges: 200,
      indexed_pages: 95,
      ocr_pending: 5,
      stale_sources: 2,
      coverage_score: 0.85,
      last_synced: "2024-01-01",
      source_breakdown: [{ source_type: "dms", count: 50, fresh: true }],
      quality_issues: [],
    };
    expect(summary.coverage_score).toBe(0.85);
  });

  test("MatterRiskItem with severity levels", () => {
    const severities: MatterRiskItem["severity"][] = ["critical", "high", "medium", "low"];
    expect(severities).toHaveLength(4);
  });

  test("MatterUnderstandingPanel with all fields", () => {
    const panel: MatterUnderstandingPanel = {
      case_slug: "cases/1",
      case_title: "Test",
      understanding_score: 0.75,
      summary: "Good coverage",
      facts: [],
      gaps: [],
      risks: [],
      freshness: {
        overall: "fresh",
        completeness_score: 0.8,
        stale_sources: 0,
        fresh_sources: 3,
        total_sources: 3,
        last_activity: "2024-01-01",
      },
      recently_changed_sources: [],
      engine_reachable: true,
      generated_at: "2024-01-01",
    };
    expect(panel.understanding_score).toBe(0.75);
  });

  test("RecentlyChangedSource with change types", () => {
    const changeTypes: RecentlyChangedSource["change_type"][] = [
      "created",
      "updated",
      "synced",
      "reviewed",
    ];
    expect(changeTypes).toHaveLength(4);
  });
});

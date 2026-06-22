import { describe, test, expect } from "vitest";
import type {
  BrainPage,
  Entity,
  EntityConnection,
  SearchResult,
  QueryResponse,
  Citation,
  BrainStats,
  GraphNode,
  GraphLink,
  UploadedFile,
  RecentQuery,
  ConflictMatch,
  ConflictCheckResponse,
  JudgementsSyncResponse,
  ConnectorStatus,
  AnonymizeResponse,
  TabularReviewResponse,
  PlaybookRequiredPosition,
  PlaybookSeverity,
  PlaybookRule,
  Playbook,
  PricingTier,
  DocumentAnalysisResult,
  PrecedentSearchResponse,
  CaseScannerResponse,
  DocumentTranslation,
  ObligationEntry,
  GroundedCitation,
  ObligationExtractionResult,
} from "./types";

describe("Type instantiation — types.ts", () => {
  test("BrainPage with all fields", () => {
    const page: BrainPage = {
      slug: "cases/1",
      title: "Test",
      content: "Body",
      created_at: "2024-01-01",
      updated_at: "2024-01-02",
      source: "upload",
      tags: ["legal"],
      entities: [],
      backlinks: [],
      word_count: 100,
      type: "case",
      frontmatter: { key: "val" },
    };
    expect(page.slug).toBe("cases/1");
  });

  test("Entity with all type variants", () => {
    const types: Entity["type"][] = ["person", "company", "idea", "document", "event", "place"];
    expect(types).toHaveLength(6);
  });

  test("EntityConnection with weight", () => {
    const conn: EntityConnection = {
      target_slug: "entities/1",
      target_name: "Max",
      edge_type: "represented_by",
      weight: 0.9,
    };
    expect(conn.weight).toBe(0.9);
  });

  test("SearchResult with optional fields", () => {
    const result: SearchResult = {
      slug: "cases/1",
      title: "Case",
      snippet: "...",
      score: 0.85,
      evidence: "doc",
      source: "internal",
      created_at: "2024-01-01",
    };
    expect(result.score).toBe(0.85);
  });

  test("QueryResponse with mode", () => {
    const resp: QueryResponse = {
      answer: "Yes",
      citations: [],
      gaps: [],
      tokens_used: 100,
      latency_ms: 50,
      mode: "balanced",
    };
    expect(resp.mode).toBe("balanced");
  });

  test("Citation with confidence", () => {
    const cit: Citation = { slug: "cases/1", title: "Case", quote: "...", confidence: 0.9 };
    expect(cit.confidence).toBe(0.9);
  });

  test("BrainStats with optional fields", () => {
    const stats: BrainStats = {
      total_pages: 100,
      total_entities: 50,
      total_queries: 200,
      total_edges: 300,
      last_synced: "2024-01-01",
      storage_used_mb: 10.5,
      dream_cycle_last: "2024-01-02",
    };
    expect(stats.total_pages).toBe(100);
  });

  test("GraphNode with position fields", () => {
    const node: GraphNode = {
      id: "n1",
      name: "Node",
      type: "person",
      connections: 5,
      x: 10,
      y: 20,
      vx: 0.1,
      vy: 0.2,
      fx: null,
      fy: null,
    };
    expect(node.connections).toBe(5);
  });

  test("GraphLink with string refs", () => {
    const link: GraphLink = { source: "n1", target: "n2", type: "knows", weight: 1.0 };
    expect(link.source).toBe("n1");
  });

  test("UploadedFile with status variants", () => {
    const statuses: UploadedFile["status"][] = ["uploading", "processing", "done", "error"];
    expect(statuses).toHaveLength(4);
  });

  test("RecentQuery", () => {
    const q: RecentQuery = {
      id: "q1",
      query: "test",
      answer_preview: "...",
      citations_count: 3,
      created_at: "2024-01-01",
    };
    expect(q.citations_count).toBe(3);
  });

  test("ConflictMatch with role", () => {
    const match: ConflictMatch = {
      slug: "cases/1",
      title: "Case",
      role: "client",
      status: "active",
      matched_name: "Max",
      exact: true,
    };
    expect(match.role).toBe("client");
  });

  test("ConflictCheckResponse with severity", () => {
    const resp: ConflictCheckResponse = {
      name: "Max",
      severity: "critical",
      explanation: "...",
      matches: [],
      checked_cases: 10,
      disclaimer: "No warranty",
    };
    expect(resp.severity).toBe("critical");
  });

  test("JudgementsSyncResponse", () => {
    const resp: JudgementsSyncResponse = {
      success: true,
      jurisdiction: "AT",
      fetched: 50,
      imported: 45,
      errors: [],
    };
    expect(resp.imported).toBe(45);
  });

  test("ConnectorStatus", () => {
    const status: ConnectorStatus = {
      service: "docusign",
      configured: true,
      enabled: true,
      connected: true,
      hasCredentials: true,
      last_sync_at: Date.now(),
    };
    expect(status.service).toBe("docusign");
  });

  test("AnonymizeResponse", () => {
    const resp: AnonymizeResponse = {
      anonymized: "Anon text",
      replacements: [],
      stats: { names: 2 },
      llm_used: true,
      count: 2,
      disclaimer: "No warranty",
    };
    expect(resp.llm_used).toBe(true);
  });

  test("TabularReviewResponse", () => {
    const resp: TabularReviewResponse = {
      questions: ["Q1"],
      rows: [],
      document_count: 0,
      truncated: false,
    };
    expect(resp.questions).toHaveLength(1);
  });

  test("PlaybookRequiredPosition variants", () => {
    const positions: PlaybookRequiredPosition[] = [
      "favorable",
      "neutral",
      "exclude",
      "must_include",
    ];
    expect(positions).toHaveLength(4);
  });

  test("PlaybookSeverity variants", () => {
    const severities: PlaybookSeverity[] = ["low", "medium", "high", "critical"];
    expect(severities).toHaveLength(4);
  });

  test("PlaybookRule", () => {
    const rule: PlaybookRule = {
      id: "r1",
      clause_type: "liability",
      required_position: "favorable",
      deviation_flag: "check",
      severity: "high",
      notes: "Important",
    };
    expect(rule.severity).toBe("high");
  });

  test("Playbook", () => {
    const pb: Playbook = {
      slug: "playbooks/1",
      title: "NDA",
      jurisdiction: "AT",
      contract_types: ["nda"],
      rules: [],
      created_at: "2024-01-01",
      updated_at: "2024-01-02",
    };
    expect(pb.contract_types).toContain("nda");
  });

  test("PricingTier with id variants", () => {
    const ids: PricingTier["id"][] = ["free", "pro", "team"];
    expect(ids).toHaveLength(3);
  });

  test("DocumentAnalysisResult with grounding", () => {
    const result: DocumentAnalysisResult = {
      document_type: "contract",
      parties: [],
      summary: "Test",
      _grounding: {
        citations_verified: 5,
        citations_unverified: 1,
        corpus_checked: true,
        analyzed_at: "2024-01-01",
      },
    };
    expect(result._grounding?.citations_verified).toBe(5);
  });

  test("PrecedentSearchResponse", () => {
    const resp: PrecedentSearchResponse = { results: [], total: 0, warnings: [] };
    expect(resp.total).toBe(0);
  });

  test("CaseScannerResponse", () => {
    const resp: CaseScannerResponse = {
      success: true,
      job_id: "job-1",
      status: "queued",
      look_ahead_days: 30,
      evidence_threshold: 0.7,
      max_cases: 100,
    };
    expect(resp.status).toBe("queued");
  });

  test("DocumentTranslation", () => {
    const tr: DocumentTranslation = {
      translated_text: "Übersetzt",
      source_language: "de",
      target_language: "en",
      glossary: [],
      warnings: [],
      attorney_review_required: true,
    };
    expect(tr.attorney_review_required).toBe(true);
  });

  test("ObligationEntry with type variants", () => {
    const types: ObligationEntry["type"][] = [
      "payment",
      "notice",
      "delivery",
      "performance",
      "compliance",
      "renewal",
      "termination",
      "other",
    ];
    expect(types).toHaveLength(8);
  });

  test("ObligationEntry with recurring variants", () => {
    const recurring: ObligationEntry["recurring"][] = [
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "one-time",
    ];
    expect(recurring).toHaveLength(6);
  });

  test("GroundedCitation", () => {
    const cit: GroundedCitation = {
      code: "BGB",
      paragraph: "§ 280",
      context: "Schadensersatz",
      verified: true,
      source_text: "...",
      source_file: "bgb.md",
    };
    expect(cit.verified).toBe(true);
  });

  test("ObligationExtractionResult", () => {
    const result: ObligationExtractionResult = {
      obligations: [],
      renewal_dates: [],
      payment_terms: [],
      notice_periods: [],
      summary: "Test",
      warnings: [],
      attorney_review_required: true,
    };
    expect(result.attorney_review_required).toBe(true);
  });
});

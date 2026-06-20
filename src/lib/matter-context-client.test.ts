/**
 * Matter Context API Contract Tests — P0-BRAIN-007
 *
 * Verifies that:
 * 1. All Matter Context API endpoints return correctly shaped responses.
 * 2. The typed client SDK (matter-context-client.ts) matches the API contract.
 * 3. Error handling is consistent across endpoints.
 *
 * Uses mocked fetch to avoid requiring a running engine.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  matterContext,
  MatterContextError,
  type MatterContextBundleResponse,
  type MatterGapsResponse,
  type MatterFactsResponse,
  type MatterActivityResponse,
  type MatterPartiesResponse,
  type MatterDeadlinesResponse,
  type MatterDocumentsResponse,
  type MatterExplainResponse,
  type MatterQualityResponse,
} from "@/lib/matter-context-client";

// ── Mock fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleBundle: MatterContextBundleResponse = {
  case_slug: "cases/2024-001",
  case_title: "Test Case",
  case_number: "2024-001",
  legal_area: "civil",
  status: "open",
  parties: [
    { slug: "c1", name: "Client", role: "client" },
    { slug: "o1", name: "Opponent", role: "opponent" },
  ],
  deadlines: [
    { title: "Klagefrist", date: "2025-12-01", status: "open", urgency: "upcoming", source: "court" },
  ],
  documents: [
    { slug: "docs/contract", name: "contract.pdf", uploaded_at: "2024-01-01" },
  ],
  recent_activity: [
    { at: "2024-06-01T10:00:00Z", action: "created", description: "Case created" },
  ],
  facts: [
    { id: "f1", statement: "Test fact", source: "case_frontmatter", confidence: "high" },
  ],
  document_requests: [],
  intake_requests: [],
  conversation_events: [],
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
  gaps: [
    { type: "engine_unreachable", severity: "critical", title: "Engine down", description: "No engine", recommendation: "Start engine", detected_at: "2024-01-01T00:00:00Z" },
  ],
  generated_at: "2024-06-01T10:00:00Z",
  engine_reachable: true,
};

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Bundle ────────────────────────────────────────────────────────────

describe("matterContext.getBundle", () => {
  it("fetches full bundle for a case slug", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(sampleBundle));
    const bundle = await matterContext.getBundle("cases/2024-001");
    expect(bundle.case_slug).toBe("cases/2024-001");
    expect(bundle.parties).toHaveLength(2);
    expect(bundle.deadlines).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/matter-context/cases/2024-001",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("encodes slugs with slashes correctly", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(sampleBundle));
    await matterContext.getBundle("cases/2024-001");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/matter-context/cases/2024-001");
  });

  it("throws MatterContextError on 404", async () => {
    mockFetch.mockImplementation(async () => mockResponse({ error: "not_found", message: "Case not found" }, 404));
    await expect(matterContext.getBundle("cases/unknown")).rejects.toThrow(MatterContextError);
    try {
      await matterContext.getBundle("cases/unknown");
    } catch (e) {
      expect(e).toBeInstanceOf(MatterContextError);
      expect((e as MatterContextError).code).toBe("not_found");
      expect((e as MatterContextError).statusCode).toBe(404);
    }
  });
});

// ── Coverage ──────────────────────────────────────────────────────────

describe("matterContext.getCoverage", () => {
  it("fetches coverage status", async () => {
    const coverage = sampleBundle.coverage;
    mockFetch.mockResolvedValueOnce(mockResponse(coverage));
    const result = await matterContext.getCoverage("cases/2024-001");
    expect(result.sources).toEqual([]);
    expect(result.completeness_score).toBe(0);
  });
});

// ── Gaps ──────────────────────────────────────────────────────────────

describe("matterContext.getGaps", () => {
  it("fetches gaps with summary counts", async () => {
    const gapsResponse: MatterGapsResponse = {
      case_slug: "cases/2024-001",
      gaps: sampleBundle.gaps,
      gap_count: 1,
      critical_count: 1,
      high_count: 0,
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(gapsResponse));
    const result = await matterContext.getGaps("cases/2024-001");
    expect(result.gap_count).toBe(1);
    expect(result.critical_count).toBe(1);
  });
});

// ── Facts ─────────────────────────────────────────────────────────────

describe("matterContext.getFacts", () => {
  it("fetches facts with confidence counts", async () => {
    const factsResponse: MatterFactsResponse = {
      case_slug: "cases/2024-001",
      facts: sampleBundle.facts,
      fact_count: 1,
      high_confidence: 1,
      contradictions: [],
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(factsResponse));
    const result = await matterContext.getFacts("cases/2024-001");
    expect(result.fact_count).toBe(1);
    expect(result.high_confidence).toBe(1);
  });
});

// ── Activity ──────────────────────────────────────────────────────────

describe("matterContext.getActivity", () => {
  it("fetches recent activity", async () => {
    const activityResponse: MatterActivityResponse = {
      case_slug: "cases/2024-001",
      recent_activity: sampleBundle.recent_activity,
      activity_count: 1,
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(activityResponse));
    const result = await matterContext.getActivity("cases/2024-001");
    expect(result.activity_count).toBe(1);
    expect(result.recent_activity[0].action).toBe("created");
  });
});

// ── Parties ───────────────────────────────────────────────────────────

describe("matterContext.getParties", () => {
  it("fetches parties with role flags", async () => {
    const partiesResponse: MatterPartiesResponse = {
      case_slug: "cases/2024-001",
      parties: sampleBundle.parties,
      party_count: 2,
      has_client: true,
      has_opponent: true,
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(partiesResponse));
    const result = await matterContext.getParties("cases/2024-001");
    expect(result.party_count).toBe(2);
    expect(result.has_client).toBe(true);
    expect(result.has_opponent).toBe(true);
  });
});

// ── Deadlines ─────────────────────────────────────────────────────────

describe("matterContext.getDeadlines", () => {
  it("fetches deadlines with urgency counts", async () => {
    const deadlinesResponse: MatterDeadlinesResponse = {
      case_slug: "cases/2024-001",
      deadlines: sampleBundle.deadlines,
      deadline_count: 1,
      overdue_count: 0,
      critical_count: 0,
      upcoming_count: 1,
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(deadlinesResponse));
    const result = await matterContext.getDeadlines("cases/2024-001");
    expect(result.deadline_count).toBe(1);
    expect(result.upcoming_count).toBe(1);
  });
});

// ── Documents ─────────────────────────────────────────────────────────

describe("matterContext.getDocuments", () => {
  it("fetches documents with OCR/extraction counts", async () => {
    const docsResponse: MatterDocumentsResponse = {
      case_slug: "cases/2024-001",
      documents: sampleBundle.documents,
      document_count: 1,
      ocr_pending: 0,
      extraction_pending: 0,
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(docsResponse));
    const result = await matterContext.getDocuments("cases/2024-001");
    expect(result.document_count).toBe(1);
    expect(result.ocr_pending).toBe(0);
  });
});

// ── Explain ───────────────────────────────────────────────────────────

describe("matterContext.explain", () => {
  it("fetches explained search results", async () => {
    const explainResponse: MatterExplainResponse = {
      query: "Verjährung",
      mode: "deep_matter",
      results: [
        {
          slug: "cases/2024-001",
          title: "Test Case",
          snippet: "Verjährung diskutiert",
          score: 0.95,
          explanation: {
            slug: "cases/2024-001",
            title: "Test Case",
            score: 0.95,
            search_mode: "hybrid",
            source: "internal",
            permission_filtered: false,
            chunk_info: { snippet: "Verjährung diskutiert" },
          },
        },
      ],
      result_count: 1,
      generated_at: "2024-06-01T10:00:00Z",
    };
    mockFetch.mockResolvedValueOnce(mockResponse(explainResponse));
    const result = await matterContext.explain("cases/2024-001", "Verjährung", "deep_matter");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].explanation.search_mode).toBe("hybrid");
    expect(mockFetch.mock.calls[0][0]).toContain("q=Verj%C3%A4hrung");
    expect(mockFetch.mock.calls[0][0]).toContain("mode=deep_matter");
  });

  it("defaults to balanced mode when not specified", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      query: "test",
      mode: "balanced",
      results: [],
      result_count: 0,
      generated_at: "2024-06-01T10:00:00Z",
    }));
    await matterContext.explain("cases/2024-001", "test");
    expect(mockFetch.mock.calls[0][0]).not.toContain("mode=");
  });
});

// ── Quality ───────────────────────────────────────────────────────────

describe("matterContext.getQuality", () => {
  it("fetches brain quality summary", async () => {
    const qualityResponse: MatterQualityResponse = {
      total_pages: 100,
      total_entities: 50,
      total_edges: 200,
      indexed_pages: 100,
      ocr_pending: 5,
      stale_sources: 2,
      coverage_score: 0.8,
      last_synced: "2024-06-01T10:00:00Z",
      source_breakdown: [
        { source_type: "upload", count: 10, fresh: true },
      ],
      quality_issues: [],
    };
    mockFetch.mockResolvedValueOnce(mockResponse(qualityResponse));
    const result = await matterContext.getQuality();
    expect(result.total_pages).toBe(100);
    expect(result.coverage_score).toBe(0.8);
  });
});

// ── Error handling ────────────────────────────────────────────────────

describe("MatterContextError", () => {
  it("preserves code and statusCode from API response", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: "rate_limited", message: "Too many requests" }, 429));
    await expect(matterContext.getBundle("cases/2024-001")).rejects.toMatchObject({
      code: "rate_limited",
      statusCode: 429,
      message: "Too many requests",
    });
  });

  it("handles non-JSON error responses", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));
    await expect(matterContext.getBundle("cases/2024-001")).rejects.toMatchObject({
      code: "http_500",
      statusCode: 500,
    });
  });
});

// ── URL encoding ──────────────────────────────────────────────────────

describe("URL encoding", () => {
  it("encodes each path segment separately", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(sampleBundle));
    await matterContext.getBundle("cases/2024-001");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/matter-context/cases/2024-001");
  });

  it("encodes special characters in slugs", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(sampleBundle));
    await matterContext.getBundle("cases/Strafverfahren §123");
    expect(mockFetch.mock.calls[0][0]).toContain("Strafverfahren%20%C2%A7123");
  });
});

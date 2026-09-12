// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrain: () => ({ Authorization: "Bearer test" }),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const ctx = {
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      let query: unknown = undefined;
      if (opts.query) {
        const params = Object.fromEntries(url.searchParams);
        const parsed = opts.query.safeParse(params);
        if (parsed.success) query = parsed.data;
      }
      return handler(ctx, {}, query, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

const mockBundle = {
  case_slug: "legal/cases/test-case",
  recent_activity: [
    { type: "document_uploaded", timestamp: "2026-09-12T10:00:00Z", title: "Klage.pdf" },
    { type: "deadline_added", timestamp: "2026-09-11T15:00:00Z", title: "Berufungsfrist" },
  ],
  parties: [
    { name: "Max Muster", role: "client" },
    { name: "Gegner AG", role: "opponent" },
  ],
  facts: [{ label: "Klage eingereicht", confidence: "high" }],
  gaps: [{ type: "missing_poa", severity: "high" }],
  deadlines: [{ title: "Berufungsfrist", due_date: "2026-12-01", urgency: "critical" }],
  documents: [{ slug: "doc/1.pdf", title: "Klage" }],
  coverage: { completeness: 0.85 },
  generated_at: "2026-09-12T10:00:00.000Z",
};

vi.mock("@/lib/matter-context", () => ({
  buildMatterContext: vi.fn(async () => mockBundle),
  buildUnderstandingPanel: vi.fn(() => ({
    summary: "Test understanding panel",
    risk_items: [{ type: "missing_poa", severity: "high" }],
    confidence: 0.7,
  })),
  explainRetrieval: vi.fn(async () => [
    { slug: "doc/1.pdf", title: "Klage", score: 0.95, snippet: "Klage eingereicht..." },
    { slug: "doc/2.pdf", title: "Vertrag", score: 0.78, snippet: "Vertrag geschlossen..." },
  ]),
  buildBrainQualitySummary: vi.fn(async () => ({
    total_pages: 100,
    total_entities: 50,
    coverage_score: 0.85,
    quality_score: 0.92,
    generated_at: "2026-09-12T10:00:00.000Z",
  })),
}));

vi.mock("@/lib/case-investigation-suggest", () => ({
  shouldSuggestInvestigation: vi.fn(() => ({
    should_suggest: true,
    reason: "missing_power_of_attorney",
    priority: "high",
    suggested_actions: ["request_vollmacht"],
  })),
}));

function makeReq(caseSlug: string, path: string): Request {
  const url = `http://localhost/api/matter-context/${encodeURIComponent(caseSlug)}/${path}`;
  const req = new Request(url, { method: "GET" });
  (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
    caseSlug,
  });
  return req;
}

// ── Activity ───────────────────────────────────────────────────────────
import { GET as getActivity } from "./activity/route";

describe("GET /api/matter-context/[caseSlug]/activity", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns recent activity with count", async () => {
    const res = await getActivity(makeReq("legal/cases/test", "activity"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity_count).toBe(2);
    expect(body.recent_activity).toHaveLength(2);
    expect(body.recent_activity[0].type).toBe("document_uploaded");
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//activity", { method: "GET" });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getActivity(req);
    expect(res.status).toBe(400);
  });

  test("handles empty activity list", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    vi.mocked(buildMatterContext).mockResolvedValueOnce({ ...mockBundle, recent_activity: [] });
    const res = await getActivity(makeReq("legal/cases/empty", "activity"));
    const body = await res.json();
    expect(body.activity_count).toBe(0);
  });
});

// ── Explain ─────────────────────────────────────────────────────────────
import { GET as getExplain } from "./explain/route";

describe("GET /api/matter-context/[caseSlug]/explain", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns retrieval explanation with results", async () => {
    const req = new Request(
      "http://localhost/api/matter-context/legal%2Fcases%2Ftest/explain?q=Klage&mode=balanced",
      { method: "GET" }
    );
    const res = await getExplain(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("Klage");
    expect(body.mode).toBe("balanced");
    expect(body.result_count).toBe(2);
    expect(body.results).toHaveLength(2);
  });

  test("uses conservative mode when specified", async () => {
    const req = new Request(
      "http://localhost/api/matter-context/legal%2Fcases%2Ftest/explain?q=test&mode=conservative",
      { method: "GET" }
    );
    const res = await getExplain(req);
    const body = await res.json();
    expect(body.mode).toBe("conservative");
  });

  test("defaults to balanced mode when not specified", async () => {
    const req = new Request(
      "http://localhost/api/matter-context/legal%2Fcases%2Ftest/explain?q=test",
      { method: "GET" }
    );
    const res = await getExplain(req);
    const body = await res.json();
    expect(body.mode).toBe("balanced");
  });

  test("uses deep_matter mode", async () => {
    const req = new Request(
      "http://localhost/api/matter-context/legal%2Fcases%2Ftest/explain?q=test&mode=deep_matter",
      { method: "GET" }
    );
    const res = await getExplain(req);
    const body = await res.json();
    expect(body.mode).toBe("deep_matter");
  });
});

// ── Understanding ───────────────────────────────────────────────────────
import { GET as getUnderstanding } from "./understanding/route";

describe("GET /api/matter-context/[caseSlug]/understanding", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns understanding panel with risk items", async () => {
    const res = await getUnderstanding(makeReq("legal/cases/test", "understanding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("Test understanding panel");
    expect(body.risk_items).toHaveLength(1);
    expect(body.confidence).toBe(0.7);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//understanding", {
      method: "GET",
    });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getUnderstanding(req);
    expect(res.status).toBe(400);
  });
});

// ── Investigation Suggest ───────────────────────────────────────────────
import { GET as getInvestigationSuggest } from "./investigation-suggest/route";

describe("GET /api/matter-context/[caseSlug]/investigation-suggest", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns investigation suggestion", async () => {
    const res = await getInvestigationSuggest(makeReq("legal/cases/test", "investigation-suggest"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.should_suggest).toBe(true);
    expect(body.data.reason).toBe("missing_power_of_attorney");
    expect(body.data.priority).toBe("high");
    expect(body.data.suggested_actions).toContain("request_vollmacht");
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//investigation-suggest", {
      method: "GET",
    });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getInvestigationSuggest(req);
    expect(res.status).toBe(400);
  });

  test("returns 502 when buildMatterContext fails", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    vi.mocked(buildMatterContext).mockRejectedValueOnce(new Error("Engine unreachable"));
    const res = await getInvestigationSuggest(
      makeReq("legal/cases/error", "investigation-suggest")
    );
    expect(res.status).toBe(502);
  });
});

// ── Quality (no caseSlug — brain-level) ─────────────────────────────────
import { GET as getQuality } from "../quality/route";

describe("GET /api/matter-context/quality", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns brain quality summary", async () => {
    const req = new Request("http://localhost/api/matter-context/quality", { method: "GET" });
    const res = await getQuality(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total_pages).toBe(100);
    expect(body.coverage_score).toBe(0.85);
    expect(body.quality_score).toBe(0.92);
  });

  test("handles buildBrainQualitySummary error", async () => {
    const { buildBrainQualitySummary } = await import("@/lib/matter-context");
    vi.mocked(buildBrainQualitySummary).mockRejectedValueOnce(new Error("Engine error"));
    const req = new Request("http://localhost/api/matter-context/quality", { method: "GET" });
    await expect(getQuality(req)).rejects.toThrow("Engine error");
  });
});

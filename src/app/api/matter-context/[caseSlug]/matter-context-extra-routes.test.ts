import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrain: () => ({ Authorization: "Bearer test" }),
}));

// The signed-in caller's headers (tenant + signed identity), as createHandler
// builds them. The route must use these, never the bare firm headers.
const CALLER_HEADERS = vi.hoisted(() => ({
  "x-subsumio-source": "test-brain",
  "x-subsumio-identity-token": "signed-identity",
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
        headers: CALLER_HEADERS,
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

function makeReq(caseSlug: string, path: string): NextRequest {
  const url = `http://localhost/api/matter-context/${encodeURIComponent(caseSlug)}/${path}`;
  const req = new Request(url, { method: "GET" }) as unknown as NextRequest;
  (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
    caseSlug,
  });
  return req;
}

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

  test("reads the matter with the caller's identity-bearing headers", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    await getUnderstanding(makeReq("legal/cases/test", "understanding"));
    expect(vi.mocked(buildMatterContext).mock.calls[0][2]).toBe(CALLER_HEADERS);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//understanding", {
      method: "GET",
    }) as unknown as NextRequest;
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

  test("reads the matter with the caller's identity-bearing headers", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    await getInvestigationSuggest(makeReq("legal/cases/test", "investigation-suggest"));
    expect(vi.mocked(buildMatterContext).mock.calls[0][2]).toBe(CALLER_HEADERS);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//investigation-suggest", {
      method: "GET",
    }) as unknown as NextRequest;
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

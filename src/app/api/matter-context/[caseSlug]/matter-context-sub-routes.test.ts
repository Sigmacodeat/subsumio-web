// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Shared mocks for all matter-context sub-routes
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrain: () => ({ Authorization: "Bearer test" }),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: Record<string, unknown>,
    handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      return handler(ctx, {}, {}, req);
    };
  },
}));

vi.mock("@/lib/legal-types", () => ({
  caseFrontmatter: (page: { frontmatter?: Record<string, unknown> }) =>
    (page.frontmatter ?? {}) as Record<string, unknown>,
}));

const mockBundle = {
  case_slug: "legal/cases/test-case",
  documents: [
    { slug: "doc/1.pdf", title: "Klage", ocr_status: "ready", extraction_status: "ready" },
    {
      slug: "doc/2.pdf",
      title: "Urteil",
      ocr_status: "ocr_needed",
      extraction_status: "ocr_needed",
    },
    { slug: "doc/3.pdf", title: "Vertrag", ocr_status: "unknown", extraction_status: "processing" },
  ],
  parties: [
    { name: "Max Muster", role: "client" },
    { name: "Gegner AG", role: "opponent" },
    { name: "Zeuge Schmidt", role: "witness" },
  ],
  facts: [
    { label: "Klage eingereicht", confidence: "high" },
    { label: "Frist abgelaufen", confidence: "low" },
    { label: "Vertrag geschlossen", confidence: "high" },
  ],
  gaps: [
    { type: "missing_client", severity: "critical" },
    { type: "missing_poa", severity: "high" },
    { type: "contradictory_facts", severity: "high" },
    { type: "overdue_deadline", severity: "critical" },
  ],
  generated_at: "2026-09-12T10:00:00.000Z",
};

vi.mock("@/lib/matter-context", () => ({
  buildMatterContext: vi.fn(async () => mockBundle),
  checkCoverage: vi.fn(async () => ({
    completeness: 0.85,
    sources: [
      { source: "at", coverage: 0.9, pages: 100 },
      { source: "de", coverage: 0.8, pages: 50 },
    ],
    generated_at: "2026-09-12T10:00:00.000Z",
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

// ── Documents ──────────────────────────────────────────────────────────
import { GET as getDocuments } from "./documents/route";

describe("GET /api/matter-context/[caseSlug]/documents", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns document summary with OCR and extraction counts", async () => {
    const res = await getDocuments(makeReq("legal/cases/test", "documents"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document_count).toBe(3);
    expect(body.ocr_pending).toBe(2);
    expect(body.extraction_pending).toBe(2);
    expect(body.documents).toHaveLength(3);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//documents", { method: "GET" });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getDocuments(req);
    expect(res.status).toBe(400);
  });

  test("handles empty documents list", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    vi.mocked(buildMatterContext).mockResolvedValueOnce({ ...mockBundle, documents: [] });
    const res = await getDocuments(makeReq("legal/cases/empty", "documents"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document_count).toBe(0);
    expect(body.ocr_pending).toBe(0);
  });
});

// ── Parties ────────────────────────────────────────────────────────────
import { GET as getParties } from "./parties/route";

describe("GET /api/matter-context/[caseSlug]/parties", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns party summary with has_client and has_opponent flags", async () => {
    const res = await getParties(makeReq("legal/cases/test", "parties"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.party_count).toBe(3);
    expect(body.has_client).toBe(true);
    expect(body.has_opponent).toBe(true);
  });

  test("returns has_client=false when no client party", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    vi.mocked(buildMatterContext).mockResolvedValueOnce({
      ...mockBundle,
      parties: [{ name: "Gegner", role: "opponent" }],
    });
    const res = await getParties(makeReq("legal/cases/no-client", "parties"));
    const body = await res.json();
    expect(body.has_client).toBe(false);
    expect(body.has_opponent).toBe(true);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//parties", { method: "GET" });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getParties(req);
    expect(res.status).toBe(400);
  });
});

// ── Facts ──────────────────────────────────────────────────────────────
import { GET as getFacts } from "./facts/route";

describe("GET /api/matter-context/[caseSlug]/facts", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns facts with high_confidence count and contradictions", async () => {
    const res = await getFacts(makeReq("legal/cases/test", "facts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fact_count).toBe(3);
    expect(body.high_confidence).toBe(2);
    expect(body.contradictions).toHaveLength(1);
    expect(body.contradictions[0].type).toBe("contradictory_facts");
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//facts", { method: "GET" });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getFacts(req);
    expect(res.status).toBe(400);
  });
});

// ── Gaps ───────────────────────────────────────────────────────────────
import { GET as getGaps } from "./gaps/route";

describe("GET /api/matter-context/[caseSlug]/gaps", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns gaps with critical and high counts", async () => {
    const res = await getGaps(makeReq("legal/cases/test", "gaps"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gap_count).toBe(4);
    expect(body.critical_count).toBe(2);
    expect(body.high_count).toBe(2);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//gaps", { method: "GET" });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getGaps(req);
    expect(res.status).toBe(400);
  });

  test("handles empty gaps list", async () => {
    const { buildMatterContext } = await import("@/lib/matter-context");
    vi.mocked(buildMatterContext).mockResolvedValueOnce({ ...mockBundle, gaps: [] });
    const res = await getGaps(makeReq("legal/cases/clean", "gaps"));
    const body = await res.json();
    expect(body.gap_count).toBe(0);
    expect(body.critical_count).toBe(0);
  });
});

// ── Coverage ───────────────────────────────────────────────────────────
import { GET as getCoverage } from "./coverage/route";

describe("GET /api/matter-context/[caseSlug]/coverage", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns coverage with completeness and sources", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ frontmatter: { status: "open" } }), { status: 200 })
    );

    const res = await getCoverage(makeReq("legal/cases/test", "coverage"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completeness).toBe(0.85);
    expect(body.sources).toHaveLength(2);
  });

  test("handles engine unreachable gracefully", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("unreachable"));

    const res = await getCoverage(makeReq("legal/cases/test", "coverage"));
    expect(res.status).toBe(200);
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = new Request("http://localhost/api/matter-context//coverage", { method: "GET" });
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });
    const res = await getCoverage(req);
    expect(res.status).toBe(400);
  });
});

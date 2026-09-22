import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  recordQuota: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ai-deadline-detect", () => ({
  detectDeadlines: vi.fn(() => [
    {
      description: "Berufungsfrist",
      date: "2026-12-01",
      confidence: "high",
      matchedRule: "regex_absolute_date",
      sourceSnippet: "Berufung binnen 4 Wochen",
      daysFromNow: undefined,
      fristResult: undefined,
      zustellungsdatum: undefined,
    },
    {
      description: "Unsichere Frist",
      date: "",
      confidence: "low",
      matchedRule: "regex_relative_days",
      sourceSnippet: "innerhalb von 14 Tagen",
      daysFromNow: 14,
      fristResult: undefined,
      zustellungsdatum: undefined,
    },
  ]),
  enrichAllDeadlines: vi.fn((detected) => detected),
  resolveRelativeDeadline: vi.fn((days: number) => `2026-${String(days).padStart(2, "0")}-01`),
}));

vi.mock("@/lib/llm-deadline-extract", () => ({
  hybridDeadlineDetection: vi.fn(async (_text: string, detected: unknown[]) => detected),
  isLLMDeadlineExtractionAvailable: vi.fn(() => false),
}));

vi.mock("@/lib/citation-gate", () => ({
  groundAnswerCitations: vi.fn(async () => ({
    verified: 0,
    unverified: 0,
    citations: [],
    grounded: true,
  })),
  emptyGroundingMetadata: () => ({ verified: 0, unverified: 0, citations: [], grounded: false }),
}));

vi.mock("@/lib/prompt-sanitizer", () => ({
  sanitizeUserInput: vi.fn((text: string) => text),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      const raw = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      }
      return handler(ctx, raw);
    };
  },
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { POST } from "./route";
import { detectDeadlines } from "@/lib/ai-deadline-detect";
import { recordQuota } from "@/lib/engine";
import { groundAnswerCitations } from "@/lib/citation-gate";

describe("POST /api/legal/ai-deadlines", () => {
  beforeEach(() => vi.clearAllMocks());

  test("detects deadlines and creates high-confidence pages", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 201 })
    );

    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({
        text: "Berufung binnen 4 Wochen ab Zustellung vom 2026-11-01",
        caseSlug: "legal/cases/test",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.detected).toHaveLength(2);
    expect(body.llm_fallback_used).toBe(false);
    expect(body.llm_available).toBe(false);
    // Only high-confidence deadline with date should be created
    expect(body.created).toHaveLength(1);

    // Verify engine POST for deadline creation
    const createCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[1]?.method === "POST"
    );
    expect(createCall).toBeDefined();
    const createBody = JSON.parse(createCall![1]?.body as string);
    expect(createBody.type).toBe("deadline");
    expect(createBody.frontmatter.case_slug).toBe("legal/cases/test");
    expect(createBody.frontmatter.status).toBe("pending");
    expect(createBody.frontmatter.review_status).toBe("unreviewed");
    expect(createBody.frontmatter.ai_confidence).toBe("high");
  });

  test("does not create pages without caseSlug", async () => {
    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({
        text: "Berufung binnen 4 Wochen",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("calls groundAnswerCitations for grounding", async () => {
    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({ text: "Frist bis 2026-12-01" }),
    }) as unknown as NextRequest;

    await POST(req);
    expect(groundAnswerCitations).toHaveBeenCalled();
  });

  test("returns empty grounding on citation-gate failure", async () => {
    vi.mocked(groundAnswerCitations).mockRejectedValueOnce(new Error("Grounding failed"));

    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({ text: "Frist" }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    const body = await res.json();
    expect(body._grounding).toBeDefined();
    expect(body._grounding.grounded).toBe(false);
  });

  test("records quota when pages are created", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 201 })
    );

    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({
        text: "Berufung binnen 4 Wochen",
        caseSlug: "legal/cases/test",
      }),
    }) as unknown as NextRequest;

    await POST(req);
    expect(recordQuota).toHaveBeenCalled();
  });

  test("rejects empty text", async () => {
    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({ text: "" }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("rejects text over 50,000 chars", async () => {
    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(50_001) }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("skips deadline when engine returns error (res.ok check)", async () => {
    // Bug fix: Route now checks res.ok — failed creates are NOT pushed
    vi.mocked(detectDeadlines).mockReturnValueOnce([
      {
        type: "frist",
        description: "Frist 1",
        date: "2026-12-01",
        confidence: "high",
        matchedRule: "regex",
        sourceSnippet: "s1",
        daysFromNow: undefined,
        fristResult: undefined,
        zustellungsdatum: undefined,
      },
      {
        type: "frist",
        description: "Frist 2",
        date: "2027-01-01",
        confidence: "high",
        matchedRule: "regex",
        sourceSnippet: "s2",
        daysFromNow: undefined,
        fristResult: undefined,
        zustellungsdatum: undefined,
      },
    ]);

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("Error", { status: 500 })) // Frist 1 fails
      .mockResolvedValueOnce(new Response("{}", { status: 201 })); // Frist 2 succeeds

    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({
        text: "Frist 1 und Frist 2",
        caseSlug: "legal/cases/test",
      }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only successful deadline is pushed
    expect(body.created).toHaveLength(1);
  });
});

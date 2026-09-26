import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  recordQuota: vi.fn(async () => undefined),
  resolveCaseJurisdiction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ai-deadline-detect", () => ({
  recognizeDeadlines: vi.fn(() => [
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
}));

const billing = vi.hoisted(() => ({
  affordable: true,
  charge: vi.fn(),
}));
vi.mock("@/lib/billing/optional-llm-credits", () => ({
  canAffordOptionalLlm: vi.fn(async () => billing.affordable),
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
  recordCreditConsumption: (...args: unknown[]) => billing.charge(...args),
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { POST } from "./route";
import { recognizeDeadlines } from "@/lib/ai-deadline-detect";
import { resolveCaseJurisdiction } from "@/lib/engine";
import { groundAnswerCitations } from "@/lib/citation-gate";
import { hybridDeadlineDetection } from "@/lib/llm-deadline-extract";

describe("POST /api/legal/ai-deadlines — credits for the LLM fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billing.affordable = true;
  });

  const detect = () =>
    POST(
      new Request("http://localhost/api/legal/ai-deadlines", {
        method: "POST",
        body: JSON.stringify({ text: "binnen vier Wochen ab Zustellung" }),
      }) as unknown as NextRequest
    );

  test("charges deadline_detect when the model was called", async () => {
    vi.mocked(hybridDeadlineDetection).mockImplementationOnce(async (_t, detected, _h, opts) => {
      if (opts?.meta) opts.meta.modelCalled = true;
      return detected;
    });
    await detect();
    expect(billing.charge).toHaveBeenCalledWith(expect.anything(), "deadline_detect", undefined);
  });

  test("charges nothing when only the regex ran", async () => {
    await detect();
    expect(billing.charge).not.toHaveBeenCalled();
  });

  test("skips the model without balance and still answers from the regex", async () => {
    billing.affordable = false;
    const res = await detect();
    expect(res.status).toBe(200);
    expect(hybridDeadlineDetection).not.toHaveBeenCalled();
    expect((await res.json()).llm_skipped).toBe("insufficient_credits");
    expect(billing.charge).not.toHaveBeenCalled();
  });
});

describe("POST /api/legal/ai-deadlines", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns suggestions only — never writes deadline pages (W1-5)", async () => {
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
    expect(body.created).toBeUndefined();
    const writes = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[1]?.method === "POST"
    );
    expect(writes).toHaveLength(0);
  });

  test("computes with the matter's Rechtsraum (W1-17)", async () => {
    vi.mocked(resolveCaseJurisdiction).mockResolvedValueOnce("de");
    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({ text: "Berufungsfrist", caseSlug: "legal/cases/de-akte" }),
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect((await res.json()).rechtsraum).toBe("DE");
    expect(vi.mocked(recognizeDeadlines).mock.calls[0]![1]).toEqual({ rechtsraum: "DE" });
  });

  test("without a matter the Austrian rules apply", async () => {
    const req = new Request("http://localhost/api/legal/ai-deadlines", {
      method: "POST",
      body: JSON.stringify({ text: "Berufung binnen 4 Wochen" }),
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rechtsraum).toBe("AT");
    expect(resolveCaseJurisdiction).not.toHaveBeenCalled();
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
});

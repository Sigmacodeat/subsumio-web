// @vitest-environment node
//
// POST persists feedback as a `retrieval_feedback` engine page via the
// server brain client (identity-bearing ctx.headers), GET lists the
// caller's org pages and aggregates stats.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface CreatedPage {
  slug: string;
  title?: string;
  content?: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

const mockListPages = vi.fn();
const mockCreatePage = vi.fn(async (page: CreatedPage) => ({ slug: page.slug }));

vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    listPages: (...args: unknown[]) => mockListPages(...args),
    createPage: (page: CreatedPage) => mockCreatePage(page),
  }),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
        query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      },
      handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      let body: unknown;
      if (opts.body) {
        const parsed = opts.body.safeParse(await req.json());
        if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
        body = parsed.data;
      }
      let query: unknown = {};
      if (opts.query) {
        const params = Object.fromEntries(new URL(req.url).searchParams.entries());
        const parsed = opts.query.safeParse(params);
        if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
        query = parsed.data;
      }
      const ctx = {
        headers: { "x-subsumio-source": "brain-1" },
        brainId: "brain-1",
        user: { id: "u1", email: "anwalt@example.com", orgId: "org-1", brainId: "brain-1" },
      };
      return handler(ctx, body, query, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { POST, GET } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/legal/retrieval-feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

function get(url = "http://localhost/api/legal/retrieval-feedback") {
  return GET(new Request(url) as unknown as NextRequest);
}

const validBody = {
  query: "Lieferverzug BGB",
  result_slug: "legal/cases/fall-1",
  result_title: "Fall 1",
  feedback_type: "relevant",
};

function feedbackPage(fm: Record<string, unknown>) {
  return { slug: `retrieval-feedback/org-1/${Math.random()}`, frontmatter: fm };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListPages.mockResolvedValue([]);
});

describe("POST /api/legal/retrieval-feedback", () => {
  it("persists the feedback as a retrieval_feedback page and answers 201", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^retrieval-feedback\/org-1\//);
    expect(body.created_at).toBeDefined();

    expect(mockCreatePage).toHaveBeenCalledTimes(1);
    const page = mockCreatePage.mock.calls[0][0];
    expect(page.slug).toBe(body.id);
    expect(page.type).toBe("retrieval_feedback");
    expect(page.frontmatter?.org_id).toBe("org-1");
    expect(page.frontmatter?.brain_id).toBe("brain-1");
    expect(page.frontmatter?.user_id).toBe("u1");
    expect(page.frontmatter?.feedback_type).toBe("relevant");
  });

  it("applies the severity default and stores the comment", async () => {
    const res = await post({ ...validBody, comment: "Passt." });
    expect(res.status).toBe(201);
    const page = mockCreatePage.mock.calls[0][0];
    expect(page.frontmatter?.severity).toBe("medium");
    expect(page.frontmatter?.comment).toBe("Passt.");
  });

  it("rejects an over-long comment (400)", async () => {
    const res = await post({ ...validBody, comment: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(mockCreatePage).not.toHaveBeenCalled();
  });

  it("rejects an invalid feedback_type (400)", async () => {
    const res = await post({ ...validBody, feedback_type: "super" });
    expect(res.status).toBe(400);
    expect(mockCreatePage).not.toHaveBeenCalled();
  });

  it("rejects a missing query (400)", async () => {
    const res = await post({ result_slug: "x", feedback_type: "relevant" });
    expect(res.status).toBe(400);
    expect(mockCreatePage).not.toHaveBeenCalled();
  });

  it("answers 502 when the engine write fails — no silent drop", async () => {
    mockCreatePage.mockRejectedValueOnce(new Error("engine down"));
    const res = await post(validBody);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("feedback_save_failed");
  });
});

describe("GET /api/legal/retrieval-feedback", () => {
  it("aggregates only the caller's org feedback", async () => {
    mockListPages.mockResolvedValue([
      feedbackPage({
        feedback_type: "relevant",
        severity: "medium",
        org_id: "org-1",
        brain_id: "brain-1",
        user_id: "u1",
        query: "a",
        query_hash: "ha",
        result_slug: "r1",
        created_at: "2026-06-20T10:00:00Z",
      }),
      feedbackPage({
        feedback_type: "wrong",
        severity: "high",
        org_id: "org-1",
        brain_id: "brain-1",
        user_id: "u2",
        query: "b",
        query_hash: "hb",
        result_slug: "r2",
        created_at: "2026-06-20T11:00:00Z",
      }),
      // Sister org on the same brain — must not leak into stats.
      feedbackPage({
        feedback_type: "relevant",
        severity: "low",
        org_id: "org-2",
        brain_id: "brain-1",
        user_id: "u9",
        query: "c",
        query_hash: "hc",
        result_slug: "r3",
        created_at: "2026-06-20T12:00:00Z",
      }),
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.stats.total_feedback).toBe(2);
    expect(body.stats.by_type.relevant).toBe(1);
    expect(body.stats.by_type.wrong).toBe(1);
    expect(body.stats.satisfaction_rate).toBe(0.5);
  });

  it("returns zeroed stats for an empty store", async () => {
    mockListPages.mockResolvedValue([]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.stats.total_feedback).toBe(0);
    expect(body.stats.satisfaction_rate).toBe(0);
  });

  it("skips tombstoned pages", async () => {
    mockListPages.mockResolvedValue([
      feedbackPage({
        feedback_type: "relevant",
        severity: "low",
        org_id: "org-1",
        status: "tombstoned",
      }),
    ]);
    const res = await get();
    expect((await res.json()).total).toBe(0);
  });

  it("honours the limit query param", async () => {
    mockListPages.mockImplementation(async (opts: { limit: number; offset: number }) =>
      Array.from({ length: Math.min(opts.limit, 3) }, (_, i) =>
        feedbackPage({
          feedback_type: "relevant",
          severity: "low",
          org_id: "org-1",
          query: `q${opts.offset + i}`,
          query_hash: `h${opts.offset + i}`,
          result_slug: `r${opts.offset + i}`,
          created_at: "2026-06-20T10:00:00Z",
        })
      )
    );
    const res = await get("http://localhost/api/legal/retrieval-feedback?limit=3");
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(3);
  });

  it("answers 502 when the engine read fails", async () => {
    mockListPages.mockRejectedValue(new Error("engine down"));
    const res = await get();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("feedback_load_failed");
  });
});

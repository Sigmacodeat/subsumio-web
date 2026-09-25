// @vitest-environment node
// The AI routes that used to call a model for free (go-live audit 2026-09-23):
// each one declares its price and books it only after the model delivered.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  charge: vi.fn(),
  opts: new Map<string, { credits?: string }>(),
  think: vi.fn(),
  support: vi.fn(),
  review: vi.fn(),
  pipeline: vi.fn(),
  rerank: vi.fn(),
  affordable: true,
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      credits?: string;
      body?: { parse: (d: unknown) => unknown };
      query?: { parse: (d: unknown) => unknown };
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const fn = async (req: Request, name: string) => {
      h.opts.set(name, opts);
      const ctx = {
        headers: {},
        brainId: "b",
        user: { id: "u1", email: "a@example.com", jurisdiction: "AT" },
        billing: { ownerId: "o", ownerType: "org" },
      };
      const raw = req.method === "GET" ? {} : await req.json();
      const params = Object.fromEntries(new URL(req.url).searchParams);
      const query = opts.query ? opts.query.parse(params) : params;
      return handler(ctx, opts.body ? opts.body.parse(raw) : raw, query, req);
    };
    return fn;
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  recordCreditConsumption: (...args: unknown[]) => h.charge(...args),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineWriteOrThrow: async (
    headers: Record<string, string>,
    body: Record<string, unknown>,
    opts?: { path?: string }
  ) => {
    const res = await fetch(`http://engine.test${opts?.path ?? "/api/pages"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Engine write failed: HTTP ${res.status}`);
    return res;
  },
}));
vi.mock("@/lib/engine-think", () => ({ engineThink: (...a: unknown[]) => h.think(...a) }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/citation-gate", () => ({
  groundAnswerCitations: vi.fn(async () => ({ grounded_citations: [] })),
}));
vi.mock("@/lib/citation-gate-client", () => ({ userJurisdiction: () => "at" }));
vi.mock("@/lib/support-check", () => ({ checkSupport: (...a: unknown[]) => h.support(...a) }));
vi.mock("@/lib/draft-review", () => ({
  reviewDraft: (...a: unknown[]) => h.review(...a),
  persistReviewResult: vi.fn(async () => {}),
  updateIssueStatus: vi.fn(),
  listReviews: vi.fn(),
}));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => ({}) }));
vi.mock("@/lib/legal-graph/pipeline", () => ({
  runPipeline: (...a: unknown[]) => h.pipeline(...a),
}));
vi.mock("@/lib/legal-graph/search", () => ({
  hybridSearch: vi.fn(async () => ({ results: [{ id: "j1" }], total: 1, mode: "bm25" })),
}));
vi.mock("@/lib/legal-graph/embedding", () => ({
  checkEmbeddingAvailability: vi.fn(async () => ({ available: false })),
  embedQuery: vi.fn(),
}));
vi.mock("@/lib/legal-graph/reranking", () => ({
  rerankResults: (...a: unknown[]) => h.rerank(...a),
}));
vi.mock("@/lib/billing/optional-llm-credits", () => ({
  canAffordOptionalLlm: vi.fn(async () => h.affordable),
}));

import { POST as redTeam } from "./red-team/route";
import { POST as perspektiven } from "./legal/perspektiven-room/route";
import { POST as support } from "./legal/support/route";
import { POST as draftReview } from "./copilot/draft-review/route";
import { POST as pipeline } from "./legal/judgements-db/pipeline/route";
import { GET as judgements } from "./legal/judgements-db/route";

type Route = (req: Request, name: string) => Promise<Response>;
const call = (route: unknown, name: string, body?: unknown, url = "http://x/api") =>
  (route as Route)(
    new Request(url, {
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    name
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.affordable = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ title: "Akte", frontmatter: { legal_area: "Zivilrecht" } }))
  );
});

describe("red-team", () => {
  const body = { case_slug: "akte-1", draft_text: "Klage", case_context: "Sachverhalt" };

  it("declares and books subsumption after a delivered analysis", async () => {
    h.think.mockResolvedValue({ answer: "[]" });
    expect((await call(redTeam, "rt", body)).status).toBe(200);
    expect(h.opts.get("rt")?.credits).toBe("subsumption");
    expect(h.charge).toHaveBeenCalledWith(expect.anything(), "subsumption", "akte-1");
  });

  it("books nothing when the model failed", async () => {
    h.think.mockRejectedValue(new Error("down"));
    expect((await call(redTeam, "rt", body)).status).toBe(502);
    expect(h.charge).not.toHaveBeenCalled();
  });
});

describe("perspektiven-room", () => {
  it("books one agent run after all roles answered", async () => {
    h.think.mockResolvedValue({ answer: '{"position":"x"}' });
    expect((await call(perspektiven, "pr", { case_slug: "akte-1" })).status).toBe(200);
    expect(h.opts.get("pr")?.credits).toBe("agent");
    expect(h.charge).toHaveBeenCalledTimes(1);
    expect(h.charge).toHaveBeenCalledWith(expect.anything(), "agent", "akte-1");
  });

  it("books nothing when a role failed", async () => {
    h.think.mockRejectedValue(new Error("down"));
    expect((await call(perspektiven, "pr", { case_slug: "akte-1" })).status).toBe(503);
    expect(h.charge).not.toHaveBeenCalled();
  });
});

describe("legal/support", () => {
  const text = "Nach § 1295 ABGB haftet der Schädiger.";

  // Automatic follow-up of an already billed answer (useGroundedAnswer) — no
  // vendor bills citation checks separately, and the check must never be
  // skipped for lack of balance.
  it("never books credits and never asks for a balance", async () => {
    h.support.mockImplementation(async (_h, _t, _c, meta?: { model?: string }) => {
      if (meta) meta.model = "haiku";
      return [];
    });
    await call(support, "sp", { text });
    expect(h.opts.get("sp")?.credits).toBeUndefined();
    expect(h.charge).not.toHaveBeenCalled();
  });
});

describe("copilot/draft-review", () => {
  it("books a subsumption credit for a finished review", async () => {
    h.review.mockResolvedValue({ id: "r1", issues: [] });
    const res = await call(draftReview, "dr", {
      action: "review",
      content: "Text",
      title: "Klage",
    });
    expect(res.status).toBe(200);
    expect(h.opts.get("dr")?.credits).toBe("subsumption");
    expect(h.charge).toHaveBeenCalledWith(expect.anything(), "subsumption");
  });

  it("books nothing when the review failed", async () => {
    h.review.mockRejectedValue(new Error("down"));
    await call(draftReview, "dr", { action: "review", content: "Text", title: "Klage" });
    expect(h.charge).not.toHaveBeenCalled();
  });
});

describe("judgements-db", () => {
  it("pipeline books an agent run once the synthesis answered", async () => {
    h.pipeline.mockResolvedValue({ steps: [{ agent: "synthesis", status: "done" }] });
    await call(pipeline, "pl", { query: "Haftung" });
    expect(h.opts.get("pl")?.credits).toBe("agent");
    expect(h.charge).toHaveBeenCalledWith(expect.anything(), "agent");
  });

  it("pipeline books nothing when the synthesis failed", async () => {
    h.pipeline.mockResolvedValue({ steps: [{ agent: "synthesis", status: "error" }] });
    await call(pipeline, "pl", { query: "Haftung" });
    expect(h.charge).not.toHaveBeenCalled();
  });

  it("search books a think credit for an LLM rerank", async () => {
    h.rerank.mockResolvedValue({ results: [{ id: "j1" }], reranked: true, model: "m" });
    await call(judgements, "jd", undefined, "http://x/api?q=Haftung&rerank=true");
    expect(h.charge).toHaveBeenCalledWith(expect.anything(), "think");
  });

  it("search skips the rerank without balance and still returns results", async () => {
    h.affordable = false;
    const res = await call(judgements, "jd", undefined, "http://x/api?q=Haftung&rerank=true");
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.rerank_skipped).toBe("insufficient_credits");
    expect(h.rerank).not.toHaveBeenCalled();
    expect(h.charge).not.toHaveBeenCalled();
  });
});

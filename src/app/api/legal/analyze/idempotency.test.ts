// @vitest-environment node
// Document analysis is idempotent per content, bounded and billed for
// background callers, and probes contradictions only once per upload.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const m = vi.hoisted(() => ({
  check: vi.fn(),
  patch: vi.fn(),
  deduct: vi.fn(),
  record: vi.fn(),
  hit: vi.fn(),
  ctx: { brainId: "brain-at" } as { brainId: string },
  fm: {} as Record<string, unknown>,
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(
        {
          brainId: m.ctx.brainId,
          headers: { "x-subsumio-source": "brain-at" },
          user: { id: "u1", email: "a@example.com" },
        },
        await req.json()
      ),
  recordCreditConsumption: (...a: unknown[]) => m.record(...a),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
  engineHeadersWithCaseJurisdiction: async (h: Record<string, string>) => h,
}));
vi.mock("@/lib/auth/rate-limit", () => ({ hit: (...a: unknown[]) => m.hit(...a) }));
vi.mock("@/lib/billing/credits", () => ({ deductCredits: (...a: unknown[]) => m.deduct(...a) }));
vi.mock("@/lib/legal-grounding", () => ({ groundCitations: async () => [] }));
vi.mock("@/lib/legal/precedent-search", () => ({ findRelevantPrecedents: async () => [] }));
vi.mock("@/lib/legal/case-writeback", () => ({
  writeSuggestedDeadlinesAndParties: vi.fn(async () => undefined),
}));
vi.mock("@/lib/legal/contradiction-check", () => ({
  checkCaseContradictions: (...a: unknown[]) => m.check(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { POST } from "./route";

const TEXT = "Klage\n\nText der Klage";
const HASH = createHash("sha256").update(TEXT).digest("hex").slice(0, 32);
let engineAnalyses = 0;

function call(body: Record<string, unknown>): Promise<Response> {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/legal/analyze", {
      method: "POST",
      body: JSON.stringify({ document_slug: "legal/documents/d1", ...body }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  engineAnalyses = 0;
  m.ctx.brainId = "brain-at";
  m.fm = { case_slug: "legal/cases/m1" };
  m.patch.mockResolvedValue(Response.json({ ok: true }));
  m.check.mockResolvedValue({ contradictions: [] });
  m.deduct.mockResolvedValue({ ok: true });
  m.hit.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("http://engine.test/api/pages/")) {
        return Response.json({ title: "Klage", content: "Text der Klage", frontmatter: m.fm });
      }
      if (u === "http://engine.test/api/legal/analyze") {
        engineAnalyses++;
        return Response.json({ document_type: "klage", summary: "neu" });
      }
      return new Response("unexpected", { status: 500 });
    })
  );
});

describe("legal/analyze — idempotent per document content", () => {
  it("an already analysed, unchanged document is not sent to the model again", async () => {
    m.fm = {
      analysis_status: "completed",
      analysis_content_hash: HASH,
      auto_analysis: { summary: "alt" },
    };
    const res = await call({});
    const out = (await res.json()) as Record<string, unknown>;
    expect(engineAnalyses).toBe(0);
    expect(out.summary).toBe("alt");
    expect(out._cached).toBe(true);
    expect(m.record).not.toHaveBeenCalled();
  });

  it("changed content is analysed again, and the fingerprint is stored", async () => {
    m.fm = {
      analysis_status: "completed",
      analysis_content_hash: "anderer-inhalt",
      auto_analysis: { summary: "alt" },
    };
    await call({});
    expect(engineAnalyses).toBe(1);
    const persisted = m.patch.mock.calls.find(
      ([, b]) =>
        (b as { frontmatter?: Record<string, unknown> }).frontmatter?.analysis_status ===
        "completed"
    );
    expect(
      (persisted![1] as { frontmatter: Record<string, unknown> }).frontmatter.analysis_content_hash
    ).toBe(HASH);
  });

  it("force re-runs on purpose", async () => {
    m.fm = { analysis_status: "completed", analysis_content_hash: HASH, auto_analysis: {} };
    await call({ force: true });
    expect(engineAnalyses).toBe(1);
  });
});

describe("legal/analyze — background calls", () => {
  beforeEach(() => {
    m.ctx.brainId = "internal";
  });

  it("are booked on the uploading firm, once per content", async () => {
    await call({
      brain_id: "brain-at",
      owner_id: "org-1",
      owner_type: "org",
      retry_owner: "outbox",
    });
    expect(engineAnalyses).toBe(1);
    expect(m.deduct).toHaveBeenCalledTimes(1);
    const [owner, type, , opts] = m.deduct.mock.calls[0]!;
    expect([owner, type]).toEqual(["org-1", "org"]);
    expect((opts as { idempotencyKey: string }).idempotencyKey).toContain(HASH);
  });

  it("stop at the daily budget without calling the model", async () => {
    m.hit.mockResolvedValue({ ok: false, retryAfterSeconds: 3600 });
    const res = await call({ brain_id: "brain-at" });
    expect(res.status).toBe(429);
    expect(engineAnalyses).toBe(0);
  });

  it("from the outbox do not probe contradictions (the outbox has its own task)", async () => {
    await call({ brain_id: "brain-at", retry_owner: "outbox" });
    await new Promise((r) => setTimeout(r, 0));
    expect(m.check).not.toHaveBeenCalled();
  });

  it("a legacy analysis without fingerprint counts as current for background jobs", async () => {
    m.fm = { analysis_status: "completed", auto_analysis: { summary: "alt" } };
    await call({ brain_id: "brain-at" });
    expect(engineAnalyses).toBe(0);
  });
});

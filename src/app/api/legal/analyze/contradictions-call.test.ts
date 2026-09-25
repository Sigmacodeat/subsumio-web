// @vitest-environment node
// After a document analysis the matter's contradiction check runs in-process
// with the same engine headers — never as a relative-URL fetch, which cannot
// resolve on the server.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  check: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(
        {
          brainId: "brain-at",
          headers: { "x-subsumio-source": "brain-at" },
          user: { id: "u1", email: "a@example.com" },
        },
        await req.json()
      ),
  recordCreditConsumption: vi.fn(),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
  engineHeadersWithCaseJurisdiction: async (h: Record<string, string>) => h,
}));
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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.patch.mockResolvedValue(Response.json({ ok: true }));
  m.check.mockResolvedValue({ contradictions: [], documents_checked: 2, checked_at: "x" });
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith("http://engine.test/api/pages/")) {
      return Response.json({
        title: "Klage",
        content: "Text der Klage",
        frontmatter: { case_slug: "legal/cases/m1" },
      });
    }
    if (u === "http://engine.test/api/legal/analyze") {
      return Response.json({ document_type: "klage", summary: "s" });
    }
    return new Response("unexpected", { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("legal/analyze → contradiction check", () => {
  it("runs the check for the document's matter with the caller's engine headers", async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/legal/analyze", {
        method: "POST",
        body: JSON.stringify({ document_slug: "legal/documents/d1" }),
      })
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));

    expect(m.check).toHaveBeenCalledTimes(1);
    expect(m.check).toHaveBeenCalledWith({ "x-subsumio-source": "brain-at" }, "legal/cases/m1");
    // No fetch to a relative path.
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^https?:\/\//);
    }
  });

  it("answers normally when the check fails", async () => {
    m.check.mockRejectedValue(new Error("engine down"));
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/legal/analyze", {
        method: "POST",
        body: JSON.stringify({ document_slug: "legal/documents/d1" }),
      })
    );
    expect(res.status).toBe(200);
  });
});

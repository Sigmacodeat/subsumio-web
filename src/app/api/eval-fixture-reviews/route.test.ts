import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockPatch = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(
        { headers: { "x-subsumio-source": "b1" }, brainId: "b1", user: { email: "ra@x.at" } },
        parsed?.data ?? raw,
        undefined,
        req
      );
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { PATCH } from "./route";
import { buildReviewFrontmatter, buildReviewSlug } from "@/lib/eval-fixture-review";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

describe("PATCH /api/eval-fixture-reviews", () => {
  test("schreibt per POST (merge) statt PUT und liefert 200", async () => {
    const fm = buildReviewFrontmatter({
      fixture_file: "fixtures/a.json",
      question_id: "q1",
      question: "Frage?",
      current_expected_slug: "gesetze/abgb/1",
      proposed_slug: "gesetze/abgb/2",
      reasoning: "Begründung",
      proposed_by: "ra@x.at",
    });
    const slug = buildReviewSlug("fixtures/a.json", "q1");
    mockFetch.mockResolvedValueOnce(Response.json({ slug, title: "Review", frontmatter: fm }));
    mockPatch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await PATCH(
      new Request("http://localhost/api/eval-fixture-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, status: "approved" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    const [, page] = mockPatch.mock.calls[0] as [unknown, { slug: string; frontmatter: object }];
    expect(page.slug).toBe(slug);
    expect(page.frontmatter).toMatchObject({ status: "approved" });
    // No PUT against the engine.
    expect(mockFetch.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });
});

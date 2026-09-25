// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: async (_h: unknown, body: { frontmatter: Record<string, unknown> }) => {
    // Slow write: without serialisation both reviewers read the same list.
    await new Promise((r) => setTimeout(r, 20));
    store.frontmatter = body.frontmatter;
    return Response.json({ ok: true });
  },
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
    ) =>
    async (req: Request & { params: Promise<{ slug: string }> }) => {
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      return handler(
        { headers: {}, brainId: "b", user: { id: "u", email: reviewer.value } },
        parsed.data,
        {},
        req
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

const reviewer = vi.hoisted(() => ({ value: "a@b.at" }));
const store = vi.hoisted(() => ({ frontmatter: {} as Record<string, unknown> }));

vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    Response.json({ slug: "review-sets/1", type: "review_set", frontmatter: store.frontmatter })
  )
);

import { PATCH } from "./route";

function patch(body: unknown) {
  const req = new Request("http://x/api/legal/review-sets/review-sets%2F1", {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as Request & { params: Promise<{ slug: string }> };
  req.params = Promise.resolve({ slug: "review-sets%2F1" });
  return (PATCH as unknown as (r: unknown) => Promise<Response>)(req);
}

type Doc = { slug: string; decision?: string; decisionBy?: string };
const docs = () => store.frontmatter.documents as Doc[];

describe("PATCH /api/legal/review-sets/[slug]", () => {
  beforeEach(() => {
    store.frontmatter = {
      status: "in_review",
      documents: [
        { slug: "d1", title: "D1", privilegeType: "none" },
        { slug: "d2", title: "D2", privilegeType: "none" },
      ],
    };
  });

  test("two parallel decisions on different documents are both kept", async () => {
    const [r1, r2] = await Promise.all([
      patch({ documentUpdates: [{ slug: "d1", decision: "privileged" }] }),
      patch({ documentUpdates: [{ slug: "d2", decision: "responsive" }] }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(docs().find((d) => d.slug === "d1")?.decision).toBe("privileged");
    expect(docs().find((d) => d.slug === "d2")?.decision).toBe("responsive");
    expect(docs().find((d) => d.slug === "d1")?.decisionBy).toBe("a@b.at");
  });

  test("documents can be added to a set and start unreviewed", async () => {
    await patch({
      addDocuments: [
        { slug: "d3", title: "D3" },
        { slug: "d1", title: "dup" },
      ],
    });
    expect(docs().map((d) => d.slug)).toEqual(["d1", "d2", "d3"]);
    expect(docs().find((d) => d.slug === "d3")?.decision).toBeUndefined();
    expect((store.frontmatter.statistics as { unreviewed: number }).unreviewed).toBe(3);
  });

  test("an update for a document outside the set is refused", async () => {
    const res = await patch({ documentUpdates: [{ slug: "fremd", decision: "withhold" }] });
    expect(res.status).toBe(409);
  });
});

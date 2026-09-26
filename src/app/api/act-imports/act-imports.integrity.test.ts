// @vitest-environment node
// R8-14: create-only sessions, one finalize per attempt, documents of the matter only.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  pages: new Map<string, { slug: string; frontmatter: Record<string, unknown> }>(),
  triggers: 0,
  reserve: vi.fn(async () => ({ ok: true, reservedCredits: 10 })),
}));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: vi.fn(
    async (_h: unknown, p: { slug: string; frontmatter?: Record<string, unknown> }) => {
      const prev = m.pages.get(p.slug);
      m.pages.set(p.slug, {
        slug: p.slug,
        frontmatter: { ...(prev?.frontmatter ?? {}), ...(p.frontmatter ?? {}) },
      });
      return new Response("{}", { status: 200 });
    }
  ),
}));
vi.mock("@/lib/billing/credits", () => ({
  reserveCredits: (...a: unknown[]) => m.reserve(...(a as [])),
  refundCredits: vi.fn(async () => undefined),
}));
vi.mock("@/lib/billing/credit-rate-card", () => ({
  estimatePipelineCredits: () => ({ estimatedCredits: 10 }),
}));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { body?: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          {
            headers: { "x-subsumio-source": "b1" },
            brainId: "b1",
            user: { id: "u1", email: "a@k.at" },
            billing: { ownerId: "o1", ownerType: "org" },
          },
          opts.body ? opts.body.parse(await req.json()) : undefined,
          {},
          req
        ),
  };
});

import { POST as createPOST } from "./route";
import { POST as finalizePOST } from "./[id]/finalize/route";
import { POST as itemPOST } from "./[id]/items/route";

function withParams(req: Request, id: string): Request {
  (req as unknown as { params: Promise<{ id: string }> }).params = Promise.resolve({ id });
  return req;
}
const call = (fn: unknown, req: Request) => (fn as (r: Request) => Promise<Response>)(req);

beforeEach(() => {
  m.pages.clear();
  m.triggers = 0;
  m.reserve.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/legal-pipeline/trigger") {
        m.triggers++;
        await new Promise((r) => setTimeout(r, 5));
        return Response.json({ job_id: 1 });
      }
      if (url.pathname === "/api/pages" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.if_absent && m.pages.has(body.slug)) {
          return Response.json({ error: "page_exists" }, { status: 409 });
        }
        m.pages.set(body.slug, { slug: body.slug, frontmatter: body.frontmatter ?? {} });
        return Response.json({ success: true });
      }
      if (url.pathname === "/api/pages") {
        const prefix = url.searchParams.get("slug_prefix") ?? "";
        return Response.json([...m.pages.values()].filter((p) => p.slug.startsWith(prefix)));
      }
      const slug = decodeURIComponent(url.pathname.replace("/api/pages/", ""));
      const page = m.pages.get(slug);
      return page ? Response.json(page) : new Response("nf", { status: 404 });
    })
  );
});

function seedSession() {
  m.pages.set("act-imports/s1", {
    slug: "act-imports/s1",
    frontmatter: { id: "s1", case_slug: "legal/cases/a", status: "draft", jurisdiction: "at" },
  });
  m.pages.set("docs/a1", { slug: "docs/a1", frontmatter: { case_slug: "legal/cases/a" } });
  m.pages.set("docs/b1", { slug: "docs/b1", frontmatter: { case_slug: "legal/cases/b" } });
  m.pages.set("act-import-items/s1/i1", {
    slug: "act-import-items/s1/i1",
    frontmatter: { id: "i1", status: "ready", documentSlug: "docs/a1", partSlugs: [] },
  });
}

describe("act imports (R8-14)", () => {
  it("POST with an existing session id → 409, the session is untouched", async () => {
    seedSession();
    m.pages.get("act-imports/s1")!.frontmatter.status = "analyzing";
    const res = await call(
      createPOST,
      new Request("http://x/api/act-imports", {
        method: "POST",
        body: JSON.stringify({ id: "s1", case_slug: "legal/cases/b", title: "neu" }),
      })
    );
    expect(res.status).toBe(409);
    expect(m.pages.get("act-imports/s1")!.frontmatter).toMatchObject({
      status: "analyzing",
      case_slug: "legal/cases/a",
    });
  });

  it("an item naming a document of another matter → 400", async () => {
    seedSession();
    const item = (doc: string) =>
      call(
        itemPOST,
        withParams(
          new Request("http://x/api/act-imports/s1/items", {
            method: "POST",
            body: JSON.stringify({
              item_id: "i2",
              case_slug: "legal/cases/a",
              relative_path: "x.pdf",
              filename: "x.pdf",
              size: 1,
              document_slug: doc,
              status: "ready",
            }),
          }),
          "s1"
        )
      );
    expect((await item("docs/b1")).status).toBe(400);
    expect((await item("docs/a1")).status).toBe(200);
  });

  it("two simultaneous finalize calls → one reservation and one pipeline trigger", async () => {
    seedSession();
    const fin = () =>
      call(
        finalizePOST,
        withParams(
          new Request("http://x/api/act-imports/s1/finalize", {
            method: "POST",
            body: JSON.stringify({}),
          }),
          "s1"
        )
      );
    const [a, b] = await Promise.all([fin(), fin()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(m.triggers).toBe(1);
    expect(m.reserve).toHaveBeenCalledTimes(1);
  });

  it("finalize refuses a stored item whose document belongs to another matter", async () => {
    seedSession();
    m.pages.get("act-import-items/s1/i1")!.frontmatter.documentSlug = "docs/b1";
    const res = await call(
      finalizePOST,
      withParams(
        new Request("http://x/api/act-imports/s1/finalize", { method: "POST", body: "{}" }),
        "s1"
      )
    );
    expect(res.status).toBe(400);
    expect(m.triggers).toBe(0);
  });
});

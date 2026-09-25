// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { headers: {}, brainId: "b", user: { id: "u", email: "a@b.at" } };
      if (req.method === "GET") {
        return handler(ctx, undefined, Object.fromEntries(new URL(req.url).searchParams));
      }
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      // Like the real createHandler: an AppError becomes its HTTP answer.
      try {
        return await handler(ctx, parsed.data, {});
      } catch (err) {
        const e = err as { statusCode?: number; code?: string; message?: string };
        if (typeof e.statusCode === "number") {
          return Response.json({ error: e.message, code: e.code }, { status: e.statusCode });
        }
        throw err;
      }
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, POST } from "./route";

let writeStatus = 200;
let stored: Array<Record<string, unknown>> = [];

beforeEach(() => {
  writeStatus = 200;
  stored = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (writeStatus === 200) stored.push(body);
        return new Response("{}", { status: writeStatus });
      }
      return Response.json(
        stored.map((b) => ({ slug: b.slug, title: b.title, frontmatter: b.frontmatter }))
      );
    })
  );
});

function post(body: unknown) {
  return POST(
    new Request("http://x/api/document-interviews", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
}

describe("/api/document-interviews", () => {
  test("the form without a questions field creates an interview that shows up in the list", async () => {
    const res = await post({
      title: "Scheidung",
      description: "",
      template_slug: "templates/scheidung",
      output_format: "docx",
    });
    expect(res.status).toBe(200);
    const list = await (
      await GET(
        new Request("http://x/api/document-interviews?template_slug=templates/scheidung") as never
      )
    ).json();
    expect(list.data.items).toHaveLength(1);
    expect(list.data.items[0].title).toBe("Scheidung");
  });

  test("an engine error is reported, not turned into success", async () => {
    writeStatus = 500;
    const res = await post({ title: "X", template_slug: "t/x", questions: [] });
    expect(res.status).toBe(502);
  });
});

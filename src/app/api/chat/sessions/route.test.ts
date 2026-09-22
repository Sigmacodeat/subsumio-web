import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: { id: "u-lawyer", name: "Lawyer", email: "l@x.at" } }));
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: vi.fn(
    async (_h: unknown, body: { slug: string; frontmatter: Record<string, unknown> }) => {
      const page = store.get(body.slug);
      if (page) page.frontmatter = { ...(page.frontmatter as object), ...body.frontmatter };
      return new Response("{}", { status: 200 });
    }
  ),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => [...store.values()]),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { parse: (d: unknown) => unknown };
        query?: { parse: (d: unknown) => unknown };
      },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { headers: {}, user: user.current };
      const url = new URL(req.url);
      const body =
        opts.body && req.method !== "GET" ? opts.body.parse(await req.json()) : undefined;
      const query = opts.query ? opts.query.parse(Object.fromEntries(url.searchParams)) : undefined;
      return handler(ctx, body, query);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, PATCH, PUT } from "./route";

const ENGINE = "http://engine-test:3001";

beforeEach(() => {
  store.clear();
  user.current = { id: "u-lawyer", name: "Lawyer", email: "l@x.at" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url === `${ENGINE}/api/pages`) {
        const body = JSON.parse(String(init.body));
        store.set(body.slug, body);
        return Response.json({ ok: true });
      }
      const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
      if (init?.method === "DELETE") {
        store.delete(slug);
        return Response.json({ ok: true });
      }
      const page = store.get(slug);
      return page ? Response.json(page) : new Response("{}", { status: 404 });
    })
  );
});

const req = (method: string, body?: unknown, query = "") =>
  new Request(`http://x/api/chat/sessions${query}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;

const session = {
  id: "s1",
  title: "Kündigungsfrist",
  case_slug: "cases/mueller",
  messages: [
    { id: "m1", role: "user", content: "Frage", createdAt: "2026-09-19T10:00:00Z" },
    { id: "m2", role: "assistant", content: "Antwort", createdAt: "2026-09-19T10:00:05Z" },
  ],
};

describe("/api/chat/sessions", () => {
  it("keeps a new conversation private to its owner", async () => {
    expect((await PUT(req("PUT", session))).status).toBe(200);
    expect([...store.keys()]).toEqual(["chat-sessions/private/u-lawyer/s1"]);

    user.current = { id: "u-other", name: "Other", email: "o@x.at" };
    const res = await GET(req("GET", undefined, "?id=s1&owner=u-lawyer"));
    expect(res.status).toBe(404);
  });

  it("shares a copy colleagues can open, and takes it back", async () => {
    await PUT(req("PUT", session));
    const shared = await (await PATCH(req("PATCH", { id: "s1", shared: true }))).json();
    expect(shared.data).toMatchObject({ shared: true, owner_id: "u-lawyer" });
    expect(store.has("chat-sessions/shared/u-lawyer/s1")).toBe(true);

    user.current = { id: "u-other", name: "Other", email: "o@x.at" };
    const opened = await (await GET(req("GET", undefined, "?id=s1&owner=u-lawyer"))).json();
    expect(opened.data.messages).toHaveLength(2);

    user.current = { id: "u-lawyer", name: "Lawyer", email: "l@x.at" };
    await PATCH(req("PATCH", { id: "s1", shared: false }));
    expect(store.has("chat-sessions/shared/u-lawyer/s1")).toBe(false);
  });

  it("lists one's own conversation once even when it is shared", async () => {
    await PUT(req("PUT", session));
    await PATCH(req("PATCH", { id: "s1", shared: true }));
    const listed = await (await GET(req("GET", undefined, "?case_slug=cases/mueller"))).json();
    expect(listed.data.sessions.map((s: { id: string }) => s.id)).toEqual(["s1"]);
  });
});

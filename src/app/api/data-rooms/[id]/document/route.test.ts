// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const role = vi.hoisted(() => ({ value: { kind: "guest" } as Record<string, unknown> }));
const pages = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const fileCalls = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({ "x-subsumio-source": "host" }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock("@/lib/data-rooms", () => ({
  getDataRoomStore: () => ({
    getRoom: async () => ({ id: "room-1", hostBrainId: "host", caseSlug: "legal/cases/m" }),
    documents: async () => [{ docSlug: "docs/d1", title: "D1" }],
  }),
}));
vi.mock("@/lib/data-room-access", () => ({ roomRole: async () => role.value }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, b: unknown, q: unknown, req: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const q = opts.query!.safeParse(Object.fromEntries(new URL(req.url).searchParams));
      return handler(
        { headers: {}, user: { id: "g1", email: "g@x.at" } },
        undefined,
        q.data,
        Object.assign(req, { params: Promise.resolve({ id: "room-1" }) })
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";

beforeEach(() => {
  role.value = { kind: "guest" };
  pages.clear();
  fileCalls.length = 0;
  pages.set("legal/cases/m", { slug: "legal/cases/m", frontmatter: { status: "open" } });
  pages.set("docs/d1", { slug: "docs/d1", title: "D1", content: "Text", frontmatter: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const file = u.match(/\/api\/files\/(.+)$/);
      if (file) {
        fileCalls.push(decodeURIComponent(file[1]!));
        return new Response("%PDF", {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }
      const m = u.match(/\/api\/pages\/(.+)$/);
      const page = m ? pages.get(decodeURIComponent(m[1]!)) : undefined;
      return page ? Response.json(page) : new Response("{}", { status: 404 });
    })
  );
});

const get = (format: "file" | "text") =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request(`http://x/api/data-rooms/room-1/document?slug=docs/d1&format=${format}`)
  );

describe("data room document — deletion ends sharing", () => {
  it("serves a live shared document to a guest", async () => {
    expect((await get("text")).status).toBe(200);
    expect((await get("file")).status).toBe(200);
  });

  it("a tombstoned document is 404 for text and file", async () => {
    pages.set("docs/d1", { slug: "docs/d1", frontmatter: { status: "tombstoned" } });
    expect((await get("text")).status).toBe(404);
    expect((await get("file")).status).toBe(404);
    expect(fileCalls).toEqual([]);
  });

  it("an archived matter closes the room for guests", async () => {
    pages.set("legal/cases/m", { slug: "legal/cases/m", frontmatter: { status: "archived" } });
    expect((await get("file")).status).toBe(404);
    expect(fileCalls).toEqual([]);
  });

  it("a purged document (page gone) is 404", async () => {
    pages.delete("docs/d1");
    expect((await get("file")).status).toBe(404);
    expect(fileCalls).toEqual([]);
  });
});

// @vitest-environment node

/**
 * End-to-end through the DMS routes with the real per-firm resolution and the
 * real access rules: two firms with their own DMS, one without. Engine and DMS
 * backends are stubbed at the fetch level.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

let current = { brainId: "brain-a", role: "lawyer" };

vi.mock("@/lib/api-handler", () => ({
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<unknown>
  ) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const body = req.method === "POST" ? await req.json() : null;
      const ctx = {
        brainId: current.brainId,
        headers: { "x-brain": current.brainId },
        user: { id: "u1", email: "t@t.com", role: current.role },
      };
      return handler(ctx, body, Object.fromEntries(url.searchParams), req);
    };
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  recordQuota: vi.fn(),
  enginePatchPage: vi.fn(),
}));
vi.mock("@/lib/dms/config-store", () => ({
  getDmsSettingsForBrain: vi.fn(async (brainId: string) => {
    if (brainId === "brain-a")
      return { provider: "imanager", baseUrl: "https://dms-a.example.com", apiKey: "key-a" };
    if (brainId === "brain-b")
      return { provider: "imanager", baseUrl: "https://dms-b.example.com", apiKey: "key-b" };
    return null;
  }),
}));

import * as content from "./content/route";
import * as search from "./search/route";
import * as status from "./status/route";

/** Import pages per brain: brain-a imported doc-1 (unlinked) and doc-2 (walled matter). */
const importPages: Record<string, Record<string, Record<string, unknown>>> = {
  "brain-a": {
    "doc-1": { dms_document_id: "doc-1" },
    "doc-2": { dms_document_id: "doc-2", case_slug: "cases/walled" },
  },
};

let dmsCalls: string[] = [];

beforeEach(() => {
  delete process.env.DMS_ALLOWED_BRAIN_IDS;
  delete process.env.DMS_PROVIDER;
  current = { brainId: "brain-a", role: "lawyer" };
  dmsCalls = [];
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const brain = new Headers(init?.headers).get("x-brain") ?? "";
    if (url.startsWith("http://engine/api/pages/")) {
      const slug = decodeURIComponent(url.slice("http://engine/api/pages/".length));
      if (slug.startsWith("dms/import/")) {
        const fm = importPages[brain]?.[slug.slice("dms/import/".length)];
        return fm
          ? Response.json({ type: "dms_document", frontmatter: fm })
          : new Response("nf", { status: 404 });
      }
      if (slug === "cases/walled") {
        // Case exists, but an ethical wall excludes u1.
        return Response.json({
          type: "legal_case",
          frontmatter: { permissions: { blocked_users: ["u1"] } },
        });
      }
      return new Response("nf", { status: 404 });
    }
    dmsCalls.push(`${url} ${new Headers(init?.headers).get("authorization")}`);
    if (url.includes("/search")) {
      return Response.json({
        documents: [
          { id: "doc-1", name: "a.pdf" },
          { id: "doc-2", name: "walled.pdf" },
          { id: "doc-3", name: "fresh.pdf" },
        ],
        total_count: 3,
      });
    }
    if (url.endsWith("/content")) {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "application/pdf" },
      });
    }
    return Response.json({ id: "doc-1", name: "a.pdf" });
  });
});

const get = (url: string) => new Request(url) as never;

describe("DMS per firm", () => {
  test("firm A opens a document it imported, from its own DMS with its own key", async () => {
    const r = (await content.GET(get("http://x/api/dms/content?id=doc-1"))) as Response;
    expect(r.status).toBe(200);
    expect(dmsCalls.length).toBeGreaterThan(0);
    expect(
      dmsCalls.every(
        (c) => c.startsWith("https://dms-a.example.com/") && c.endsWith("Bearer key-a")
      )
    ).toBe(true);
  });

  test("firm B cannot fetch a document id imported by firm A", async () => {
    current = { brainId: "brain-b", role: "lawyer" };
    const r = (await content.GET(get("http://x/api/dms/content?id=doc-1"))) as Response;
    expect(r.status).toBe(403);
    expect(dmsCalls).toEqual([]);
  });

  test("a firm without its own DMS gets 503 'DMS nicht eingerichtet'", async () => {
    current = { brainId: "brain-c", role: "lawyer" };
    const r = (await content.GET(get("http://x/api/dms/content?id=doc-1"))) as Response;
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("DMS nicht eingerichtet");
    const s = (await status.GET(get("http://x/api/dms/status"))) as Response;
    expect(await s.json()).toEqual({ configured: false });
  });

  test("a document linked to a walled matter is refused", async () => {
    const r = (await content.GET(get("http://x/api/dms/content?id=doc-2"))) as Response;
    expect(r.status).toBe(403);
    expect(dmsCalls).toEqual([]);
  });

  test("search drops hits linked to a walled matter; unlinked hits stay for staff", async () => {
    const r = (await search.GET(get("http://x/api/dms/search?q=a"))) as Response;
    const body = (await r.json()) as { documents: Array<{ id: string }>; totalCount: number };
    expect(body.documents.map((d) => d.id)).toEqual(["doc-1", "doc-3"]);
    expect(body.totalCount).toBe(2);
  });

  test("status reports the firm's own DMS", async () => {
    const s = (await status.GET(get("http://x/api/dms/status"))) as Response;
    expect(await s.json()).toMatchObject({ configured: true, source: "firm", ready: true });
  });
});

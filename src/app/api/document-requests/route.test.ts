// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockNotify = vi.fn();

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/comments", () => ({
  createDocumentRequestNotification: (...args: unknown[]) => mockNotify(...args),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { headers: {}, brainId: "b", user: { id: "u", email: "a@b.at" } };
      if (req.method === "GET") {
        return handler(ctx, undefined, Object.fromEntries(new URL(req.url).searchParams));
      }
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      return handler(ctx, parsed.data, {});
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET, PATCH } from "./route";

type Row = { slug: string; title: string; type: string; frontmatter: Record<string, unknown> };
let rows: Row[] = [];
let stored: Record<string, unknown> | null = null;
const writes: Array<{ body: Record<string, unknown>; signal: unknown }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes.push({ body: JSON.parse(String(init.body)), signal: init.signal });
        return Response.json({ ok: true });
      }
      const u = new URL(url);
      if (u.pathname === "/api/pages") {
        const start = Number(u.searchParams.get("cursor") ?? "0");
        const headers: Record<string, string> = {};
        if (start + 100 < rows.length) headers["x-next-cursor"] = String(start + 100);
        return new Response(JSON.stringify(rows.slice(start, start + 100)), { headers });
      }
      return stored ? Response.json(stored) : new Response("{}", { status: 404 });
    })
  );
});

function request(i: number): Row {
  return {
    slug: `legal/document-requests/r${i}`,
    title: `Anfrage ${i}`,
    type: "document_request",
    frontmatter: {
      case_slug: "legal/cases/a",
      status: "draft",
      created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    },
  };
}

describe("GET /api/document-requests", () => {
  test("lists every request, not only the newest 100", async () => {
    rows = Array.from({ length: 150 }, (_, i) => request(i));
    const res = await GET(new Request("http://x/api/document-requests") as never);
    const body = await res.json();
    expect(body.total).toBe(150);
  });

  test("a failed listing is an error, not an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    const res = await GET(new Request("http://x/api/document-requests") as never);
    expect(res.status).toBe(502);
  });
});

describe("PATCH /api/document-requests", () => {
  function patch(body: unknown) {
    return PATCH(
      new Request("http://x/api/document-requests", {
        method: "PATCH",
        body: JSON.stringify(body),
      }) as never
    );
  }

  test("updates the status without renaming or retyping the request", async () => {
    stored = { ...request(1), frontmatter: { ...request(1).frontmatter, case_title: "Akte A" } };
    const res = await patch({ slug: "legal/document-requests/r1", status: "sent" });
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.body.title).toBeUndefined();
    expect(writes[0]!.body.type).toBeUndefined();
    expect(writes[0]!.body.signal).toBeUndefined();
    expect(writes[0]!.signal).toBeDefined();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ caseSlug: "legal/cases/a", caseTitle: "Akte A" })
    );
  });

  test("refuses to touch a page that is not a document request (409)", async () => {
    stored = { slug: "legal/cases/a", type: "legal_case", frontmatter: {} };
    const res = await patch({ slug: "legal/cases/a", status: "sent" });
    expect(res.status).toBe(409);
    expect(writes).toHaveLength(0);
  });

  test("an unknown slug is 404, nothing is created", async () => {
    stored = null;
    const res = await patch({ slug: "legal/document-requests/neu", status: "sent" });
    expect(res.status).toBe(404);
    expect(writes).toHaveLength(0);
  });
});

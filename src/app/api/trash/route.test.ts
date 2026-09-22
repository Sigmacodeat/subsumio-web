import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockListEnginePages = vi.fn();
const mockEnginePatchPage = vi.fn();

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: (...args: unknown[]) => mockEnginePatchPage(...args),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockListEnginePages(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams.entries());
      if (req.method === "GET") {
        const parsed = opts.query?.safeParse(query);
        if (parsed && !parsed.success) {
          return Response.json({ error: "validation_failed" }, { status: 400 });
        }
        return handler(ctx, undefined, parsed?.data ?? query, req);
      }
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, parsed?.data ?? raw, undefined, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { GET, POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

function enginePage(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status });
}

describe("GET /api/trash", () => {
  beforeEach(() => vi.clearAllMocks());

  test("lists archived cases and tombstoned pages, newest first", async () => {
    mockListEnginePages.mockImplementation((_h: unknown, type: string) => {
      if (type === "legal_case") {
        return Promise.resolve([
          {
            slug: "legal/cases/old",
            title: "Alte Akte",
            type: "legal_case",
            frontmatter: {
              status: "archived",
              archived_at: "2026-01-01T10:00:00.000Z",
              archived_by: "anwalt@example.com",
            },
          },
          {
            slug: "legal/cases/active",
            title: "Aktive Akte",
            type: "legal_case",
            frontmatter: { status: "open" },
          },
        ]);
      }
      if (type === "document") {
        return Promise.resolve([
          {
            slug: "legal/cases/old/doc-1",
            title: "Schriftsatz",
            type: "document",
            frontmatter: {
              status: "tombstoned",
              tombstoned_at: "2026-02-01T10:00:00.000Z",
              tombstone_reason: "case_archived",
              case_slug: "legal/cases/old",
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const res = await GET(new Request("http://localhost/api/trash") as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].slug).toBe("legal/cases/old/doc-1");
    expect(body.data.items[0].kind).toBe("item");
    expect(body.data.items[0].reason).toBe("case_archived");
    expect(body.data.items[1].slug).toBe("legal/cases/old");
    expect(body.data.items[1].kind).toBe("case");
    expect(body.data.items[1].deleted_by).toBe("anwalt@example.com");
  });

  test("honours the type filter", async () => {
    mockListEnginePages.mockResolvedValue([]);
    const res = await GET(
      new Request("http://localhost/api/trash?type=invoice") as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    expect(mockListEnginePages).toHaveBeenCalledTimes(1);
    expect(mockListEnginePages).toHaveBeenCalledWith(
      { "x-subsumio-source": "brain-at" },
      "invoice",
      5000,
      { includeTombstoned: true }
    );
  });

  test("returns 503 when the engine listing fails", async () => {
    mockListEnginePages.mockRejectedValue(new Error("down"));
    const res = await GET(new Request("http://localhost/api/trash") as unknown as NextRequest);
    expect(res.status).toBe(503);
  });
});

describe("POST /api/trash (restore)", () => {
  beforeEach(() => vi.clearAllMocks());

  test("rejects a missing slug", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 404 for an unknown slug", async () => {
    mockFetch.mockResolvedValueOnce(enginePage({}, 404));
    const res = await post({ slug: "doc-1" });
    expect(res.status).toBe(404);
  });

  test("returns 409 for an element that is not deleted", async () => {
    mockFetch.mockResolvedValueOnce(
      enginePage({ slug: "doc-1", type: "document", frontmatter: { status: "assigned" } })
    );
    const res = await post({ slug: "doc-1" });
    expect(res.status).toBe(409);
    expect(mockEnginePatchPage).not.toHaveBeenCalled();
  });

  test("restores a tombstoned document and clears the tombstone keys", async () => {
    mockFetch.mockResolvedValueOnce(
      enginePage({
        slug: "doc-1",
        type: "document",
        frontmatter: {
          status: "tombstoned",
          tombstoned_at: "2026-02-01T10:00:00.000Z",
          tombstone_reason: "manual_delete",
          case_slug: "legal/cases/one",
        },
      })
    );
    // Parent case lookup — active, not archived.
    mockFetch.mockResolvedValueOnce(
      enginePage({ slug: "legal/cases/one", frontmatter: { status: "open" } })
    );
    mockEnginePatchPage.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await post({ slug: "doc-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("active");

    const [, patchBody] = mockEnginePatchPage.mock.calls[0] as [
      unknown,
      { slug: string; frontmatter: Record<string, unknown> },
    ];
    expect(patchBody.slug).toBe("doc-1");
    expect(patchBody.frontmatter).toMatchObject({
      status: null,
      tombstoned_at: null,
      tombstone_reason: null,
      assignment_status: "assigned",
      restored_by: "anwalt@example.com",
    });
  });

  test("refuses to restore a document into an archived matter", async () => {
    mockFetch.mockResolvedValueOnce(
      enginePage({
        slug: "doc-1",
        type: "document",
        frontmatter: { status: "tombstoned", case_slug: "legal/cases/old" },
      })
    );
    mockFetch.mockResolvedValueOnce(
      enginePage({ slug: "legal/cases/old", frontmatter: { status: "archived" } })
    );
    const res = await post({ slug: "doc-1" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("parent_archived");
    expect(mockEnginePatchPage).not.toHaveBeenCalled();
  });

  test("restores an archived case and reactivates its cascade-tombstoned documents", async () => {
    mockFetch.mockResolvedValueOnce(
      enginePage({
        slug: "legal/cases/old",
        type: "legal_case",
        frontmatter: { status: "archived", archived_at: "2026-01-01T10:00:00.000Z" },
      })
    );
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "legal/cases/old/doc-1",
        type: "document",
        frontmatter: {
          status: "tombstoned",
          tombstone_reason: "case_archived",
          case_slug: "legal/cases/old",
        },
      },
      {
        slug: "legal/cases/old/doc-2",
        type: "document",
        frontmatter: {
          status: "tombstoned",
          tombstone_reason: "manual_delete",
          case_slug: "legal/cases/old",
        },
      },
      {
        slug: "legal/cases/other/doc-3",
        type: "document",
        frontmatter: {
          status: "tombstoned",
          tombstone_reason: "case_archived",
          case_slug: "legal/cases/other",
        },
      },
    ]);
    mockEnginePatchPage.mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await post({ slug: "legal/cases/old" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("open");
    expect(body.data.cascaded).toBe(1);

    // Case patch first, then exactly one cascade patch for doc-1 only.
    expect(mockEnginePatchPage).toHaveBeenCalledTimes(2);
    const casePatch = mockEnginePatchPage.mock.calls[0][1] as {
      frontmatter: Record<string, unknown>;
    };
    expect(casePatch.frontmatter).toMatchObject({
      status: "open",
      archived_at: null,
      archived_by: null,
    });
    const docPatch = mockEnginePatchPage.mock.calls[1][1] as {
      slug: string;
      frontmatter: Record<string, unknown>;
    };
    expect(docPatch.slug).toBe("legal/cases/old/doc-1");
    expect(docPatch.frontmatter.status).toBeNull();
  });

  test("restores an archived case to dormant when requested", async () => {
    mockFetch.mockResolvedValueOnce(
      enginePage({
        slug: "legal/cases/old",
        type: "legal_case",
        frontmatter: { status: "archived" },
      })
    );
    mockListEnginePages.mockResolvedValueOnce([]);
    mockEnginePatchPage.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await post({ slug: "legal/cases/old", status: "dormant" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("dormant");
    const casePatch = mockEnginePatchPage.mock.calls[0][1] as {
      frontmatter: Record<string, unknown>;
    };
    expect(casePatch.frontmatter.status).toBe("dormant");
  });

  test("rejects a target status outside the archived state machine", async () => {
    const res = await post({ slug: "legal/cases/old", status: "won" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

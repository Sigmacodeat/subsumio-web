import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockList = vi.fn();

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockList(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const url = new URL(req.url);
      const rawQuery = Object.fromEntries(url.searchParams.entries());
      const parsed = opts.query?.safeParse(rawQuery);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, undefined, parsed?.data ?? rawQuery);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { GET } from "./route";

function get(qs = "") {
  return GET(
    new Request(`http://localhost/api/post-upload-tasks${qs}`, {
      method: "GET",
    }) as unknown as NextRequest
  );
}

function page(slug: string, fm: Record<string, unknown>) {
  return { slug, type: "post_upload_task_exhausted", frontmatter: fm };
}

describe("GET /api/post-upload-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("listet exhausted Tasks aller Typen", async () => {
    mockList.mockResolvedValueOnce([
      page("legal/post-upload-tasks/analyze/d-1-aaa", {
        task_type: "analyze",
        status: "exhausted",
        doc_slug: "legal/documents/d-1",
        doc_title: "Klage.pdf",
        attempts: 4,
        last_error: "timeout",
      }),
      page("legal/post-upload-tasks/inbound_stamp/in-x-bbb", {
        task_type: "inbound_stamp",
        status: "exhausted",
        doc_slug: "in-x",
      }),
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { tasks: Array<{ task_slug: string; task_type?: string; doc_title?: string }> };
    };
    expect(body.data.tasks).toHaveLength(2);
    expect(body.data.tasks[0]).toMatchObject({
      task_slug: "legal/post-upload-tasks/analyze/d-1-aaa",
      task_type: "analyze",
      doc_title: "Klage.pdf",
      last_error: "timeout",
    });
    // tenant-scoped
    expect(mockList).toHaveBeenCalledWith(
      { "x-subsumio-source": "brain-at" },
      "post_upload_task_exhausted",
      5000
    );
  });

  test("filtert Fremd-Status und fehlende task_type raus", async () => {
    mockList.mockResolvedValueOnce([
      page("legal/post-upload-tasks/analyze/d-1-aaa", {
        task_type: "analyze",
        status: "pending",
        doc_slug: "d-1",
      }),
      page("legal/post-upload-tasks/x/y", { status: "exhausted", doc_slug: "d-2" }),
    ]);
    const res = await get();
    const body = (await res.json()) as { data: { tasks: unknown[] } };
    expect(body.data.tasks).toHaveLength(0);
  });

  test("status=pending listet laufende Tasks", async () => {
    mockList.mockResolvedValueOnce([
      page("legal/post-upload-tasks/analyze/d-1-aaa", {
        task_type: "analyze",
        status: "pending",
        doc_slug: "d-1",
        attempts: 2,
        next_attempt_at: "2026-01-01T00:00:00Z",
      }),
    ]);
    const res = await get("?status=pending");
    const body = (await res.json()) as { data: { tasks: Array<{ attempts?: number }> } };
    expect(body.data.tasks).toHaveLength(1);
    expect(mockList).toHaveBeenCalledWith(
      { "x-subsumio-source": "brain-at" },
      "post_upload_task",
      5000
    );
  });

  test("Engine-Fehler → 502", async () => {
    mockList.mockRejectedValueOnce(new Error("down"));
    const res = await get();
    expect(res.status).toBe(502);
  });
});

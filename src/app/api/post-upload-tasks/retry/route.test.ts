import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockPatch = vi.fn();

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, parsed?.data ?? raw);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { POST } from "./route";

const STAMP_SLUG = "legal/post-upload-tasks/inbound_stamp/in-x-abcdef1234567890";
const ANALYZE_SLUG = "legal/post-upload-tasks/analyze/doc-1-abcdef1234567890";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/post-upload-tasks/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

function taskPage(fm: Record<string, unknown>) {
  return new Response(JSON.stringify({ type: "post_upload_task_exhausted", frontmatter: fm }), {
    status: 200,
  });
}

const EXHAUSTED_STAMP = {
  task_type: "inbound_stamp",
  status: "exhausted",
  attempts: 4,
  doc_slug: "in-x",
  inbound: { entry_id: "in-x", input: { channel: "portal", subject: "Vollmacht.pdf" } },
};

const EXHAUSTED_ANALYZE = {
  task_type: "analyze",
  status: "exhausted",
  attempts: 4,
  doc_slug: "legal/documents/d-1",
  doc_title: "Klage.pdf",
};

describe("POST /api/post-upload-tasks/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockResolvedValue({ ok: true });
  });

  test("re-queued einen exhausted inbound_stamp-Task", async () => {
    mockFetch.mockResolvedValueOnce(taskPage(EXHAUSTED_STAMP));
    const res = await post({ task_slug: STAMP_SLUG });
    expect(res.status).toBe(200);

    const [headers, patchArg] = mockPatch.mock.calls[0] as [
      Record<string, string>,
      { slug: string; type: string; frontmatter: Record<string, unknown> },
    ];
    expect(patchArg.slug).toBe(STAMP_SLUG);
    expect(patchArg.type).toBe("post_upload_task");
    expect(patchArg.frontmatter.status).toBe("pending");
    expect(patchArg.frontmatter.attempts).toBe(0);
    expect(patchArg.frontmatter.retried_by).toBe("anwalt@example.com");
    expect(headers["x-subsumio-source"]).toBe("brain-at");
  });

  test("re-queued auch andere Task-Typen (analyze)", async () => {
    mockFetch.mockResolvedValueOnce(taskPage(EXHAUSTED_ANALYZE));
    const res = await post({ task_slug: ANALYZE_SLUG });
    expect(res.status).toBe(200);
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });

  test("nicht-exhausted Tasks → 409 (pending läuft schon)", async () => {
    mockFetch.mockResolvedValueOnce(taskPage({ ...EXHAUSTED_STAMP, status: "pending" }));
    const res = await post({ task_slug: STAMP_SLUG });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("blocked Tasks → 409 (terminal, kein Retry)", async () => {
    mockFetch.mockResolvedValueOnce(taskPage({ ...EXHAUSTED_ANALYZE, status: "blocked" }));
    const res = await post({ task_slug: ANALYZE_SLUG });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("Seite ohne Task-Frontmatter → 409", async () => {
    mockFetch.mockResolvedValueOnce(taskPage({ title: "kein Task" }));
    const res = await post({ task_slug: STAMP_SLUG });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("unbekannter Task → 404", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nf", { status: 404 }));
    const res = await post({ task_slug: STAMP_SLUG });
    expect(res.status).toBe(404);
  });

  test("Slug außerhalb des post-upload-tasks-Namensraums → 400", async () => {
    const res = await post({ task_slug: "legal/cases/../../etc" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("Engine-Patch-Fehler → 502", async () => {
    mockFetch.mockResolvedValueOnce(taskPage(EXHAUSTED_STAMP));
    mockPatch.mockResolvedValueOnce({ ok: false });
    const res = await post({ task_slug: STAMP_SLUG });
    expect(res.status).toBe(502);
  });
});

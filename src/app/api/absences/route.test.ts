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
      audit?: (ctx: unknown, body: unknown) => unknown;
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
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
      return handler(ctx, parsed?.data ?? raw, undefined, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { PATCH } from "./route";

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/absences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

const ABSENCE = {
  id: "absence-1",
  user_email: "ra@example.com",
  user_name: "RA Müller",
  delegate_email: "vertreter@example.com",
  delegate_name: "RA Vertreter",
  start_date: "2026-10-01",
  end_date: "2026-10-14",
  status: "planned",
  auto_route_enabled: true,
  reassigned_rundown_items: [],
  forwarded_deadlines: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function pageWith(record: unknown) {
  return new Response(JSON.stringify({ frontmatter: record }), { status: 200 });
}

describe("PATCH /api/absences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockResolvedValue({ ok: true });
  });

  test("cancel setzt status=cancelled und schreibt zurück", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(200);

    const [headers, patchArg] = mockPatch.mock.calls[0] as [
      Record<string, string>,
      { slug: string; frontmatter: { status: string } },
    ];
    expect(patchArg.slug).toBe("legal/absences/absence-1");
    expect(patchArg.frontmatter.status).toBe("cancelled");
    expect(headers["x-subsumio-source"]).toBe("brain-at");
  });

  test("complete setzt status=completed", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "active" }));
    const res = await patch({ id: "absence-1", action: "complete" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.status).toBe("completed");
  });

  test("activate setzt status=active", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    const res = await patch({ id: "absence-1", action: "activate" });
    const body = await res.json();
    expect(body.data.absence.status).toBe("active");
  });

  test("unbekannte Abwesenheit → 404, kein Patch", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nf", { status: 404 }));
    const res = await patch({ id: "gibts-nicht", action: "cancel" });
    expect(res.status).toBe(404);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("bereits storniert/abgeschlossen → 409 (kein Reopen über Lifecycle)", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "cancelled" }));
    const res = await patch({ id: "absence-1", action: "activate" });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("id im Frontmatter muss übereinstimmen (kein fremder Slug)", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, id: "andere-id" }));
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(404);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("Engine-Patch-Fehler → 502", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    mockPatch.mockResolvedValueOnce({ ok: false });
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(502);
  });

  test("Validierung: unbekannte action → 400", async () => {
    const res = await patch({ id: "absence-1", action: "delete" });
    expect(res.status).toBe(400);
  });
});

// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      const raw = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      }
      return handler(ctx, raw);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { POST } from "./route";

const validCsv = `case_number,client_name,matter,mandate_id
123,Max Muster,Kündigung,M-001
456,Anna Schmidt,Unterhalt,M-002`;

describe("POST /api/cases/bulk-import", () => {
  beforeEach(() => vi.clearAllMocks());

  test("creates new cases from valid CSV", async () => {
    // Both cases don't exist yet → 404 on check, 201 on create
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // check case 1
      .mockResolvedValueOnce(new Response("{}", { status: 201 })) // create case 1
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // check case 2
      .mockResolvedValueOnce(new Response("{}", { status: 201 })); // create case 2

    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: validCsv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(2);
    expect(body.data.created).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(body.data.errors).toBe(0);
    expect(body.data.case_slugs).toHaveLength(2);
  });

  test("skips existing cases", async () => {
    // First case exists → 200, skip. Second case doesn't → create.
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // case 1 exists
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // case 2 doesn't
      .mockResolvedValueOnce(new Response("{}", { status: 201 })); // create case 2

    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: validCsv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(body.data.skipped).toBe(1);
  });

  test("returns 400 when CSV has no valid rows", async () => {
    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: "case_number,client_name,matter,mandate_id" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("parse_error");
  });

  test("rejects CSV shorter than 10 chars", async () => {
    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: "short" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("records errors when engine create fails", async () => {
    // CSV has 2 rows. Each row needs: check (404) + create (500 for row 1, 201 for row 2)
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // check row 1
      .mockResolvedValueOnce(new Response("Error", { status: 500 })) // create row 1 fails
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // check row 2
      .mockResolvedValueOnce(new Response("{}", { status: 201 })); // create row 2 succeeds

    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: validCsv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.errors).toBe(1);
    expect(body.data.created).toBe(1);
    expect(body.data.errors_detail).toHaveLength(1);
    expect(body.data.errors_detail[0].error).toContain("500");
  });

  test("handles fetch exceptions gracefully", async () => {
    // Row 1: check throws. Row 2: check + create succeed.
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Network error")) // check row 1 throws
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // check row 2
      .mockResolvedValueOnce(new Response("{}", { status: 201 })); // create row 2

    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: validCsv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.errors).toBe(1);
    expect(body.data.errors_detail[0].error).toBe("Network error");
  });

  test("rejects CSV over 100,000 chars", async () => {
    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv: "x".repeat(100_001) }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("handles mixed success/skip/error in one batch", async () => {
    const csv = `case_number,client_name,matter,mandate_id
1,Client A,Matter A,M-001
2,Client B,Matter B,M-002
3,Client C,Matter C,M-003`;

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // case 1 exists (skip)
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // case 2 check
      .mockResolvedValueOnce(new Response("{}", { status: 201 })) // case 2 create
      .mockResolvedValueOnce(new Response("Not found", { status: 404 })) // case 3 check
      .mockResolvedValueOnce(new Response("Error", { status: 500 })); // case 3 create fails

    const req = new Request("http://localhost/api/cases/bulk-import", {
      method: "POST",
      body: JSON.stringify({ csv }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(3);
    expect(body.data.skipped).toBe(1);
    expect(body.data.created).toBe(1);
    expect(body.data.errors).toBe(1);
  });
});

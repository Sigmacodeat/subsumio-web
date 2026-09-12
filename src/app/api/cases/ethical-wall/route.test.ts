// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      let body: unknown = {};
      if (opts.body) {
        const raw = await req.json().catch(() => ({}));
        const parsed = opts.body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
        body = parsed.data ?? raw;
      }
      let query: unknown = undefined;
      if (opts.query) {
        const params = Object.fromEntries(url.searchParams);
        const parsed = opts.query.safeParse(params);
        if (parsed.success) query = parsed.data;
      }
      return handler(ctx, body, query, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { GET, PATCH } from "./route";

describe("PATCH /api/cases/ethical-wall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("updates blocked_users on a case", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            frontmatter: { permissions: { blocked_users: ["old-user"] } },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const req = new Request("http://localhost/api/cases/ethical-wall", {
      method: "PATCH",
      body: JSON.stringify({ case_slug: "legal/cases/test", blocked_users: ["user-a", "user-b"] }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.case_slug).toBe("legal/cases/test");
    expect(body.data.blocked_users).toEqual(["user-a", "user-b"]);

    // Verify PATCH to engine
    const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(patchCall![1]?.method).toBe("PATCH");
    const patchBody = JSON.parse(patchCall![1]?.body as string);
    expect(patchBody.frontmatter.permissions.blocked_users).toEqual(["user-a", "user-b"]);
  });

  test("returns 404 when case not found", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Not found", { status: 404 })
    );

    const req = new Request("http://localhost/api/cases/ethical-wall", {
      method: "PATCH",
      body: JSON.stringify({ case_slug: "legal/cases/missing", blocked_users: [] }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  test("returns 502 when engine update fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ frontmatter: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const req = new Request("http://localhost/api/cases/ethical-wall", {
      method: "PATCH",
      body: JSON.stringify({ case_slug: "legal/cases/test", blocked_users: ["user-a"] }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(502);
  });

  test("initializes permissions when missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ frontmatter: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const req = new Request("http://localhost/api/cases/ethical-wall", {
      method: "PATCH",
      body: JSON.stringify({ case_slug: "legal/cases/test", blocked_users: ["user-x"] }),
    });

    await PATCH(req);
    const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const patchBody = JSON.parse(patchCall![1]?.body as string);
    expect(patchBody.frontmatter.permissions.blocked_users).toEqual(["user-x"]);
  });
});

describe("GET /api/cases/ethical-wall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns blocked users and audit events", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            frontmatter: { permissions: { blocked_users: ["user-a"] } },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              action: "case.update",
              timestamp: "2026-01-01T00:00:00Z",
              details: { blockedUsers: ["user-a"] },
            },
            {
              action: "case.update",
              timestamp: "2026-01-02T00:00:00Z",
              details: { other: "data" },
            },
          ]),
          { status: 200 }
        )
      );

    const req = new Request("http://localhost/api/cases/ethical-wall?case_slug=legal/cases/test", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blocked_users).toEqual(["user-a"]);
    expect(body.data.audit_events).toHaveLength(1);
    expect(body.data.audit_events[0].details.blockedUsers).toEqual(["user-a"]);
  });

  test("returns empty blocked_users when no permissions set", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(JSON.stringify({ frontmatter: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));

    const req = new Request("http://localhost/api/cases/ethical-wall?case_slug=legal/cases/test", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blocked_users).toEqual([]);
  });

  test("returns 404 when case not found", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Not found", { status: 404 })
    );

    const req = new Request(
      "http://localhost/api/cases/ethical-wall?case_slug=legal/cases/missing",
      {
        method: "GET",
      }
    );

    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  test("handles audit endpoint failure gracefully", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ frontmatter: { permissions: { blocked_users: ["user-a"] } } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("Error", { status: 500 }));

    const req = new Request("http://localhost/api/cases/ethical-wall?case_slug=legal/cases/test", {
      method: "GET",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.blocked_users).toEqual(["user-a"]);
    expect(body.data.audit_events).toEqual([]);
  });
});

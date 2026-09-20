// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      let query: unknown = undefined;
      if (opts.query) {
        const params = Object.fromEntries(url.searchParams);
        const parsed = opts.query.safeParse(params);
        if (parsed.success) query = parsed.data;
      }
      return handler(ctx, {}, query);
    };
  },
}));

global.fetch = vi.fn() as unknown as typeof fetch;

import { GET } from "./route";

describe("GET /api/legal/deadlines.ics", () => {
  beforeEach(() => vi.clearAllMocks());

  test("proxies ICS feed from engine with correct content-type", async () => {
    const mockIcs =
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Frist\nEND:VEVENT\nEND:VCALENDAR";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(mockIcs, { status: 200, headers: { "Content-Type": "text/calendar" } })
    );

    const req = new Request("http://localhost/api/legal/deadlines.ics", { method: "GET" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("fristenbuch.ics");
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    const body = await res.text();
    expect(body).toContain("VCALENDAR");
  });

  test("passes case filter to engine URL", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR", { status: 200 })
    );

    const req = new Request("http://localhost/api/legal/deadlines.ics?case=legal/cases/test", {
      method: "GET",
    });
    await GET(req);

    const fetchUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(fetchUrl).toContain("case=legal%2Fcases%2Ftest");
  });

  test("an empty engine feed falls back to the matters in the brain", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("BEGIN:VCALENDAR\nEND:VCALENDAR", { status: 200 }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(
        Response.json([
          {
            slug: "legal/cases/a",
            title: "Novak",
            frontmatter: { deadlines: [{ title: "Replik", due_date: "2026-10-01" }] },
          },
        ])
      );

    const req = new Request("http://localhost/api/legal/deadlines.ics", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SUMMARY:Replik");
    expect(body).toContain("DTSTART;VALUE=DATE:20261001");
  });

  test("falls back to brain-built ICS when the engine feed errors", async () => {
    // Primary ICS fetch fails; the route falls back to building the ICS
    // from brain pages directly (fetchPagesByType calls) instead of 502ing —
    // a Fristenbuch feed staying available beats a hard failure.
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("Internal error", { status: 500 }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]));

    const req = new Request("http://localhost/api/legal/deadlines.ics", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
  });

  test("returns 502 when engine is unreachable", async () => {
    // Every source fails. An empty calendar would quietly delete the entries a
    // subscribed client already holds, so the route reports the failure.
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new Request("http://localhost/api/legal/deadlines.ics", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain("ICS feed unavailable");
  });

  test("works without case filter (all deadlines)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR", { status: 200 })
    );

    const req = new Request("http://localhost/api/legal/deadlines.ics", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const fetchUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(fetchUrl).not.toContain("case=");
  });
});

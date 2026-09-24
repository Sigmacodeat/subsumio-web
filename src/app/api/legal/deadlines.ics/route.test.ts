import type { NextRequest } from "next/server";
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

type Routes = { fristenbuch?: unknown; pages?: Record<string, unknown[]>; fail?: string[] };

/** Engine stub routed by URL: the feed is built from the Fristen read model. */
function engine(routes: Routes) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
    const parsed = new URL(url);
    const type = parsed.searchParams.get("type") ?? "";
    if (routes.fail?.includes(parsed.pathname) || routes.fail?.includes(type)) {
      return new Response("Internal error", { status: 500 });
    }
    if (parsed.pathname === "/api/legal/fristenbuch") {
      return Response.json(routes.fristenbuch ?? { heute: "", eintraege: [], zusammenfassung: {} });
    }
    if (parsed.pathname === "/api/pages") {
      const offset = Number(parsed.searchParams.get("offset") ?? 0);
      return Response.json(offset === 0 ? (routes.pages?.[type] ?? []) : []);
    }
    return new Response("{}", { status: 404 });
  });
}

function request(path = "/api/legal/deadlines.ics") {
  return new Request(`http://localhost${path}`, { method: "GET" }) as unknown as NextRequest;
}

describe("GET /api/legal/deadlines.ics", () => {
  beforeEach(() => vi.clearAllMocks());

  test("serves the calendar with the correct headers", async () => {
    engine({
      pages: {
        legal_deadline: [
          {
            slug: "legal/deadlines/a",
            frontmatter: { due_date: "2026-10-01", description: "Frist" },
          },
        ],
      },
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("fristenbuch.ics");
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    const body = await res.text();
    expect(body).toContain("VCALENDAR");
    expect(body).toContain("SUMMARY:Frist");
  });

  test("passes the case filter to the engine Fristenbuch", async () => {
    engine({});
    await GET(request("/api/legal/deadlines.ics?case=legal/cases/test"));
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.find((u) => u.includes("/api/legal/fristenbuch"))).toContain(
      "case=legal%2Fcases%2Ftest"
    );
  });

  test("includes deadlines embedded in matters alongside Fristenbuch entries", async () => {
    engine({
      fristenbuch: {
        heute: "2026-09-24",
        eintraege: [
          {
            case_slug: "legal/cases/b",
            datum: "2026-10-20",
            frist: "Revision",
            rechtsgrundlage: "§ 505 ZPO",
            status: "ok",
            vorfrist: "2026-10-13",
          },
        ],
      },
      pages: {
        legal_case: [
          {
            slug: "legal/cases/a",
            title: "Novak",
            frontmatter: { deadlines: [{ title: "Replik", due_date: "2026-10-01" }] },
          },
        ],
      },
    });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("SUMMARY:Replik");
    expect(body).toContain("DTSTART;VALUE=DATE:20261001");
    expect(body).toContain("Revision");
  });

  test("answers 502 instead of a shortened calendar when a deadline source fails", async () => {
    // A calendar missing the Fristenbuch entries would silently delete them
    // from every subscribed client; 502 keeps what the client already has.
    engine({ fail: ["/api/legal/fristenbuch"] });
    const res = await GET(request());
    expect(res.status).toBe(502);
  });

  test("returns 502 when engine is unreachable", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(request());
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain("ICS feed unavailable");
  });

  test("works without case filter (all deadlines)", async () => {
    engine({});
    const res = await GET(request());
    expect(res.status).toBe(200);
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => !u.includes("case="))).toBe(true);
  });
});

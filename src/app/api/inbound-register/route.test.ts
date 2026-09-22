import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockListEnginePages = vi.fn();

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockListEnginePages(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
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
    new Request("http://localhost/api/inbound-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

describe("POST /api/inbound-register", () => {
  beforeEach(() => vi.clearAllMocks());

  test("rejects a missing subject before touching the engine", async () => {
    const res = await post({ channel: "scan" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("persists a normalized inbound entry in the engine", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));

    const res = await post({
      channel: "scan",
      subject: "Brief an Gericht",
      sender_name: "Absender",
      case_slug: "legal/cases/2026-0001",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry.direction).toBe("inbound");
    expect(body.data.entry.received_by).toBe("Anwalt");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine-test:3001/api/pages");
    const payload = JSON.parse(String(init.body));
    expect(payload.slug).toMatch(/^legal\/inbound-register\/in-/);
    expect(payload.type).toBe("inbound_entry");
    expect(payload.frontmatter).toMatchObject({
      channel: "scan",
      subject: "Brief an Gericht",
      case_slug: "legal/cases/2026-0001",
    });
  });

  test("suggests a case when the subject contains its Aktenzeichen", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "legal/cases/2026-0007",
        title: "Muster ./. AG",
        frontmatter: { aktenzeichen: "MUSTER-26-0007", client_name: "Muster GmbH" },
      },
    ]);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));

    const res = await post({
      channel: "erv",
      subject: "Ladung MUSTER-26-0007",
      sender_name: "Bezirksgericht",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry.case_slug).toBe("legal/cases/2026-0007");
    expect(body.data.entry.case_suggested).toBe(true);
  });

  test("leaves case_slug empty when nothing matches", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      { slug: "legal/cases/x", title: "Unrelatiert", frontmatter: {} },
    ]);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));

    const res = await post({ channel: "scan", subject: "Brief" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry.case_slug).toBeUndefined();
    expect(body.data.entry.case_suggested).toBeUndefined();
  });

  test("returns 502 when the engine write fails", async () => {
    mockFetch.mockResolvedValueOnce(new Response("broken", { status: 500 }));
    const res = await post({ channel: "scan", subject: "Brief" });
    expect(res.status).toBe(502);
  });
});

describe("GET /api/inbound-register", () => {
  beforeEach(() => vi.clearAllMocks());

  test("paginates via listEnginePages, filters and sorts entries", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "older",
        frontmatter: {
          id: "in-1",
          received_at: "2026-01-01T10:00:00.000Z",
          channel: "email",
          subject: "Alt",
          case_slug: "legal/cases/one",
          direction: "inbound",
        },
      },
      {
        slug: "newer",
        frontmatter: {
          id: "in-2",
          received_at: "2026-01-03T10:00:00.000Z",
          channel: "scan",
          subject: "Neu",
          case_slug: "legal/cases/one",
          direction: "inbound",
        },
      },
      {
        slug: "other-case",
        frontmatter: {
          id: "in-3",
          received_at: "2026-01-04T10:00:00.000Z",
          channel: "scan",
          subject: "Andere Akte",
          case_slug: "legal/cases/two",
          direction: "inbound",
        },
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost/api/inbound-register?case_slug=legal/cases/one"
      ) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    expect(mockListEnginePages).toHaveBeenCalledWith(
      { "x-subsumio-source": "brain-at" },
      "inbound_entry",
      5000
    );
    const body = await res.json();
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual(["in-2", "in-1"]);
  });

  test("supports CSV export", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "x",
        frontmatter: {
          id: "in-1",
          received_at: "2026-01-01T10:00:00.000Z",
          channel: "email",
          subject: 'Betreff "wichtig"',
          sender_name: "Absender",
          direction: "inbound",
        },
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/inbound-register?format=csv") as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("Eingangsdatum;Kanal;Absender;Adresse;Akte;Betreff");
    expect(csv).toContain('"Betreff ""wichtig"""');
  });

  test("returns 502 when listing fails", async () => {
    mockListEnginePages.mockRejectedValueOnce(new Error("down"));
    const res = await GET(
      new Request("http://localhost/api/inbound-register") as unknown as NextRequest
    );
    expect(res.status).toBe(502);
  });
});

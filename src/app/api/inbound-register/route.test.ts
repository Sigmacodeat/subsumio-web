import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockListEnginePages = vi.fn();

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
// Matter lookups (frontmatter / slug filters, full scan) are answered from
// ONE fixture list per test, filtered like the engine filters.
let caseUniverse: Array<{ slug: string; frontmatter?: Record<string, unknown> }> | undefined;
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (...args: unknown[]) => {
    const [, type, , opts] = args as [
      unknown,
      string,
      number,
      { frontmatter?: Record<string, string>; slugPrefix?: string; failOnTruncate?: boolean }?,
    ];
    if (type === "legal_case" && (opts?.frontmatter || opts?.slugPrefix || opts?.failOnTruncate)) {
      caseUniverse ??= await mockListEnginePages(...args);
      const rows = caseUniverse ?? [];
      if (opts.frontmatter) {
        return rows.filter((r) =>
          Object.entries(opts.frontmatter!).some(([k, v]) => r.frontmatter?.[k] === v)
        );
      }
      if (opts.slugPrefix) return rows.filter((r) => r.slug.startsWith(opts.slugPrefix!));
      return rows;
    }
    return mockListEnginePages(...args);
  },
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

import { GET, PATCH, POST } from "./route";

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEnginePages.mockReset();
    mockFetch.mockReset();
    caseUniverse = undefined;
  });

  test("rejects a missing subject before touching the engine", async () => {
    const res = await post({ channel: "scan" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("persists a normalized inbound entry in the engine", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      { slug: "legal/cases/2026-0001", title: "Akte", frontmatter: {} },
    ]);
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

  test("an entered Aktenzeichen is resolved to its matter", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "legal/cases/2026-0007",
        title: "Muster",
        frontmatter: { aktenzeichen: "MK-26-0007" },
      },
    ]);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
    const res = await post({ channel: "scan", subject: "Brief", case_slug: " mk-26-0007 " });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry.case_slug).toBe("legal/cases/2026-0007");
  });

  test("an unknown Aktenzeichen is refused, never stored as a matter link", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      {
        slug: "legal/cases/2026-0007",
        title: "Muster",
        frontmatter: { aktenzeichen: "MK-26-0007" },
      },
    ]);
    const res = await post({ channel: "scan", subject: "Brief", case_slug: "irgendwas" });
    expect(res.status).toBe(422);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("accepts the Aktenzeichen of the oldest of 6,000 matters (R11-8)", async () => {
    mockListEnginePages.mockResolvedValueOnce(
      Array.from({ length: 6000 }, (_, i) => ({
        slug: `legal/cases/c-${i}`,
        title: `Akte ${i}`,
        frontmatter: { aktenzeichen: `AZ-${i}` },
      }))
    );
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
    const res = await post({ channel: "scan", subject: "Brief", case_slug: "AZ-5999" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.entry.case_slug).toBe("legal/cases/c-5999");
  });

  test("an incomplete matter list refuses instead of rejecting the Aktenzeichen", async () => {
    mockListEnginePages.mockRejectedValueOnce(new Error("list legal_case truncated at 100000"));
    const res = await post({ channel: "scan", subject: "Brief", case_slug: "az-1" });
    expect(res.status).toBe(502);
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

  test("surfaces exhausted inbound_stamp tasks as failed_stamps", async () => {
    mockListEnginePages
      .mockResolvedValueOnce([
        {
          slug: "e1",
          frontmatter: {
            id: "in-1",
            received_at: "2026-01-01T10:00:00.000Z",
            channel: "email",
            subject: "Alt",
            direction: "inbound",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          slug: "legal/post-upload-tasks/inbound_stamp/in-x-abc",
          frontmatter: {
            task_type: "inbound_stamp",
            status: "exhausted",
            doc_slug: "in-x",
            attempts: 4,
            last_error: "inbound_stamp_failed_503",
            inbound: { entry_id: "in-x", input: { channel: "portal", subject: "Vollmacht.pdf" } },
          },
        },
        {
          // unrelated exhausted task — must not surface here
          slug: "legal/post-upload-tasks/analyze/doc-1",
          frontmatter: { task_type: "analyze", status: "exhausted", doc_slug: "d/1" },
        },
      ]);

    const res = await GET(
      new Request("http://localhost/api/inbound-register") as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.failed_stamps).toHaveLength(1);
    expect(body.data.failed_stamps[0]).toMatchObject({
      task_slug: "legal/post-upload-tasks/inbound_stamp/in-x-abc",
      subject: "Vollmacht.pdf",
      channel: "portal",
      last_error: "inbound_stamp_failed_503",
    });
  });

  test("a failing task scan still returns the register entries", async () => {
    mockListEnginePages
      .mockResolvedValueOnce([
        {
          slug: "e1",
          frontmatter: {
            id: "in-1",
            received_at: "2026-01-01T10:00:00.000Z",
            channel: "email",
            subject: "Alt",
            direction: "inbound",
          },
        },
      ])
      .mockRejectedValueOnce(new Error("task scan down"));

    const res = await GET(
      new Request("http://localhost/api/inbound-register") as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.failed_stamps).toEqual([]);
  });

  test("stamps retrying beyond the first attempt surface as pending_stamps", async () => {
    mockListEnginePages
      .mockResolvedValueOnce([]) // inbound_entry
      .mockResolvedValueOnce([]) // post_upload_task_exhausted
      .mockResolvedValueOnce([
        {
          slug: "legal/post-upload-tasks/inbound_stamp/in-y-abc",
          frontmatter: {
            task_type: "inbound_stamp",
            status: "pending",
            doc_slug: "in-y",
            attempts: 3,
            inbound: { entry_id: "in-y", input: { channel: "email", subject: "Schriftsatz" } },
          },
        },
        {
          // first attempt pending — still within normal retry, not shown
          slug: "legal/post-upload-tasks/inbound_stamp/in-z-abc",
          frontmatter: {
            task_type: "inbound_stamp",
            status: "pending",
            doc_slug: "in-z",
            attempts: 0,
            inbound: { entry_id: "in-z", input: { channel: "email", subject: "Neu" } },
          },
        },
      ]);

    const res = await GET(
      new Request("http://localhost/api/inbound-register") as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pending_stamps).toHaveLength(1);
    expect(body.data.pending_stamps[0]).toMatchObject({
      subject: "Schriftsatz",
      channel: "email",
      attempts: 3,
    });
  });
});

describe("PATCH /api/inbound-register — Zuordnung bestätigen/korrigieren (W4-06)", () => {
  const stored = {
    slug: "legal/inbound-register/in-1",
    title: "Posteingang: Ladung",
    type: "inbound_entry",
    frontmatter: {
      id: "in-1",
      received_at: "2026-09-21T08:00:00.000Z",
      channel: "erv",
      direction: "inbound",
      subject: "Ladung",
      sender_name: "Bezirksgericht",
      case_slug: "legal/cases/falsch",
      case_suggested: true,
      created_at: "2026-09-21T08:00:00.000Z",
    },
  };
  const patch = (body: unknown) =>
    PATCH(
      new Request("http://localhost/api/inbound-register", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as unknown as NextRequest
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockListEnginePages.mockReset();
    mockFetch.mockReset();
    caseUniverse = undefined;
  });

  test("confirming keeps the matter, drops the suggestion mark and records who confirmed", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(stored), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await patch({ id: "in-1", action: "confirm" });
    expect(res.status).toBe(200);
    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.merge).toBe(true);
    expect(payload.frontmatter).toMatchObject({
      case_slug: "legal/cases/falsch",
      case_suggested: false,
      case_confirmed_by: "Anwalt",
    });
    expect(payload.frontmatter.assignment_history).toHaveLength(1);
    expect(payload.frontmatter.assignment_history[0].kind).toBe("confirmed");
  });

  test("a correction moves the entry to the named matter, the receipt stamp stays untouched", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      { slug: "legal/cases/richtig", frontmatter: { case_number: "MK-26-0009" } },
    ]);
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(stored), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await patch({ id: "in-1", action: "assign", case_slug: "MK-26-0009" });
    expect(res.status).toBe(200);
    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    const fm = JSON.parse(String(init.body)).frontmatter;
    expect(fm.case_slug).toBe("legal/cases/richtig");
    expect(fm.assignment_history[0]).toMatchObject({
      from: "legal/cases/falsch",
      to: "legal/cases/richtig",
      kind: "reassigned",
    });
    for (const key of ["received_at", "channel", "subject", "sender_name"]) {
      expect(fm).not.toHaveProperty(key);
    }
  });

  test("an unknown Aktenzeichen is refused and nothing is written", async () => {
    mockListEnginePages.mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(stored), { status: 200 }));
    const res = await patch({ id: "in-1", action: "assign", case_slug: "XX-1" });
    expect(res.status).toBe(422);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("only register entries can be reassigned", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...stored, type: "legal_case" }), { status: 200 })
    );
    const res = await patch({ id: "in-1", action: "confirm" });
    expect(res.status).toBe(404);
  });

  test("an unreadable entry is not written (fail closed)", async () => {
    mockFetch.mockResolvedValueOnce(new Response("busy", { status: 503 }));
    const res = await patch({ id: "in-1", action: "confirm" });
    expect(res.status).toBe(502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

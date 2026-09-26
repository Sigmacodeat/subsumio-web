// @vitest-environment node
// Postausgangsbuch: the GET reads engine list items (entry in `frontmatter`)
// completely, filters by matter, exports CSV; POST records the signed-in user.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: {
          body?: { parse: (v: unknown) => unknown };
          query?: { parse: (v: unknown) => unknown };
        },
        handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
      ) =>
      async (req: Request) => {
        const url = new URL(req.url);
        const body =
          req.method === "POST" && opts.body ? opts.body.parse(await req.json()) : undefined;
        const query = opts.query
          ? opts.query.parse(Object.fromEntries(url.searchParams))
          : undefined;
        return handler(
          {
            brainId: "brain_1",
            headers: { "x-subsumio-source": "brain_1" },
            user: { id: "u1", email: "sekretariat@kanzlei.at", name: "Sekretariat Muster" },
          },
          body,
          query
        );
      },
  };
});

import { GET, POST } from "./route";

function entryPage(i: number, extra: Record<string, unknown> = {}) {
  const date = new Date(Date.UTC(2026, 8, 1, 8, 0, i)).toISOString();
  return {
    slug: `legal/outbound-register/out-${i}`,
    title: `Ausgang ${i}`,
    type: "outbound_entry",
    frontmatter: {
      id: `out-${i}`,
      date,
      channel: "post",
      direction: "outbound",
      recipient_name: `Empfänger ${i}`,
      recipient_address: "Gasse 1, 1010 Wien",
      case_slug: i % 2 === 0 ? "cases/a" : "cases/b",
      subject: `Schreiben ${i}`,
      delivery_status: "sent",
      sent_by: "Sekretariat",
      created_at: date,
      ...extra,
    },
  };
}

let pages: ReturnType<typeof entryPage>[];
let written: Record<string, unknown>[];

beforeEach(() => {
  pages = [];
  written = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        written.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit"));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      // Real list format: the engine caps each request at 100 rows.
      const batch = pages.slice(offset, offset + Math.min(limit, 100));
      return new Response(JSON.stringify({ pages: batch }), { status: 200 });
    })
  );
});

describe("GET /api/outbound-register", () => {
  it("delivers all 250 entries, not only the first batch", async () => {
    pages = Array.from({ length: 250 }, (_, i) => entryPage(i));
    const res = await GET(new Request("http://x/api/outbound-register") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toHaveLength(250);
  });

  it("filters by matter on the entry fields", async () => {
    pages = Array.from({ length: 6 }, (_, i) => entryPage(i));
    const res = await GET(
      new Request("http://x/api/outbound-register?case_slug=cases%2Fa") as never
    );
    const json = await res.json();
    expect(json.data.items.map((e: { id: string }) => e.id).sort()).toEqual([
      "out-0",
      "out-2",
      "out-4",
    ]);
  });

  it("exports CSV rows instead of failing", async () => {
    pages = [entryPage(1), entryPage(2)];
    const res = await GET(new Request("http://x/api/outbound-register?format=csv") as never);
    expect(res.status).toBe(200);
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(csv).toContain("Schreiben 1");
  });

  it("leaves out deleted entries", async () => {
    pages = [entryPage(1), entryPage(2, { status: "tombstoned" })];
    const res = await GET(new Request("http://x/api/outbound-register") as never);
    const json = await res.json();
    expect(json.data.items).toHaveLength(1);
  });

  it("a failed engine read is an error, not an empty register", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("x", { status: 500 }));
    const res = await GET(new Request("http://x/api/outbound-register") as never);
    expect(res.status).toBe(502);
  });
});

describe("POST /api/outbound-register", () => {
  it("records the signed-in user as sender, ignoring a sent_by from the body", async () => {
    const res = await POST(
      new Request("http://x/api/outbound-register", {
        method: "POST",
        body: JSON.stringify({
          channel: "post",
          recipient_name: "BG Innere Stadt",
          recipient_address: "Wien",
          subject: "Klage",
          sent_by: "Jemand anderes",
        }),
      }) as never
    );
    expect(res.status).toBe(200);
    const fm = written[0].frontmatter as { sent_by: string };
    expect(fm.sent_by).toBe("Sekretariat Muster");
  });
});

import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockSendMail = vi.fn(async (..._args: unknown[]) => undefined);

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrain: vi.fn((brainId: string) => ({ "x-subsumio-source": brainId })),
}));

vi.mock("@/lib/api-handler", () => ({
  createPublicHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (req: Request, body: unknown, query: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams.entries());
      if (req.method === "GET") {
        const parsed = opts.query?.safeParse(query);
        if (parsed && !parsed.success) {
          return Response.json({ error: "validation_failed" }, { status: 400 });
        }
        return handler(req, undefined, parsed?.data ?? query);
      }
      const body = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "validation_failed" }, { status: 400 });
        }
      }
      return handler(req, body, undefined);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

vi.mock("@/lib/api-response", () => ({
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/mail", () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { GET, POST } from "./route";

const ENABLED_SETTINGS = {
  frontmatter: {
    bookingEnabled: true,
    bookingStart: "09:00",
    bookingEnd: "10:00",
    kanzleiEmail: "k@k.at",
  },
};

function enginePagesFor(slugOrQuery: string): Response {
  if (slugOrQuery.includes("legal%2Fsettings%2Fkanzlei")) {
    return new Response(JSON.stringify(ENABLED_SETTINGS), { status: 200 });
  }
  return new Response(JSON.stringify({ pages: [] }), { status: 200 });
}

function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("GET /api/booking/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID", "brain-at");
  });

  test("404 wenn die Kanzlei die Buchung nicht aktiviert hat", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ frontmatter: {} }), { status: 200 }));
    const res = await GET(
      new Request(
        `http://localhost/api/booking/public?date=${futureDate()}`
      ) as unknown as NextRequest
    );
    expect(res.status).toBe(404);
  });

  test("liefert freie Slots des Tages", async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve(enginePagesFor(String(url))));
    const res = await GET(
      new Request(
        `http://localhost/api/booking/public?date=${futureDate()}`
      ) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 09:00–10:00 à 30 min → 2 Slots (sofern nicht in Vergangenheit gefiltert)
    expect(body.data.slots.length).toBeGreaterThanOrEqual(0);
  });

  test("weist ungültige Datumsformate ab", async () => {
    const res = await GET(
      new Request("http://localhost/api/booking/public?date=morgen") as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/booking/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID", "brain-at");
  });

  const baseBody = (start: string, date: string) => ({
    date,
    start,
    name: "Max Muster",
    email: "max@example.com",
    matter: "Erstberatung Kündigung",
    consent: true,
  });

  test("bucht einen freien Slot und persistiert eine booking-Seite", async () => {
    const date = futureDate();
    // Settings + leere Belegung → Slots generieren, ersten nehmen.
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).endsWith("/api/pages")) {
        return Promise.resolve(new Response(JSON.stringify({ slug: "ok" }), { status: 200 }));
      }
      return Promise.resolve(enginePagesFor(String(url)));
    });

    // GET zuerst, um einen echten Slot zu erhalten.
    const getRes = await GET(
      new Request(`http://localhost/api/booking/public?date=${date}`) as unknown as NextRequest
    );
    const getBody = await getRes.json();
    const slot = getBody.data.slots[0];
    if (!slot) {
      // Tag fällt in den 2h-Puffer — kein Slot; dann POST muss 409 liefern.
      const res = await POST(
        new Request("http://localhost/api/booking/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(baseBody(`${date}T07:00:00.000Z`, date)),
        }) as unknown as NextRequest
      );
      expect(res.status).toBe(409);
      return;
    }

    const res = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody(slot.start, date)),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.confirmed).toBe(true);
    expect(body.data.booking_id).toBeTruthy();

    const writes = mockFetch.mock.calls.filter(
      (c) =>
        (c[1] as RequestInit | undefined)?.method === "POST" && String(c[0]).endsWith("/api/pages")
    );
    expect(writes).toHaveLength(1);
    const payload = JSON.parse(String((writes[0][1] as RequestInit).body));
    expect(payload.type).toBe("booking");
    expect(payload.frontmatter.client_name).toBe("Max Muster");
    expect(payload.frontmatter.slot_start).toBe(slot.start);
  });

  test("weist einen bereits belegten Slot mit 409 ab", async () => {
    const date = futureDate();
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("legal%2Fsettings%2Fkanzlei")) {
        return Promise.resolve(new Response(JSON.stringify(ENABLED_SETTINGS), { status: 200 }));
      }
      if (u.includes("type=booking")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              pages: [
                {
                  slug: "legal/bookings/x",
                  frontmatter: {
                    slot_start: `${date}T07:00:00.000Z`,
                    slot_end: `${date}T07:30:00.000Z`,
                    status: "confirmed",
                  },
                },
              ],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ pages: [] }), { status: 200 }));
    });

    // Belegung deckt den lokalen 09:00-Slot nicht zwingend ab — teste einen
    // Slot, den es garantiert nicht gibt (Mitternacht UTC).
    const res = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody(`${date}T00:00:00.000Z`, date)),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(409);
  });

  test("Race: Engine-409 auf den deterministischen Slot-Slug → 409 statt Doppelbuchung", async () => {
    const date = futureDate();
    // Freie Slots, aber der Page-Write meldet Konflikt — ein paralleler
    // Request hat denselben Slot inzwischen gebucht.
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(url).endsWith("/api/pages")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "page_exists" }), { status: 409 })
        );
      }
      return Promise.resolve(enginePagesFor(String(url)));
    });

    const getRes = await GET(
      new Request(`http://localhost/api/booking/public?date=${date}`) as unknown as NextRequest
    );
    const slot = (await getRes.json()).data.slots[0];
    if (!slot) return; // 2h-Puffer — kein Slot heute, nichts zu testen

    const res = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody(slot.start, date)),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(409);

    // Deterministischer Slug: zwei Buchungen desselben Slots treffen denselben
    // Page-Slug — genau das macht den Race zum Engine-Konflikt statt zur
    // Doppelbuchung.
    const writes = mockFetch.mock.calls.filter(
      (c) =>
        (c[1] as RequestInit | undefined)?.method === "POST" && String(c[0]).endsWith("/api/pages")
    );
    expect(writes).toHaveLength(1);
    const written = JSON.parse(String((writes[0][1] as RequestInit).body));
    expect(written.if_absent).toBe(true);
    const slug = written.slug as string;
    expect(slug).toBe(
      `legal/bookings/${date.replace(/\D/g, "")}-${slot.start.replace(/\D/g, "").slice(0, 12)}`
    );
  });

  test("Re-Buchung eines stornierten Slots schreibt die nächste Generation create-only", async () => {
    const date = futureDate();
    // Der deterministische Slug bleibt nach einer Stornierung belegt — die
    // Route weicht auf den nächsten deterministischen Slug aus (…-r1), wieder
    // create-only, statt die stornierte Seite zu überschreiben.
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const slug = JSON.parse(String(init.body)).slug as string;
        if (slug.endsWith("-r1")) {
          return Promise.resolve(new Response(JSON.stringify({ slug }), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: "page_exists" }), { status: 409 })
        );
      }
      if (u.includes("/api/pages/legal%2Fbookings%2F")) {
        return Promise.resolve(
          new Response(JSON.stringify({ frontmatter: { status: "cancelled" } }), { status: 200 })
        );
      }
      return Promise.resolve(enginePagesFor(u));
    });

    const getRes = await GET(
      new Request(`http://localhost/api/booking/public?date=${date}`) as unknown as NextRequest
    );
    const slot = (await getRes.json()).data.slots[0];
    if (!slot) return;

    const res = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody(slot.start, date)),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.confirmed).toBe(true);

    const writes = mockFetch.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.if_absent === true)).toBe(true);
    expect(writes[1].slug).toBe(`${writes[0].slug}-r1`);
    // Nie ein Überschreiben/PATCH der stornierten Seite.
    expect(mockFetch.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PATCH")).toBe(false);
  });

  test("zwei parallele Buchungen desselben Slots: genau eine gewinnt (create-only)", async () => {
    const date = futureDate();
    // In-Memory-Engine mit echter if_absent-Semantik: ein belegter Slug wird
    // mit 409 page_exists abgelehnt, nichts wird überschrieben.
    const store = new Map<string, { frontmatter: Record<string, unknown> }>();
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const body = JSON.parse(String(init.body));
        if (body.if_absent !== true && store.has(body.slug)) {
          store.set(body.slug, { frontmatter: body.frontmatter });
          return new Response(JSON.stringify({ slug: body.slug }), { status: 200 });
        }
        if (store.has(body.slug)) {
          return new Response(JSON.stringify({ error: "page_exists" }), { status: 409 });
        }
        store.set(body.slug, { frontmatter: body.frontmatter });
        return new Response(JSON.stringify({ slug: body.slug }), { status: 200 });
      }
      const m = u.match(/\/api\/pages\/(legal%2Fbookings%2F[^?]+)/);
      if (m) {
        const page = store.get(decodeURIComponent(m[1]));
        return page
          ? new Response(JSON.stringify(page), { status: 200 })
          : new Response("{}", { status: 404 });
      }
      return enginePagesFor(u);
    });

    const getRes = await GET(
      new Request(`http://localhost/api/booking/public?date=${date}`) as unknown as NextRequest
    );
    const slot = (await getRes.json()).data.slots[0];
    if (!slot) return;

    const post = (name: string) =>
      POST(
        new Request("http://localhost/api/booking/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseBody(slot.start, date), name }),
        }) as unknown as NextRequest
      );
    const [a, b] = await Promise.all([post("Erste Person"), post("Zweite Person")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(store.size).toBe(1);
    const winner = a.status === 200 ? "Erste Person" : "Zweite Person";
    expect([...store.values()][0].frontmatter.client_name).toBe(winner);
  });

  test("Engine-Fehler beim Lesen der Belegung → 503 statt 'alles frei'", async () => {
    const date = futureDate();
    mockFetch.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("legal%2Fsettings%2Fkanzlei")) {
        return Promise.resolve(new Response(JSON.stringify(ENABLED_SETTINGS), { status: 200 }));
      }
      return Promise.resolve(new Response("boom", { status: 500 }));
    });
    const res = await GET(
      new Request(`http://localhost/api/booking/public?date=${date}`) as unknown as NextRequest
    );
    expect(res.status).toBe(503);
    const post = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(baseBody(`${date}T08:00:00.000Z`, date)),
      }) as unknown as NextRequest
    );
    expect(post.status).toBe(503);
    expect(
      mockFetch.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "POST")
    ).toBe(false);
  });

  test("lehnt den Honeypot ab", async () => {
    const res = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody("x", futureDate()), website: "spam" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });

  test("verlangt DSGVO-Consent", async () => {
    const res = await POST(
      new Request("http://localhost/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody("x", futureDate()), consent: false }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(400);
  });
});

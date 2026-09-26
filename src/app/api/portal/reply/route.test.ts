import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/portal-push", () => ({ notifyPortalClients: vi.fn(async () => 0) }));
vi.mock("@/lib/portal-notify", () => ({ mailPortalClients: vi.fn(async () => 0) }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt A", email: "a@k.at" },
    };
    return async (req: Request) => {
      const body = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "validation_failed" }, { status: 400 });
        }
      }
      return handler(ctx, body);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST } from "./route";

const CS = "legal/cases/2026-0001";
const CASE_PAGE = {
  slug: CS,
  frontmatter: { status: "active", portal_enabled: true, time_entries: [] },
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/portal/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

function stubCaseAndWrites(extraFm: Record<string, unknown> = {}) {
  mockFetch.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "POST" && u.endsWith("/api/pages")) {
      return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
    }
    // GET page (case load + verify)
    const stored = (mockFetch as unknown as { __timeEntries?: unknown }).__timeEntries;
    if (stored !== undefined) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            slug: CS,
            frontmatter: { ...CASE_PAGE.frontmatter, ...extraFm, time_entries: stored },
          }),
          { status: 200 }
        )
      );
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ slug: CS, frontmatter: { ...CASE_PAGE.frontmatter, ...extraFm } }),
        { status: 200 }
      )
    );
  });
}

type Written = {
  slug: string;
  type?: string;
  content?: string;
  merge?: boolean;
  frontmatter: Record<string, unknown> & {
    ai_draft?: { text?: string; status?: string };
    ai_assisted?: boolean;
  };
};

describe("POST /api/portal/reply — WP-3.16 Leistungsbuchung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (mockFetch as unknown as { __timeEntries?: unknown }).__timeEntries;
  });

  test("sendet ohne bill_minutes wie bisher (kein Zeiteintrag)", async () => {
    stubCaseAndWrites();
    const res = await post({ case_slug: CS, message: "Antwort" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(false);
    // Nur ein Page-Write: die Portal-Nachricht selbst.
    const writes = mockFetch.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "POST"
    );
    expect(writes).toHaveLength(1);
  });

  test("verbucht bill_minutes als time_entry auf der Akte", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages/array-append")) {
        const payload = JSON.parse(String(init.body));
        return Promise.resolve(
          new Response(JSON.stringify({ items: payload.items }), { status: 200 })
        );
      }
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ slug: CS, frontmatter: CASE_PAGE.frontmatter }), {
          status: 200,
        })
      );
    });

    const res = await post({ case_slug: CS, message: "Antwort mit Infos", bill_minutes: 12 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(true);

    const append = mockFetch.mock.calls
      .map((c) => ({ url: String(c[0]), init: c[1] as RequestInit | undefined }))
      .filter((c) => c.init?.method === "POST")
      .map((c) => ({ url: c.url, payload: JSON.parse(String(c.init!.body)) }))
      .find((c) => c.url.endsWith("/api/pages/array-append") && c.payload.field === "time_entries");
    expect(append).toBeTruthy();
    expect(append!.payload.slug).toBe(CS);
    const entry = append!.payload.items[0];
    expect(entry.minutes).toBe(12);
    expect(entry.billable).toBe(true);
    expect(entry.description).toContain("Portal-Nachricht");
    expect(entry.lawyer).toBe("Anwalt A");
  });

  test("bucht eine Antwort kurz nach Mitternacht auf den Wiener Kalendertag", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T22:30:00Z")); // 00:30 am 26.09. in Wien
    try {
      mockFetch.mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === "POST" && u.endsWith("/api/pages/array-append")) {
          const payload = JSON.parse(String(init.body));
          return Promise.resolve(
            new Response(JSON.stringify({ items: payload.items }), { status: 200 })
          );
        }
        if (init?.method === "POST" && u.endsWith("/api/pages")) {
          return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ slug: CS, frontmatter: CASE_PAGE.frontmatter }), {
            status: 200,
          })
        );
      });
      await post({ case_slug: CS, message: "Antwort", bill_minutes: 6 });
      const append = mockFetch.mock.calls
        .map((c) => ({ url: String(c[0]), init: c[1] as RequestInit | undefined }))
        .filter((c) => c.init?.method === "POST" && c.url.endsWith("/api/pages/array-append"))
        .map((c) => JSON.parse(String(c.init!.body)))
        .find((p) => p.field === "time_entries");
      expect(append.items[0].date).toBe("2026-09-26");
    } finally {
      vi.useRealTimers();
    }
  });

  test("meldet billed=false, wenn der Zeiteintrag nicht persistiert werden kann", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages/array-append")) {
        // Engine lehnt den atomaren Append ab → billed=false.
        return Promise.resolve(new Response("engine unavailable", { status: 500 }));
      }
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ slug: CS, frontmatter: CASE_PAGE.frontmatter }), {
          status: 200,
        })
      );
    });

    const res = await post({ case_slug: CS, message: "Antwort", bill_minutes: 6 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(false);
  }, 15_000);

  test("weist unplausible Minuten ab", async () => {
    stubCaseAndWrites();
    const res = await post({ case_slug: CS, message: "Antwort", bill_minutes: 9999 });
    expect(res.status).toBe(400);
  });
});

// KI im Mandantenportal, Modus "entwurf" (KI4-03): the lawyer releases the AI
// draft of a client question as the portal reply.
describe("POST /api/portal/reply — Freigabe eines KI-Entwurfs", () => {
  const MSG = `portal-message/${CS}/1700000000000`;

  function stubWithMessage(messageFm: Record<string, unknown>) {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
      }
      if (u.endsWith(`/api/pages/${encodeURIComponent(MSG)}`)) {
        return Promise.resolve(
          new Response(JSON.stringify({ slug: MSG, frontmatter: messageFm }), { status: 200 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ slug: CS, frontmatter: CASE_PAGE.frontmatter }), {
          status: 200,
        })
      );
    });
  }

  const writes = () =>
    mockFetch.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Written);

  const pendingFm = {
    type: "portal_message",
    case_slug: CS,
    sender: "client",
    message: "Wie ist der Stand?",
    ai_draft: { text: "Laut Klage …", grounded: true, status: "pending", created_at: "x" },
  };

  beforeEach(() => vi.clearAllMocks());

  test("veröffentlicht den (bearbeiteten) Entwurf gekennzeichnet und schließt ihn ab", async () => {
    stubWithMessage(pendingFm);
    const res = await post({
      case_slug: CS,
      message: "Laut Klage … (von uns ergänzt)",
      in_reply_to: MSG,
      ai_draft_used: true,
    });
    expect(res.status).toBe(200);

    const reply = writes().find((w) => w.type === "portal_message");
    expect(reply!.slug.startsWith(`portal-message/${CS}/`)).toBe(true);
    expect(reply!.content).toBe("Laut Klage … (von uns ergänzt)");
    expect(reply!.frontmatter).toMatchObject({
      sender: "lawyer",
      ai_assisted: true,
      reviewed_by: "Anwalt A",
      in_reply_to: MSG,
    });

    const settled = writes().find((w) => w.slug === MSG);
    expect(settled!.merge).toBe(true);
    expect(settled!.frontmatter.ai_draft).toMatchObject({
      status: "approved",
      reviewed_by: "Anwalt A",
      text: "Laut Klage …",
    });
  });

  test("eine eigene Antwort ohne Entwurf ist nicht gekennzeichnet, der Entwurf gilt als verworfen", async () => {
    stubWithMessage(pendingFm);
    await post({ case_slug: CS, message: "Eigene Antwort", in_reply_to: MSG });
    const reply = writes().find((w) => w.type === "portal_message");
    expect(reply!.frontmatter.ai_assisted).toBeUndefined();
    expect(writes().find((w) => w.slug === MSG)!.frontmatter.ai_draft?.status).toBe("discarded");
  });

  test("ohne offenen Entwurf gibt es keine KI-Kennzeichnung", async () => {
    stubWithMessage({ ...pendingFm, ai_draft: { ...pendingFm.ai_draft, status: "approved" } });
    await post({ case_slug: CS, message: "Nochmal", in_reply_to: MSG, ai_draft_used: true });
    const reply = writes().find((w) => w.type === "portal_message");
    expect(reply!.frontmatter.ai_assisted).toBeUndefined();
    expect(writes().some((w) => w.slug === MSG)).toBe(false);
  });

  test("ein Entwurf einer anderen Akte wird nicht gelesen und nicht angefasst", async () => {
    stubWithMessage(pendingFm);
    const foreign = "portal-message/legal/cases/andere/1";
    await post({ case_slug: CS, message: "Antwort", in_reply_to: foreign, ai_draft_used: true });
    expect(
      mockFetch.mock.calls.some((c) => String(c[0]).includes(encodeURIComponent(foreign)))
    ).toBe(false);
    const reply = writes().find((w) => w.type === "portal_message");
    expect(reply!.frontmatter.ai_assisted).toBeUndefined();
  });
});

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
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const payload = JSON.parse(String(init.body));
        // time_entries-Update: bei Verify dasselbe Array zurückgeben.
        if (payload.frontmatter?.time_entries) {
          (mockFetch as unknown as { __timeEntries?: unknown }).__timeEntries =
            payload.frontmatter.time_entries;
        }
        return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
      }
      const stored = (mockFetch as unknown as { __timeEntries?: unknown }).__timeEntries;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            slug: CS,
            frontmatter: {
              ...CASE_PAGE.frontmatter,
              time_entries: stored ?? [],
            },
          }),
          { status: 200 }
        )
      );
    });

    const res = await post({ case_slug: CS, message: "Antwort mit Infos", bill_minutes: 12 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(true);

    const timeWrite = mockFetch.mock.calls
      .filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)))
      .find((p) => Array.isArray(p.frontmatter?.time_entries));
    expect(timeWrite).toBeTruthy();
    const entry = timeWrite.frontmatter.time_entries[0];
    expect(entry.minutes).toBe(12);
    expect(entry.billable).toBe(true);
    expect(entry.description).toContain("Portal-Nachricht");
    expect(entry.lawyer).toBe("Anwalt A");
  });

  test("meldet billed=false, wenn der Zeiteintrag nicht persistiert werden kann", async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const payload = JSON.parse(String(init.body));
        if (payload.frontmatter?.time_entries) {
          // Verify sieht den Eintrag nie → Konflikt-Pfad bis zum Abbruch.
          return Promise.resolve(new Response(JSON.stringify({ slug: "x" }), { status: 200 }));
        }
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

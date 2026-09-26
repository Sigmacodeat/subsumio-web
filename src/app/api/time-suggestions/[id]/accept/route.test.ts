import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const pages = new Map<string, { frontmatter: Record<string, unknown> }>();
const appends: Array<{ slug: string; items: unknown[] }> = [];
let failAppend = false;

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/engine-page-io", () => ({
  getEnginePage: async (_h: unknown, slug: string) => pages.get(slug) ?? null,
  writeEnginePage: async (
    _h: unknown,
    page: { slug: string; frontmatter: Record<string, unknown> }
  ) => {
    const existing = pages.get(page.slug);
    pages.set(page.slug, {
      frontmatter: { ...(existing?.frontmatter ?? {}), ...page.frontmatter },
    });
  },
}));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: async (slug: string) => {
      const p = pages.get(slug);
      if (!p) throw new Error("HTTP 404");
      return { slug, ...p };
    },
    appendPageArray: async (slug: string, field: string, items: unknown[]) => {
      if (failAppend) throw new Error("engine down");
      appends.push({ slug, items });
      const p = pages.get(slug)!;
      p.frontmatter[field] = [...((p.frontmatter[field] as unknown[]) ?? []), ...items];
      return { slug, field, appended: items.length };
    },
  }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const ctx = {
      headers: {},
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
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

import { POST } from "./route";

function accept(id: string, body: Record<string, unknown> = {}) {
  return POST(
    new Request(`http://localhost/api/time-suggestions/${id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        case_slug: "legal/cases/a",
        minutes: 30,
        description: "Schriftsatz",
        billable: true,
        ...body,
      }),
    }) as unknown as NextRequest
  );
}

beforeEach(() => {
  pages.clear();
  appends.length = 0;
  failAppend = false;
  pages.set("legal/cases/a", { frontmatter: { time_entries: [] } });
});

function seedSuggestion(id: string, over: Record<string, unknown> = {}) {
  pages.set(`legal/time-suggestions/${id}`, {
    frontmatter: {
      id,
      user_email: "anwalt@example.com",
      case_slug: "legal/cases/a",
      date: "2026-09-25",
      duration_minutes: 30,
      description: "Schriftsatz",
      status: "suggested",
      ...over,
    },
  });
}

describe("POST /api/time-suggestions/{id}/accept", () => {
  test("zweimal accept → ein Zeiteintrag, zweiter Aufruf 409", async () => {
    seedSuggestion("s1");
    const first = await accept("s1");
    expect(first.status).toBe(201);
    const second = await accept("s1");
    expect(second.status).toBe(409);
    expect(appends).toHaveLength(1);
    expect(pages.get("legal/time-suggestions/s1")!.frontmatter.status).toBe("accepted");
  });

  test("gleichzeitige Aufrufe buchen nur einmal", async () => {
    seedSuggestion("s2");
    const results = await Promise.all([accept("s2"), accept("s2"), accept("s2")]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(appends).toHaveLength(1);
  });

  test("bereits gebuchter Eintrag (Markierung fehlgeschlagen) → 409 und Markierung nachgezogen", async () => {
    seedSuggestion("s3");
    pages.set("legal/cases/a", { frontmatter: { time_entries: [{ id: "time-sugg-s3" }] } });
    const res = await accept("s3");
    expect(res.status).toBe(409);
    expect(appends).toHaveLength(0);
    expect(pages.get("legal/time-suggestions/s3")!.frontmatter.status).toBe("accepted");
  });

  test("fehlgeschlagene Buchung gibt den Vorschlag wieder frei", async () => {
    seedSuggestion("s4");
    failAppend = true;
    expect((await accept("s4")).status).toBe(502);
    failAppend = false;
    expect((await accept("s4")).status).toBe(201);
    expect(appends).toHaveLength(1);
  });

  test("fremder Vorschlag → 404", async () => {
    seedSuggestion("s5", { user_email: "kollege@example.com" });
    expect((await accept("s5")).status).toBe(404);
    expect(appends).toHaveLength(0);
  });

  test("geänderte Übernahme wird als modified mit Original vermerkt", async () => {
    seedSuggestion("s6");
    const res = await accept("s6", { minutes: 45 });
    expect(res.status).toBe(201);
    const fm = pages.get("legal/time-suggestions/s6")!.frontmatter;
    expect(fm.status).toBe("modified");
    expect((fm.original as { duration_minutes: number }).duration_minutes).toBe(30);
  });
});

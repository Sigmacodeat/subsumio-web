import type { NextRequest } from "next/server";
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeEngine, type FakeEngine } from "@/test/fake-engine-pages";

const mockComplete = vi.fn();

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

vi.mock("@/lib/engine-llm", () => ({
  engineComplete: (...args: unknown[]) => mockComplete(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, parsed?.data ?? raw, undefined);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

let engine: FakeEngine;
/** Page types whose listing answers 500 (engine outage for that list). */
let failingTypes: string[] = [];

/** Seed pages: `{ type: [{ slug?, title?, frontmatter }] }`, newest-edited LAST
 *  in the array is listed LAST (the fake lists in insertion order). */
function seed(pages: Record<string, Array<Record<string, unknown>>>) {
  let n = 0;
  for (const [type, list] of Object.entries(pages)) {
    for (const p of list) {
      n++;
      engine.put({
        slug: String(p.slug ?? `${type}/${n}`),
        title: String(p.title ?? `${type} ${n}`),
        type,
        frontmatter: (p.frontmatter as Record<string, unknown>) ?? {},
      });
    }
  }
}

beforeEach(() => {
  engine = createFakeEngine("http://engine.test", () => "2026-01-01T00:00:00Z");
  failingTypes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.pathname === "/api/legal/fristenbuch") {
        return Response.json({ heute: "", eintraege: [], zusammenfassung: {} });
      }
      if (u.pathname === "/api/pages" && failingTypes.includes(u.searchParams.get("type") ?? "")) {
        return new Response("boom", { status: 500 });
      }
      // The real engine clamps every listing to 100 rows.
      if (u.pathname === "/api/pages" && Number(u.searchParams.get("limit")) > 100) {
        u.searchParams.set("limit", "100");
      }
      return engine.fetch(u.toString(), init);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { POST } from "./route";

function absence(fm: Record<string, unknown>) {
  return { slug: `absences/${fm.id ?? "x"}`, type: "absence_record", frontmatter: fm };
}

const ACTIVE = {
  id: "absence-1",
  user_email: "mueller@kanzlei.at",
  user_name: "RA Müller",
  delegate_email: "berger@kanzlei.at",
  delegate_name: "Dr. Berger",
  start_date: "2020-01-01",
  end_date: "2099-12-31",
  status: "active",
  auto_route_enabled: true,
};

function post(language = "de") {
  return POST(
    new Request("http://localhost/api/dashboard/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    }) as unknown as NextRequest
  );
}

interface BriefingBody {
  data: {
    narrative: string;
    usedFallback: boolean;
    data: {
      activeDelegations: Array<{ name: string; delegate: string; until: string }>;
      topDeadlines: Array<{ title: string; daysLeft: number; delegate?: string }>;
    };
  };
}

describe("POST /api/dashboard/briefing — Delegationen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue(null);
  });

  test("keine Abwesenheiten → leere Delegationen, kein Vertretungs-Satz", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toEqual([]);
    expect(body.data.narrative).not.toContain("vertritt");
  });

  test("eine aktive Abwesenheit → Vertretung im Fallback-Text", async () => {
    seed({ absence_record: [absence(ACTIVE)] });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toEqual([
      { name: "RA Müller", delegate: "Dr. Berger", until: "2099-12-31" },
    ]);
    expect(body.data.narrative).toContain("Dr. Berger vertritt RA Müller bis 2099-12-31");
  });

  test("mehrere aktive Abwesenheiten → alle gelistet", async () => {
    seed({
      absence_record: [
        absence(ACTIVE),
        absence({
          ...ACTIVE,
          id: "absence-2",
          user_email: "huber@kanzlei.at",
          user_name: "RA Huber",
          delegate_name: "RA Novak",
        }),
      ],
    });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toHaveLength(2);
    expect(body.data.narrative).toContain("RA Novak vertritt RA Huber");
  });

  test("stornierte/abgeschlossene/abgelaufene Abwesenheiten werden ignoriert", async () => {
    seed({
      absence_record: [
        absence({ ...ACTIVE, id: "a1", status: "cancelled" }),
        absence({ ...ACTIVE, id: "a2", status: "completed" }),
        absence({ ...ACTIVE, id: "a3", end_date: "2020-12-31" }),
        absence({ ...ACTIVE, id: "a4", auto_route_enabled: false }),
      ],
    });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toEqual([]);
    expect(body.data.narrative).not.toContain("vertritt");
  });

  test("Frist des Abwesenden trägt den Vertreter in topDeadlines", async () => {
    seed({
      absence_record: [absence(ACTIVE)],
      legal_case: [
        {
          slug: "legal/cases/1",
          title: "Akte Muster",
          frontmatter: { status: "open", own_lawyer_name: "RA Müller" },
        },
      ],
      legal_deadline: [
        {
          slug: "legal/deadlines/1",
          title: "Klagsantwort",
          frontmatter: {
            case_slug: "legal/cases/1",
            due_date: "2099-01-10",
            status: "open",
          },
        },
        {
          slug: "legal/deadlines/2",
          title: "Frist ohne Akte",
          frontmatter: { due_date: "2099-01-11", status: "open" },
        },
      ],
    });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.topDeadlines[0]?.delegate).toBe("Dr. Berger");
    expect(body.data.data.topDeadlines[1]?.delegate).toBeUndefined();
  });

  test("englischer Fallback nennt die Vertretung", async () => {
    seed({ absence_record: [absence(ACTIVE)] });
    const res = await post("en");
    const body = (await res.json()) as BriefingBody;
    expect(body.data.narrative).toContain("Dr. Berger covers for RA Müller until 2099-12-31");
  });
});

interface BriefingDataBody {
  data: {
    narrative: string;
    usedFallback: boolean;
    degraded: boolean;
    data: {
      overdueDeadlines: number;
      criticalDeadlines: number;
      deadlinesIncomplete: boolean;
      activeCases: number;
      cappedCounts: string[];
      openInvoices: number;
    };
  };
}

describe("POST /api/dashboard/briefing — Fristen aus dem Lesemodell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue(null);
  });

  test("120 Fristen: die überfällige, am längsten nicht geänderte wird gezählt", async () => {
    const future = Array.from({ length: 119 }, (_, i) => ({
      slug: `legal/deadlines/future-${i}`,
      frontmatter: { due_date: "2099-06-01", status: "open", description: `Zukunft ${i}` },
    }));
    // Listed last = edited longest ago — beyond any 50/100 first batch.
    seed({
      legal_deadline: [
        ...future,
        {
          slug: "legal/deadlines/alt",
          frontmatter: { due_date: "2020-01-01", status: "open", description: "Alte Frist" },
        },
      ],
    });
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefingDataBody;
    expect(body.data.data.overdueDeadlines).toBe(1);
    expect(body.data.data.deadlinesIncomplete).toBe(false);
    expect(body.data.narrative).toContain("überfällige Frist");
  });

  test("Engine-Fehler bei legal_deadline → Hinweis auf unvollständige Daten, nie Entwarnung", async () => {
    failingTypes = ["legal_deadline"];
    mockComplete.mockResolvedValue({ text: "Keine kritischen Fristen heute. Alles ruhig." });
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefingDataBody;
    expect(body.data.degraded).toBe(true);
    expect(body.data.data.deadlinesIncomplete).toBe(true);
    expect(body.data.narrative).toContain("nicht vollständig geladen");
    expect(body.data.narrative).not.toContain("Keine kritischen Fristen");
    // No model prose on an incomplete deadline picture.
    expect(mockComplete).not.toHaveBeenCalled();
  });

  test("englischer Text bei Lesefehler sagt nie 'No critical deadlines'", async () => {
    failingTypes = ["legal_deadline"];
    const res = await post("en");
    const body = (await res.json()) as BriefingDataBody;
    expect(body.data.narrative).toContain("could not be loaded completely");
    expect(body.data.narrative).not.toContain("No critical deadlines");
  });

  test("erledigt, tombstoned und verworfene KI-Fristen zählen nicht", async () => {
    seed({
      legal_deadline: [
        { frontmatter: { due_date: "2020-01-01", status: "erledigt" } },
        { frontmatter: { due_date: "2020-01-02", status: "tombstoned" } },
        { frontmatter: { due_date: "2020-01-03", status: "open", review_status: "rejected" } },
        { frontmatter: { due_date: "2020-01-04", status: "completed" } },
      ],
      legal_case: [
        {
          slug: "legal/cases/x",
          frontmatter: {
            status: "open",
            deadlines: [
              { id: "e1", title: "Storniert", due_date: "2020-01-05", status: "storniert" },
              { id: "e2", title: "Verworfen", due_date: "2020-01-06", review_status: "rejected" },
            ],
          },
        },
      ],
    });
    const res = await post();
    const body = (await res.json()) as BriefingDataBody;
    expect(body.data.data.overdueDeadlines).toBe(0);
    expect(body.data.data.criticalDeadlines).toBe(0);
    expect(body.data.narrative).toContain("Keine kritischen Fristen heute.");
  });

  test("mehr Akten als das Lesebudget → Zahl als Untergrenze gekennzeichnet", async () => {
    seed({
      legal_case: Array.from({ length: 501 }, (_, i) => ({
        slug: `legal/cases/c${i}`,
        frontmatter: { status: "open" },
      })),
      invoice: [{ frontmatter: { status: "sent" } }, { frontmatter: { status: "tombstoned" } }],
    });
    const res = await post();
    const body = (await res.json()) as BriefingDataBody;
    expect(body.data.data.activeCases).toBe(500);
    expect(body.data.data.cappedCounts).toContain("activeCases");
    expect(body.data.narrative).toContain("500+ aktive Akte(n)");
    // A deleted invoice is not an open one.
    expect(body.data.data.openInvoices).toBe(1);
  });
});

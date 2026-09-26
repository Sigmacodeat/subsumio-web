import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockPatch = vi.fn();
const mockList = vi.fn();

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));

const mockGetByEmail = vi.fn();
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getByEmail: (...args: unknown[]) => mockGetByEmail(...args) }),
}));

let ctxUser: Record<string, unknown> = { id: "u1", name: "Anwalt", email: "anwalt@example.com" };

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockList(...args),
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
    return async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "brain-at" },
        brainId: "brain-at",
        user: ctxUser,
      };
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      const queryRaw = Object.fromEntries(new URL(req.url).searchParams.entries());
      const queryParsed = opts.query?.safeParse(queryRaw);
      if (queryParsed && !queryParsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, parsed?.data ?? raw, queryParsed?.data ?? queryRaw, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { GET, PATCH, POST } from "./route";
import { zonedDateString } from "@/lib/datetime";

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/absences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

const ABSENCE = {
  id: "absence-1",
  user_email: "ra@example.com",
  user_name: "RA Müller",
  delegate_email: "vertreter@example.com",
  delegate_name: "RA Vertreter",
  start_date: "2026-10-01",
  end_date: "2026-10-14",
  status: "planned",
  auto_route_enabled: true,
  reassigned_rundown_items: [],
  forwarded_deadlines: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

function pageWith(record: unknown) {
  return new Response(JSON.stringify({ frontmatter: record }), { status: 200 });
}

describe("PATCH /api/absences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockResolvedValue({ ok: true });
    mockList.mockResolvedValue([]);
  });

  test("cancel setzt status=cancelled und schreibt zurück", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(200);

    const [headers, patchArg] = mockPatch.mock.calls[0] as [
      Record<string, string>,
      { slug: string; frontmatter: { status: string } },
    ];
    expect(patchArg.slug).toBe("legal/absences/absence-1");
    expect(patchArg.frontmatter.status).toBe("cancelled");
    expect(headers["x-subsumio-source"]).toBe("brain-at");
  });

  test("complete setzt status=completed", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "active" }));
    const res = await patch({ id: "absence-1", action: "complete" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.status).toBe("completed");
  });

  test("activate setzt status=active", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    const res = await patch({ id: "absence-1", action: "activate" });
    const body = await res.json();
    expect(body.data.absence.status).toBe("active");
  });

  test("activate befüllt forwarded_deadlines mit abgedeckten Fristen", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    mockList
      .mockResolvedValueOnce([
        {
          slug: "legal/deadlines/d-in",
          frontmatter: { case_slug: "legal/cases/1", due_date: "2026-10-05" },
        },
        {
          slug: "legal/deadlines/d-out",
          frontmatter: { case_slug: "legal/cases/1", due_date: "2026-11-01" },
        },
        {
          slug: "legal/deadlines/d-done",
          frontmatter: {
            case_slug: "legal/cases/1",
            due_date: "2026-10-05",
            status: "erledigt",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          slug: "legal/wv/w-1",
          frontmatter: { case_slug: "legal/cases/1", date: "2026-10-10" },
        },
      ])
      .mockResolvedValueOnce([
        { slug: "legal/cases/1", frontmatter: { own_lawyer_name: "RA Müller" } },
      ]);
    const res = await patch({ id: "absence-1", action: "activate" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.forwarded_deadlines).toEqual(["legal/deadlines/d-in", "legal/wv/w-1"]);
  });

  test("der Fristen-Scan liest vollständig oder gar nicht (R11-8)", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    mockList.mockResolvedValue([]);
    await patch({ id: "absence-1", action: "activate" });
    for (const call of mockList.mock.calls) {
      expect(call[2]).toBeGreaterThanOrEqual(100_000);
      expect(call[3]).toMatchObject({ strict: true, failOnTruncate: true });
    }
    expect(mockList.mock.calls.map((c) => c[1]).sort()).toEqual([
      "legal_case",
      "legal_deadline",
      "legal_follow_up",
    ]);
    mockList.mockReset();
  });

  test("activate bleibt erfolgreich wenn Fristen-Scan fehlschlägt", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    mockList.mockRejectedValue(new Error("engine down"));
    const res = await patch({ id: "absence-1", action: "activate" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.status).toBe("active");
    expect(body.data.absence.forwarded_deadlines).toEqual([]);
  });

  test("unbekannte Abwesenheit → 404, kein Patch", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nf", { status: 404 }));
    const res = await patch({ id: "gibts-nicht", action: "cancel" });
    expect(res.status).toBe(404);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("complete/cancel auf storniert → 409", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "cancelled" }));
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("activate einer stornierten Abwesenheit mit Überschneidung → 409, kein Patch", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "cancelled" }));
    mockList.mockResolvedValueOnce([
      { slug: "legal/absences/absence-1", frontmatter: { ...ABSENCE, status: "cancelled" } },
      {
        slug: "legal/absences/neu",
        frontmatter: { ...ABSENCE, id: "neu", start_date: "2026-10-05", end_date: "2026-10-20" },
      },
    ]);
    const res = await patch({ id: "absence-1", action: "activate" });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("activate einer stornierten Abwesenheit: Lesefehler → 502 statt ungeprüft", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "cancelled" }));
    mockList.mockRejectedValueOnce(new Error("down"));
    const res = await patch({ id: "absence-1", action: "activate" });
    expect(res.status).toBe(502);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("activate auf storniert/abgeschlossen → Reopen erlaubt (Undo-Pfad)", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "cancelled" }));
    const res = await patch({ id: "absence-1", action: "activate" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.status).toBe("active");

    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, status: "completed" }));
    const res2 = await patch({ id: "absence-1", action: "activate" });
    expect(res2.status).toBe(200);
  });

  test("id im Frontmatter muss übereinstimmen (kein fremder Slug)", async () => {
    mockFetch.mockResolvedValueOnce(pageWith({ ...ABSENCE, id: "andere-id" }));
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(404);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("Engine-Patch-Fehler → 502", async () => {
    mockFetch.mockResolvedValueOnce(pageWith(ABSENCE));
    mockPatch.mockResolvedValueOnce({ ok: false });
    const res = await patch({ id: "absence-1", action: "cancel" });
    expect(res.status).toBe(502);
  });

  test("Validierung: unbekannte action → 400", async () => {
    const res = await patch({ id: "absence-1", action: "delete" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/absences", () => {
  const baseBody = {
    user_email: "ra@example.com",
    user_name: "RA Müller",
    delegate_email: "vertreter@example.com",
    delegate_name: "RA Vertreter",
    start_date: "2026-10-01",
    end_date: "2026-10-14",
    kind: "urlaub",
  };

  function post(body: unknown) {
    return POST(
      new Request("http://localhost/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as unknown as NextRequest
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
    ctxUser = { id: "u1", name: "Anwalt", email: "anwalt@example.com" };
  });

  test("Überschneidung mit bestehender Abwesenheit derselben Person → 409", async () => {
    mockList.mockResolvedValueOnce([
      {
        slug: "legal/absences/alt",
        frontmatter: { ...ABSENCE, start_date: "2026-10-10", end_date: "2026-10-20" },
      },
    ]);
    const res = await post(baseBody);
    expect(res.status).toBe(409);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("stornierte oder fremde Abwesenheit im Zeitraum blockiert nicht", async () => {
    mockList.mockResolvedValueOnce([
      { slug: "legal/absences/s", frontmatter: { ...ABSENCE, status: "cancelled" } },
      {
        slug: "legal/absences/f",
        frontmatter: { ...ABSENCE, user_email: "andere@example.com" },
      },
    ]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await post(baseBody);
    expect(res.status).toBe(200);
  });

  test("Kanzlei: unbekannte Vertretungs-E-Mail → 422", async () => {
    ctxUser = { ...ctxUser, orgId: "org-1" };
    mockGetByEmail.mockResolvedValueOnce(null);
    const res = await post(baseBody);
    expect(res.status).toBe(422);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("Kanzlei: Vertretung aus anderer Kanzlei oder deaktiviert → 422", async () => {
    ctxUser = { ...ctxUser, orgId: "org-1" };
    mockGetByEmail.mockResolvedValueOnce({ orgId: "org-2", role: "lawyer" });
    expect((await post(baseBody)).status).toBe(422);
    mockGetByEmail.mockResolvedValueOnce({
      orgId: "org-1",
      role: "lawyer",
      deactivatedAt: "2026-01-01",
    });
    expect((await post(baseBody)).status).toBe(422);
  });

  test("externe Vertretung (§ 34 RAO) → ohne Mitgliedsprüfung angelegt, Name/Kanzlei gespeichert", async () => {
    ctxUser = { ...ctxUser, orgId: "org-1" };
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { delegate_email: _e, ...noEmail } = baseBody;
    const res = await post({
      ...noEmail,
      delegate_name: "Dr. Substitut",
      substitute_external: true,
      delegate_firm: "Kanzlei Beispiel",
    });
    expect(res.status).toBe(200);
    expect(mockGetByEmail).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.absence).toMatchObject({
      substitute_external: true,
      delegate_name: "Dr. Substitut",
      delegate_firm: "Kanzlei Beispiel",
      delegate_email: "",
    });
  });

  test("Kanzleimitglied ohne E-Mail → 400", async () => {
    const { delegate_email: _e, ...noEmail } = baseBody;
    const res = await post(noEmail);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("Kanzlei: aktives Mitglied als Vertretung → angelegt", async () => {
    ctxUser = { ...ctxUser, orgId: "org-1" };
    mockGetByEmail.mockResolvedValueOnce({ orgId: "org-1", role: "lawyer" });
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect((await post(baseBody)).status).toBe(200);
    expect(mockGetByEmail).toHaveBeenCalledWith("vertreter@example.com");
  });

  test("legt die Abwesenheit an und liefert den Record", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await post(baseBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.user_email).toBe("ra@example.com");
    expect(body.data.absence.status).toBe("planned");
  });

  test("Anlegen mit Start heute → aktiv und forwarded_deadlines enthält die passende Frist", async () => {
    const today = zonedDateString(new Date());
    mockList
      .mockResolvedValueOnce([]) // overlap check
      .mockResolvedValueOnce([
        {
          slug: "legal/deadlines/heute",
          frontmatter: { case_slug: "legal/cases/1", due_date: today },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { slug: "legal/cases/1", frontmatter: { own_lawyer_name: "RA Müller" } },
      ]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await post({ ...baseBody, start_date: today, end_date: "2099-12-31" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absence.status).toBe("active");
    expect(body.data.absence.forwarded_deadlines).toEqual(["legal/deadlines/heute"]);
    const written = JSON.parse(String(mockFetch.mock.calls[0]![1].body));
    expect(written.frontmatter.forwarded_deadlines).toEqual(["legal/deadlines/heute"]);
  });

  test("ohne Art der Abwesenheit → 400", async () => {
    const { kind: _kind, ...withoutKind } = baseBody;
    const res = await post(withoutKind);
    expect(res.status).toBe(400);
  });

  test("Art wird gespeichert", async () => {
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await post({ ...baseBody, kind: "krankheit" });
    const body = await res.json();
    expect(body.data.absence.kind).toBe("krankheit");
  });

  test("Freitext-Datum wird abgelehnt (400) — solche Records aktivierten nie", async () => {
    const res = await post({ ...baseBody, start_date: "Anfang Oktober" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("Selbstvertretung wird abgelehnt (422)", async () => {
    const res = await post({ ...baseBody, delegate_email: "RA@example.com" });
    expect(res.status).toBe(422);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("end_date vor start_date → 422", async () => {
    const res = await post({ ...baseBody, end_date: "2026-09-01" });
    expect(res.status).toBe(422);
  });

  test("fehlgeschlagener Engine-Write → Fehler statt Phantom-Abwesenheit", async () => {
    mockFetch.mockResolvedValueOnce(new Response("db down", { status: 500 }));
    const res = await post(baseBody);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("engine_write_failed");
  });
});

describe("GET /api/absences", () => {
  beforeEach(() => vi.clearAllMocks());

  function get(qs = "") {
    return GET(new Request(`http://localhost/api/absences${qs}`) as unknown as NextRequest);
  }

  test("filtert auf dem Frontmatter, nicht auf dem Page-Wrapper", async () => {
    mockList.mockResolvedValueOnce([
      { slug: "legal/absences/a1", frontmatter: ABSENCE },
      {
        slug: "legal/absences/a2",
        frontmatter: { ...ABSENCE, id: "a2", user_email: "andere@example.com" },
      },
    ]);
    const res = await get("?user_email=ra@example.com");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.absences).toHaveLength(1);
    expect(body.data.absences[0].id).toBe("absence-1");
  });

  test("status-Filter trifft das Frontmatter-Feld", async () => {
    mockList.mockResolvedValueOnce([
      { slug: "legal/absences/a1", frontmatter: ABSENCE },
      { slug: "legal/absences/a2", frontmatter: { ...ABSENCE, id: "a2", status: "cancelled" } },
    ]);
    const res = await get("?status=cancelled");
    const body = await res.json();
    expect(body.data.absences).toHaveLength(1);
    expect(body.data.absences[0].id).toBe("a2");
  });

  test("150 Datensätze → 150 (vollständige, strikte Liste)", async () => {
    mockList.mockResolvedValueOnce(
      Array.from({ length: 150 }, (_, i) => ({
        slug: `legal/absences/a${i}`,
        frontmatter: { ...ABSENCE, id: `a${i}` },
      }))
    );
    const res = await get();
    const body = await res.json();
    expect(body.data.absences).toHaveLength(150);
    expect(mockList).toHaveBeenCalledWith(expect.anything(), "absence_record", 10_000, {
      strict: true,
    });
  });

  test("Lesefehler → 502 statt gekürzter Liste", async () => {
    mockList.mockRejectedValueOnce(new Error("engine down"));
    const res = await get();
    expect(res.status).toBe(502);
  });
});

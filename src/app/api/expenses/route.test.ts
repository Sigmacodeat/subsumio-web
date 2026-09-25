import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGetPage = vi.fn();
const mockListPages = vi.fn();
const mockAppendPageArray = vi.fn();
const mockMutatePageArray = vi.fn();

vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    getPage: (...args: unknown[]) => mockGetPage(...args),
    listPages: (...args: unknown[]) => mockListPages(...args),
    appendPageArray: (...args: unknown[]) => mockAppendPageArray(...args),
    mutatePageArray: (...args: unknown[]) => mockMutatePageArray(...args),
  }),
}));

vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
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
      if (req.method === "GET" || req.method === "HEAD") {
        const params = Object.fromEntries(new URL(req.url).searchParams.entries());
        const parsed = opts.query?.safeParse(params);
        if (parsed && !parsed.success) {
          return Response.json({ error: "validation_failed" }, { status: 400 });
        }
        return handler(ctx, undefined, parsed?.data ?? params, req);
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

import { GET, POST, PATCH, DELETE } from "./route";
import { POST as MARK_BILLED } from "./mark-billed/route";
import { POST as UNBILL } from "./unbill/route";

function call(
  fn: (req: NextRequest) => Promise<Response>,
  method: string,
  url: string,
  body?: unknown
) {
  return fn(
    new Request(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }) as unknown as NextRequest
  );
}

const get = (qs = "") => call(GET, "GET", `http://localhost/api/expenses${qs}`);
const post = (body: unknown) => call(POST, "POST", "http://localhost/api/expenses", body);
const patch = (body: unknown) => call(PATCH, "PATCH", "http://localhost/api/expenses", body);
const del = (body: unknown) => call(DELETE, "DELETE", "http://localhost/api/expenses", body);
const markBilled = (body: unknown) =>
  call(MARK_BILLED, "POST", "http://localhost/api/expenses/mark-billed", body);
const unbill = (body: unknown) =>
  call(UNBILL, "POST", "http://localhost/api/expenses/unbill", body);

const EXPENSE = {
  id: "exp-1",
  description: "Gerichtskosten",
  amount: 120.5,
  date: "2026-09-20",
  billable: true,
  billed: false,
};

const CASE_PAGE = { frontmatter: { expenses: [EXPENSE] } };

type Elem = Record<string, unknown>;
interface Mutation {
  match: unknown[];
  match_key?: string;
  set?: Elem;
  unset?: string[];
  remove?: boolean;
  unless?: { eq?: Elem; ne?: Elem };
}

/**
 * Minimal mirror of the engine's page_array_append / page_array_mutate on the
 * in-memory frontmatter `fm`, including the {eq, ne} skip guard: an element is
 * skipped when every `eq` key equals AND every `ne` key is present-and-different
 * (see server/src/core/postgres-engine.ts mutatePageArrayItems).
 */
function mockBrainCase(fm: Record<string, unknown>) {
  mockGetPage.mockImplementation(async () => ({ frontmatter: fm }));
  mockAppendPageArray.mockImplementation(async (_slug: string, field: string, items: Elem[]) => {
    const cur = Array.isArray(fm[field]) ? (fm[field] as Elem[]) : [];
    fm[field] = [...cur, ...items];
    return { items: fm[field] };
  });
  mockMutatePageArray.mockImplementation(async (slug: string, field: string, m: Mutation) => {
    const cur = Array.isArray(fm[field]) ? (fm[field] as Elem[]) : [];
    const key = m.match_key ?? "id";
    const wanted = m.match.map(String);
    const matched: string[] = [];
    const skipped: string[] = [];
    const updated: string[] = [];
    const isSkipped = (e: Elem) => {
      if (!m.unless) return false;
      const eqOk = !m.unless.eq || Object.entries(m.unless.eq).every(([k, v]) => e[k] === v);
      const neOk =
        !m.unless.ne ||
        Object.entries(m.unless.ne).every(([k, v]) => k in e && String(e[k]) !== String(v));
      return eqOk && neOk;
    };
    const next: Elem[] = [];
    for (const e of cur) {
      const id = String(e[key]);
      if (!wanted.includes(id)) {
        next.push(e);
        continue;
      }
      matched.push(id);
      if (isSkipped(e)) {
        skipped.push(id);
        next.push(e);
        continue;
      }
      updated.push(id);
      if (m.remove) continue;
      const patched: Elem = { ...e, ...(m.set ?? {}) };
      for (const k of m.unset ?? []) delete patched[k];
      next.push(patched);
    }
    fm[field] = next;
    return {
      slug,
      field,
      matched_ids: matched,
      updated_ids: updated,
      skipped_ids: skipped,
      not_found_ids: wanted.filter((id) => !matched.includes(id)),
      items: next,
      length: next.length,
    };
  });
}

const expensesOf = (fm: Record<string, unknown>) =>
  fm.expenses as Array<{ id: string; billed?: boolean; invoice_number?: string; amount?: number }>;

describe("GET /api/expenses", () => {
  beforeEach(() => vi.clearAllMocks());

  test("case-scoped: liefert expenses der Akte mit case_slug", async () => {
    mockGetPage.mockResolvedValue(CASE_PAGE);
    const res = await get("?case_slug=case-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0].id).toBe("exp-1");
    expect(body.data.entries[0].case_slug).toBe("case-1");
    expect(body.data.summary.total_amount).toBe(120.5);
  });

  test("unbekannte Akte → 404 case_not_found", async () => {
    mockGetPage.mockRejectedValue(new Error("not found"));
    const res = await get("?case_slug=fremd");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("case_not_found");
  });

  test("kanzleiweit: aggregiert expenses aller legal_case-Pages", async () => {
    mockListPages.mockResolvedValue([
      { slug: "case-1", frontmatter: { expenses: [EXPENSE] } },
      {
        slug: "case-2",
        frontmatter: { expenses: [{ ...EXPENSE, id: "exp-2", amount: 10 }] },
      },
      { slug: "case-3", frontmatter: { expenses: [], status: "tombstoned" } },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entries).toHaveLength(2);
    expect(body.data.summary.total_amount).toBe(130.5);
  });

  test("unbilled-Filter", async () => {
    mockGetPage.mockResolvedValue({
      frontmatter: { expenses: [EXPENSE, { ...EXPENSE, id: "exp-2", billed: true }] },
    });
    const res = await get("?case_slug=case-1&unbilled=true");
    const body = await res.json();
    expect(body.data.entries.map((e: { id: string }) => e.id)).toEqual(["exp-1"]);
  });
});

describe("POST /api/expenses — Validation", () => {
  beforeEach(() => vi.clearAllMocks());

  test("fehlende case_slug → 400", async () => {
    const res = await post({ description: "x", amount: 10, date: "2026-09-22" });
    expect(res.status).toBe(400);
  });

  test("NaN/negativer Betrag → 400", async () => {
    expect(
      (await post({ case_slug: "c", description: "x", amount: "abc", date: "2026-09-22" })).status
    ).toBe(400);
    expect(
      (await post({ case_slug: "c", description: "x", amount: -5, date: "2026-09-22" })).status
    ).toBe(400);
  });

  test("fehlende Beschreibung / ungültiges Datum / ungültige Währung → 400", async () => {
    expect((await post({ case_slug: "c", amount: 10, date: "2026-09-22" })).status).toBe(400);
    expect(
      (await post({ case_slug: "c", description: "x", amount: 10, date: "22.09.2026" })).status
    ).toBe(400);
    expect(
      (
        await post({
          case_slug: "c",
          description: "x",
          amount: 10,
          date: "2026-09-22",
          currency: "EURO",
        })
      ).status
    ).toBe(400);
  });

  test("legt Auslage per atomarem Array-Append an (201) — kein Read-Modify-Write", async () => {
    const fm: Record<string, unknown> = { expenses: [] };
    mockBrainCase(fm);
    const res = await post({
      case_slug: "case-1",
      description: "Kopien",
      amount: "12,50",
      date: "2026-09-22",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.entry.id).toMatch(/^exp-/);
    expect(body.data.entry.amount).toBe(12.5);
    expect(body.data.entry.currency).toBe("EUR");
    expect(body.data.entry.billed).toBe(false);
    expect(mockAppendPageArray).toHaveBeenCalledTimes(1);
    const [slug, field, items] = mockAppendPageArray.mock.calls[0]! as [string, string, unknown[]];
    expect(slug).toBe("case-1");
    expect(field).toBe("expenses");
    expect(items).toHaveLength(1);
    expect(expensesOf(fm)).toHaveLength(1);
  });

  test("unbekannte Akte → 404", async () => {
    mockGetPage.mockRejectedValue(new Error("not found"));
    const res = await post({ case_slug: "fremd", description: "x", amount: 5, date: "2026-09-22" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("case_not_found");
  });
});

describe("PATCH /api/expenses", () => {
  beforeEach(() => vi.clearAllMocks());

  test("aktualisiert offene Auslage", async () => {
    mockBrainCase({ expenses: [EXPENSE] });
    const res = await patch({ case_slug: "case-1", id: "exp-1", amount: 99.9 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry.amount).toBe(99.9);
    expect(body.data.entry.description).toBe("Gerichtskosten");
  });

  test("abgerechnete Auslage → 409 expense_billed", async () => {
    mockBrainCase({ expenses: [{ ...EXPENSE, billed: true, invoice_number: "RE-1" }] });
    const res = await patch({ case_slug: "case-1", id: "exp-1", amount: 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("expense_billed");
  });

  test("unbekannte ID → 404 expense_not_found", async () => {
    mockBrainCase({ expenses: [EXPENSE] });
    const res = await patch({ case_slug: "case-1", id: "nope", amount: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("expense_not_found");
  });

  test("billed/invoice_number sind via PATCH nicht setzbar", async () => {
    const fm: Record<string, unknown> = { expenses: [EXPENSE] };
    mockBrainCase(fm);
    const res = await patch({
      case_slug: "case-1",
      id: "exp-1",
      billed: true,
      invoice_number: "RE-HACK",
    });
    expect(res.status).toBe(200);
    const [, , mutation] = mockMutatePageArray.mock.calls[0]! as [string, string, Mutation];
    expect(Object.keys(mutation.set ?? {})).not.toContain("billed");
    expect(Object.keys(mutation.set ?? {})).not.toContain("invoice_number");
    expect(expensesOf(fm)[0]!.billed).toBe(false);
    expect(expensesOf(fm)[0]!.invoice_number).toBeUndefined();
  });

  test("Guard läuft in der Engine: eine parallel abgerechnete Auslage wird nicht mehr überschrieben", async () => {
    // Zwischen dem Case-Existenzcheck und der Mutation rechnet jemand ab —
    // der Guard sitzt IM Update, also 409 statt stillem Überschreiben.
    const fm: Record<string, unknown> = { expenses: [{ ...EXPENSE }] };
    mockBrainCase(fm);
    mockGetPage.mockImplementation(async () => {
      expensesOf(fm)[0]!.billed = true;
      expensesOf(fm)[0]!.invoice_number = "RE-PARALLEL";
      return { frontmatter: fm };
    });
    const res = await patch({ case_slug: "case-1", id: "exp-1", amount: 1 });
    expect(res.status).toBe(409);
    expect(expensesOf(fm)[0]!.amount).toBe(120.5);
    expect(expensesOf(fm)[0]!.invoice_number).toBe("RE-PARALLEL");
  });
});

describe("DELETE /api/expenses", () => {
  beforeEach(() => vi.clearAllMocks());

  test("löscht offene Auslage per atomarem remove", async () => {
    const fm: Record<string, unknown> = { expenses: [EXPENSE, { ...EXPENSE, id: "exp-2" }] };
    mockBrainCase(fm);
    const res = await del({ case_slug: "case-1", id: "exp-1" });
    expect(res.status).toBe(200);
    const [, , mutation] = mockMutatePageArray.mock.calls[0]! as [string, string, Mutation];
    expect(mutation).toMatchObject({ match: ["exp-1"], remove: true });
    expect(expensesOf(fm).map((e) => e.id)).toEqual(["exp-2"]);
  });

  test("abgerechnete Auslage → 409 expense_billed, Eintrag bleibt", async () => {
    const fm: Record<string, unknown> = { expenses: [{ ...EXPENSE, billed: true }] };
    mockBrainCase(fm);
    const res = await del({ case_slug: "case-1", id: "exp-1" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("expense_billed");
    expect(expensesOf(fm)).toHaveLength(1);
  });

  test("unbekannte ID → 404, fehlende case_slug → 400", async () => {
    mockBrainCase({ expenses: [EXPENSE] });
    expect((await del({ case_slug: "case-1", id: "nope" })).status).toBe(404);
    expect((await del({ id: "exp-1" })).status).toBe(400);
  });
});

describe("POST /api/expenses/mark-billed + unbill", () => {
  beforeEach(() => vi.clearAllMocks());

  test("mark-billed setzt billed+invoice_number in einer Mutation mit Fremdrechnungs-Guard", async () => {
    const fm: Record<string, unknown> = { expenses: [EXPENSE] };
    mockBrainCase(fm);
    const res = await markBilled({
      case_slug: "case-1",
      entry_ids: ["exp-1"],
      invoice_number: "RE-2026-001",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toBe(1);
    expect(body.data.already_billed).toEqual([]);
    const [, , mutation] = mockMutatePageArray.mock.calls[0]! as [string, string, Mutation];
    expect(mutation).toMatchObject({
      match: ["exp-1"],
      set: { billed: true, invoice_number: "RE-2026-001" },
      unless: { eq: { billed: true }, ne: { invoice_number: "RE-2026-001" } },
    });
    expect(expensesOf(fm)[0]!.billed).toBe(true);
    expect(expensesOf(fm)[0]!.invoice_number).toBe("RE-2026-001");
  });

  test("mark-billed: unter anderer Rechnung gebucht → 200 mit already_billed, nie umgehängt", async () => {
    const fm: Record<string, unknown> = {
      expenses: [
        { ...EXPENSE, billed: true, invoice_number: "RE-ALT" },
        { ...EXPENSE, id: "exp-2" },
      ],
    };
    mockBrainCase(fm);
    const res = await markBilled({
      case_slug: "case-1",
      entry_ids: ["exp-1", "exp-2"],
      invoice_number: "RE-NEU",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toBe(1);
    expect(body.data.already_billed).toEqual(["exp-1"]);
    expect(expensesOf(fm)[0]!.invoice_number).toBe("RE-ALT");
    expect(expensesOf(fm)[1]!.invoice_number).toBe("RE-NEU");

    // Alle fremd-gebucht: kein 404 (die Auslagen existieren), sondern
    // updated=0 + vollständige already_billed-Liste für den Rechnungsdialog.
    const again = await markBilled({
      case_slug: "case-1",
      entry_ids: ["exp-1"],
      invoice_number: "RE-NEU",
    });
    expect(again.status).toBe(200);
    expect((await again.json()).data).toMatchObject({ updated: 0, already_billed: ["exp-1"] });
  });

  test("mark-billed: Retry derselben Rechnung bleibt idempotent (kein Skip)", async () => {
    const fm: Record<string, unknown> = {
      expenses: [{ ...EXPENSE, billed: true, invoice_number: "RE-1" }],
    };
    mockBrainCase(fm);
    const res = await markBilled({
      case_slug: "case-1",
      entry_ids: ["exp-1"],
      invoice_number: "RE-1",
    });
    expect((await res.json()).data).toMatchObject({ updated: 1, already_billed: [] });
  });

  test("mark-billed mit nur unbekannten IDs → 404", async () => {
    mockBrainCase({ expenses: [EXPENSE] });
    const res = await markBilled({
      case_slug: "case-1",
      entry_ids: ["nope"],
      invoice_number: "RE-1",
    });
    expect(res.status).toBe(404);
  });

  test("unbill macht die Auslage wieder editierbar (billed=false, invoice_number entfernt)", async () => {
    const fm: Record<string, unknown> = {
      expenses: [{ ...EXPENSE, billed: true, invoice_number: "RE-1" }],
    };
    mockBrainCase(fm);
    // The invoice RE-1 is still a draft — its work may be released.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            slug: "invoice/re-1",
            title: "x",
            frontmatter: { invoice_number: "RE-1", status: "draft" },
          },
        ])
      )
    );
    const res = await unbill({ case_slug: "case-1", entry_ids: ["exp-1"] });
    vi.unstubAllGlobals();
    expect(res.status).toBe(200);
    const [, , mutation] = mockMutatePageArray.mock.calls[0]! as [string, string, Mutation];
    expect(mutation).toMatchObject({ set: { billed: false }, unset: ["invoice_number"] });
    expect(expensesOf(fm)[0]!.billed).toBe(false);
    expect(expensesOf(fm)[0]!.invoice_number).toBeUndefined();
  });

  test("unbill auf unbekannter Akte → 404 case_not_found", async () => {
    mockGetPage.mockRejectedValue(new Error("not found"));
    const res = await unbill({ case_slug: "fremd", entry_ids: ["exp-1"] });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("case_not_found");
  });
});

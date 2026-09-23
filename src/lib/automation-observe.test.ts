import { describe, expect, test } from "vitest";
import { collectObservations, planRuleRuns, type ObservedPage } from "./automation-observe";
import type { AutomationRule } from "./automation-model";

const NOW = new Date("2026-09-22T12:00:00Z");

function rule(event: AutomationRule["event"], firedKeys: string[] = []): AutomationRule {
  return {
    slug: `rule-${event}`,
    name: event,
    enabled: true,
    event,
    actions: [{ type: "notify" }],
    fired_keys: firedKeys,
    created_at: "2026-09-01T00:00:00Z",
    created_by: "test",
  };
}

function page(slug: string, frontmatter: Record<string, unknown> = {}, title = slug): ObservedPage {
  return { slug, title, frontmatter };
}

describe("collectObservations", () => {
  test("case.created feuert einmal pro Akte", () => {
    const obs = collectObservations(
      [rule("case.created")],
      { legal_case: [page("cases/a"), page("cases/b")] },
      NOW
    );
    expect(obs.map((o) => o.fireKey)).toEqual(["case:cases/a", "case:cases/b"]);
    expect(obs[0]!.payload.case_slug).toBe("cases/a");
  });

  test("case.status_changed feuert einmal pro Statuswert", () => {
    const obs = collectObservations(
      [rule("case.status_changed")],
      {
        legal_case: [
          page("cases/a", { status: "active" }),
          page("cases/b", { status: "archived" }),
          page("cases/c", {}), // kein Status → keine Observation
        ],
      },
      NOW
    );
    expect(obs.map((o) => o.fireKey)).toEqual(["status:cases/a:active", "status:cases/b:archived"]);
    expect(obs[0]!.payload.status).toBe("active");
  });

  test("deadline.created + due_soon: Fenster und done-Status", () => {
    const c = page("cases/a", {
      deadlines: [
        { id: "d1", title: "Berufung", due_date: "2026-09-25", status: "pending" }, // in 3d → due_soon
        { id: "d2", title: "Fern", due_date: "2027-01-01", status: "pending" }, // > 7d
        { id: "d3", title: "Erledigt", due_date: "2026-09-23", status: "done" }, // done → nie
        { id: "d4", title: "Überfällig", due_date: "2026-09-20", status: "pending" }, // <0 → nicht due_soon
      ],
    });
    const obs = collectObservations(
      [rule("deadline.created"), rule("deadline.due_soon")],
      { legal_case: [c] },
      NOW
    );
    const created = obs.filter((o) => o.event === "deadline.created");
    // d3 (done) wird nicht beobachtet — erledigte Fristen feuern nie.
    expect(created.map((o) => o.fireKey)).toEqual([
      "dl:cases/a:d1",
      "dl:cases/a:d2",
      "dl:cases/a:d4",
    ]);
    const dueSoon = obs.filter((o) => o.event === "deadline.due_soon");
    expect(dueSoon.map((o) => o.fireKey)).toEqual(["due:cases/a:d1"]);
    expect(dueSoon[0]!.payload.days_left).toBe("3");
  });

  test("invoice.overdue nur bei unbezahlt + überschrittenem Datum", () => {
    const obs = collectObservations(
      [rule("invoice.overdue")],
      {
        invoice: [
          page("inv/1", { status: "sent", due_date: "2026-09-01", invoice_number: "R-1" }),
          page("inv/2", { status: "paid", due_date: "2026-09-01" }),
          page("inv/3", { status: "sent", due_date: "2026-10-01" }), // noch nicht fällig
          page("inv/4", { status: "draft", due_date: "2026-09-01" }),
        ],
      },
      NOW
    );
    expect(obs.map((o) => o.fireKey)).toEqual(["invoice:inv/1"]);
    expect(obs[0]!.payload.invoice_number).toBe("R-1");
  });

  test("document.uploaded / message.received / booking.created je Entity", () => {
    const obs = collectObservations(
      [rule("document.uploaded"), rule("message.received"), rule("booking.created")],
      {
        document: [page("docs/1", { case_slug: "cases/a", doc_type: "vertrag" })],
        inbound_entry: [page("in/1", { channel: "whatsapp", sender_name: "Max" })],
        booking: [page("bk/1", { client_name: "Eva", slot_start: "2026-09-25T09:00:00Z" })],
      },
      NOW
    );
    expect(obs.map((o) => o.fireKey)).toEqual(["doc:docs/1", "msg:in/1", "booking:bk/1"]);
    expect(obs[0]!.payload.doc_type).toBe("vertrag");
    expect(obs[1]!.payload.channel).toBe("whatsapp");
    expect(obs[2]!.payload.name).toBe("Eva");
    expect(obs[2]!.payload.date).toBe("2026-09-25");
  });

  test("nur Events mit aktiven Regeln werden gescannt", () => {
    const obs = collectObservations(
      [rule("invoice.overdue")],
      {
        legal_case: [page("cases/a")],
        document: [page("docs/1")],
        inbound_entry: [page("in/1")],
      },
      NOW
    );
    expect(obs).toEqual([]);
  });

  test("leere/unkomplette Entities erzeugen keine Fehler", () => {
    const obs = collectObservations(
      [rule("case.created"), rule("deadline.due_soon")],
      {
        legal_case: [
          page("cases/a", { deadlines: [{ due_date: "kein-datum" }, {}] }),
          { slug: "cases/b", title: "b" }, // kein frontmatter
        ],
      },
      NOW
    );
    expect(obs.map((o) => o.fireKey)).toEqual(["case:cases/a", "case:cases/b"]);
  });
});

describe("Beobachtungszeitpunkte", () => {
  test("Engine-Anlagezeit hat Vorrang, Rechnung ist ab dem Folgetag überfällig", () => {
    const obs = collectObservations(
      [rule("case.created"), rule("invoice.overdue")],
      {
        legal_case: [
          { ...page("cases/a", { created_at: "2020-01-01" }), created_at: "2026-09-20T08:00:00Z" },
        ],
        invoice: [page("inv/1", { status: "sent", due_date: "2026-09-10" })],
      },
      NOW
    );
    expect(obs.find((o) => o.event === "case.created")?.occurredAt).toBe("2026-09-20T08:00:00Z");
    const inv = obs.find((o) => o.event === "invoice.overdue")!;
    expect(inv.notBefore).toBe("2026-09-11T00:00:00.000Z");
    expect(inv.occurredAt).toBeUndefined();
  });

  test("Vorlauf-Fenster richtet sich nach der weitesten Regel", () => {
    const wide = { ...rule("deadline.due_soon"), within_days: 30 };
    const obs = collectObservations(
      [wide],
      { legal_case: [page("cases/a", { deadlines: [{ id: "d", due_date: "2026-10-10" }] })] },
      NOW
    );
    expect(obs.map((o) => o.fireKey)).toEqual(["due:cases/a:d"]);
  });
});

describe("planRuleRuns — keine Nachholung alter Ereignisse", () => {
  const SINCE = "2026-09-22T11:00:00.000Z";
  const fresh = (event: AutomationRule["event"], extra: Partial<AutomationRule> = {}) => ({
    ...rule(event),
    active_since: SINCE,
    ...extra,
  });
  const cases = {
    legal_case: [
      // Vor dem Stichtag angelegt (Zeitpunkt bekannt) → nie.
      { ...page("cases/old"), created_at: "2026-01-01T00:00:00Z" },
      // Nach dem Stichtag angelegt → ausführen.
      { ...page("cases/new"), created_at: "2026-09-22T11:30:00Z" },
      // Zeitpunkt unbekannt → erster Lauf merkt ihn nur.
      page("cases/unknown"),
    ],
  };

  test("erster Lauf nach dem Stichtag: Altes übergehen, Unbekanntes merken, Neues ausführen", () => {
    const r = fresh("case.created");
    const plan = planRuleRuns([r], collectObservations([r], cases, NOW));
    expect(plan.runs.map((x) => x.obs.fireKey)).toEqual(["case:cases/new"]);
    expect(plan.baseline.get(r.slug)).toEqual(["case:cases/unknown"]);
  });

  test("nach der Bestandsaufnahme feuert nur wirklich Neues — jedes genau einmal", () => {
    const r = fresh("case.created", {
      baseline_done_for: SINCE,
      fired_keys: ["case:cases/unknown", "case:cases/new"],
    });
    const later = {
      legal_case: [...cases.legal_case, page("cases/later-unknown")],
    };
    const plan = planRuleRuns([r], collectObservations([r], later, NOW));
    expect(plan.runs.map((x) => x.obs.fireKey)).toEqual(["case:cases/later-unknown"]);
    expect(plan.baseline.size).toBe(0);
  });

  test("übergangene alte Ereignisse bleiben alt, auch wenn ihr Key verdrängt wurde", () => {
    const r = fresh("case.created", { baseline_done_for: SINCE, fired_keys: [] });
    const plan = planRuleRuns(
      [r],
      collectObservations([r], { legal_case: [cases.legal_case[0]!] }, NOW)
    );
    expect(plan.runs).toEqual([]);
  });

  test("„bald fällig“: beim Stichtag schon im Fenster → gemerkt, neue Frist → ausgeführt", () => {
    const r = fresh("deadline.due_soon");
    const c = page("cases/a", {
      deadlines: [
        { id: "soon", title: "Schon im Fenster", due_date: "2026-09-25" },
        { id: "enters", title: "Rückt nach", due_date: "2026-09-29" },
      ],
    });
    const plan = planRuleRuns([r], collectObservations([r], { legal_case: [c] }, NOW));
    // Beide lagen beim Stichtag schon im 7-Tage-Fenster, ihre Anlage ist
    // unbekannt → nur gemerkt. Eine danach hinzugekommene Frist feuert:
    expect(plan.baseline.get(r.slug)).toEqual(["due:cases/a:soon", "due:cases/a:enters"]);
    const later = planRuleRuns(
      [{ ...r, baseline_done_for: SINCE, fired_keys: plan.baseline.get(r.slug) }],
      collectObservations(
        [r],
        {
          legal_case: [
            page("cases/a", {
              deadlines: [
                { id: "soon", due_date: "2026-09-25" },
                { id: "enters", due_date: "2026-09-29" },
                { id: "new", due_date: "2026-09-29" },
              ],
            }),
          ],
        },
        NOW
      )
    );
    expect(later.runs.map((x) => x.obs.fireKey)).toEqual(["due:cases/a:new"]);
  });

  test("überfällige Rechnung: Fälligkeit nach dem Stichtag → ausführen, davor → nur merken", () => {
    const r = fresh("invoice.overdue", { active_since: "2026-09-15T00:00:00.000Z" });
    const invoices = {
      invoice: [
        page("inv/before", { status: "sent", due_date: "2026-09-01" }),
        page("inv/after", { status: "sent", due_date: "2026-09-20" }),
      ],
    };
    const plan = planRuleRuns([r], collectObservations([r], invoices, NOW));
    expect(plan.runs.map((x) => x.obs.fireKey)).toEqual(["invoice:inv/after"]);
    expect(plan.baseline.get(r.slug)).toEqual(["invoice:inv/before"]);
  });

  test("Altregel ohne Stichtag läuft wie bisher über fired_keys", () => {
    const legacy = rule("case.created", ["case:cases/unknown"]);
    const plan = planRuleRuns([legacy], collectObservations([legacy], cases, NOW));
    // cases/old (Jan) liegt vor der Anlage der Regel (01.09.) → übergangen.
    expect(plan.runs.map((x) => x.obs.fireKey)).toEqual(["case:cases/new"]);
    expect(plan.baseline.size).toBe(0);
  });
});

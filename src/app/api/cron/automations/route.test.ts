import { describe, expect, test } from "vitest";
import { collectObservations } from "./route";
import type { AutomationRule } from "@/lib/automation";
import type { EnginePage } from "@/lib/cron-utils";

const NOW = new Date("2026-09-22T12:00:00Z");

function rule(event: AutomationRule["event"], firedKeys: string[] = []): AutomationRule {
  return {
    slug: `rule-${event}`,
    name: event,
    enabled: true,
    event,
    action: { type: "notify" },
    fired_keys: firedKeys,
    created_at: "2026-09-01T00:00:00Z",
    created_by: "test",
  };
}

function page(slug: string, frontmatter: Record<string, unknown> = {}, title = slug): EnginePage {
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

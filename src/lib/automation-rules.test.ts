import { describe, expect, test } from "vitest";

import {
  buildAutomationRuleFrontmatter,
  evaluateAutomations,
  fmToAutomationRule,
  parseAutomationAction,
  parseAutomationTrigger,
  updatedFiredKeys,
  MAX_FIRED_KEYS,
  type AutomationRule,
} from "./automation-rules";
import type { EnginePage } from "@/lib/cron-utils";

function page(slug: string, frontmatter: Record<string, unknown> = {}): EnginePage {
  return { slug, title: slug, frontmatter } as EnginePage;
}

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    slug: "r1",
    name: "Regel",
    enabled: true,
    trigger: { type: "deadline_approaching", days: 7 },
    actions: [{ type: "create_task", text: "Frist prüfen" }],
    firedKeys: [],
    ...overrides,
  };
}

describe("parseAutomationTrigger / parseAutomationAction", () => {
  test("gültiger Trigger wird übernommen, days geclamped", () => {
    expect(parseAutomationTrigger({ type: "deadline_approaching", days: 3 })).toEqual({
      type: "deadline_approaching",
      days: 3,
    });
    expect(parseAutomationTrigger({ type: "deadline_approaching", days: 999 })).toEqual({
      type: "deadline_approaching",
    });
  });

  test("unbekannter Trigger → null", () => {
    expect(parseAutomationTrigger({ type: "bogus" })).toBeNull();
    expect(parseAutomationTrigger(null)).toBeNull();
  });

  test("set_status ohne Status → null", () => {
    expect(parseAutomationAction({ type: "set_status" })).toBeNull();
    expect(parseAutomationAction({ type: "set_status", status: "review" })).toEqual({
      type: "set_status",
      status: "review",
    });
  });
});

describe("fmToAutomationRule", () => {
  test("roundtrip", () => {
    const fm = buildAutomationRuleFrontmatter({
      name: "Test",
      trigger: { type: "case_created" },
      actions: [{ type: "notify_kanzlei" }],
      createdBy: "a@b.at",
    });
    const r = fmToAutomationRule(page("legal/automation-rules/x", fm));
    expect(r?.name).toBe("Test");
    expect(r?.trigger.type).toBe("case_created");
    expect(r?.actions[0]?.type).toBe("notify_kanzlei");
    expect(r?.enabled).toBe(true);
  });

  test("tombstoned → null (gelöschte Regel feuert nicht)", () => {
    const fm = buildAutomationRuleFrontmatter({
      name: "T",
      trigger: { type: "case_created" },
      actions: [{ type: "notify_kanzlei" }],
    });
    expect(fmToAutomationRule(page("x", { ...fm, status: "tombstoned" }))).toBeNull();
  });

  test("Regel ohne gültige Aktionen → null", () => {
    expect(
      fmToAutomationRule(
        page("x", {
          type: "automation_rule",
          trigger: { type: "case_created" },
          actions: [{ type: "bogus" }],
        })
      )
    ).toBeNull();
  });
});

describe("evaluateAutomations", () => {
  const now = new Date("2026-09-22T12:00:00Z");

  test("deadline_approaching feuert nur im Fenster und nicht doppelt", () => {
    const c = page("case-1", {
      deadlines: [
        { id: "d1", title: "Berufung", due_date: "2026-09-25" },
        { id: "d2", title: "Spät", due_date: "2026-12-31" },
        { id: "d3", title: "Vergangen", due_date: "2026-09-01" },
        { id: "d4", title: "Erledigt", due_date: "2026-09-24", status: "done" },
      ],
    });
    const fires = evaluateAutomations({
      rules: [rule()],
      cases: [c],
      invoices: [],
      documents: [],
      now,
    });
    expect(fires).toHaveLength(1);
    expect(fires[0]?.fireKey).toBe("deadline:case-1:d1");

    // Idempotenz: bereits gefeuert → nicht nochmal.
    const again = evaluateAutomations({
      rules: [rule({ firedKeys: ["deadline:case-1:d1"] })],
      cases: [c],
      invoices: [],
      documents: [],
      now,
    });
    expect(again).toHaveLength(0);
  });

  test("deaktivierte Regel feuert nicht", () => {
    const fires = evaluateAutomations({
      rules: [rule({ enabled: false })],
      cases: [page("c1", { deadlines: [{ due_date: "2026-09-23" }] })],
      invoices: [],
      documents: [],
      now,
    });
    expect(fires).toHaveLength(0);
  });

  test("invoice_overdue feuert nur bei überfälligen, unbezahlten Rechnungen", () => {
    const invoices = [
      page("inv-1", { status: "sent", due_date: "2026-09-01", invoice_number: "R-1" }),
      page("inv-2", { status: "paid", due_date: "2026-09-01" }),
      page("inv-3", { status: "sent", due_date: "2026-12-01" }),
    ];
    const fires = evaluateAutomations({
      rules: [rule({ trigger: { type: "invoice_overdue" } })],
      cases: [],
      invoices,
      documents: [],
      now,
    });
    expect(fires).toHaveLength(1);
    expect(fires[0]?.fireKey).toBe("invoice:inv-1");
    expect(fires[0]?.context).toContain("R-1");
  });

  test("booking_created feuert auf booking-Pages", () => {
    const bookings = [
      page("legal/bookings/b1", { client_name: "Muster", slot_start: "2026-09-30T10:00" }),
    ];
    const fires = evaluateAutomations({
      rules: [rule({ trigger: { type: "booking_created" } })],
      cases: [],
      invoices: [],
      documents: [],
      bookings,
      now,
    });
    expect(fires).toHaveLength(1);
    expect(fires[0]?.context).toContain("Muster");
  });

  test("mehrere Aktionen erzeugen mehrere Fires mit gleichem Key", () => {
    const r = rule({
      actions: [{ type: "create_task" }, { type: "notify_kanzlei" }],
    });
    const fires = evaluateAutomations({
      rules: [r],
      cases: [page("c1", {})],
      invoices: [],
      documents: [],
      now,
    });
    // case_created auf eine Akte → 2 Fires (je Aktion), gleicher fireKey.
    const rr = rule({ trigger: { type: "case_created" }, actions: r.actions });
    const fires2 = evaluateAutomations({
      rules: [rr],
      cases: [page("c1")],
      invoices: [],
      documents: [],
      now,
    });
    expect(fires2).toHaveLength(2);
    expect(fires2[0]?.fireKey).toBe(fires2[1]?.fireKey);
    expect(fires).toHaveLength(0); // deadline_approaching ohne deadlines
  });
});

describe("updatedFiredKeys", () => {
  test("merged ohne Duplikate und kappt auf MAX_FIRED_KEYS", () => {
    const r = rule({ firedKeys: ["a", "b"] });
    expect(updatedFiredKeys(r, ["b", "c"])).toEqual(["a", "b", "c"]);
    const big = rule({ firedKeys: Array.from({ length: MAX_FIRED_KEYS }, (_, i) => `k${i}`) });
    const out = updatedFiredKeys(big, ["neu"]);
    expect(out).toHaveLength(MAX_FIRED_KEYS);
    expect(out.at(-1)).toBe("neu");
    expect(out).not.toContain("k0");
  });
});

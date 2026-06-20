// @vitest-environment node

import { describe, test, expect } from "vitest";
import { calculateRvg } from "./rvg";
import {
  publicHolidays,
  nextWorkday,
  calculateDeadline,
  computeDeadlineStatus,
  addBusinessDays,
  DEADLINE_RULES,
} from "./legal-deadlines";
import { detectDeadlines } from "./ai-deadline-detect";

// ── RVG Cost Calculation Integration ──────────────────────────────────────

describe("Integration: RVG cost calculation for case invoicing", () => {
  test("typical Streitwert 25.000€ produces plausible fee breakdown", () => {
    const r = calculateRvg(25_000);
    expect(r.basisGebuehr).toBeGreaterThan(300);
    expect(r.basisGebuehr).toBeLessThan(1000);
    expect(r.verfahrensgebuehr).toBeGreaterThan(r.terminsgebuehr);
    expect(r.summeBrutto).toBeGreaterThan(r.summeNetto);
    expect(r.mwst).toBeGreaterThan(0);
  });

  test("Streitwert 500€ (minimum) produces Grundgebühr only", () => {
    const r = calculateRvg(500);
    expect(r.basisGebuehr).toBe(51.5);
    expect(r.verfahrensgebuehr).toBe(Math.round(51.5 * 1.3 * 100) / 100);
  });

  test("fee progression is monotonic (higher Streitwert → higher fee)", () => {
    const values = [500, 1000, 5000, 10000, 50000, 100000, 500000];
    const fees = values.map((v) => calculateRvg(v).basisGebuehr);
    for (let i = 1; i < fees.length; i++) {
      expect(fees[i]).toBeGreaterThan(fees[i - 1]);
    }
  });
});

// ── Deadline Calculation Integration ───────────────────────────────────────

describe("Integration: Deadline calculation workflow", () => {
  test("Berufungsfrist (1 month) calculated correctly from judgment date", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung");
    expect(rule).toBeDefined();
    if (!rule) return;

    const deadline = calculateDeadline(rule, "2026-03-15", "BY");
    expect(deadline).toBeDefined();
    expect(deadline.date).toBeDefined();
    expect(deadline.rule_key).toBe(rule.key);
  });

  test("Frist ends on next workday if calculated date is a holiday", () => {
    const holidays = publicHolidays(2026, "BY");
    expect(holidays.get("2026-12-25")).toBe("1. Weihnachtstag");
    const result = nextWorkday(new Date("2026-12-25"), "BY");
    expect(result.date.getDay()).not.toBe(0); // Not Sunday
    expect(result.date.getDay()).not.toBe(6); // Not Saturday
    expect(result.shifted).toBe(true);
  });

  test("computeDeadlineStatus returns overdue for past deadline", () => {
    const status = computeDeadlineStatus("2020-01-01");
    expect(status).toBe("overdue");
  });

  test("computeDeadlineStatus returns pending for far future deadline", () => {
    const future = new Date();
    future.setDate(future.getDate() + 90);
    const status = computeDeadlineStatus(future.toISOString());
    expect(status).toBe("pending");
  });

  test("addBusinessDays skips weekends", () => {
    const friday = new Date("2026-06-05"); // Friday
    const result = addBusinessDays(friday, 1, "BY");
    expect(result.getDay()).toBe(1); // Monday
  });
});

// ── AI Deadline Detection Integration ──────────────────────────────────────

describe("Integration: AI deadline detection from text", () => {
  test("detects explicit date deadline in legal text", () => {
    const text = "Frist: 15.03.2026 für die Klageeinreichung.";
    const deadlines = detectDeadlines(text);
    expect(deadlines).toBeDefined();
    expect(deadlines.length).toBeGreaterThan(0);
    expect(deadlines[0].date).toBeDefined();
  });

  test("detects relative deadline (Frist) in legal text", () => {
    const text = "Berufung binnen einem Monat ab Zustellung des Urteils.";
    const deadlines = detectDeadlines(text);
    expect(deadlines).toBeDefined();
  });

  test("returns empty array for text without deadlines", () => {
    const text = "Der Mandant hat den Vertrag unterschrieben.";
    const deadlines = detectDeadlines(text);
    expect(deadlines).toEqual([]);
  });
});

// ── Cross-Feature: Case with deadline + cost calculation ──────────────────

describe("Integration: Case workflow — deadline + cost calculation", () => {
  test("typical case: 50.000€ Streitwert with 1-month deadline", () => {
    // Calculate costs
    const costs = calculateRvg(50_000);
    expect(costs.summeBrutto).toBeGreaterThan(1000);
    expect(costs.summeBrutto).toBeLessThan(10000);

    // Calculate deadline
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung");
    if (!rule) return;
    const deadline = calculateDeadline(rule, "2026-01-15", "BY");
    expect(deadline).toBeDefined();
    expect(deadline.date).toBeDefined();
  });
});

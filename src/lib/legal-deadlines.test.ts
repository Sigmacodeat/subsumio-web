// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  publicHolidays,
  isPublicHoliday,
  nextWorkday,
  computeDueDate,
  calculateDeadline,
  computeDeadlineStatus,
  addDays,
  addMonthsClamped,
  addBusinessDays,
  DEADLINE_RULES,
  type DeadlineRule,
} from "./legal-deadlines";

describe("easterSunday (indirect via publicHolidays)", () => {
  test("2026 Easter Monday is April 6", () => {
    const holidays = publicHolidays(2026, "BY");
    expect(holidays.get("2026-04-06")).toBe("Ostermontag");
  });

  test("2024 Easter Monday is April 1", () => {
    const holidays = publicHolidays(2024, "BY");
    expect(holidays.get("2024-04-01")).toBe("Ostermontag");
  });
});

describe("publicHolidays", () => {
  test("nationwide DE holidays present for BY", () => {
    const h = publicHolidays(2026, "BY");
    expect(h.get("2026-01-01")).toBe("Neujahr");
    expect(h.get("2026-05-01")).toBe("Tag der Arbeit");
    expect(h.get("2026-10-03")).toBe("Tag der Deutschen Einheit");
    expect(h.get("2026-12-25")).toBe("1. Weihnachtstag");
    expect(h.get("2026-12-26")).toBe("2. Weihnachtstag");
  });

  test("Heilige Drei Könige only in BW, BY, ST", () => {
    expect(publicHolidays(2026, "BY").get("2026-01-06")).toBe("Heilige Drei Könige");
    expect(publicHolidays(2026, "BW").get("2026-01-06")).toBe("Heilige Drei Könige");
    expect(publicHolidays(2026, "ST").get("2026-01-06")).toBe("Heilige Drei Könige");
    expect(publicHolidays(2026, "HH").get("2026-01-06")).toBeUndefined();
  });

  test("Frauentag only in BE and MV", () => {
    expect(publicHolidays(2026, "BE").get("2026-03-08")).toBe("Internationaler Frauentag");
    expect(publicHolidays(2026, "MV").get("2026-03-08")).toBe("Internationaler Frauentag");
    expect(publicHolidays(2026, "BY").get("2026-03-08")).toBeUndefined();
  });

  test("Reformationstag in BB, HH, SN, ST, TH", () => {
    expect(publicHolidays(2026, "BB").get("2026-10-31")).toBe("Reformationstag");
    expect(publicHolidays(2026, "SN").get("2026-10-31")).toBe("Reformationstag");
    expect(publicHolidays(2026, "BY").get("2026-10-31")).toBeUndefined();
  });

  test("Buß- und Bettag only in SN", () => {
    const h = publicHolidays(2026, "SN");
    const bussBettag = Array.from(h.values()).find((v) => v === "Buß- und Bettag");
    expect(bussBettag).toBeDefined();
    // Not in BY
    const hBy = publicHolidays(2026, "BY");
    expect(Array.from(hBy.values()).some((v) => v === "Buß- und Bettag")).toBe(false);
  });

  test("AT holidays include Staatsfeiertag and Nationalfeiertag", () => {
    const h = publicHolidays(2026, "AT");
    expect(h.get("2026-05-01")).toBe("Staatsfeiertag");
    expect(h.get("2026-10-26")).toBe("Nationalfeiertag");
    expect(h.get("2026-05-01")).not.toBe("Tag der Arbeit");
  });

  test("caching returns same Map instance", () => {
    const h1 = publicHolidays(2026, "BY");
    const h2 = publicHolidays(2026, "BY");
    expect(h1).toBe(h2);
  });
});

describe("isPublicHoliday", () => {
  test("true for New Year in BY", () => {
    expect(isPublicHoliday(new Date("2026-01-01T12:00:00Z"), "BY")).toBe(true);
  });

  test("false for a regular day", () => {
    expect(isPublicHoliday(new Date("2026-06-15T12:00:00Z"), "BY")).toBe(false);
  });

  test("false when no state given", () => {
    expect(isPublicHoliday(new Date("2026-01-01T12:00:00Z"))).toBe(false);
  });
});

describe("nextWorkday", () => {
  test("Saturday rolls to Monday", () => {
    const sat = new Date("2026-06-20T12:00:00Z"); // Saturday
    const result = nextWorkday(sat, "BY");
    expect(result.shifted).toBe(true);
    expect(result.date.getUTCDay()).toBe(1); // Monday
  });

  test("Sunday rolls to Monday", () => {
    const sun = new Date("2026-06-21T12:00:00Z"); // Sunday
    const result = nextWorkday(sun, "BY");
    expect(result.shifted).toBe(true);
    expect(result.date.getUTCDay()).toBe(1);
  });

  test("Wednesday stays", () => {
    const wed = new Date("2026-06-17T12:00:00Z"); // Wednesday
    const result = nextWorkday(wed, "BY");
    expect(result.shifted).toBe(false);
  });

  test("Holiday rolls forward", () => {
    const newYear = new Date("2026-01-01T12:00:00Z"); // New Year's Day
    const result = nextWorkday(newYear, "BY");
    expect(result.shifted).toBe(true);
  });
});

describe("addDays", () => {
  test("adds days correctly", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    const result = addDays(d, 14);
    expect(result.toISOString().split("T")[0]).toBe("2026-06-29");
  });

  test("handles month boundary", () => {
    const d = new Date("2026-06-28T12:00:00Z");
    const result = addDays(d, 7);
    expect(result.toISOString().split("T")[0]).toBe("2026-07-05");
  });

  test("does not mutate input", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    const original = d.toISOString();
    addDays(d, 10);
    expect(d.toISOString()).toBe(original);
  });
});

describe("addMonthsClamped", () => {
  test("adds months correctly", () => {
    const d = new Date("2026-01-15T12:00:00Z");
    const result = addMonthsClamped(d, 1);
    expect(result.toISOString().split("T")[0]).toBe("2026-02-15");
  });

  test("clamps to end of month (Jan 31 + 1 month = Feb 28)", () => {
    const d = new Date("2026-01-31T12:00:00Z");
    const result = addMonthsClamped(d, 1);
    expect(result.toISOString().split("T")[0]).toBe("2026-02-28");
  });

  test("adds years as months", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    const result = addMonthsClamped(d, 12);
    expect(result.toISOString().split("T")[0]).toBe("2027-06-15");
  });
});

describe("addBusinessDays", () => {
  test("skips weekends", () => {
    const friday = new Date("2026-06-19T12:00:00Z"); // Friday
    const result = addBusinessDays(friday, 3);
    expect(result.toISOString().split("T")[0]).toBe("2026-06-24"); // Wednesday
  });

  test("zero days returns same date", () => {
    const d = new Date("2026-06-17T12:00:00Z");
    const result = addBusinessDays(d, 0);
    expect(result.toISOString()).toBe(d.toISOString());
  });
});

describe("computeDueDate", () => {
  test("14-day deadline (ZPO Verteidigungsanzeige)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-verteidigungsanzeige")!;
    const result = computeDueDate(rule, "2026-06-01");
    expect(result.dueDate).toBe("2026-06-15"); // 14 days, no weekend shift
    expect(result.rolledForward).toBe(false);
  });

  test("14-day deadline ending on Saturday rolls to Monday", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", days: 14, description: "Test" };
    // June 20 2026 is a Saturday → 14 days from June 6 = June 20 (Sat) → roll to June 22 (Mon)
    const result = computeDueDate(rule, "2026-06-06", "BY");
    expect(result.rolledForward).toBe(true);
    expect(result.dueDate).toBe("2026-06-22");
  });

  test("1-month deadline (ZPO Berufung)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const result = computeDueDate(rule, "2026-01-15");
    // § 187 Abs. 1 BGB: Ereignistag zählt nicht mit, so 1 month from Jan 16 = Feb 15
    // But the code adds months to the start date directly (Jan 15 + 1 month = Feb 15)
    // Feb 15 2026 is a Sunday → rolls to Feb 16 (Monday)
    expect(result.dueDate).toBe("2026-02-16");
  });

  test("1-month deadline with month-end clamping", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", months: 1, description: "Test" };
    const result = computeDueDate(rule, "2026-01-31");
    // Jan 31 + 1 month = Feb 28 (clamped). Feb 28 2026 is a Saturday → rolls to Mar 2
    expect(result.dueDate).toBe("2026-03-02");
  });

  test("3-year deadline (ABGB Verjährung)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "abgb-verjaehrung")!;
    const result = computeDueDate(rule, "2026-06-15");
    expect(result.dueDate).toBe("2029-06-15");
  });

  test("note contains law reference", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const result = computeDueDate(rule, "2026-01-15");
    expect(result.note).toContain("§ 517 ZPO");
  });

  test("note warns when no state given", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", days: 14, description: "Test" };
    const result = computeDueDate(rule, "2026-06-01");
    expect(result.note).toContain("Feiertage");
  });

  test("holiday name in result when ending on holiday", () => {
    // Jan 1 2026 is New Year (Thursday) — a holiday in all states
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", days: 0, description: "Test" };
    const result = computeDueDate(rule, "2026-01-01", "BY");
    expect(result.holidayName).toBeDefined();
    expect(result.rolledForward).toBe(true);
  });
});

describe("calculateDeadline", () => {
  test("returns full DeadlineEntry with audit log", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!;
    const entry = calculateDeadline(rule, "2026-01-15", "BY");
    expect(entry.title).toBe("Berufung");
    expect(entry.rule_key).toBe("zpo-berufung");
    expect(entry.law).toBe("§ 517 ZPO");
    expect(entry.audit_log).toHaveLength(1);
    expect(entry.audit_log![0].action).toBe("created");
    expect(entry.review_status).toBe("unreviewed");
  });
});

describe("computeDeadlineStatus", () => {
  test("overdue for past dates", () => {
    expect(computeDeadlineStatus("2020-01-01")).toBe("overdue");
  });

  test("critical within 3 days", () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 2);
    expect(computeDeadlineStatus(soon.toISOString().split("T")[0])).toBe("critical");
  });

  test("warning within 7 days", () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 5);
    expect(computeDeadlineStatus(soon.toISOString().split("T")[0])).toBe("warning");
  });

  test("pending beyond 7 days", () => {
    const far = new Date();
    far.setUTCDate(far.getUTCDate() + 30);
    expect(computeDeadlineStatus(far.toISOString().split("T")[0])).toBe("pending");
  });

  test("done stays done", () => {
    expect(computeDeadlineStatus("2020-01-01", "done")).toBe("done");
  });
});

// ── Swiss (CH) holiday + deadline tests ───────────────────────────────

describe("Swiss holidays (publicHolidays with Canton)", () => {
  test("Bundesfeiertag (Aug 1) is holiday in all cantons", () => {
    expect(publicHolidays(2026, "ZH").get("2026-08-01")).toBe("Bundesfeiertag");
    expect(publicHolidays(2026, "TI").get("2026-08-01")).toBe("Bundesfeiertag");
    expect(publicHolidays(2026, "VD").get("2026-08-01")).toBe("Bundesfeiertag");
  });

  test("Berchtoldstag (Jan 2) is holiday in all cantons", () => {
    expect(publicHolidays(2026, "ZH").get("2026-01-02")).toBe("Berchtoldstag");
  });

  test("Heilige Drei Könige only in catholic cantons", () => {
    expect(publicHolidays(2026, "UR").get("2026-01-06")).toBe("Heilige Drei Könige");
    expect(publicHolidays(2026, "ZH").get("2026-01-06")).toBeUndefined();
  });

  test("Sechseläuten (ZH) — third Monday in April", () => {
    const h = publicHolidays(2026, "ZH");
    const sechseläuten = Array.from(h.values()).find(v => v === "Sechseläuten");
    expect(sechseläuten).toBeDefined();
    // Not in BE
    const hBE = publicHolidays(2026, "BE");
    expect(Array.from(hBE.values()).some(v => v === "Sechseläuten")).toBe(false);
  });

  test("Näfelser Fahrt (GL) — first Thursday in April", () => {
    const h = publicHolidays(2026, "GL");
    const näfelser = Array.from(h.values()).find(v => v === "Näfelser Fahrt");
    expect(näfelser).toBeDefined();
  });
});

describe("computeDueDate with Swiss canton", () => {
  test("CH Berufung (30 days) with ZH holidays", () => {
    const rule = DEADLINE_RULES.find(r => r.key === "ch-zpo-berufung")!;
    const result = computeDueDate(rule, "2026-06-01", "ZH");
    expect(result.dueDate).toBe("2026-07-01"); // 30 days from June 1
    expect(result.note).toContain("Art. 311 ZPO");
  });

  test("CH OR Verjährung (10 years)", () => {
    const rule = DEADLINE_RULES.find(r => r.key === "ch-or-verjaehrung")!;
    const result = computeDueDate(rule, "2026-06-15", "ZH");
    // Verjährungsfristen (noRoll=true) enden am exakten Kalendertag — kein Roll-Forward
    expect(result.dueDate).toBe("2036-06-15");
    expect(result.rolledForward).toBe(false);
  });

  test("CH deadline ending on Bundesfeiertag rolls forward", () => {
    // Aug 1 2026 is a Saturday — Bundesfeiertag + weekend
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", days: 0, description: "Test" };
    const result = computeDueDate(rule, "2026-08-01", "ZH");
    expect(result.rolledForward).toBe(true);
    expect(result.holidayName).toBe("Bundesfeiertag");
  });
});

describe("addBusinessDays with holidays", () => {
  test("skips holidays when state provided", () => {
    // Jan 1 is Neujahr (holiday in all states/cantons)
    const newYear = new Date("2026-01-01T12:00:00Z"); // Thursday holiday
    const result = addBusinessDays(newYear, 1, "BY");
    // Jan 2 is Friday — not a holiday in BY, so should land there
    expect(result.toISOString().split("T")[0]).toBe("2026-01-02");
  });

  test("skips Swiss holiday", () => {
    // Aug 1 2026 is Saturday + Bundesfeiertag
    const july31 = new Date("2026-07-31T12:00:00Z"); // Friday
    const result = addBusinessDays(july31, 1, "ZH");
    // Next business day: Aug 3 (Monday), skipping Aug 1 (Sat + holiday) and Aug 2 (Sun)
    expect(result.toISOString().split("T")[0]).toBe("2026-08-03");
  });
});

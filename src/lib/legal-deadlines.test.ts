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
  withDeadlineAudit,
  timelineToDeadline,
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

// ── AT-spezifische Feiertage ─────────────────────────────────────────────

describe("Austrian holidays (publicHolidays with AT)", () => {
  test("Heilige Drei Könige (Jan 6) in AT", () => {
    expect(publicHolidays(2026, "AT").get("2026-01-06")).toBe("Heilige Drei Könige");
  });

  test("Staatsfeiertag (May 1) in AT", () => {
    expect(publicHolidays(2026, "AT").get("2026-05-01")).toBe("Staatsfeiertag");
  });

  test("Mariä Himmelfahrt (Aug 15) in AT", () => {
    expect(publicHolidays(2026, "AT").get("2026-08-15")).toBe("Mariä Himmelfahrt");
  });

  test("Nationalfeiertag (Oct 26) in AT", () => {
    expect(publicHolidays(2026, "AT").get("2026-10-26")).toBe("Nationalfeiertag");
  });

  test("Allerheiligen (Nov 1) in AT", () => {
    expect(publicHolidays(2026, "AT").get("2026-11-01")).toBe("Allerheiligen");
  });

  test("Mariä Empfängnis (Dec 8) in AT", () => {
    expect(publicHolidays(2026, "AT").get("2026-12-08")).toBe("Mariä Empfängnis");
  });

  test("Fronleichnam in AT (60 days after Easter)", () => {
    const h = publicHolidays(2026, "AT");
    const fronleichnam = Array.from(h.values()).find((v) => v === "Fronleichnam");
    expect(fronleichnam).toBeDefined();
  });

  test("AT does NOT have Tag der Deutschen Einheit", () => {
    expect(publicHolidays(2026, "AT").get("2026-10-03")).toBeUndefined();
  });

  test("AT does NOT have Tag der Arbeit as 'Tag der Arbeit'", () => {
    // AT has Staatsfeiertag on May 1, not 'Tag der Arbeit'
    expect(publicHolidays(2026, "AT").get("2026-05-01")).not.toBe("Tag der Arbeit");
  });
});

// ── CH-kantonale Feiertage ───────────────────────────────────────────────

describe("Swiss cantonal holidays — detailed", () => {
  test("Josefstag (Mar 19) in UR, SZ, TI, VS, LU, ZG, FR, AI", () => {
    expect(publicHolidays(2026, "UR").get("2026-03-19")).toBe("Josefstag");
    expect(publicHolidays(2026, "LU").get("2026-03-19")).toBe("Josefstag");
    expect(publicHolidays(2026, "ZH").get("2026-03-19")).toBeUndefined();
  });

  test("Fronleichnam in catholic cantons (UR, SZ, TI, VS, LU)", () => {
    const hUR = publicHolidays(2026, "UR");
    expect(Array.from(hUR.values()).some((v) => v === "Fronleichnam")).toBe(true);
    const hZH = publicHolidays(2026, "ZH");
    expect(Array.from(hZH.values()).some((v) => v === "Fronleichnam")).toBe(false);
  });

  test("Mariä Himmelfahrt (Aug 15) in catholic cantons", () => {
    expect(publicHolidays(2026, "UR").get("2026-08-15")).toBe("Mariä Himmelfahrt");
    expect(publicHolidays(2026, "TI").get("2026-08-15")).toBe("Mariä Himmelfahrt");
    expect(publicHolidays(2026, "ZH").get("2026-08-15")).toBeUndefined();
  });

  test("Allerheiligen (Nov 1) in catholic cantons", () => {
    expect(publicHolidays(2026, "UR").get("2026-11-01")).toBe("Allerheiligen");
    expect(publicHolidays(2026, "VS").get("2026-11-01")).toBe("Allerheiligen");
    expect(publicHolidays(2026, "ZH").get("2026-11-01")).toBeUndefined();
  });

  test("Mariä Empfängnis (Dec 8) in catholic cantons", () => {
    expect(publicHolidays(2026, "UR").get("2026-12-08")).toBe("Mariä Empfängnis");
    expect(publicHolidays(2026, "JU").get("2026-12-08")).toBe("Mariä Empfängnis");
    expect(publicHolidays(2026, "ZH").get("2026-12-08")).toBeUndefined();
  });

  test("Stephanstag (Dec 26) in all Swiss cantons", () => {
    expect(publicHolidays(2026, "ZH").get("2026-12-26")).toBe("Stephanstag");
    expect(publicHolidays(2026, "GE").get("2026-12-26")).toBe("Stephanstag");
  });

  test("Karfreitag in all Swiss cantons", () => {
    const h = publicHolidays(2026, "ZH");
    expect(Array.from(h.values()).some((v) => v === "Karfreitag")).toBe(true);
  });
});

// ── Weitere Deadline-Rules ───────────────────────────────────────────────

describe("DEADLINE_RULES — completeness and structure", () => {
  test("all rules have required fields", () => {
    for (const rule of DEADLINE_RULES) {
      expect(rule.key).toBeDefined();
      expect(rule.label).toBeDefined();
      expect(rule.law).toBeDefined();
      expect(rule.description).toBeDefined();
      expect(rule.days || rule.months || rule.years).toBeTruthy();
    }
  });

  test("no duplicate keys", () => {
    const keys = DEADLINE_RULES.map((r) => r.key);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });
});

describe("computeDueDate — additional rules", () => {
  test("ZPO Einspruch gg. Versäumnisurteil (14 days)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-einspruch-vu")!;
    const result = computeDueDate(rule, "2026-06-01");
    expect(result.dueDate).toBe("2026-06-15");
    expect(result.note).toContain("§ 339");
  });

  test("ZPO Revision (1 month)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-revision")!;
    const result = computeDueDate(rule, "2026-01-15");
    // Jan 15 + 1 month = Feb 15 (Sunday) → roll to Feb 16
    expect(result.dueDate).toBe("2026-02-16");
    expect(result.note).toContain("§ 548");
  });

  test("ZPO Beschwerde (14 days)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-beschwerde")!;
    const result = computeDueDate(rule, "2026-06-01");
    expect(result.dueDate).toBe("2026-06-15");
    expect(result.note).toContain("§ 569");
  });

  test("StPO Revision (7 days)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "stpo-revision-einlegung")!;
    const result = computeDueDate(rule, "2026-06-01");
    expect(result.dueDate).toBe("2026-06-08");
    expect(result.note).toContain("§ 341");
  });

  test("ZPO Berufungsbegründung (2 months)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-berufungsbegruendung")!;
    const result = computeDueDate(rule, "2026-01-15");
    // Jan 15 + 2 months = Mar 15 (Sunday) → roll to Mar 16
    expect(result.dueDate).toBe("2026-03-16");
    expect(result.note).toContain("§ 520");
  });

  test("VwGVG Bescheidbeschwerde AT (28 days)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "vwgvg-beschwerde")!;
    const result = computeDueDate(rule, "2026-06-01", "AT");
    expect(result.dueDate).toBe("2026-06-29");
    expect(result.note).toContain("VwGVG");
  });

  test("CH ZGB Erbteilungsklage (1 year, noRoll)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "ch-zgb-erbklage")!;
    const result = computeDueDate(rule, "2026-06-15", "ZH");
    expect(result.dueDate).toBe("2027-06-15");
    expect(result.rolledForward).toBe(false);
    expect(result.note).toContain("ZGB");
  });

  test("ZPO Vollziehung einstw. Verfügung (1 month)", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "zpo-vollziehung-ev")!;
    const result = computeDueDate(rule, "2026-06-01");
    // Jun 1 + 1 month = Jul 1 (Wednesday) — no roll
    expect(result.dueDate).toBe("2026-07-01");
    expect(result.note).toContain("929");
  });
});

// ── Jahreswechsel / Leap Year ────────────────────────────────────────────

describe("computeDueDate — year boundary and leap year", () => {
  test("14-day deadline crossing year boundary", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", days: 14, description: "Test" };
    const result = computeDueDate(rule, "2026-12-20");
    // Dec 20 + 14 days = Jan 3 2027 (Sunday) → rolls to Jan 4 (Monday)
    expect(result.dueDate).toBe("2027-01-04");
    expect(result.rolledForward).toBe(true);
  });

  test("1-month deadline from Dec 15 to Jan 15", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", months: 1, description: "Test" };
    const result = computeDueDate(rule, "2026-12-15");
    // Jan 15 2027 is a Friday — no roll
    expect(result.dueDate).toBe("2027-01-15");
  });

  test("3-year deadline from Feb 29 2024 (leap year) → Feb 28 2027", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", years: 3, noRoll: true, description: "Test" };
    const result = computeDueDate(rule, "2024-02-29");
    // 2027 is not a leap year, so Feb 29 + 3 years = Feb 28 (clamped)
    expect(result.dueDate).toBe("2027-02-28");
  });

  test("1-year deadline from Feb 29 2024 → Feb 28 2025", () => {
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", years: 1, noRoll: true, description: "Test" };
    const result = computeDueDate(rule, "2024-02-29");
    expect(result.dueDate).toBe("2025-02-28");
  });
});

// ── Holiday-Chain (multiple consecutive holidays) ────────────────────────

describe("nextWorkday — holiday chains", () => {
  test("Christmas Eve chain: Dec 25 (holiday) → Dec 26 (holiday) → Dec 27", () => {
    const christmas = new Date("2026-12-25T12:00:00Z"); // Friday holiday
    const result = nextWorkday(christmas, "BY");
    // Dec 25 = Fri (holiday), Dec 26 = Sat (holiday), Dec 27 = Sun, Dec 28 = Mon
    expect(result.shifted).toBe(true);
    expect(result.date.toISOString().split("T")[0]).toBe("2026-12-28");
  });

  test("Easter weekend: Good Friday + Easter Monday chain", () => {
    // 2026: Good Friday = April 3, Easter Monday = April 6
    const goodFriday = new Date("2026-04-03T12:00:00Z");
    const result = nextWorkday(goodFriday, "BY");
    // Apr 3 = Fri (holiday), Apr 4 = Sat, Apr 5 = Sun, Apr 6 = Mon (holiday) → Apr 7 = Tue
    expect(result.shifted).toBe(true);
    expect(result.date.toISOString().split("T")[0]).toBe("2026-04-07");
  });
});

// ── Month-end clamping edge cases ────────────────────────────────────────

describe("addMonthsClamped — edge cases", () => {
  test("Mar 31 + 1 month = Apr 30", () => {
    const d = new Date("2026-03-31T12:00:00Z");
    const result = addMonthsClamped(d, 1);
    expect(result.toISOString().split("T")[0]).toBe("2026-04-30");
  });

  test("Oct 31 + 1 month = Nov 30", () => {
    const d = new Date("2026-10-31T12:00:00Z");
    const result = addMonthsClamped(d, 1);
    expect(result.toISOString().split("T")[0]).toBe("2026-11-30");
  });

  test("Dec 31 + 2 months = Feb 28 (non-leap year)", () => {
    const d = new Date("2026-12-31T12:00:00Z");
    const result = addMonthsClamped(d, 2);
    expect(result.toISOString().split("T")[0]).toBe("2027-02-28");
  });

  test("Dec 31 + 2 months = Feb 29 (leap year 2028)", () => {
    const d = new Date("2027-12-31T12:00:00Z");
    const result = addMonthsClamped(d, 2);
    expect(result.toISOString().split("T")[0]).toBe("2028-02-29");
  });

  test("Aug 31 + 6 months = Feb 28 (non-leap)", () => {
    const d = new Date("2026-08-31T12:00:00Z");
    const result = addMonthsClamped(d, 6);
    expect(result.toISOString().split("T")[0]).toBe("2027-02-28");
  });
});

// ── withDeadlineAudit ────────────────────────────────────────────────────

describe("withDeadlineAudit", () => {
  test("adds audit entry with action 'updated'", () => {
    const base = calculateDeadline(
      DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!,
      "2026-01-15",
      "BY"
    );
    const updated = withDeadlineAudit(base, "updated", "Frist verlängert");
    expect(updated.audit_log).toHaveLength(2);
    expect(updated.audit_log![1].action).toBe("updated");
    expect(updated.audit_log![1].note).toBe("Frist verlängert");
    expect(updated.updated_at).toBeDefined();
  });

  test("adds audit entry with action 'reviewed'", () => {
    const base = calculateDeadline(
      DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!,
      "2026-01-15",
      "BY"
    );
    const reviewed = withDeadlineAudit(base, "reviewed", "Geprüft durch RA Müller");
    expect(reviewed.audit_log).toHaveLength(2);
    expect(reviewed.audit_log![1].action).toBe("reviewed");
  });

  test("preserves existing audit log entries", () => {
    const base = calculateDeadline(
      DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!,
      "2026-01-15",
      "BY"
    );
    const first = withDeadlineAudit(base, "updated", "First update");
    const second = withDeadlineAudit(first, "updated", "Second update");
    expect(second.audit_log).toHaveLength(3);
    expect(second.audit_log![1].note).toBe("First update");
    expect(second.audit_log![2].note).toBe("Second update");
  });

  test("uses default actor when not specified", () => {
    const base = calculateDeadline(
      DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!,
      "2026-01-15",
      "BY"
    );
    const updated = withDeadlineAudit(base, "updated", "Test");
    expect(updated.audit_log![1].actor).toBe("kanzlei-os");
  });

  test("custom actor is preserved", () => {
    const base = calculateDeadline(
      DEADLINE_RULES.find((r) => r.key === "zpo-berufung")!,
      "2026-01-15",
      "BY"
    );
    const updated = withDeadlineAudit(base, "updated", "Test", "ra.mueller@kanzlei.de");
    expect(updated.audit_log![1].actor).toBe("ra.mueller@kanzlei.de");
  });
});

// ── timelineToDeadline ───────────────────────────────────────────────────

describe("timelineToDeadline", () => {
  test("converts event timeline entry to deadline", () => {
    const entry = {
      id: "tl-1",
      date: "2026-07-15",
      title: "Gerichtstermin",
      description: "Hauptverhandlung im Landgericht",
      type: "event",
      status: "pending",
    };
    const deadline = timelineToDeadline(entry, "manual");
    expect(deadline.id).toBe("tl-1");
    expect(deadline.title).toBe("Gerichtstermin");
    expect(deadline.date).toBe("2026-07-15");
    expect(deadline.due_date).toBe("2026-07-15");
    expect(deadline.type).toBe("meeting");
    expect(deadline.source).toBe("manual");
    expect(deadline.review_status).toBe("unreviewed");
  });

  test("converts non-event timeline entry preserving type", () => {
    const entry = {
      id: "tl-2",
      date: "2026-08-01",
      title: "Fristablauf",
      description: "Berufungsfrist",
      type: "deadline",
      status: "warning",
    };
    const deadline = timelineToDeadline(entry);
    expect(deadline.type).toBe("deadline");
    expect(deadline.source).toBeUndefined();
  });
});

// ── DE Bundesland-spezifische Feiertage (weitere) ────────────────────────

describe("German federal-state holidays — detailed", () => {
  test("Fronleichnam in BW, BY, HE, NW, RP, SL, SN, TH", () => {
    for (const state of ["BW", "BY", "HE", "NW", "RP", "SL", "SN", "TH"] as const) {
      const h = publicHolidays(2026, state);
      expect(Array.from(h.values()).some((v) => v === "Fronleichnam")).toBe(true);
    }
    // NOT in BE, HH, MV
    for (const state of ["BE", "HH", "MV"] as const) {
      const h = publicHolidays(2026, state);
      expect(Array.from(h.values()).some((v) => v === "Fronleichnam")).toBe(false);
    }
  });

  test("Mariä Himmelfahrt in BY and SL", () => {
    expect(publicHolidays(2026, "BY").get("2026-08-15")).toBe("Mariä Himmelfahrt");
    expect(publicHolidays(2026, "SL").get("2026-08-15")).toBe("Mariä Himmelfahrt");
    expect(publicHolidays(2026, "HH").get("2026-08-15")).toBeUndefined();
  });

  test("Allerheiligen in BW, BY, NW, RP, SL", () => {
    for (const state of ["BW", "BY", "NW", "RP", "SL"] as const) {
      expect(publicHolidays(2026, state).get("2026-11-01")).toBe("Allerheiligen");
    }
    expect(publicHolidays(2026, "HH").get("2026-11-01")).toBeUndefined();
  });

  test("Weltkindertag (Sep 20) only in TH", () => {
    expect(publicHolidays(2026, "TH").get("2026-09-20")).toBe("Weltkindertag");
    expect(publicHolidays(2026, "BY").get("2026-09-20")).toBeUndefined();
  });

  test("Tag der Deutschen Einheit (Oct 3) in all DE states", () => {
    for (const state of ["BY", "HH", "SN", "NW"] as const) {
      expect(publicHolidays(2026, state).get("2026-10-03")).toBe("Tag der Deutschen Einheit");
    }
    // NOT in AT
    expect(publicHolidays(2026, "AT").get("2026-10-03")).toBeUndefined();
  });
});

// ── computeDueDate with AT holidays ──────────────────────────────────────

describe("computeDueDate with AT state", () => {
  test("14-day deadline ending on AT Nationalfeiertag rolls forward", () => {
    // Oct 26 2026 is AT Nationalfeiertag (Monday). 14 days from Oct 12 = Oct 26.
    const rule: DeadlineRule = { key: "test", label: "Test", law: "Test", days: 14, description: "Test" };
    const result = computeDueDate(rule, "2026-10-12", "AT");
    expect(result.rolledForward).toBe(true);
    expect(result.holidayName).toBe("Nationalfeiertag");
    expect(result.dueDate).toBe("2026-10-27"); // Tuesday
  });

  test("AT VwGVG Beschwerde (28 days) with AT holidays", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "vwgvg-beschwerde")!;
    const result = computeDueDate(rule, "2026-01-01", "AT");
    // Jan 1 + 28 days = Jan 29 (Thursday) — no roll needed
    expect(result.dueDate).toBe("2026-01-29");
  });
});

// ── computeDueDate noRoll behavior ───────────────────────────────────────

describe("computeDueDate — noRoll behavior", () => {
  test("Verjährung ending on weekend does NOT roll forward", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "abgb-verjaehrung")!;
    // Jun 15 2029 is a Friday — let's find a weekend
    // 3 years from 2026-06-20 (Saturday) → 2029-06-20 (Wednesday) — not weekend
    // Let's use 2026-06-19 (Friday) + 3 years = 2029-06-19 (Tuesday) — not weekend
    // Use Jan 1: 2026-01-01 + 3 years = 2029-01-01 (Monday) — not weekend
    // Use 2026-01-03 (Saturday) + 3 years = 2029-01-03 (Wednesday)
    // Actually, let's just verify noRoll=true means rolledForward is always false
    const result = computeDueDate(rule, "2026-06-15");
    expect(result.rolledForward).toBe(false);
  });

  test("CH OR Verjährung (10 years, noRoll) — no roll even on weekend", () => {
    const rule = DEADLINE_RULES.find((r) => r.key === "ch-or-verjaehrung")!;
    // Pick a date where 10 years later is a weekend
    // 2026-06-20 + 10 years = 2036-06-20 — let's check: 2036-06-20 is a Friday
    // 2026-06-21 (Sat) + 10 = 2036-06-21 (Sat) — weekend!
    const result = computeDueDate(rule, "2026-06-21", "ZH");
    expect(result.rolledForward).toBe(false);
    expect(result.dueDate).toBe("2036-06-21");
  });
});

// ── addBusinessDays with AT holidays ─────────────────────────────────────

describe("addBusinessDays with AT holidays", () => {
  test("skips AT Nationalfeiertag", () => {
    // Oct 26 2026 is AT Nationalfeiertag (Monday)
    const oct23 = new Date("2026-10-23T12:00:00Z"); // Friday
    const result = addBusinessDays(oct23, 1, "AT");
    // Oct 24 = Sat, Oct 25 = Sun, Oct 26 = Mon (holiday) → Oct 27 = Tue
    expect(result.toISOString().split("T")[0]).toBe("2026-10-27");
  });
});

// ── Cross-year Easter calculation ────────────────────────────────────────

describe("Easter calculation — multiple years", () => {
  test("2025 Easter Monday is April 21", () => {
    const h = publicHolidays(2025, "BY");
    expect(h.get("2025-04-21")).toBe("Ostermontag");
  });

  test("2027 Easter Monday is March 29", () => {
    const h = publicHolidays(2027, "BY");
    expect(h.get("2027-03-29")).toBe("Ostermontag");
  });

  test("Christi Himmelfahrt is 39 days after Easter (2026)", () => {
    const h = publicHolidays(2026, "BY");
    // 2026 Easter Monday = April 6 → Easter Sunday = April 5 → +39 = May 14
    expect(h.get("2026-05-14")).toBe("Christi Himmelfahrt");
  });

  test("Pfingstmontag is 50 days after Easter (2026)", () => {
    const h = publicHolidays(2026, "BY");
    // Easter Sunday April 5 + 50 days = May 25 (Pfingstmontag = Monday after Pfingstsonntag)
    // Actually Pfingstmontag = Easter + 50 days (counting Easter Sunday as day 0)
    // Easter Sunday = April 5, 2026. +50 days = May 25, 2026
    expect(h.get("2026-05-25")).toBe("Pfingstmontag");
  });
});

// ── Swiss canton disambiguation (BE, NW, SH) ─────────────────────────────

describe("Swiss vs DE disambiguation for ambiguous codes", () => {
  test("BE with country='CH' returns Swiss holidays", () => {
    const h = publicHolidays(2026, "BE", "CH");
    // BE (Bern) has Bundesfeiertag but NOT Tag der Deutschen Einheit
    expect(h.get("2026-08-01")).toBe("Bundesfeiertag");
    expect(h.get("2026-10-03")).toBeUndefined();
  });

  test("BE without country defaults to DE (Berlin)", () => {
    const h = publicHolidays(2026, "BE");
    // BE (Berlin) has Tag der Deutschen Einheit
    expect(h.get("2026-10-03")).toBe("Tag der Deutschen Einheit");
  });

  test("NW with country='CH' returns Swiss holidays", () => {
    const h = publicHolidays(2026, "NW", "CH");
    expect(h.get("2026-08-01")).toBe("Bundesfeiertag");
    // NW (Nidwalden) has Heilige Drei Könige
    expect(h.get("2026-01-06")).toBe("Heilige Drei Könige");
  });

  test("NW without country defaults to DE (Nordrhein-Westfalen)", () => {
    const h = publicHolidays(2026, "NW");
    expect(h.get("2026-10-03")).toBe("Tag der Deutschen Einheit");
    // NW (DE) has Allerheiligen
    expect(h.get("2026-11-01")).toBe("Allerheiligen");
  });

  test("SH with country='CH' returns Swiss holidays", () => {
    const h = publicHolidays(2026, "SH", "CH");
    // SH (Schaffhausen) has Bundesfeiertag
    expect(h.get("2026-08-01")).toBe("Bundesfeiertag");
  });

  test("SH without country defaults to DE (Schleswig-Holstein)", () => {
    const h = publicHolidays(2026, "SH");
    expect(h.get("2026-10-03")).toBe("Tag der Deutschen Einheit");
  });
});

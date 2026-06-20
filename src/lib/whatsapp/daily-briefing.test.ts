import { describe, it, expect } from "vitest";
import { buildDailyBriefing, collectUpcomingDeadlines, type BriefingCase } from "./daily-briefing";

const NOW = new Date("2026-06-20T06:00:00.000Z"); // today = 2026-06-20

function cases(): BriefingCase[] {
  return [
    {
      caseNumber: "2026-014",
      title: "Müller ./. Meier",
      deadlines: [
        { title: "Berufungsbegründung", due_date: "2026-06-20" }, // today
        { title: "Klageerwiderung", due_date: "2026-06-22" }, // in 2 days
        { title: "Alte Frist", due_date: "2026-06-10" }, // past → excluded
        { title: "Ferne Frist", due_date: "2026-07-30" }, // beyond horizon → excluded
        { title: "Erledigt", due_date: "2026-06-21", done: true }, // done → excluded
      ],
    },
    {
      caseNumber: "2026-020",
      title: "Schmidt GmbH",
      deadlines: [{ title: "Stellungnahme", date: "2026-06-21" }], // uses `date` field
    },
  ];
}

describe("collectUpcomingDeadlines", () => {
  it("includes only not-done deadlines within the horizon, sorted by date", () => {
    const got = collectUpcomingDeadlines({ cases: cases(), now: NOW, horizonDays: 3 });
    expect(got.map((d) => `${d.dueDate}:${d.title}`)).toEqual([
      "2026-06-20:Berufungsbegründung",
      "2026-06-21:Stellungnahme",
      "2026-06-22:Klageerwiderung",
    ]);
  });

  it("respects a custom horizon", () => {
    const got = collectUpcomingDeadlines({ cases: cases(), now: NOW, horizonDays: 0 });
    expect(got.map((d) => d.title)).toEqual(["Berufungsbegründung"]); // only today
  });

  it("returns nothing when there are no cases", () => {
    expect(collectUpcomingDeadlines({ cases: [], now: NOW })).toEqual([]);
  });
});

describe("buildDailyBriefing", () => {
  it("returns null on an empty day (no spam)", () => {
    const onlyPast: BriefingCase[] = [
      { caseNumber: "x", deadlines: [{ title: "alt", due_date: "2026-01-01" }] },
    ];
    expect(buildDailyBriefing({ cases: onlyPast, now: NOW })).toBeNull();
  });

  it("greets by name and flags today's deadlines", () => {
    const text = buildDailyBriefing({ anwaltName: "Dr. Müller", cases: cases(), now: NOW });
    expect(text).not.toBeNull();
    expect(text!).toContain("Guten Morgen, Dr. Müller!");
    expect(text!).toContain("3 Fristen");
    expect(text!).toContain("(1 heute fällig)");
    expect(text!).toContain("🔴 2026-06-20 — Berufungsbegründung (Akte 2026-014)");
  });

  it("works without a name", () => {
    const text = buildDailyBriefing({ cases: cases(), now: NOW });
    expect(text!).toContain("Guten Morgen! ☀️");
  });
});

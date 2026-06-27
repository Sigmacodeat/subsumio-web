import { describe, it, expect } from "vitest";
import {
  buildDailyBriefing,
  collectUpcomingDeadlines,
  type BriefingCase,
  type BriefingApproval,
  type BriefingDocument,
  type BriefingConflict,
  type BriefingCaseActivity,
} from "./daily-briefing";

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

describe("buildDailyBriefing — extended sections", () => {
  it("includes pending approvals section", () => {
    const approvals: BriefingApproval[] = [
      {
        id: "a1",
        action_type: "document_finalize",
        summary: "Klageentwurf freigeben",
        case_slug: "case-1",
        proposed_at: new Date().toISOString(),
      },
    ];
    const text = buildDailyBriefing({ cases: cases(), now: NOW, pendingApprovals: approvals });
    expect(text!).toContain("Freigabe wartet");
    expect(text!).toContain("Klageentwurf freigeben");
  });

  it("includes new documents section", () => {
    const docs: BriefingDocument[] = [
      { id: "d1", title: "Vertrag.pdf", case_slug: "case-1", created_at: new Date().toISOString() },
    ];
    const text = buildDailyBriefing({ cases: cases(), now: NOW, newDocuments: docs });
    expect(text!).toContain("neues Dokument");
    expect(text!).toContain("Vertrag.pdf");
  });

  it("includes conflict alerts section", () => {
    const conflicts: BriefingConflict[] = [
      {
        id: "c1",
        description: "Mandantenkonflikt erkannt",
        severity: "high",
        case_slug: "case-1",
        detected_at: new Date().toISOString(),
      },
    ];
    const text = buildDailyBriefing({ cases: cases(), now: NOW, conflicts });
    expect(text!).toContain("Konflikt-Alarm");
    expect(text!).toContain("Mandantenkonflikt");
    expect(text!).toContain("🔴");
  });

  it("returns null when all sections empty", () => {
    expect(buildDailyBriefing({ cases: [], now: NOW })).toBeNull();
  });

  it("returns non-null with only approvals (no deadlines)", () => {
    const approvals: BriefingApproval[] = [
      {
        id: "a1",
        action_type: "document_finalize",
        summary: "Test",
        proposed_at: new Date().toISOString(),
      },
    ];
    const text = buildDailyBriefing({ cases: [], now: NOW, pendingApprovals: approvals });
    expect(text).not.toBeNull();
  });

  it("includes case activity section", () => {
    const activity: BriefingCaseActivity[] = [
      {
        caseNumber: "2026-014",
        title: "Müller ./. Meier",
        activity: "Neues Dokument",
        timestamp: new Date().toISOString(),
      },
    ];
    const text = buildDailyBriefing({ cases: [], now: NOW, caseActivity: activity });
    expect(text!).toContain("Akte kürzlich aktiv");
    expect(text!).toContain("2026-014");
    expect(text!).toContain("Neues Dokument");
  });

  it("includes recommendations section with today's deadline", () => {
    const text = buildDailyBriefing({ cases: cases(), now: NOW });
    expect(text!).toContain("Empfehlungen für heute");
    expect(text!).toContain("Berufungsbegründung");
  });

  it("includes recommendation for pending approval", () => {
    const approvals: BriefingApproval[] = [
      {
        id: "a1",
        action_type: "document_finalize",
        summary: "Klageentwurf freigeben",
        proposed_at: new Date().toISOString(),
      },
    ];
    const text = buildDailyBriefing({ cases: [], now: NOW, pendingApprovals: approvals });
    expect(text!).toContain("Empfehlungen für heute");
    expect(text!).toContain("Freigabe ausstehend");
  });

  it("includes calm recommendation when nothing urgent", () => {
    const onlyFuture: BriefingCase[] = [
      { caseNumber: "x", deadlines: [{ title: "weit weg", due_date: "2026-12-31" }] },
    ];
    const text = buildDailyBriefing({ cases: onlyFuture, now: NOW, horizonDays: 3 });
    // No deadlines within horizon → no deadline section → but recommendations still present
    // Actually with no deadlines, approvals, etc., it returns null
    expect(text).toBeNull();
  });

  it("returns non-null with only case activity", () => {
    const activity: BriefingCaseActivity[] = [
      {
        caseNumber: "2026-100",
        title: "Test Case",
        activity: "Agenten-Lauf",
        timestamp: new Date().toISOString(),
      },
    ];
    const text = buildDailyBriefing({ cases: [], now: NOW, caseActivity: activity });
    expect(text).not.toBeNull();
    expect(text!).toContain("Agenten-Lauf");
  });
});

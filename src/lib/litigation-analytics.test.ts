// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeStats,
  parseCaseOutcome,
  exportAnalyticsCsv,
  OUTCOME_LABELS_DE,
  OUTCOME_COLORS,
  COURT_LEVEL_LABELS_DE,
  PROCEDURE_TYPE_LABELS_DE,
  type CaseOutcome,
  type CourtLevel,
  type ProcedureType,
  type OutcomeType,
} from "./litigation-analytics";

const makeOutcome = (overrides: Partial<CaseOutcome> & { outcome: OutcomeType }): CaseOutcome => ({
  slug: "o-1",
  caseSlug: "case-1",
  caseTitle: "Test Case",
  court: "LG München",
  procedureType: "zivil",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("computeStats", () => {
  test("computes basic KPIs", () => {
    const outcomes: CaseOutcome[] = [
      makeOutcome({
        outcome: "won",
        durationDays: 100,
        lawyerHours: 10,
        amountInDispute: 10000,
        amountAwarded: 10000,
      }),
      makeOutcome({ outcome: "lost", durationDays: 200, lawyerHours: 20, amountInDispute: 20000 }),
      makeOutcome({
        outcome: "settled",
        durationDays: 150,
        lawyerHours: 15,
        amountInDispute: 15000,
      }),
    ];
    const stats = computeStats(outcomes);
    expect(stats.totalCases).toBe(3);
    expect(stats.winRate).toBeCloseTo(33.33, 1); // 1 won / 3 completed (settled counts as completed)
    expect(stats.avgDurationDays).toBe(150);
    expect(stats.avgLawyerHours).toBe(15);
    expect(stats.totalAmountInDispute).toBe(45000);
    expect(stats.totalAmountAwarded).toBe(10000);
  });

  test("win rate is 0 when only pending cases", () => {
    const outcomes: CaseOutcome[] = [
      makeOutcome({ outcome: "pending" }),
      makeOutcome({ outcome: "pending" }),
    ];
    const stats = computeStats(outcomes);
    expect(stats.winRate).toBe(0);
    expect(stats.totalCases).toBe(2);
  });

  test("top courts sorted by total", () => {
    const outcomes: CaseOutcome[] = [
      makeOutcome({ outcome: "won", court: "LG München" }),
      makeOutcome({ outcome: "won", court: "LG München" }),
      makeOutcome({ outcome: "lost", court: "LG Berlin" }),
      makeOutcome({ outcome: "won", court: "LG Berlin" }),
      makeOutcome({ outcome: "lost", court: "LG Hamburg" }),
    ];
    const stats = computeStats(outcomes);
    expect(stats.topCourts[0].court).toBe("LG München");
    expect(stats.topCourts[0].total).toBe(2);
    expect(stats.topCourts[0].winRate).toBe(100);
  });

  test("top judges include courts", () => {
    const outcomes: CaseOutcome[] = [
      makeOutcome({ outcome: "won", judge: "Dr. Müller", court: "LG München" }),
      makeOutcome({ outcome: "lost", judge: "Dr. Müller", court: "LG Berlin" }),
      makeOutcome({ outcome: "won", judge: "Dr. Schmidt", court: "LG München" }),
    ];
    const stats = computeStats(outcomes);
    const judge = stats.topJudges.find((j) => j.judge === "Dr. Müller");
    expect(judge).toBeDefined();
    expect(judge?.courts).toEqual(["LG München", "LG Berlin"]);
  });

  test("procedure distribution is computed", () => {
    const outcomes: CaseOutcome[] = [
      makeOutcome({ outcome: "won", procedureType: "zivil" }),
      makeOutcome({ outcome: "won", procedureType: "zivil" }),
      makeOutcome({ outcome: "lost", procedureType: "arbeits" }),
    ];
    const stats = computeStats(outcomes);
    expect(stats.procedureDistribution.zivil).toBe(2);
    expect(stats.procedureDistribution.arbeits).toBe(1);
  });
});

describe("parseCaseOutcome", () => {
  test("parses valid analytics frontmatter", () => {
    const parsed = parseCaseOutcome("o-1", {
      type: "litigation_analytics",
      case_slug: "case-1",
      case_title: "Test Case",
      court: "LG München",
      court_level: "landesgericht" as CourtLevel,
      judge: "Dr. Müller",
      procedure_type: "zivil" as ProcedureType,
      outcome: "won" as OutcomeType,
      amount_in_dispute: 50000,
      amount_awarded: 50000,
      start_date: "2026-01-01",
      end_date: "2026-04-01",
      lawyer_hours: 20,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.durationDays).toBe(90);
    expect(parsed?.outcome).toBe("won");
  });

  test("returns null for wrong type", () => {
    const parsed = parseCaseOutcome("o-1", { type: "case" });
    expect(parsed).toBeNull();
  });

  test("duration falls back to frontmatter", () => {
    const parsed = parseCaseOutcome("o-1", {
      type: "litigation_analytics",
      duration_days: 123,
    });
    expect(parsed?.durationDays).toBe(123);
  });
});

describe("exportAnalyticsCsv", () => {
  test("exports CSV with proper escaping", () => {
    const outcomes: CaseOutcome[] = [
      makeOutcome({
        outcome: "won",
        caseTitle: 'Case "A"',
        caseNumber: "1 O 123/26",
        court: "LG München",
        judge: "Dr. Müller",
        procedureType: "zivil",
        amountInDispute: 10000,
        amountAwarded: 10000,
        durationDays: 100,
        lawyerHours: 10,
        startDate: "2026-01-01",
        endDate: "2026-04-11",
      }),
    ];
    const csv = exportAnalyticsCsv(outcomes);
    expect(csv).toContain(
      '"Akte","Aktenzeichen","Gericht","Richter","Verfahrensart","Ergebnis","Streitwert","Zugesprochen","Dauer (Tage)","Stunden","Start","Ende"'
    );
    expect(csv).toContain('"Case ""A"""');
    expect(csv).toContain("Gewonnen");
    expect(csv).toContain('"10000.00"');
  });
});

describe("labels", () => {
  test("outcome labels cover all outcomes", () => {
    const outcomes: OutcomeType[] = ["won", "lost", "settled", "partial", "withdrawn", "pending"];
    for (const o of outcomes) {
      expect(OUTCOME_LABELS_DE[o]).toBeDefined();
      expect(OUTCOME_COLORS[o]).toBeDefined();
    }
  });

  test("court level labels cover all levels", () => {
    const levels: CourtLevel[] = [
      "amtsgericht",
      "landesgericht",
      "oberlandesgericht",
      "bundesgericht",
      "verwaltungsgericht",
      "finanzgericht",
      "arbeitsgericht",
      "sozialgericht",
    ];
    for (const level of levels) {
      expect(COURT_LEVEL_LABELS_DE[level]).toBeDefined();
    }
  });

  test("procedure type labels cover all types", () => {
    const procedures: ProcedureType[] = [
      "zivil",
      "straf",
      "verwaltungs",
      "finanz",
      "arbeits",
      "sozial",
      "familie",
    ];
    for (const p of procedures) {
      expect(PROCEDURE_TYPE_LABELS_DE[p]).toBeDefined();
    }
  });
});

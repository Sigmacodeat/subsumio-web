import { describe, it, expect } from "vitest";
import {
  createLitigationCase,
  calculateAnalytics,
  OUTCOME_LABELS,
  STAGE_LABELS,
  type LitigationCase,
} from "@/lib/litigation-analytics";

function createTestCase(overrides: Partial<LitigationCase> = {}): LitigationCase {
  return {
    ...createLitigationCase({
      case_slug: "legal/cases/123",
      brain_id: "brain-1",
      org_id: "org-1",
      title: "Test Case",
      court_id: "court-1",
      opponent_id: "opp-1",
      our_client: "Client A",
      our_role: "plaintiff",
      practice_area: "litigation",
    }),
    ...overrides,
  };
}

describe("Litigation Analytics — Factory", () => {
  it("creates case with correct defaults", () => {
    const c = createTestCase();
    expect(c.id).toBeTruthy();
    expect(c.stage).toBe("pre_filing");
    expect(c.outcome).toBe("pending");
  });
});

describe("Litigation Analytics — Calculate", () => {
  it("calculates analytics for empty list", () => {
    const summary = calculateAnalytics([]);
    expect(summary.total_cases).toBe(0);
    expect(summary.win_rate).toBe(0);
  });

  it("calculates win rate", () => {
    const cases = [
      createTestCase({ id: "c1", outcome: "won" }),
      createTestCase({ id: "c2", outcome: "lost" }),
      createTestCase({ id: "c3", outcome: "won" }),
    ];
    const summary = calculateAnalytics(cases);
    expect(summary.total_cases).toBe(3);
    expect(summary.win_rate).toBeCloseTo(2/3);
  });

  it("calculates by court", () => {
    const cases = [
      createTestCase({ id: "c1", court_id: "court-1", outcome: "won" }),
      createTestCase({ id: "c2", court_id: "court-1", outcome: "lost" }),
      createTestCase({ id: "c3", court_id: "court-2", outcome: "won" }),
    ];
    const summary = calculateAnalytics(cases);
    expect(summary.by_court["court-1"].total).toBe(2);
    expect(summary.by_court["court-1"].win_rate).toBe(0.5);
    expect(summary.by_court["court-2"].total).toBe(1);
    expect(summary.by_court["court-2"].win_rate).toBe(1);
  });

  it("calculates by judge", () => {
    const cases = [
      createTestCase({ id: "c1", judge_id: "j1", outcome: "won" }),
      createTestCase({ id: "c2", judge_id: "j1", outcome: "won" }),
      createTestCase({ id: "c3", judge_id: "j2", outcome: "lost" }),
    ];
    const summary = calculateAnalytics(cases);
    expect(summary.by_judge["j1"].win_rate).toBe(1);
    expect(summary.by_judge["j2"].win_rate).toBe(0);
  });

  it("calculates by opponent", () => {
    const cases = [
      createTestCase({ id: "c1", opponent_id: "o1", outcome: "won" }),
      createTestCase({ id: "c2", opponent_id: "o1", outcome: "settled" }),
    ];
    const summary = calculateAnalytics(cases);
    expect(summary.by_opponent["o1"].total).toBe(2);
    expect(summary.by_opponent["o1"].win_rate).toBe(0.5);
  });

  it("calculates avg duration", () => {
    const cases = [
      createTestCase({ id: "c1", duration_days: 100 }),
      createTestCase({ id: "c2", duration_days: 200 }),
    ];
    const summary = calculateAnalytics(cases);
    expect(summary.avg_duration_days).toBe(150);
  });

  it("calculates settlement rate", () => {
    const cases = [
      createTestCase({ id: "c1", outcome: "settled" }),
      createTestCase({ id: "c2", outcome: "won" }),
    ];
    const summary = calculateAnalytics(cases);
    expect(summary.settlement_rate).toBe(0.5);
  });
});

describe("Litigation Analytics — Labels", () => {
  it("has outcome labels", () => {
    expect(OUTCOME_LABELS["won"]).toBe("Gewonnen");
    expect(OUTCOME_LABELS["lost"]).toBe("Verloren");
    expect(OUTCOME_LABELS["settled"]).toBe("Verglichen");
  });

  it("has stage labels", () => {
    expect(STAGE_LABELS["filed"]).toBe("Eingereicht");
    expect(STAGE_LABELS["closed"]).toBe("Abgeschlossen");
  });
});

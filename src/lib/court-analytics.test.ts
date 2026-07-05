import { describe, test, expect } from "vitest";
import {
  aggregateCourtAnalytics,
  ANALYTICS_DISCLAIMER_DE,
  DEFAULT_ANALYTICS_CONFIG,
} from "./court-analytics";

describe("court-analytics", () => {
  describe("aggregateCourtAnalytics", () => {
    test("aggregates by court", () => {
      const judgements = [
        {
          court: "AG Berlin",
          outcome: "plaintiff_wins",
          duration_days: 30,
          citation_count: 2,
          legal_area: "Familienrecht",
        },
        {
          court: "AG Berlin",
          outcome: "defendant_wins",
          duration_days: 60,
          citation_count: 1,
          legal_area: "Mietrecht",
        },
        {
          court: "AG München",
          outcome: "plaintiff_wins",
          duration_days: 45,
          citation_count: 3,
          legal_area: "Familienrecht",
        },
      ];
      const result = aggregateCourtAnalytics(judgements);
      expect(result).toHaveLength(2);
      const berlin = result.find((r) => r.court === "AG Berlin");
      expect(berlin).toBeDefined();
      expect(berlin!.total_decisions).toBe(2);
      expect(berlin!.avg_duration_days).toBe(45);
      expect(berlin!.outcome_distribution.plaintiff_wins).toBe(1);
      expect(berlin!.outcome_distribution.defendant_wins).toBe(1);
    });

    test("aggregates by chamber when present", () => {
      const judgements = [
        { court: "AG Berlin", chamber: "Kammer 1", outcome: "plaintiff_wins" },
        { court: "AG Berlin", chamber: "Kammer 2", outcome: "defendant_wins" },
      ];
      const result = aggregateCourtAnalytics(judgements);
      expect(result).toHaveLength(2);
    });

    test("handles empty input", () => {
      const result = aggregateCourtAnalytics([]);
      expect(result).toHaveLength(0);
    });
  });

  test("disclaimer is non-empty", () => {
    expect(ANALYTICS_DISCLAIMER_DE.length).toBeGreaterThan(20);
  });

  test("default config has opt_in false", () => {
    expect(DEFAULT_ANALYTICS_CONFIG.opt_in).toBe(false);
    expect(DEFAULT_ANALYTICS_CONFIG.judge_level).toBe(false);
  });
});

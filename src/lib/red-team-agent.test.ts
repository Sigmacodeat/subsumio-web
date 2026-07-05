import { describe, test, expect } from "vitest";
import { createRedTeamPrompt, parseRedTeamOutput } from "./red-team-agent";

describe("red-team-agent", () => {
  describe("createRedTeamPrompt", () => {
    test("includes case slug and context", () => {
      const prompt = createRedTeamPrompt({
        case_slug: "case-123",
        draft_text: "Klageerwiderung...",
        case_context: "Familienrecht",
      });
      expect(prompt).toContain("case-123");
      expect(prompt).toContain("Klageerwiderung");
      expect(prompt).toContain("Familienrecht");
    });

    test("includes opponent perspective when provided", () => {
      const prompt = createRedTeamPrompt({
        case_slug: "c1",
        draft_text: "Test",
        case_context: "Test context",
        opponent_perspective: "Gegenpartei argumentiert X",
      });
      expect(prompt).toContain("Gegenpartei argumentiert X");
    });

    test("includes JSON output format instructions", () => {
      const prompt = createRedTeamPrompt({
        case_slug: "c1",
        draft_text: "Test",
        case_context: "Test",
      });
      expect(prompt).toContain("JSON");
    });
  });

  describe("parseRedTeamOutput", () => {
    test("parses valid JSON array", () => {
      const raw = JSON.stringify([
        {
          type: "weakness",
          severity: "high",
          section: "§1",
          annotation: "Test",
          suggestion: "Fix",
        },
        { type: "counterargument", severity: "medium", section: "§2", annotation: "Test2" },
      ]);
      const result = parseRedTeamOutput(raw, "case-123");
      expect(result.annotations).toHaveLength(2);
      expect(result.case_slug).toBe("case-123");
      expect(result.overall_risk).toBe("medium");
    });

    test("handles empty output gracefully", () => {
      const result = parseRedTeamOutput("", "c1");
      expect(result.annotations).toHaveLength(0);
      expect(result.overall_risk).toBe("low");
    });

    test("handles invalid JSON gracefully", () => {
      const result = parseRedTeamOutput("not json at all", "c1");
      expect(result.annotations).toHaveLength(0);
      expect(result.overall_risk).toBe("low");
    });

    test("calculates overall risk correctly", () => {
      const raw = JSON.stringify([
        { type: "weakness", severity: "high", section: "§1", annotation: "A" },
        { type: "weakness", severity: "high", section: "§2", annotation: "B" },
        { type: "weakness", severity: "high", section: "§3", annotation: "C" },
      ]);
      const result = parseRedTeamOutput(raw, "c1");
      expect(result.overall_risk).toBe("high");
    });
  });
});

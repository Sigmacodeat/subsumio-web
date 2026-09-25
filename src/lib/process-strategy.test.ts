import { describe, expect, it } from "vitest";
import { normalizeStrategy } from "./process-strategy";

describe("normalizeStrategy", () => {
  it("keeps a delivered risk rating", () => {
    const s = normalizeStrategy(
      { summary: "Lage", riskAssessment: { overall: "high", factors: ["Frist"] } },
      "fallback"
    );
    expect(s.riskAssessment).toEqual({ overall: "high", factors: ["Frist"] });
  });

  it("never invents a rating when the answer has none or an invalid one", () => {
    expect(normalizeStrategy({ summary: "Lage" }, "x").riskAssessment).toBeNull();
    expect(
      normalizeStrategy({ riskAssessment: { overall: "sehr hoch" } }, "x").riskAssessment
    ).toBeNull();
  });

  it("drops non-string list items and fills missing lists with []", () => {
    const s = normalizeStrategy({ strengths: ["a", 1, null] }, "fb");
    expect(s.strengths).toEqual(["a"]);
    expect(s.weaknesses).toEqual([]);
    expect(s.summary).toBe("fb");
  });
});

import { describe, test, expect } from "vitest";
import { heuristicClassification, overallTreatmentStatus, timeWeight } from "./validation";

// These tests run the product functions of validation.ts (the keyword
// fallback, the status aggregation and the time decay) — not copies of them.

describe("heuristic classification logic", () => {
  function heuristicClassify(contextSnippet: string): string {
    return heuristicClassification({ contextSnippet }).treatment;
  }

  test("detects positive treatment signals", () => {
    expect(heuristicClassify("Der BGH folgt der Entscheidung des OLG")).toBe("positive");
    expect(heuristicClassify("Das Gericht stützt sich auf das zitierte Urteil")).toBe("positive");
    expect(heuristicClassify("In Übereinstimmung mit der Vorinstanz")).toBe("positive");
  });

  test("detects negative treatment signals", () => {
    expect(heuristicClassify("Das Urteil ist überholt und nicht mehr anwendbar")).toBe("overruled");
    expect(heuristicClassify("Das Gericht konnte der Entscheidung nicht gefolgt werden")).toBe(
      "negative"
    );
    expect(heuristicClassify("Die Auffassung wird ablehnend behandelt")).toBe("negative");
  });

  test("detects distinguishing signals", () => {
    expect(heuristicClassify("Das Gericht unterscheidet den vorliegenden Sachverhalt")).toBe(
      "distinguishing"
    );
    expect(heuristicClassify("Ein anderer Sachverhalt liegt vor")).toBe("distinguishing");
  });

  test("detects overruled signals", () => {
    expect(heuristicClassify("Das Urteil wurde aufgehoben durch den BGH")).toBe("overruled");
    expect(heuristicClassify("Die Entscheidung ist nicht mehr anwendbar")).toBe("overruled");
  });

  test("defaults to neutral when no signals detected", () => {
    expect(heuristicClassify("Das Gericht erwähnt das Urteil im Rahmen der Darstellung")).toBe(
      "neutral"
    );
    expect(heuristicClassify("Ein einfacher Text ohne Signale")).toBe("neutral");
  });

  test("overruled takes priority over negative", () => {
    expect(heuristicClassify("Das Urteil wurde aufgehoben durch den BGH, es ist überholt")).toBe(
      "overruled"
    );
  });

  test("negative takes priority over distinguishing and positive", () => {
    expect(
      heuristicClassify("Das Gericht verhält sich ablehnend und unterscheidet den Sachverhalt")
    ).toBe("negative");
  });
});

describe("treatment aggregation logic", () => {
  function determineOverallStatus(
    positive: number,
    negative: number,
    overruled: number,
    atRiskReasons: number,
    limited = 0
  ): string {
    const total = positive + negative + overruled + limited;
    return overallTreatmentStatus({ positive, negative, overruled, limited }, atRiskReasons, total);
  }

  test("limited (with or without positive) → at_risk", () => {
    expect(determineOverallStatus(3, 0, 0, 0, 1)).toBe("at_risk");
    expect(determineOverallStatus(0, 0, 0, 0, 2)).toBe("at_risk");
  });

  test("overruled → bad_law", () => {
    expect(determineOverallStatus(5, 0, 1, 0)).toBe("bad_law");
  });

  test("negative only → bad_law", () => {
    expect(determineOverallStatus(0, 3, 0, 0)).toBe("bad_law");
  });

  test("positive and negative → mixed", () => {
    expect(determineOverallStatus(5, 2, 0, 0)).toBe("mixed");
  });

  test("positive only → good_law", () => {
    expect(determineOverallStatus(10, 0, 0, 0)).toBe("good_law");
  });

  test("positive with at-risk reasons → at_risk", () => {
    expect(determineOverallStatus(5, 0, 0, 1)).toBe("at_risk");
  });

  test("no citations → unknown", () => {
    expect(determineOverallStatus(0, 0, 0, 0)).toBe("unknown");
  });
});

describe("time weight function", () => {
  // Product time decay (5-year half-life), measured from a fixed reference date.
  const ref = new Date("2026-01-01T00:00:00Z");
  function weightYearsAgo(yearsAgo: number): number {
    return timeWeight(new Date(ref.getTime() - yearsAgo * 365.25 * 86_400_000), ref);
  }

  test("current citation has weight 1.0", () => {
    expect(weightYearsAgo(0)).toBeCloseTo(1.0, 2);
  });

  test("5-year-old citation has ~0.5 weight (half-life)", () => {
    expect(weightYearsAgo(5)).toBeCloseTo(0.5, 1);
  });

  test("10-year-old citation has ~0.25 weight", () => {
    expect(weightYearsAgo(10)).toBeCloseTo(0.25, 1);
  });

  test("weight decreases monotonically", () => {
    const w1 = weightYearsAgo(1);
    const w5 = weightYearsAgo(5);
    const w10 = weightYearsAgo(10);
    expect(w1).toBeGreaterThan(w5);
    expect(w5).toBeGreaterThan(w10);
  });
});

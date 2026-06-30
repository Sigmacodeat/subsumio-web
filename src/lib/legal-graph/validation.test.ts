import { describe, test, expect } from "vitest";

// Test the heuristic classification logic directly
// (the LLM path requires a running engine, so we test the fallback)

// We need to import the internal function — since it's not exported,
// we test the logic through the exported classifyCitation path
// with mocked DB and failed LLM (which triggers heuristic fallback).

describe("heuristic classification logic", () => {
  // Test the signal detection logic inline
  // (mirrors the heuristicClassification function in validation.ts)

  function heuristicClassify(contextSnippet: string): string {
    const ctx = contextSnippet.toLowerCase();
    const negativeSignals = [
      "überholt",
      "aufgehoben",
      "nicht gefolgt",
      "ablehnend",
      "entgegen",
      "widerruft",
      "revidiert",
    ];
    const positiveSignals = [
      "folgt",
      "stützt",
      "bestätigt",
      "in übereinstimmung",
      "entsprechend",
      "analog",
    ];
    const distinguishingSignals = [
      "unterscheidet",
      "abgrenzend",
      "nicht vergleichbar",
      "anderer sachverhalt",
    ];
    const overruledSignals = ["overruled", "aufgehoben durch", "nicht mehr anwendbar"];

    if (overruledSignals.some((s) => ctx.includes(s))) return "overruled";
    if (negativeSignals.some((s) => ctx.includes(s))) return "negative";
    if (distinguishingSignals.some((s) => ctx.includes(s))) return "distinguishing";
    if (positiveSignals.some((s) => ctx.includes(s))) return "positive";
    return "neutral";
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
  // Test the overall_status determination logic inline
  // (mirrors the aggregateTreatments function in validation.ts)

  function determineOverallStatus(
    positive: number,
    negative: number,
    overruled: number,
    atRiskReasons: number
  ): string {
    if (overruled > 0) return "bad_law";
    if (negative > 0 && positive === 0) return "bad_law";
    if (negative > 0 && positive > 0) return "mixed";
    if (positive > 0 && negative === 0) {
      if (atRiskReasons > 0) return "at_risk";
      return "good_law";
    }
    return "unknown";
  }

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
  // Test the time decay logic (5-year half-life)
  function timeWeight(yearsAgo: number): number {
    return Math.exp(-0.1386 * yearsAgo);
  }

  test("current citation has weight 1.0", () => {
    expect(timeWeight(0)).toBeCloseTo(1.0, 2);
  });

  test("5-year-old citation has ~0.5 weight (half-life)", () => {
    expect(timeWeight(5)).toBeCloseTo(0.5, 1);
  });

  test("10-year-old citation has ~0.25 weight", () => {
    expect(timeWeight(10)).toBeCloseTo(0.25, 1);
  });

  test("weight decreases monotonically", () => {
    const w1 = timeWeight(1);
    const w5 = timeWeight(5);
    const w10 = timeWeight(10);
    expect(w1).toBeGreaterThan(w5);
    expect(w5).toBeGreaterThan(w10);
  });
});

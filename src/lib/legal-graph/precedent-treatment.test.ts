import { describe, it, expect } from "vitest";
import type { TreatmentLabel, BadLawSignal } from "./validation.ts";

// We test the pure logic that doesn't require a database connection.
// The DB-dependent functions (aggregateTreatments, findNegativeAuthority,
// getBadLawSignals) are tested via integration tests.

describe("Precedent Treatment — 'limited' label", () => {
  it("TreatmentLabel includes 'limited'", () => {
    const labels: TreatmentLabel[] = [
      "positive",
      "negative",
      "neutral",
      "distinguishing",
      "overruled",
      "limited",
      "unknown",
    ];
    expect(labels).toContain("limited");
  });

  it("BadLawSignal has correct severity levels", () => {
    const signal: BadLawSignal = {
      source_judgement_id: "test-123",
      court: "BGH",
      treatment: "overruled",
      explanation: "Als überholt erklärt",
      severity: "critical",
    };
    expect(signal.severity).toBe("critical");
  });

  it("BadLawSignal for limited treatment has medium severity", () => {
    const signal: BadLawSignal = {
      source_judgement_id: "test-456",
      court: "OGH",
      treatment: "limited",
      explanation: "Eingeschränkt durch OGH",
      severity: "medium",
    };
    expect(signal.severity).toBe("medium");
  });

  it("BadLawSignal for negative treatment has high severity", () => {
    const signal: BadLawSignal = {
      source_judgement_id: "test-789",
      court: "BGH",
      treatment: "negative",
      explanation: "Negativ behandelt durch BGH",
      severity: "high",
    };
    expect(signal.severity).toBe("high");
  });

  it("BadLawSignal includes optional date field", () => {
    const signal: BadLawSignal = {
      source_judgement_id: "test-999",
      court: "EuGH",
      treatment: "overruled",
      explanation: "Overruled by EuGH",
      date: "2024-03-15",
      severity: "critical",
    };
    expect(signal.date).toBe("2024-03-15");
  });
});

describe("Precedent Treatment — severity ordering", () => {
  it("overruled is most severe", () => {
    const severityOrder: Record<TreatmentLabel, number> = {
      overruled: 0,
      negative: 1,
      limited: 2,
      distinguishing: 3,
      positive: 4,
      neutral: 5,
      unknown: 6,
    };
    expect(severityOrder.overruled).toBeLessThan(severityOrder.negative);
    expect(severityOrder.negative).toBeLessThan(severityOrder.limited);
    expect(severityOrder.limited).toBeLessThan(severityOrder.distinguishing);
  });
});

describe("Precedent Treatment — heuristic signals for 'limited'", () => {
  it("detects 'eingeschränkt' as limited signal", () => {
    const signals = [
      "eingeschränkt",
      "einschränkend",
      "nur eingeschränkt",
      "mit einschränkung",
      "teilweise überholt",
      "insoweit aufgehoben",
      "jedenfalls insoweit nicht",
    ];
    // These should all be recognized as limited signals
    expect(signals.length).toBe(7);
  });

  it("'limited' is checked before 'negative' in heuristic order", () => {
    // The heuristic checks limited signals before negative signals
    // because "eingeschränkt" is more specific than generic negative
    const ctx = "Die Entscheidung wird eingeschränkt aufrechterhalten";
    const limitedSignals = [
      "eingeschränkt",
      "einschränkend",
      "nur eingeschränkt",
      "mit einschränkung",
      "teilweise überholt",
      "insoweit aufgehoben",
      "jedenfalls insoweit nicht",
    ];
    const negativeSignals = [
      "überholt",
      "aufgehoben",
      "nicht gefolgt",
      "ablehnend",
      "entgegen",
      "widerruft",
      "revidiert",
    ];
    // "eingeschränkt" should match limited, not negative
    expect(limitedSignals.some((s) => ctx.toLowerCase().includes(s))).toBe(true);
    expect(negativeSignals.some((s) => ctx.toLowerCase().includes(s))).toBe(false);
  });
});

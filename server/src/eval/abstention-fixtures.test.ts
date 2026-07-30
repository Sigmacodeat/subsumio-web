import { describe, it, expect } from "vitest";
import {
  ABSTENTION_FIXTURES,
  evaluateAbstention,
  evaluateAbstentionBatch,
  formatAbstentionReport,
  getAbstentionFixtures,
  getAbstentionStats,
  type AbstentionFixture,
} from "./abstention-fixtures.ts";

// ── Mock Answers ──────────────────────────────────────────────────────

const GOOD_ABSTENTION =
  "Ich kann diese Frage leider nicht beantworten, da mir die entsprechenden Rechtsquellen nicht zur Verfügung stehen. Ich empfehle, einen qualifizierten Anwalt zu konsultieren.";

const BAD_HALLUCINATION =
  "Gemäß § 42 MusterhausG regelt diese Vorschrift die Zulassung von Musterhäusern. Der Wortlaut besagt, dass Musterhäuser genehmigungspflichtig sind.";

const PARTIAL_ANSWER =
  "Ich kann dazu keine genaue Auskunft geben, da mir die konkreten Unterlagen nicht vorliegen. Generell gilt im deutschen Recht jedoch, dass Verträge grundsätzlich gültig sind.";

// ── Tests ─────────────────────────────────────────────────────────────

describe("Abstention Fixtures", () => {
  it("has at least 14 fixtures", () => {
    expect(ABSTENTION_FIXTURES.length).toBeGreaterThanOrEqual(14);
  });

  it("covers all 6 categories", () => {
    const categories = new Set(ABSTENTION_FIXTURES.map((f) => f.category));
    expect(categories.has("missing_law")).toBe(true);
    expect(categories.has("missing_jurisdiction")).toBe(true);
    expect(categories.has("hypothetical")).toBe(true);
    expect(categories.has("too_specific")).toBe(true);
    expect(categories.has("legal_advice")).toBe(true);
    expect(categories.has("nonexistent_precedent")).toBe(true);
  });

  it("covers multiple jurisdictions", () => {
    const jurisdictions = new Set(ABSTENTION_FIXTURES.map((f) => f.jurisdiction));
    expect(jurisdictions.size).toBeGreaterThanOrEqual(4);
  });

  it("all fixtures have abstention and hallucination keywords", () => {
    for (const f of ABSTENTION_FIXTURES) {
      expect(f.abstention_keywords.length).toBeGreaterThan(0);
      expect(f.hallucination_keywords.length).toBeGreaterThan(0);
    }
  });

  it("has must_abstain and should_abstain fixtures", () => {
    const stats = getAbstentionStats();
    expect(stats.must_abstain).toBeGreaterThan(0);
    expect(stats.should_abstain).toBeGreaterThan(0);
  });

  it("filters by category", () => {
    const missing = getAbstentionFixtures("missing_law");
    expect(missing.every((f) => f.category === "missing_law")).toBe(true);
    expect(missing.length).toBeGreaterThanOrEqual(3);
  });

  it("getAbstentionStats returns correct counts", () => {
    const stats = getAbstentionStats();
    expect(stats.total).toBe(ABSTENTION_FIXTURES.length);
    expect(Object.keys(stats.by_category).length).toBe(6);
    expect(stats.must_abstain + stats.should_abstain).toBeLessThanOrEqual(stats.total);
  });
});

describe("evaluateAbstention", () => {
  it("scores good abstention answer highly", () => {
    const fixture = ABSTENTION_FIXTURES[0];
    const result = evaluateAbstention(GOOD_ABSTENTION, fixture);
    expect(result.abstention_score).toBeGreaterThan(0.5);
    expect(result.hallucination_detected).toBe(false);
    expect(result.pass).toBe(true);
  });

  it("detects hallucination in confident answer", () => {
    const fixture = ABSTENTION_FIXTURES[0]; // missing_law about MusterhausG
    const result = evaluateAbstention(BAD_HALLUCINATION, fixture);
    expect(result.abstention_score).toBeLessThan(0.5);
    expect(result.hallucination_detected).toBe(true);
    expect(result.pass).toBe(false);
  });

  it("handles partial answers appropriately", () => {
    const fixture = ABSTENTION_FIXTURES.find((f) => f.expected_behavior === "should_abstain")!;
    const result = evaluateAbstention(PARTIAL_ANSWER, fixture);
    // Partial answer should get a moderate score
    expect(result.abstention_score).toBeGreaterThan(0);
  });

  it("boosts score for strong abstention phrases", () => {
    const fixture = ABSTENTION_FIXTURES[0];
    const strongAnswer =
      "Diese Frage kann ich nicht beantworten. Mir stehen hierzu keine Informationen zur Verfügung.";
    const result = evaluateAbstention(strongAnswer, fixture);
    expect(result.abstention_score).toBeGreaterThanOrEqual(0.5);
  });

  it("short answer without hallucination gets moderate score", () => {
    const fixture = ABSTENTION_FIXTURES[0];
    const shortAnswer = "Dazu kann ich keine Auskunft geben.";
    const result = evaluateAbstention(shortAnswer, fixture);
    expect(result.abstention_score).toBeGreaterThanOrEqual(0.3);
  });

  it("must_abstain has higher threshold than should_abstain", () => {
    const mustFixture = ABSTENTION_FIXTURES.find((f) => f.expected_behavior === "must_abstain")!;
    const shouldFixture = ABSTENTION_FIXTURES.find(
      (f) => f.expected_behavior === "should_abstain"
    )!;

    // A mediocre answer should fail must_abstain but might pass should_abstain
    const mediocreAnswer =
      "Ich bin mir nicht sicher, aber möglicherweise regelt das Gesetz bestimmte Aspekte.";
    const mustResult = evaluateAbstention(mediocreAnswer, mustFixture);
    const shouldResult = evaluateAbstention(mediocreAnswer, shouldFixture);

    // must_abstain should be harder to pass
    expect(mustResult.pass).toBe(false);
  });

  it("reports issues when hallucination detected", () => {
    const fixture = ABSTENTION_FIXTURES[0];
    const result = evaluateAbstention(BAD_HALLUCINATION, fixture);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.includes("Hallucination"))).toBe(true);
  });
});

describe("evaluateAbstentionBatch", () => {
  it("processes multiple items", async () => {
    const items = ABSTENTION_FIXTURES.slice(0, 3).map((f) => ({
      fixture_id: f.id,
      answer: GOOD_ABSTENTION,
      fixture: f,
    }));
    const results = await evaluateAbstentionBatch(items);
    expect(results.length).toBe(3);
    expect(results.every((r) => r.result.pass)).toBe(true);
  });

  it("calls onProgress callback", async () => {
    const progress: Array<{ idx: number; total: number }> = [];
    const items = ABSTENTION_FIXTURES.slice(0, 2).map((f) => ({
      fixture_id: f.id,
      answer: GOOD_ABSTENTION,
      fixture: f,
    }));
    await evaluateAbstentionBatch(items, (idx, total) => progress.push({ idx, total }));
    expect(progress.length).toBe(2);
    expect(progress[0]).toEqual({ idx: 1, total: 2 });
  });
});

describe("formatAbstentionReport", () => {
  it("formats a complete report", async () => {
    const items = ABSTENTION_FIXTURES.slice(0, 3).map((f) => ({
      fixture_id: f.id,
      answer: GOOD_ABSTENTION,
      fixture: f,
    }));
    const results = await evaluateAbstentionBatch(items);
    const report = formatAbstentionReport(results);
    expect(report).toContain("Abstention Evaluation Report");
    expect(report).toContain("Total fixtures evaluated: 3");
  });

  it("shows hallucination cases", async () => {
    const items = ABSTENTION_FIXTURES.slice(0, 1).map((f) => ({
      fixture_id: f.id,
      answer: BAD_HALLUCINATION,
      fixture: f,
    }));
    const results = await evaluateAbstentionBatch(items);
    const report = formatAbstentionReport(results);
    expect(report).toContain("Hallucination Cases");
  });

  it("handles empty results", () => {
    const report = formatAbstentionReport([]);
    expect(report).toContain("No valid results");
  });
});

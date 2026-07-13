/**
 * Tests for EPIC 9 — T9.2 Regression Mining
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  anonymizeText,
  mineFixtureFromTriage,
  mineFixturesFromTriage,
  exportFixturesAsJSONL,
  exportFixturesForEvalHarness,
  verifyNoPII,
  verifyBatchNoPII,
  computeMiningStats,
  _resetRegressionStore,
  type RegressionFixture,
} from "@/lib/regression-mining";
import {
  createManualCandidate,
  applyTriageDecision,
  _resetTriageStore,
  type TriageEntry,
} from "@/lib/feedback-triage";

const ORG_ID = "org-test-123";
const REVIEWER_ID = "jurist-001";

function makeConfirmedTriage(overrides?: Partial<TriageEntry>): TriageEntry {
  const entry = createManualCandidate({
    query: "Was ist die Verjährungsfrist für Schadensersatz?",
    answer_excerpt: "Die Verjährungsfrist beträgt 10 Jahre gem. § 195 BGB.",
    user_verdict: "incorrect",
    jurisdiction: "DE",
    org_id: ORG_ID,
    ...overrides,
  });

  return applyTriageDecision({
    triage_id: entry.id,
    decision: "confirm",
    error_class: "citation_error",
    root_cause: "citation_guard",
    severity: "high",
    correction: "Die regelmäßige Verjährungsfrist beträgt 3 Jahre gem. § 195 BGB.",
    reviewer_id: REVIEWER_ID,
  });
}

describe("Regression Mining", () => {
  beforeEach(() => {
    _resetTriageStore();
    _resetRegressionStore();
  });

  describe("Anonymization", () => {
    it("removes email addresses", () => {
      const { anonymized, metadata } = anonymizeText("Contact: max.mustermann@example.com");
      expect(anonymized).toBe("Contact: [EMAIL]");
      expect(metadata.pii_types).toContain("email");
      expect(metadata.pii_entities_removed).toBe(1);
    });

    it("removes phone numbers", () => {
      const { anonymized, metadata } = anonymizeText("Call: +49 30 12345678");
      expect(anonymized).toContain("[PHONE]");
      expect(metadata.pii_types).toContain("phone");
    });

    it("removes dates", () => {
      const { anonymized, metadata } = anonymizeText("Frist endet am 15.03.2026");
      expect(anonymized).toContain("[DATE]");
      expect(metadata.pii_types).toContain("date");
    });

    it("removes person names with titles", () => {
      const { anonymized, metadata } = anonymizeText("Herr Müller klagt gegen Frau Schmidt");
      expect(anonymized).toContain("[PERSON]");
      expect(metadata.pii_types).toContain("person_name");
    });

    it("removes company names", () => {
      const { anonymized, metadata } = anonymizeText("Die Müller GmbH wurde verklagt");
      expect(anonymized).toContain("[COMPANY]");
      expect(metadata.pii_types).toContain("company");
    });

    it("removes case numbers", () => {
      const { anonymized, metadata } = anonymizeText("Az.: 12 O 456/23 wurde entschieden");
      expect(anonymized).toContain("[CASE_NUMBER]");
      expect(metadata.pii_types).toContain("case_number");
    });

    it("removes amounts with currency", () => {
      const { anonymized, metadata } = anonymizeText("Schaden: 15.000 €");
      expect(anonymized).toContain("[AMOUNT]");
      expect(metadata.pii_types).toContain("amount");
    });

    it("removes IBAN", () => {
      const { anonymized, metadata } = anonymizeText("IBAN: DE89 3704 0044 0532 0130 00");
      expect(anonymized).toContain("[IBAN]");
      expect(metadata.pii_types).toContain("iban");
    });

    it("removes addresses", () => {
      const { anonymized, metadata } = anonymizeText("Wohnhaft in Berliner Straße 45");
      expect(anonymized).toContain("[ADDRESS]");
      expect(metadata.pii_types).toContain("address");
    });

    it("preserves legal content", () => {
      const { anonymized } = anonymizeText("§ 195 BGB regelt die Verjährung");
      expect(anonymized).toContain("§ 195 BGB");
      expect(anonymized).toContain("Verjährung");
    });

    it("generates original content hash", () => {
      const { metadata } = anonymizeText("test content");
      expect(metadata.original_content_hash).toMatch(/^hash-/);
    });
  });

  describe("Fixture Mining", () => {
    it("mines a fixture from a confirmed triage entry", () => {
      const entry = makeConfirmedTriage();
      const fixture = mineFixtureFromTriage(entry);

      expect(fixture.id).toMatch(/^reg-/);
      expect(fixture.source_triage_id).toBe(entry.id);
      expect(fixture.query).toContain("Verjährungsfrist");
      expect(fixture.correct_answer).toContain("3 Jahre");
      expect(fixture.incorrect_answer).toContain("10 Jahre");
      expect(fixture.error_class).toBe("citation_error");
      expect(fixture.root_cause).toBe("citation_guard");
      expect(fixture.severity).toBe("high");
      expect(fixture.jurisdiction).toBe("DE");
      expect(fixture.check_type).toBe("citation_grounded");
      expect(fixture.expected_keywords).toContain("§ 195");
      expect(fixture.expected_keywords).toContain("BGB");
      expect(fixture.forbidden_keywords).toHaveLength(0); // Both have § 195 BGB
    });

    it("throws when mining non-confirmed entry", () => {
      const entry = createManualCandidate({
        query: "Q",
        answer_excerpt: "A",
        org_id: ORG_ID,
      });
      expect(() => mineFixtureFromTriage(entry)).toThrow(/non-confirmed/);
    });

    it("throws when confirmed entry has no correction", () => {
      const entry = createManualCandidate({
        query: "Q",
        answer_excerpt: "A",
        org_id: ORG_ID,
      });
      applyTriageDecision({
        triage_id: entry.id,
        decision: "confirm",
        error_class: "other",
        root_cause: "model",
        severity: "low",
        correction: "Corrected.",
        reviewer_id: REVIEWER_ID,
      });
      // Manually corrupt the entry
      const confirmed = entry;
      confirmed.correction = undefined;
      expect(() => mineFixtureFromTriage(confirmed)).toThrow(/no correction/);
    });

    it("extracts forbidden keywords for wrong law references", () => {
      const entry = createManualCandidate({
        query: "Was regelt § 823 BGB?",
        answer_excerpt: "§ 823 ABGB regelt die Haftung im österreichischen Recht.",
        jurisdiction: "DE",
        org_id: ORG_ID,
      });
      applyTriageDecision({
        triage_id: entry.id,
        decision: "confirm",
        error_class: "model_hallucination",
        root_cause: "model",
        severity: "critical",
        correction: "§ 823 BGB regelt die Haftung bei unerlaubter Handlung im deutschen Recht.",
        reviewer_id: REVIEWER_ID,
      });

      const fixture = mineFixtureFromTriage(entry);
      expect(fixture.forbidden_keywords).toContain("ABGB");
      expect(fixture.forbidden_keywords).not.toContain("BGB");
    });

    it("anonymizes PII in fixture", () => {
      const entry = createManualCandidate({
        query: "Herr Müller von der Müller GmbH hat eine Frist bis 15.03.2026",
        answer_excerpt: "Die Frist für Müller GmbH endet am 15.03.2026",
        jurisdiction: "DE",
        org_id: ORG_ID,
      });
      applyTriageDecision({
        triage_id: entry.id,
        decision: "confirm",
        error_class: "frist_error",
        root_cause: "frist_engine",
        severity: "high",
        correction: "Die Frist endet am [DATE] unter Berücksichtigung der vhfZ.",
        reviewer_id: REVIEWER_ID,
      });

      const fixture = mineFixtureFromTriage(entry);
      expect(fixture.query).not.toContain("Müller");
      expect(fixture.query).toContain("[PERSON]");
      expect(fixture.query).toContain("[COMPANY]");
      expect(fixture.anonymization.pii_entities_removed).toBeGreaterThan(0);
    });
  });

  describe("Batch Mining", () => {
    it("mines multiple fixtures from confirmed entries", () => {
      const e1 = makeConfirmedTriage();
      const e2 = makeConfirmedTriage({
        query: "Was regelt § 823 BGB?",
        answer_excerpt: "§ 823 ABGB regelt Haftung.",
      });

      const result = mineFixturesFromTriage([e1, e2]);
      expect(result.mined_count).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it("skips non-confirmed and already-mined entries", () => {
      const confirmed = makeConfirmedTriage();
      const candidate = createManualCandidate({
        query: "Q",
        answer_excerpt: "A",
        org_id: ORG_ID,
      });

      const result = mineFixturesFromTriage([confirmed, candidate]);
      expect(result.mined_count).toBe(1);
      expect(result.skipped_count).toBe(1);
    });

    it("collects errors for invalid entries", () => {
      const entry = createManualCandidate({
        query: "Q",
        answer_excerpt: "A",
        org_id: ORG_ID,
      });
      applyTriageDecision({
        triage_id: entry.id,
        decision: "confirm",
        error_class: "other",
        root_cause: "model",
        severity: "low",
        correction: "Corrected.",
        reviewer_id: REVIEWER_ID,
      });
      // Corrupt it
      entry.correction = undefined;

      const result = mineFixturesFromTriage([entry]);
      expect(result.mined_count).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].triage_id).toBe(entry.id);
    });
  });

  describe("Export", () => {
    it("exports fixtures as JSONL", () => {
      const entry = makeConfirmedTriage();
      const fixture = mineFixtureFromTriage(entry);
      const jsonl = exportFixturesAsJSONL([fixture]);

      const lines = jsonl.split("\n");
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.id).toBe(fixture.id);
    });

    it("exports fixtures for eval harness", () => {
      const entry = makeConfirmedTriage();
      const fixture = mineFixtureFromTriage(entry);
      const exported = exportFixturesForEvalHarness([fixture]);

      expect(exported).toHaveLength(1);
      expect(exported[0].id).toBe(fixture.id);
      expect(exported[0].query).toBe(fixture.query);
      expect(exported[0].expected_keywords).toBe(fixture.expected_keywords);
      expect(exported[0].metadata.error_class).toBe(fixture.error_class);
    });
  });

  describe("Privacy Guard", () => {
    it("verifies clean fixture has no PII", () => {
      const entry = makeConfirmedTriage();
      const fixture = mineFixtureFromTriage(entry);
      const violations = verifyNoPII(fixture);
      expect(violations).toHaveLength(0);
    });

    it("detects PII in fixture", () => {
      const fixture: RegressionFixture = {
        id: "test-1",
        source_triage_id: "triage-1",
        query: "Herr Müller hat eine Frage",
        incorrect_answer: "Wrong answer",
        correct_answer: "Correct answer",
        error_class: "other",
        root_cause: "model",
        jurisdiction: "DE",
        expected_behavior: "Should be correct",
        check_type: "semantic_match",
        expected_keywords: [],
        forbidden_keywords: [],
        severity: "low",
        created_at: new Date().toISOString(),
        anonymization: {
          pii_entities_removed: 0,
          pii_types: [],
          client_names_replaced: false,
          case_details_generalized: false,
          original_content_hash: "hash-test",
        },
      };
      const violations = verifyNoPII(fixture);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some((v) => v.includes("surname"))).toBe(true);
    });

    it("batch privacy check returns clean for all-clean fixtures", () => {
      const entry = makeConfirmedTriage();
      const fixture = mineFixtureFromTriage(entry);
      const result = verifyBatchNoPII([fixture]);
      expect(result.clean).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("batch privacy check detects violations", () => {
      const fixture: RegressionFixture = {
        id: "test-1",
        source_triage_id: "triage-1",
        query: "Contact: test@example.com",
        incorrect_answer: "Wrong",
        correct_answer: "Correct",
        error_class: "other",
        root_cause: "model",
        jurisdiction: "DE",
        expected_behavior: "Should be correct",
        check_type: "semantic_match",
        expected_keywords: [],
        forbidden_keywords: [],
        severity: "low",
        created_at: new Date().toISOString(),
        anonymization: {
          pii_entities_removed: 0,
          pii_types: [],
          client_names_replaced: false,
          case_details_generalized: false,
          original_content_hash: "hash-test",
        },
      };
      const result = verifyBatchNoPII([fixture]);
      expect(result.clean).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });

  describe("Stats", () => {
    it("computes mining stats", () => {
      const e1 = makeConfirmedTriage();
      const e2 = makeConfirmedTriage({
        query: "Was regelt § 823 BGB?",
        answer_excerpt: "§ 823 ABGB regelt Haftung.",
        jurisdiction: "DE",
      });
      const f1 = mineFixtureFromTriage(e1);
      const f2 = mineFixtureFromTriage(e2);

      const stats = computeMiningStats([f1, f2]);
      expect(stats.total_fixtures).toBe(2);
      expect(stats.by_error_class.citation_error).toBe(2);
      expect(stats.by_root_cause.citation_guard).toBe(2);
      expect(stats.by_jurisdiction.DE).toBe(2);
      expect(stats.by_severity.high).toBe(2);
    });
  });
});

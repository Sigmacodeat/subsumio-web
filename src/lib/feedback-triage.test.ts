/**
 * Tests for EPIC 9 — T9.1 Feedback-Triage
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createManualCandidate,
  createCandidateFromHumanReview,
  applyTriageDecision,
  reopenTriage,
  markMined,
  getTriageQueue,
  getTriageById,
  getConfirmedErrors,
  getUnminedConfirmedErrors,
  getTriageStats,
  validateTriageDecision,
  _resetTriageStore,
  ERROR_CLASS_LABELS_DE,
  ROOT_CAUSE_LABELS_DE,
  SEVERITY_LABELS_DE,
  TRIAGE_STATE_LABELS_DE,
  type ErrorClass,
  type RootCause,
  type ErrorSeverity,
  type TriageState,
} from "@/lib/feedback-triage";
import type { HumanReviewFeedback } from "@/lib/human-review";

const ORG_ID = "org-test-123";
const REVIEWER_ID = "jurist-001";

function makeHumanReview(overrides?: Partial<HumanReviewFeedback>): HumanReviewFeedback {
  return {
    id: "hr-001",
    source_endpoint: "/api/think",
    query: "Was ist die Verjährungsfrist für Schadensersatz?",
    answer_excerpt: "Die Verjährungsfrist beträgt 10 Jahre gem. § 195 BGB.",
    verdict: "incorrect",
    comment: "Das ist falsch, es sind 3 Jahre.",
    flagged_citations: ["§ 195 BGB"],
    suggested_correction: "Die regelmäßige Verjährungsfrist beträgt 3 Jahre gem. § 195 BGB.",
    jurisdiction: "DE",
    reviewer_id: "attorney-001",
    reviewed_at: new Date().toISOString(),
    promoted_to_fixture: false,
    ...overrides,
  };
}

describe("Feedback-Triage", () => {
  beforeEach(() => {
    _resetTriageStore();
  });

  describe("Candidate Creation", () => {
    it("creates candidate from human review feedback", () => {
      const hr = makeHumanReview();
      const entry = createCandidateFromHumanReview(hr, ORG_ID);

      expect(entry.id).toMatch(/^triage-/);
      expect(entry.source).toBe("human_review");
      expect(entry.source_feedback_id).toBe("hr-001");
      expect(entry.triage_state).toBe("candidate");
      expect(entry.user_verdict).toBe("incorrect");
      expect(entry.mined_to_fixture).toBe(false);
      expect(entry.org_id).toBe(ORG_ID);
    });

    it("creates manual candidate with defaults", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        org_id: ORG_ID,
      });

      expect(entry.source).toBe("manual");
      expect(entry.triage_state).toBe("candidate");
      expect(entry.user_verdict).toBe("incorrect");
    });

    it("creates candidate with custom verdict", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        user_verdict: "incomplete",
        org_id: ORG_ID,
      });

      expect(entry.user_verdict).toBe("incomplete");
    });
  });

  describe("Triage Decisions", () => {
    it("confirms a candidate with error class, root cause, and correction", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Wrong answer",
        org_id: ORG_ID,
      });

      const result = applyTriageDecision({
        triage_id: entry.id,
        decision: "confirm",
        error_class: "model_hallucination",
        root_cause: "model",
        severity: "high",
        correction: "The correct answer is X.",
        review_notes: "Model fabricated the statute.",
        reviewer_id: REVIEWER_ID,
      });

      expect(result.triage_state).toBe("confirmed");
      expect(result.error_class).toBe("model_hallucination");
      expect(result.root_cause).toBe("model");
      expect(result.severity).toBe("high");
      expect(result.correction).toBe("The correct answer is X.");
      expect(result.reviewer_id).toBe(REVIEWER_ID);
      expect(result.reviewed_at).toBeDefined();
    });

    it("rejects a candidate", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Actually correct answer",
        org_id: ORG_ID,
      });

      const result = applyTriageDecision({
        triage_id: entry.id,
        decision: "reject",
        review_notes: "User was wrong, answer is actually correct.",
        reviewer_id: REVIEWER_ID,
      });

      expect(result.triage_state).toBe("rejected");
      expect(result.review_notes).toContain("actually correct");
    });

    it("marks a candidate as needs_info", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Ambiguous answer",
        org_id: ORG_ID,
      });

      const result = applyTriageDecision({
        triage_id: entry.id,
        decision: "needs_info",
        review_notes: "Need more context about the jurisdiction.",
        reviewer_id: REVIEWER_ID,
      });

      expect(result.triage_state).toBe("needs_info");
    });

    it("throws when triaging an already-reviewed entry", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        org_id: ORG_ID,
      });

      applyTriageDecision({
        triage_id: entry.id,
        decision: "reject",
        reviewer_id: REVIEWER_ID,
      });

      expect(() =>
        applyTriageDecision({
          triage_id: entry.id,
          decision: "confirm",
          error_class: "other",
          root_cause: "model",
          severity: "low",
          correction: "Corrected answer.",
          reviewer_id: REVIEWER_ID,
        })
      ).toThrow(/already reviewed/);
    });

    it("throws when entry not found", () => {
      expect(() =>
        applyTriageDecision({
          triage_id: "nonexistent",
          decision: "reject",
          reviewer_id: REVIEWER_ID,
        })
      ).toThrow(/not found/);
    });
  });

  describe("Reopen Triage", () => {
    it("reopens a needs_info entry", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        org_id: ORG_ID,
      });

      applyTriageDecision({
        triage_id: entry.id,
        decision: "needs_info",
        review_notes: "Need more info.",
        reviewer_id: REVIEWER_ID,
      });

      const reopened = reopenTriage(entry.id, "Additional context provided.");
      expect(reopened.triage_state).toBe("candidate");
      expect(reopened.review_notes).toContain("Additional context");
    });

    it("throws when reopening non-needs_info entry", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        org_id: ORG_ID,
      });

      expect(() => reopenTriage(entry.id, "info")).toThrow(/needs_info/);
    });
  });

  describe("Mark Mined", () => {
    it("marks a confirmed entry as mined", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        org_id: ORG_ID,
      });

      applyTriageDecision({
        triage_id: entry.id,
        decision: "confirm",
        error_class: "citation_error",
        root_cause: "citation_guard",
        severity: "medium",
        correction: "Correct citation is § 437 BGB.",
        reviewer_id: REVIEWER_ID,
      });

      const mined = markMined(entry.id);
      expect(mined.mined_to_fixture).toBe(true);
    });

    it("throws when marking non-confirmed entry as mined", () => {
      const entry = createManualCandidate({
        query: "Test query",
        answer_excerpt: "Test answer",
        org_id: ORG_ID,
      });

      expect(() => markMined(entry.id)).toThrow(/confirmed/);
    });
  });

  describe("Query Functions", () => {
    it("filters by state", () => {
      createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      const e2 = createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: ORG_ID });
      applyTriageDecision({
        triage_id: e2.id,
        decision: "confirm",
        error_class: "other",
        root_cause: "model",
        severity: "low",
        correction: "Corrected.",
        reviewer_id: REVIEWER_ID,
      });

      const candidates = getTriageQueue({ state: "candidate" });
      const confirmed = getTriageQueue({ state: "confirmed" });
      expect(candidates).toHaveLength(1);
      expect(confirmed).toHaveLength(1);
    });

    it("filters by error_class", () => {
      const e1 = createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      const e2 = createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: ORG_ID });
      applyTriageDecision({
        triage_id: e1.id,
        decision: "confirm",
        error_class: "frist_error",
        root_cause: "frist_engine",
        severity: "high",
        correction: "Corrected frist.",
        reviewer_id: REVIEWER_ID,
      });
      applyTriageDecision({
        triage_id: e2.id,
        decision: "confirm",
        error_class: "citation_error",
        root_cause: "citation_guard",
        severity: "medium",
        correction: "Corrected citation.",
        reviewer_id: REVIEWER_ID,
      });

      const fristErrors = getTriageQueue({ error_class: "frist_error" });
      expect(fristErrors).toHaveLength(1);
      expect(fristErrors[0].error_class).toBe("frist_error");
    });

    it("filters by org_id", () => {
      createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: "org-a" });
      createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: "org-b" });

      const orgA = getTriageQueue({}, "org-a");
      expect(orgA).toHaveLength(1);
      expect(orgA[0].org_id).toBe("org-a");
    });

    it("sorts candidates first (oldest first)", () => {
      const e1 = createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      const e2 = createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: ORG_ID });
      applyTriageDecision({
        triage_id: e2.id,
        decision: "confirm",
        error_class: "other",
        root_cause: "model",
        severity: "low",
        correction: "Corrected.",
        reviewer_id: REVIEWER_ID,
      });

      const queue = getTriageQueue({});
      expect(queue[0].triage_state).toBe("candidate");
      expect(queue[1].triage_state).toBe("confirmed");
    });

    it("getTriageById returns entry", () => {
      const entry = createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      const found = getTriageById(entry.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(entry.id);
    });

    it("getConfirmedErrors returns only confirmed", () => {
      const e1 = createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: ORG_ID });
      applyTriageDecision({
        triage_id: e1.id,
        decision: "confirm",
        error_class: "other",
        root_cause: "model",
        severity: "low",
        correction: "Corrected.",
        reviewer_id: REVIEWER_ID,
      });

      const confirmed = getConfirmedErrors();
      expect(confirmed).toHaveLength(1);
    });

    it("getUnminedConfirmedErrors excludes mined", () => {
      const e1 = createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      applyTriageDecision({
        triage_id: e1.id,
        decision: "confirm",
        error_class: "other",
        root_cause: "model",
        severity: "low",
        correction: "Corrected.",
        reviewer_id: REVIEWER_ID,
      });
      markMined(e1.id);

      const unmined = getUnminedConfirmedErrors();
      expect(unmined).toHaveLength(0);
    });
  });

  describe("Stats", () => {
    it("computes correct stats", () => {
      const e1 = createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: ORG_ID });
      const e2 = createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: ORG_ID });
      const e3 = createManualCandidate({ query: "Q3", answer_excerpt: "A3", org_id: ORG_ID });

      applyTriageDecision({
        triage_id: e1.id,
        decision: "confirm",
        error_class: "frist_error",
        root_cause: "frist_engine",
        severity: "high",
        correction: "Corrected frist.",
        reviewer_id: REVIEWER_ID,
      });
      applyTriageDecision({
        triage_id: e2.id,
        decision: "reject",
        reviewer_id: REVIEWER_ID,
      });

      const stats = getTriageStats();
      expect(stats.total).toBe(3);
      expect(stats.by_state.candidate).toBe(1);
      expect(stats.by_state.confirmed).toBe(1);
      expect(stats.by_state.rejected).toBe(1);
      expect(stats.by_error_class.frist_error).toBe(1);
      expect(stats.by_root_cause.frist_engine).toBe(1);
      expect(stats.by_severity.high).toBe(1);
      expect(stats.confirmation_rate).toBe(0.5);
      expect(stats.rejection_rate).toBe(0.5);
      expect(stats.pending_count).toBe(1);
      expect(stats.unmined_confirmed).toBe(1);
      expect(stats.mined_count).toBe(0);
    });

    it("computes stats with org filter", () => {
      createManualCandidate({ query: "Q1", answer_excerpt: "A1", org_id: "org-a" });
      createManualCandidate({ query: "Q2", answer_excerpt: "A2", org_id: "org-b" });

      const stats = getTriageStats("org-a");
      expect(stats.total).toBe(1);
    });
  });

  describe("Validation", () => {
    it("validates confirm decision requires all fields", () => {
      const errors = validateTriageDecision({
        triage_id: "test",
        decision: "confirm",
        reviewer_id: REVIEWER_ID,
      });
      expect(errors).toContain("error_class is required for confirm decision");
      expect(errors).toContain("root_cause is required for confirm decision");
      expect(errors).toContain("severity is required for confirm decision");
      expect(errors.some((e) => e.includes("correction"))).toBe(true);
    });

    it("validates reject decision requires minimal fields", () => {
      const errors = validateTriageDecision({
        triage_id: "test",
        decision: "reject",
        reviewer_id: REVIEWER_ID,
      });
      expect(errors).toHaveLength(0);
    });

    it("validates triage_id and reviewer_id required", () => {
      const errors = validateTriageDecision({
        triage_id: "",
        decision: "reject",
        reviewer_id: "",
      });
      expect(errors).toContain("triage_id is required");
      expect(errors).toContain("reviewer_id is required");
    });
  });

  describe("Labels", () => {
    it("has German labels for all error classes", () => {
      const classes: ErrorClass[] = [
        "prompt_error",
        "retrieval_miss",
        "corpus_gap",
        "ui_confusion",
        "model_hallucination",
        "frist_error",
        "citation_error",
        "other",
      ];
      for (const cls of classes) {
        expect(ERROR_CLASS_LABELS_DE[cls]).toBeTruthy();
      }
    });

    it("has German labels for all root causes", () => {
      const causes: RootCause[] = [
        "prompt",
        "retrieval",
        "corpus",
        "ui",
        "model",
        "frist_engine",
        "citation_guard",
      ];
      for (const cause of causes) {
        expect(ROOT_CAUSE_LABELS_DE[cause]).toBeTruthy();
      }
    });

    it("has German labels for all severities", () => {
      const severities: ErrorSeverity[] = ["low", "medium", "high", "critical"];
      for (const sev of severities) {
        expect(SEVERITY_LABELS_DE[sev]).toBeTruthy();
      }
    });

    it("has German labels for all triage states", () => {
      const states: TriageState[] = ["candidate", "confirmed", "rejected", "needs_info"];
      for (const state of states) {
        expect(TRIAGE_STATE_LABELS_DE[state]).toBeTruthy();
      }
    });
  });
});

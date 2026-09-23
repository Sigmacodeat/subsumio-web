/**
 * EPIC 9 — T9.1 Feedback-Triage
 * ==============================
 *
 * User feedback is CANDIDATE data, never ground truth.
 * A legal expert (jurist) must confirm:
 *   1. Error class (what went wrong)
 *   2. Correction (what the correct answer should be)
 *   3. Root cause (which system component caused the error)
 *
 * Triage states: candidate → confirmed | rejected | needs_info
 * Root causes:   prompt | retrieval | corpus | ui | model | frist_engine | citation_guard
 * Error classes: prompt_error | retrieval_miss | corpus_gap | ui_confusion |
 *                model_hallucination | frist_error | citation_error | other
 *
 * This module integrates with:
 *   - human-review.ts (source of candidate feedback)
 *   - retrieval-feedback.ts (source of retrieval-level feedback)
 *   - regression-mining.ts (consumer of confirmed errors)
 */

import type { HumanReviewFeedback, ReviewVerdict } from "@/lib/human-review";
import type { RetrievalFeedback } from "@/lib/retrieval-feedback";

// ── Types ─────────────────────────────────────────────────────────────

/** Triage state in the review pipeline */
export type TriageState = "candidate" | "confirmed" | "rejected" | "needs_info";

/** What kind of error the user encountered */
export type ErrorClass =
  | "prompt_error"
  | "retrieval_miss"
  | "corpus_gap"
  | "ui_confusion"
  | "model_hallucination"
  | "frist_error"
  | "citation_error"
  | "other";

/** Which system component caused the error */
export type RootCause =
  | "prompt"
  | "retrieval"
  | "corpus"
  | "ui"
  | "model"
  | "frist_engine"
  | "citation_guard";

/** Severity of the confirmed error */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/** Source system where the feedback originated */
export type FeedbackSource = "human_review" | "retrieval_feedback" | "manual" | "guardrail_flag";

/**
 * A triage entry wraps a piece of user feedback with jurist review metadata.
 * Until confirmed, it is a CANDIDATE — not ground truth.
 */
export interface TriageEntry {
  id: string;
  /** Source system */
  source: FeedbackSource;
  /** ID from the source system (e.g., human-review feedback ID) */
  source_feedback_id?: string;
  /** The original query/prompt */
  query: string;
  /** The AI answer that was flagged */
  answer_excerpt: string;
  /** The user's original verdict (from human-review) */
  user_verdict: ReviewVerdict;
  /** The user's comment */
  user_comment?: string;
  /** Citations flagged by the user */
  flagged_citations?: string[];
  /** Jurisdiction */
  jurisdiction?: "DE" | "AT" | "CH";
  /** Current triage state */
  triage_state: TriageState;
  /** When the candidate was created */
  created_at: string;
  /** When the jurist reviewed it (null if not yet reviewed) */
  reviewed_at?: string;
  /** Jurist user ID who reviewed */
  reviewer_id?: string;
  /** Confirmed error class (set by jurist) */
  error_class?: ErrorClass;
  /** Confirmed root cause (set by jurist) */
  root_cause?: RootCause;
  /** Confirmed severity (set by jurist) */
  severity?: ErrorSeverity;
  /** Jurist's correction — what the answer should have been */
  correction?: string;
  /** Jurist's review notes */
  review_notes?: string;
  /** Whether this confirmed error has been mined into a regression fixture */
  mined_to_fixture: boolean;
  /** Org/tenant ID for isolation */
  org_id: string;
}

export interface TriageStats {
  total: number;
  by_state: Record<TriageState, number>;
  by_error_class: Record<ErrorClass, number>;
  by_root_cause: Record<RootCause, number>;
  by_severity: Record<ErrorSeverity, number>;
  by_source: Record<FeedbackSource, number>;
  confirmation_rate: number;
  rejection_rate: number;
  pending_count: number;
  mined_count: number;
  unmined_confirmed: number;
}

export interface TriageQueueFilters {
  state?: TriageState;
  error_class?: ErrorClass;
  root_cause?: RootCause;
  severity?: ErrorSeverity;
  jurisdiction?: "DE" | "AT" | "CH";
  source?: FeedbackSource;
  limit?: number;
  offset?: number;
}

// ── Labels (German) ───────────────────────────────────────────────────

export const ERROR_CLASS_LABELS_DE: Record<ErrorClass, string> = {
  prompt_error: "Prompt-Fehler",
  retrieval_miss: "Retrieval-Fehler",
  corpus_gap: "Corpus-Lücke",
  ui_confusion: "UI-Missverständnis",
  model_hallucination: "Modell-Halluzination",
  frist_error: "Fristen-Fehler",
  citation_error: "Zitats-Fehler",
  other: "Sonstiges",
};

export const ROOT_CAUSE_LABELS_DE: Record<RootCause, string> = {
  prompt: "Prompt-Design",
  retrieval: "Retrieval-Pipeline",
  corpus: "Corpus/Datenbestand",
  ui: "UI/UX",
  model: "Modell-Architektur",
  frist_engine: "Fristen-Engine",
  citation_guard: "Zitats-Guardrail",
};

export const SEVERITY_LABELS_DE: Record<ErrorSeverity, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

export const TRIAGE_STATE_LABELS_DE: Record<TriageState, string> = {
  candidate: "Kandidat",
  confirmed: "Bestätigt",
  rejected: "Zurückgewiesen",
  needs_info: "Info benötigt",
};

export const FEEDBACK_SOURCE_LABELS_DE: Record<FeedbackSource, string> = {
  human_review: "Human Review",
  retrieval_feedback: "Retrieval Feedback",
  manual: "Manuell",
  guardrail_flag: "Guardrail-Flag",
};

// ── In-Memory Store ───────────────────────────────────────────────────

const store: TriageEntry[] = [];
let idCounter = 0;

function generateId(): string {
  idCounter++;
  return `triage-${Date.now()}-${idCounter.toString().padStart(4, "0")}`;
}

// ── Candidate Creation ────────────────────────────────────────────────

/**
 * Create a triage candidate from a HumanReviewFeedback entry.
 * The feedback starts as "candidate" — not ground truth.
 */
export function createCandidateFromHumanReview(
  feedback: HumanReviewFeedback,
  orgId: string
): TriageEntry {
  const entry: TriageEntry = {
    id: generateId(),
    source: "human_review",
    source_feedback_id: feedback.id,
    query: feedback.query,
    answer_excerpt: feedback.answer_excerpt,
    user_verdict: feedback.verdict,
    user_comment: feedback.comment,
    flagged_citations: feedback.flagged_citations,
    jurisdiction: feedback.jurisdiction,
    triage_state: "candidate",
    created_at: new Date().toISOString(),
    mined_to_fixture: false,
    org_id: orgId,
  };
  store.push(entry);
  return entry;
}

/**
 * Create a triage candidate from a RetrievalFeedback entry.
 */
export function createCandidateFromRetrievalFeedback(
  feedback: RetrievalFeedback,
  orgId: string
): TriageEntry {
  const verdict: ReviewVerdict = feedback.feedback_type === "relevant" ? "correct" : "incorrect";

  const entry: TriageEntry = {
    id: generateId(),
    source: "retrieval_feedback",
    source_feedback_id: feedback.id,
    query: feedback.query,
    answer_excerpt: feedback.result_title,
    user_verdict: verdict,
    user_comment: feedback.comment,
    jurisdiction: undefined,
    triage_state: "candidate",
    created_at: new Date().toISOString(),
    mined_to_fixture: false,
    org_id: orgId,
  };
  store.push(entry);
  return entry;
}

/**
 * Create a manual triage candidate (e.g., from guardrail flag or manual testing).
 */
export function createManualCandidate(input: {
  query: string;
  answer_excerpt: string;
  user_verdict?: ReviewVerdict;
  user_comment?: string;
  flagged_citations?: string[];
  jurisdiction?: "DE" | "AT" | "CH";
  source?: FeedbackSource;
  org_id: string;
}): TriageEntry {
  const entry: TriageEntry = {
    id: generateId(),
    source: input.source ?? "manual",
    query: input.query,
    answer_excerpt: input.answer_excerpt,
    user_verdict: input.user_verdict ?? "incorrect",
    user_comment: input.user_comment,
    flagged_citations: input.flagged_citations,
    jurisdiction: input.jurisdiction,
    triage_state: "candidate",
    created_at: new Date().toISOString(),
    mined_to_fixture: false,
    org_id: input.org_id,
  };
  store.push(entry);
  return entry;
}

// ── Triage Actions (Jurist Review) ────────────────────────────────────

export interface TriageDecision {
  triage_id: string;
  decision: "confirm" | "reject" | "needs_info";
  error_class?: ErrorClass;
  root_cause?: RootCause;
  severity?: ErrorSeverity;
  correction?: string;
  review_notes?: string;
  reviewer_id: string;
}

/**
 * Apply a jurist's triage decision to a candidate.
 * Only "candidate" entries can be triaged.
 */
export function applyTriageDecision(decision: TriageDecision): TriageEntry {
  const entry = store.find((e) => e.id === decision.triage_id);
  if (!entry) {
    throw new Error(`Triage entry not found: ${decision.triage_id}`);
  }
  if (entry.triage_state !== "candidate") {
    throw new Error(
      `Triage entry ${decision.triage_id} is already reviewed (state: ${entry.triage_state})`
    );
  }

  entry.reviewed_at = new Date().toISOString();
  entry.reviewer_id = decision.reviewer_id;

  if (decision.decision === "confirm") {
    entry.triage_state = "confirmed";
    entry.error_class = decision.error_class ?? "other";
    entry.root_cause = decision.root_cause ?? "model";
    entry.severity = decision.severity ?? "medium";
    entry.correction = decision.correction;
    entry.review_notes = decision.review_notes;
  } else if (decision.decision === "reject") {
    entry.triage_state = "rejected";
    entry.review_notes = decision.review_notes;
  } else {
    entry.triage_state = "needs_info";
    entry.review_notes = decision.review_notes;
  }

  return entry;
}

/**
 * Re-open a "needs_info" entry for re-review after additional information is provided.
 */
export function reopenTriage(triageId: string, additionalInfo: string): TriageEntry {
  const entry = store.find((e) => e.id === triageId);
  if (!entry) {
    throw new Error(`Triage entry not found: ${triageId}`);
  }
  if (entry.triage_state !== "needs_info") {
    throw new Error(`Only "needs_info" entries can be reopened (current: ${entry.triage_state})`);
  }
  entry.triage_state = "candidate";
  entry.review_notes = (entry.review_notes ?? "") + "\n--- Additional Info ---\n" + additionalInfo;
  return entry;
}

/**
 * Mark a confirmed triage entry as mined into a regression fixture.
 */
export function markMined(triageId: string): TriageEntry {
  const entry = store.find((e) => e.id === triageId);
  if (!entry) {
    throw new Error(`Triage entry not found: ${triageId}`);
  }
  if (entry.triage_state !== "confirmed") {
    throw new Error(
      `Only confirmed entries can be marked as mined (current: ${entry.triage_state})`
    );
  }
  entry.mined_to_fixture = true;
  return entry;
}

// ── Query Functions ───────────────────────────────────────────────────

export function getTriageQueue(filters: TriageQueueFilters = {}, orgId?: string): TriageEntry[] {
  let results = store;

  if (orgId) {
    results = results.filter((e) => e.org_id === orgId);
  }
  if (filters.state) {
    results = results.filter((e) => e.triage_state === filters.state);
  }
  if (filters.error_class) {
    results = results.filter((e) => e.error_class === filters.error_class);
  }
  if (filters.root_cause) {
    results = results.filter((e) => e.root_cause === filters.root_cause);
  }
  if (filters.severity) {
    results = results.filter((e) => e.severity === filters.severity);
  }
  if (filters.jurisdiction) {
    results = results.filter((e) => e.jurisdiction === filters.jurisdiction);
  }
  if (filters.source) {
    results = results.filter((e) => e.source === filters.source);
  }

  // Sort: candidates first (oldest first), then confirmed (newest first)
  results.sort((a, b) => {
    if (a.triage_state === "candidate" && b.triage_state !== "candidate") return -1;
    if (a.triage_state !== "candidate" && b.triage_state === "candidate") return 1;
    if (a.triage_state === "candidate") {
      return a.created_at.localeCompare(b.created_at);
    }
    return (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? "");
  });

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return results.slice(offset, offset + limit);
}

export function getTriageById(id: string): TriageEntry | undefined {
  return store.find((e) => e.id === id);
}

export function getConfirmedErrors(orgId?: string): TriageEntry[] {
  return store.filter((e) => e.triage_state === "confirmed" && (!orgId || e.org_id === orgId));
}

export function getUnminedConfirmedErrors(orgId?: string): TriageEntry[] {
  return store.filter(
    (e) => e.triage_state === "confirmed" && !e.mined_to_fixture && (!orgId || e.org_id === orgId)
  );
}

// ── Stats ─────────────────────────────────────────────────────────────

export function getTriageStats(orgId?: string): TriageStats {
  const entries = orgId ? store.filter((e) => e.org_id === orgId) : store;

  const byState: Record<TriageState, number> = {
    candidate: 0,
    confirmed: 0,
    rejected: 0,
    needs_info: 0,
  };
  const byErrorClass: Record<ErrorClass, number> = {
    prompt_error: 0,
    retrieval_miss: 0,
    corpus_gap: 0,
    ui_confusion: 0,
    model_hallucination: 0,
    frist_error: 0,
    citation_error: 0,
    other: 0,
  };
  const byRootCause: Record<RootCause, number> = {
    prompt: 0,
    retrieval: 0,
    corpus: 0,
    ui: 0,
    model: 0,
    frist_engine: 0,
    citation_guard: 0,
  };
  const bySeverity: Record<ErrorSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const bySource: Record<FeedbackSource, number> = {
    human_review: 0,
    retrieval_feedback: 0,
    manual: 0,
    guardrail_flag: 0,
  };

  let minedCount = 0;
  let unminedConfirmed = 0;

  for (const entry of entries) {
    byState[entry.triage_state]++;
    bySource[entry.source]++;

    if (entry.triage_state === "confirmed") {
      if (entry.error_class) byErrorClass[entry.error_class]++;
      if (entry.root_cause) byRootCause[entry.root_cause]++;
      if (entry.severity) bySeverity[entry.severity]++;
      if (entry.mined_to_fixture) {
        minedCount++;
      } else {
        unminedConfirmed++;
      }
    }
  }

  const reviewed = entries.filter(
    (e) => e.triage_state === "confirmed" || e.triage_state === "rejected"
  ).length;
  const confirmed = byState.confirmed;
  const rejected = byState.rejected;
  const total = entries.length;

  return {
    total,
    by_state: byState,
    by_error_class: byErrorClass,
    by_root_cause: byRootCause,
    by_severity: bySeverity,
    by_source: bySource,
    confirmation_rate: reviewed > 0 ? confirmed / reviewed : 0,
    rejection_rate: reviewed > 0 ? rejected / reviewed : 0,
    pending_count: byState.candidate + byState.needs_info,
    mined_count: minedCount,
    unmined_confirmed: unminedConfirmed,
  };
}

// ── Validation ────────────────────────────────────────────────────────

export function validateTriageDecision(decision: TriageDecision): string[] {
  const errors: string[] = [];

  if (!decision.triage_id) {
    errors.push("triage_id is required");
  }
  if (!decision.reviewer_id) {
    errors.push("reviewer_id is required");
  }

  if (decision.decision === "confirm") {
    if (!decision.error_class) {
      errors.push("error_class is required for confirm decision");
    }
    if (!decision.root_cause) {
      errors.push("root_cause is required for confirm decision");
    }
    if (!decision.severity) {
      errors.push("severity is required for confirm decision");
    }
    if (!decision.correction || decision.correction.trim().length < 10) {
      errors.push("correction must be at least 10 characters for confirm decision");
    }
  }

  return errors;
}

// ── Reset (for testing) ───────────────────────────────────────────────

export function _resetTriageStore(): void {
  store.length = 0;
  idCounter = 0;
}

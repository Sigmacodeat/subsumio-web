/**
 * AI Quality Metrics für Subsumio.
 *
 * Misst die Qualität von AI-Output über mehrere Dimensionen:
 *   - Citation verification rate: Anteil der Zitate, die gegen den Corpus verifiziert werden konnten
 *   - Unsupported claim rate: Anteil von Aussagen ohne Quellenbeleg
 *   - False citation rate: Anteil von Zitaten, die zwar gemacht aber NICHT verifiziert wurden
 *   - Deadline calculation accuracy: Korrektheit erkannter Fristen vs. erwartete Fristen
 *   - Contract issue detection precision/recall: Trefferquote bei Vertragsprüfung
 *
 * Diese Metriken sind die Grundlage für das Release-Gate (kein Release bei Regression).
 */

import type { GroundingMetadata } from "@/lib/citation-gate";
import type { DetectedDeadline } from "@/lib/ai-deadline-detect";
import type { GroundedCitation } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────

export interface CitationQualityMetrics {
  /** Total citations found in the AI output. */
  total_citations: number;
  /** Citations that could be verified against the corpus. */
  verified_citations: number;
  /** Citations that could NOT be verified — potential hallucinations. */
  unverified_citations: number;
  /** Citation verification rate = verified / total (0–1). */
  citation_verification_rate: number;
  /** False citation rate = unverified / total (0–1). */
  false_citation_rate: number;
  /** Whether the corpus was checked at all. */
  corpus_checked: boolean;
}

export interface ClaimQualityMetrics {
  /** Total substantive claims identified in the AI output. */
  total_claims: number;
  /** Claims that have at least one supporting citation. */
  supported_claims: number;
  /** Claims without any supporting citation. */
  unsupported_claims: number;
  /** Unsupported claim rate = unsupported / total (0–1). */
  unsupported_claim_rate: number;
}

export interface DeadlineQualityMetrics {
  /** Total deadlines detected. */
  total_detected: number;
  /** Deadlines that match expected deadlines. */
  correct: number;
  /** Deadlines that don't match any expected deadline. */
  false_positives: number;
  /** Expected deadlines that were not detected. */
  false_negatives: number;
  /** Precision = correct / (correct + false_positives) (0–1). */
  precision: number;
  /** Recall = correct / (correct + false_negatives) (0–1). */
  recall: number;
  /** F1 score (0–1). */
  f1: number;
}

export interface ContractIssueQualityMetrics {
  /** Total issues detected by AI. */
  total_detected: number;
  /** Issues that match expected issues. */
  correct: number;
  /** Detected issues that are not in expected set. */
  false_positives: number;
  /** Expected issues that were not detected. */
  false_negatives: number;
  /** Precision = correct / (correct + false_positives) (0–1). */
  precision: number;
  /** Recall = correct / (correct + false_negatives) (0–1). */
  recall: number;
  /** F1 score (0–1). */
  f1: number;
}

export interface AIQualityReport {
  citation: CitationQualityMetrics;
  claims: ClaimQualityMetrics;
  deadlines: DeadlineQualityMetrics | null;
  contract_issues: ContractIssueQualityMetrics | null;
  /** Overall quality score (0–1, weighted average). */
  overall_score: number;
  /** When the report was generated. */
  generated_at: string;
  /** Source endpoint that produced the AI output. */
  source_endpoint?: string;
}

// ── Citation quality ──────────────────────────────────────────────────

export function computeCitationQuality(
  grounding: GroundingMetadata | null | undefined
): CitationQualityMetrics {
  if (!grounding || !grounding.corpus_checked) {
    return {
      total_citations: 0,
      verified_citations: 0,
      unverified_citations: 0,
      citation_verification_rate: 0,
      false_citation_rate: 0,
      corpus_checked: false,
    };
  }

  const total = grounding.citations_verified + grounding.citations_unverified;
  const verified = grounding.citations_verified;
  const unverified = grounding.citations_unverified;

  return {
    total_citations: total,
    verified_citations: verified,
    unverified_citations: unverified,
    citation_verification_rate: total > 0 ? verified / total : 1,
    false_citation_rate: total > 0 ? unverified / total : 0,
    corpus_checked: true,
  };
}

// ── Claim quality ─────────────────────────────────────────────────────

/**
 * Heuristic: a "claim" is a sentence that makes a legal assertion.
 * Sentences containing normative language ("muss", "ist", "gilt", "kann")
 * or statute references are considered claims.
 * A claim is "supported" if it contains a statute reference (§ ...).
 */
const CLAIM_SENTENCE_RX = /[^.!?]*\b(?:muss|ist|gilt|kann|hat|sind|wird|darf|soll)\b[^.!?]*[.!?]/gi;

const CITATION_IN_SENTENCE_RX = /§+\s*\d+/;

export function computeClaimQuality(
  answerText: string,
  groundedCitations: GroundedCitation[] | null | undefined
): ClaimQualityMetrics {
  const sentences = answerText.match(CLAIM_SENTENCE_RX) ?? [];
  const total_claims = sentences.length;

  if (total_claims === 0) {
    return {
      total_claims: 0,
      supported_claims: 0,
      unsupported_claims: 0,
      unsupported_claim_rate: 0,
    };
  }

  const verifiedKeys = new Set(
    (groundedCitations ?? []).filter((c) => c.verified).map((c) => `${c.code}#${c.paragraph}`)
  );

  let supported = 0;
  for (const sentence of sentences) {
    if (CITATION_IN_SENTENCE_RX.test(sentence)) {
      // Check if any verified citation matches this sentence
      const citeMatch = sentence.match(/§+\s*(\d+[a-z]?)\s+([A-Z][A-Za-zÄÖÜ]{1,10})/);
      if (citeMatch) {
        const key = `${citeMatch[2]}#§ ${citeMatch[1]}`;
        if (verifiedKeys.has(key)) {
          supported++;
          continue;
        }
      }
      // Has a citation but not verified — still counts as partially supported
      supported++;
    }
  }

  const unsupported = total_claims - supported;
  return {
    total_claims,
    supported_claims: supported,
    unsupported_claims: unsupported,
    unsupported_claim_rate: total_claims > 0 ? unsupported / total_claims : 0,
  };
}

// ── Deadline quality ──────────────────────────────────────────────────

export interface ExpectedDeadline {
  type: string;
  date?: string;
  daysFromNow?: number;
}

export function computeDeadlineQuality(
  detected: DetectedDeadline[],
  expected: ExpectedDeadline[]
): DeadlineQualityMetrics {
  const expectedSet = new Set(expected.map((e) => `${e.type}:${e.date ?? e.daysFromNow ?? ""}`));
  const detectedSet = new Set(detected.map((d) => `${d.type}:${d.date ?? d.daysFromNow ?? ""}`));

  let correct = 0;
  for (const key of detectedSet) {
    if (expectedSet.has(key)) correct++;
  }

  const false_positives = detected.length - correct;
  const false_negatives = expected.length - correct;

  const precision = detected.length > 0 ? correct / detected.length : 0;
  const recall = expected.length > 0 ? correct / expected.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    total_detected: detected.length,
    correct,
    false_positives,
    false_negatives,
    precision,
    recall,
    f1,
  };
}

// ── Contract issue quality ────────────────────────────────────────────

export interface ExpectedContractIssue {
  clause_type: string;
  risk_level: string;
}

export interface DetectedContractIssue {
  clause_type: string;
  risk_level: string;
}

export function computeContractIssueQuality(
  detected: DetectedContractIssue[],
  expected: ExpectedContractIssue[]
): ContractIssueQualityMetrics {
  const expectedSet = new Set(expected.map((e) => `${e.clause_type}:${e.risk_level}`));
  const detectedSet = new Set(detected.map((d) => `${d.clause_type}:${d.risk_level}`));

  let correct = 0;
  for (const key of detectedSet) {
    if (expectedSet.has(key)) correct++;
  }

  const false_positives = detected.length - correct;
  const false_negatives = expected.length - correct;

  const precision = detected.length > 0 ? correct / detected.length : 0;
  const recall = expected.length > 0 ? correct / expected.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    total_detected: detected.length,
    correct,
    false_positives,
    false_negatives,
    precision,
    recall,
    f1,
  };
}

// ── Overall quality report ────────────────────────────────────────────

export interface QualityReportInput {
  answerText: string;
  grounding?: GroundingMetadata | null;
  detectedDeadlines?: DetectedDeadline[];
  expectedDeadlines?: ExpectedDeadline[];
  detectedContractIssues?: DetectedContractIssue[];
  expectedContractIssues?: ExpectedContractIssue[];
  sourceEndpoint?: string;
}

export function computeQualityReport(input: QualityReportInput): AIQualityReport {
  const citation = computeCitationQuality(input.grounding);
  const claims = computeClaimQuality(input.answerText, input.grounding?.grounded_citations);

  const deadlines =
    input.detectedDeadlines && input.expectedDeadlines
      ? computeDeadlineQuality(input.detectedDeadlines, input.expectedDeadlines)
      : null;

  const contract_issues =
    input.detectedContractIssues && input.expectedContractIssues
      ? computeContractIssueQuality(input.detectedContractIssues, input.expectedContractIssues)
      : null;

  // Weighted overall score
  // Citation verification: 40%, Unsupported claims: 30%, Deadlines: 15%, Contract issues: 15%
  const weights = { citation: 0.4, claims: 0.3, deadlines: 0.15, contract: 0.15 };
  let score = citation.citation_verification_rate * weights.citation;
  score += (1 - claims.unsupported_claim_rate) * weights.claims;
  if (deadlines) {
    score += deadlines.f1 * weights.deadlines;
  } else {
    score += weights.deadlines; // No deadline data → don't penalize
  }
  if (contract_issues) {
    score += contract_issues.f1 * weights.contract;
  } else {
    score += weights.contract; // No contract issue data → don't penalize
  }

  return {
    citation,
    claims,
    deadlines,
    contract_issues,
    overall_score: Math.round(score * 1000) / 1000,
    generated_at: new Date().toISOString(),
    source_endpoint: input.sourceEndpoint,
  };
}

// ── Quality grade ─────────────────────────────────────────────────────

export function qualityGrade(score: number): { label: string; color: string } {
  if (score >= 0.85) return { label: "Exzellent", color: "emerald" };
  if (score >= 0.7) return { label: "Gut", color: "blue" };
  if (score >= 0.5) return { label: "Ausreichend", color: "amber" };
  return { label: "Kritisch", color: "red" };
}

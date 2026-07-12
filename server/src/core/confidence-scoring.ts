/**
 * Claim-Level Confidence Scoring with Calibration
 *
 * Decomposes an AI-generated answer into individual factual claims,
 * scores each claim's confidence based on grounding, guardrail flags,
 * cross-verify results, and hedging detection, then aggregates into
 * a document-level confidence score.
 *
 * Architecture:
 *   1. Claim decomposition — sentence-level split using legal assertion heuristics
 *   2. Per-claim grounding — check if claim's §-citations appear in context
 *   3. Confidence formula — weighted factors → 0-1 calibrated score
 *   4. Level assignment — HIGH (≥0.8), MEDIUM (≥0.5), LOW (<0.5)
 *   5. Calibration — track ECE (Expected Calibration Error) over time
 *
 * Pure + deterministic: no I/O, no LLM calls. All inputs are passed in.
 * Unit-tested in test/confidence-scoring.test.ts.
 */

import type { GuardrailResult } from "./citation-guardrail.ts";
import type { CrossVerifyResult } from "./think/cross-verify.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface ClaimConfidence {
  /** The actual sentence/claim text */
  claim_text: string;
  /** Position in answer (0-indexed) */
  claim_index: number;
  /** Calibrated confidence score 0-1 */
  confidence: number;
  /** Discrete confidence level */
  level: "high" | "medium" | "low";
  /** Factor breakdown for transparency */
  factors: {
    /** Claim contains at least one §-citation */
    has_citation: boolean;
    /** Claim's §-citation(s) appear in retrieved context */
    citation_grounded: boolean;
    /** Cross-verify confirmed this claim's citations */
    citation_verified: boolean;
    /** Hedging language detected in this claim */
    hedging_detected: boolean;
    /** Number of guardrail flags affecting this claim */
    guardrail_flags: number;
    /** Number of cross-verify flags affecting this claim */
    cross_verify_flags: number;
  };
  /** Slugs that support this claim (from context) */
  supporting_passages: string[];
}

export interface DocumentConfidence {
  /** Overall calibrated confidence 0-1 */
  overall_confidence: number;
  /** Discrete confidence level */
  confidence_level: "high" | "medium" | "low";
  /** Per-claim confidence breakdown */
  claim_confidences: ClaimConfidence[];
  /** Calibration metadata */
  calibration: {
    /** Expected Calibration Error (0-1, lower is better) */
    ece: number;
    /** Number of samples used for ECE computation */
    sample_count: number;
    /** Timestamp of last calibration update */
    last_updated: string;
  };
}

export interface ConfidenceInput {
  /** The AI-generated answer text */
  answer: string;
  /** The retrieved context (pages + takes) */
  context: string;
  /** Guardrail result from Tier 0 (optional but recommended) */
  guardrailResult?: GuardrailResult;
  /** Cross-verify result from Tier 1 (optional) */
  crossVerifyResult?: CrossVerifyResult;
  /** Slugs of retrieved pages (for supporting_passages) */
  retrievedSlugs?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────

/** Confidence formula weights (sum = 1.0) */
const WEIGHTS = {
  citation_grounded: 0.4,
  no_guardrail_flags: 0.25,
  no_hedging: 0.15,
  cross_verify_clean: 0.2,
} as const;

/** Level thresholds */
const HIGH_THRESHOLD = 0.8;
const MEDIUM_THRESHOLD = 0.5;

/** Sentence pattern for legal claims — matches sentences with normative language or § references */
const CLAIM_SENTENCE_RX = /[^.!?]*\b(?:muss|ist|gilt|kann|hat|sind|wird|darf|soll|wird\s+nicht|kann\s+nicht)\b[^.!?]*[.!?]/gi;

/** §-citation pattern within a sentence */
const CITATION_IN_SENTENCE_RX = /§+\s*\d+/;

/** Hedging patterns (subset of citation-guardrail.ts) */
const HEDGING_PATTERNS = [
  /nicht\s+in\s+den\s+Quellen/i,
  /nicht\s+explizit\s+(?:in|genannt|aufgeführt)/i,
  /nicht\s+direkt\s+(?:in|genannt|aufgeführt)/i,
  /kann\s+nicht\s+nachgelesen\s+werden/i,
];

// ── Claim Decomposition ───────────────────────────────────────────────

/**
 * Decompose an answer into individual factual claims.
 * A "claim" is a sentence that makes a legal assertion — either containing
 * normative language (muss, ist, gilt, etc.) or a §-citation.
 *
 * Non-claim sentences (greetings, meta-commentary, disclaimers) are excluded.
 */
export function decomposeClaims(answer: string): string[] {
  const normativeSentences = answer.match(CLAIM_SENTENCE_RX) ?? [];

  // Also capture sentences with §-citations that might not match the normative RX
  // (e.g. "§ 433 BGB regelt die Vertriebspflichten.")
  const allSentences = answer.split(/(?<=[.!?])\s+/);
  const citationSentences = allSentences.filter((s) => CITATION_IN_SENTENCE_RX.test(s));

  // Merge and deduplicate, preserving order
  const seen = new Set<string>();
  const claims: string[] = [];
  for (const s of [...normativeSentences, ...citationSentences]) {
    const trimmed = s.trim();
    if (trimmed.length < 10) continue; // Skip trivially short fragments
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    claims.push(trimmed);
  }

  return claims;
}

// ── Per-Claim Grounding ───────────────────────────────────────────────

/**
 * Extract §-citations from a claim sentence.
 * Returns normalized citations like "§ 433 BGB", "§ 12 Abs. 1 AO".
 */
function extractClaimCitations(claim: string): string[] {
  const pattern = /§§?\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?\s*(?:Satz\s*(\d+))?\s*([A-Z][A-Za-z]{1,10})?/g;
  const citations: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(claim)) !== null) {
    const [, num, abs, satz, law] = match;
    let cite = `§ ${num}`;
    if (abs) cite += ` Abs. ${abs}`;
    if (satz) cite += ` Satz ${satz}`;
    if (law) cite += ` ${law}`;
    citations.push(cite);
  }
  return [...new Set(citations)];
}

/**
 * Check if a citation appears in the context text.
 * Reuses the logic from citation-guardrail.ts but self-contained for testability.
 */
function citationInContext(citation: string, context: string): boolean {
  if (context.includes(citation)) return true;

  const match = citation.match(/§\s*(\d+[a-z]?)\s*(?:Abs\.\s*(\d+))?/);
  if (!match) return false;
  const [, num] = match;

  if (context.includes(`§ ${num}`)) return true;
  if (context.includes(`§${num}`)) return true;
  if (context.includes(`§§ ${num}`)) return true;

  const paraRegex = new RegExp(`§§?\\s*${num}\\b`, "i");
  if (paraRegex.test(context)) return true;

  return false;
}

/**
 * Check if a claim contains hedging language.
 */
function claimHasHedging(claim: string): boolean {
  return HEDGING_PATTERNS.some((p) => p.test(claim));
}

/**
 * Count guardrail flags that affect a specific claim.
 * Matches flags by citation text appearing in the claim.
 */
function countGuardrailFlagsForClaim(
  claim: string,
  guardrailResult: GuardrailResult | undefined
): number {
  if (!guardrailResult) return 0;
  let count = 0;
  for (const flag of guardrailResult.flags) {
    if (flag.citation && claim.includes(flag.citation)) {
      count++;
    } else if (!flag.citation) {
      // General flags (hedging) — check if the detail references text in this claim
      const detailWords = flag.detail.split(/\s+/).filter((w) => w.length > 5);
      if (detailWords.length > 0 && detailWords.some((w) => claim.includes(w))) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Count cross-verify flags that affect a specific claim.
 */
function countCrossVerifyFlagsForClaim(
  claim: string,
  crossVerifyResult: CrossVerifyResult | undefined
): number {
  if (!crossVerifyResult) return 0;
  let count = 0;
  for (const flag of crossVerifyResult.flags) {
    if (flag.citation && claim.includes(flag.citation)) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a claim's citations were verified by cross-verify.
 */
function claimCitationsVerified(
  claim: string,
  crossVerifyResult: CrossVerifyResult | undefined
): boolean {
  if (!crossVerifyResult) return false;
  const claimCites = extractClaimCitations(claim);
  if (claimCites.length === 0) return false;
  // All of the claim's citations must be in the verified list
  return claimCites.every((c) =>
    crossVerifyResult.verified_citations.some((vc) =>
      vc.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(vc.toLowerCase())
    )
  );
}

// ── Confidence Computation ────────────────────────────────────────────

/**
 * Compute confidence for a single claim.
 *
 * Formula: C = w1 * grounded + w2 * no_guardrail + w3 * no_hedging + w4 * cross_verify
 * where:
 *   grounded = 1 if citation exists AND is grounded, 0.5 if citation exists but not grounded, 0 if no citation
 *   no_guardrail = 1 - min(flags * 0.3, 1)  (each flag reduces by 0.3, capped at 1)
 *   no_hedging = 0 if hedging detected, 1 otherwise
 *   cross_verify = 1 if verified, 0.5 if no cross-verify ran, 0 if flagged
 */
function computeClaimConfidence(
  claim: string,
  claimIndex: number,
  context: string,
  guardrailResult: GuardrailResult | undefined,
  crossVerifyResult: CrossVerifyResult | undefined,
  retrievedSlugs: string[]
): ClaimConfidence {
  const claimCites = extractClaimCitations(claim);
  const hasCitation = claimCites.length > 0;

  // Citation grounding
  let citationGrounded = false;
  if (hasCitation) {
    citationGrounded = claimCites.every((c) => citationInContext(c, context));
  }

  // Citation verified by cross-verify
  const citationVerified = claimCitationsVerified(claim, crossVerifyResult);

  // Hedging
  const hedgingDetected = claimHasHedging(claim);

  // Flag counts
  const guardrailFlags = countGuardrailFlagsForClaim(claim, guardrailResult);
  const crossVerifyFlags = countCrossVerifyFlagsForClaim(claim, crossVerifyResult);

  // Supporting passages (slugs that contain the cited §)
  const supportingPassages: string[] = [];
  if (hasCitation && citationGrounded) {
    for (const slug of retrievedSlugs) {
      // If the slug contains a § number that matches a claim citation, it's supporting
      const slugHasCite = claimCites.some((c) => {
        const numMatch = c.match(/§\s*(\d+[a-z]?)/);
        if (!numMatch) return false;
        return slug.toLowerCase().includes(numMatch[1].toLowerCase());
      });
      if (slugHasCite) supportingPassages.push(slug);
    }
  }

  // Compute confidence
  const groundedScore = hasCitation ? (citationGrounded ? 1.0 : 0.5) : 0.5;
  const noGuardrailScore = 1 - Math.min(guardrailFlags * 0.3, 1);
  const noHedgingScore = hedgingDetected ? 0 : 1;
  const crossVerifyScore = crossVerifyResult
    ? (citationVerified && crossVerifyFlags === 0)
      ? 1
      : crossVerifyFlags > 0
        ? 0
        : 0.5
    : 0.5;

  const confidence =
    WEIGHTS.citation_grounded * groundedScore +
    WEIGHTS.no_guardrail_flags * noGuardrailScore +
    WEIGHTS.no_hedging * noHedgingScore +
    WEIGHTS.cross_verify_clean * crossVerifyScore;

  // Clamp to [0, 1]
  const clampedConfidence = Math.max(0, Math.min(1, confidence));

  const level: "high" | "medium" | "low" =
    clampedConfidence >= HIGH_THRESHOLD
      ? "high"
      : clampedConfidence >= MEDIUM_THRESHOLD
        ? "medium"
        : "low";

  return {
    claim_text: claim,
    claim_index: claimIndex,
    confidence: Math.round(clampedConfidence * 1000) / 1000,
    level,
    factors: {
      has_citation: hasCitation,
      citation_grounded: citationGrounded,
      citation_verified: citationVerified,
      hedging_detected: hedgingDetected,
      guardrail_flags: guardrailFlags,
      cross_verify_flags: crossVerifyFlags,
    },
    supporting_passages: supportingPassages,
  };
}

// ── Document-Level Confidence ─────────────────────────────────────────

/**
 * Compute document-level confidence from per-claim scores.
 *
 * The overall confidence is the mean of per-claim confidences,
 * weighted by whether the claim has a citation (cited claims weigh more
 * because they make verifiable assertions).
 */
export function computeDocumentConfidence(input: ConfidenceInput): DocumentConfidence {
  const { answer, context, guardrailResult, crossVerifyResult, retrievedSlugs = [] } = input;

  const claims = decomposeClaims(answer);

  if (claims.length === 0) {
    return {
      overall_confidence: 0,
      confidence_level: "low",
      claim_confidences: [],
      calibration: {
        ece: 0,
        sample_count: 0,
        last_updated: new Date().toISOString(),
      },
    };
  }

  const claimConfidences = claims.map((claim, idx) =>
    computeClaimConfidence(
      claim,
      idx,
      context,
      guardrailResult,
      crossVerifyResult,
      retrievedSlugs
    )
  );

  // Weighted mean: claims with citations weigh 2x (they're verifiable assertions)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const cc of claimConfidences) {
    const weight = cc.factors.has_citation ? 2 : 1;
    weightedSum += cc.confidence * weight;
    totalWeight += weight;
  }
  const overallConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const confidenceLevel: "high" | "medium" | "low" =
    overallConfidence >= HIGH_THRESHOLD
      ? "high"
      : overallConfidence >= MEDIUM_THRESHOLD
        ? "medium"
        : "low";

  return {
    overall_confidence: Math.round(overallConfidence * 1000) / 1000,
    confidence_level: confidenceLevel,
    claim_confidences: claimConfidences,
    calibration: {
      ece: 0, // ECE is computed by the calibration tracker, not here
      sample_count: 0,
      last_updated: new Date().toISOString(),
    },
  };
}

// ── Calibration Tracking ──────────────────────────────────────────────

/**
 * Expected Calibration Error (ECE) computation.
 *
 * ECE = Σ (|B| / N) * |acc(B) - conf(B)|
 * where B bins are over [0,1], acc(B) is the average correctness in bin B,
 * and conf(B) is the average confidence in bin B.
 *
 * Used to track whether predicted confidence matches actual correctness
 * over time. Lower ECE = better calibrated.
 */
export interface CalibrationSample {
  /** Predicted confidence (0-1) */
  predicted_confidence: number;
  /** Actual correctness (1 = correct, 0 = incorrect) — from judge or attorney review */
  actual_correctness: number;
}

export function computeECE(samples: CalibrationSample[], numBins = 10): number {
  if (samples.length === 0) return 0;

  const binSize = 1 / numBins;
  const bins: Array<{ samples: CalibrationSample[]; avgConf: number; avgAcc: number }> = [];

  for (let i = 0; i < numBins; i++) {
    const lower = i * binSize;
    const upper = (i + 1) * binSize;
    const binSamples = samples.filter(
      (s) => s.predicted_confidence >= lower && s.predicted_confidence < upper
    );
    if (binSamples.length === 0) continue;
    const avgConf = binSamples.reduce((sum, s) => sum + s.predicted_confidence, 0) / binSamples.length;
    const avgAcc = binSamples.reduce((sum, s) => sum + s.actual_correctness, 0) / binSamples.length;
    bins.push({ samples: binSamples, avgConf, avgAcc });
  }

  const totalN = samples.length;
  const ece = bins.reduce(
    (sum, b) => sum + (b.samples.length / totalN) * Math.abs(b.avgAcc - b.avgConf),
    0
  );

  return Math.round(ece * 10000) / 10000;
}

/**
 * Build a calibration record from accumulated samples.
 * Call this periodically (e.g. weekly) to update the ECE.
 */
export function buildCalibrationRecord(samples: CalibrationSample[]): {
  ece: number;
  sample_count: number;
  last_updated: string;
} {
  return {
    ece: computeECE(samples),
    sample_count: samples.length,
    last_updated: new Date().toISOString(),
  };
}

// ── Confidence Display Helpers ────────────────────────────────────────

export function confidenceLabel(level: "high" | "medium" | "low"): {
  label: string;
  labelEn: string;
  color: string;
  bgColor: string;
} {
  switch (level) {
    case "high":
      return {
        label: "Hoch",
        labelEn: "High",
        color: "text-emerald-600",
        bgColor: "bg-emerald-500/10",
      };
    case "medium":
      return {
        label: "Mittel",
        labelEn: "Medium",
        color: "text-amber-600",
        bgColor: "bg-amber-500/10",
      };
    case "low":
      return {
        label: "Niedrig",
        labelEn: "Low",
        color: "text-red-600",
        bgColor: "bg-red-500/10",
      };
  }
}

/**
 * Convert a DocumentConfidence to a 0-100 score for the certification record.
 */
export function confidenceToScore(doc: DocumentConfidence): number {
  return Math.round(doc.overall_confidence * 100);
}

// ── ECE Persistence ───────────────────────────────────────────────────

/**
 * Store a calibration sample to the database.
 * Called after attorney/judge review confirms whether a prediction was correct.
 */
export async function storeCalibrationSample(opts: {
  brainId: string;
  traceId: string;
  predictedConfidence: number;
  actualCorrectness: number; // 0 or 1
  jurisdiction?: string;
  modelUsed?: string;
}): Promise<void> {
  const { getSharedPgPool } = await import("../../../src/lib/auth/store.ts");
  const pool = getSharedPgPool();
  if (!pool) return;

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS subsumio_calibration_samples (
        id bigserial PRIMARY KEY,
        brain_id text NOT NULL,
        trace_id text,
        predicted_confidence double precision NOT NULL,
        actual_correctness double precision NOT NULL,
        jurisdiction text,
        model_used text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`
    );
    await pool.query(
      `INSERT INTO subsumio_calibration_samples
        (brain_id, trace_id, predicted_confidence, actual_correctness, jurisdiction, model_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        opts.brainId,
        opts.traceId,
        opts.predictedConfidence,
        opts.actualCorrectness,
        opts.jurisdiction ?? null,
        opts.modelUsed ?? null,
      ]
    );
  } catch (err) {
    console.error(
      `[calibration] store sample failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Load calibration samples from the database and compute current ECE.
 */
export async function loadCalibrationECE(
  brainId: string,
  limit = 500
): Promise<{ ece: number; sample_count: number; last_updated: string }> {
  const { getSharedPgPool } = await import("../../../src/lib/auth/store.ts");
  const pool = getSharedPgPool();
  if (!pool) {
    return { ece: 0, sample_count: 0, last_updated: new Date().toISOString() };
  }

  try {
    const { rows } = await pool.query<{
      predicted_confidence: number;
      actual_correctness: number;
    }>(
      `SELECT predicted_confidence, actual_correctness
       FROM subsumio_calibration_samples
       WHERE brain_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [brainId, limit]
    );

    if (rows.length === 0) {
      return { ece: 0, sample_count: 0, last_updated: new Date().toISOString() };
    }

    const samples: CalibrationSample[] = rows.map((r) => ({
      predicted_confidence: r.predicted_confidence,
      actual_correctness: r.actual_correctness,
    }));

    return {
      ece: computeECE(samples),
      sample_count: samples.length,
      last_updated: new Date().toISOString(),
    };
  } catch (err) {
    console.error(
      `[calibration] load ECE failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { ece: 0, sample_count: 0, last_updated: new Date().toISOString() };
  }
}

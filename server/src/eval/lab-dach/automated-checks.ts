/**
 * LAB-DACH v3 — Automated Criteria Checker
 *
 * Runs deterministic (non-LLM) checks against task outputs.
 * Each check returns { passed, details, critical }.
 *
 * Uses:
 *   - Citation Guardrail v2 (citation_grounded_v2, law_valid, substantiated_uncertainty, jurisdiction_correct)
 *   - Language detection (language_german)
 *   - Citation count (min_citations)
 *   - Corpus receipt validation (source_provenance)
 */

import { checkCitationGrounding, extractCitations } from "../../core/citation-guardrail.ts";
import { isOfficialSource, type CorpusReceipt } from "../../core/legal/corpus-receipt.ts";
import type { Jurisdiction } from "../../core/legal/corpus-receipt.ts";
import type { AutomatedCheckId, CriterionResult } from "./types.ts";

// ── Check Result ──────────────────────────────────────────────────────

export interface AutomatedCheckResult {
  passed: boolean;
  details: string;
  critical: boolean;
  automated_check: AutomatedCheckId;
}

// ── Check Context ─────────────────────────────────────────────────────

export interface CheckContext {
  /** The agent's output text */
  output: string;
  /** The context provided to the agent (retrieved law chunks) */
  context: string;
  /** Jurisdiction of the task */
  jurisdiction: Jurisdiction;
  /** Top-level slugs of corpus files in context */
  topSlugs?: string[];
  /** Expected laws (from task definition) */
  expectedLaws?: string[];
  /** Min citations (from task params) */
  minCitations?: number;
  /** Available corpus receipts (for source_provenance check) */
  corpusReceipts?: CorpusReceipt[];
}

// ── Individual Checks ─────────────────────────────────────────────────

/**
 * Check 1: citation_grounded_v2
 * All § citations in the output must be grounded in the provided context.
 */
export function checkCitationGrounded(ctx: CheckContext): AutomatedCheckResult {
  const result = checkCitationGrounding({
    answer: ctx.output,
    context: ctx.context,
    topSlugs: ctx.topSlugs ?? [],
  });

  const ungrounded = result.flags.filter(
    (f) => f.type === "ungrounded_citation" && f.severity === "high"
  );

  return {
    passed: ungrounded.length === 0,
    details:
      ungrounded.length === 0
        ? "All § citations are grounded in context"
        : `${ungrounded.length} ungrounded citation(s): ${ungrounded.map((f) => f.detail).join("; ")}`,
    critical: true,
    automated_check: "citation_grounded_v2",
  };
}

/**
 * Check 2: law_valid
 * All referenced law abbreviations must be valid for the jurisdiction.
 */
export function checkLawValid(ctx: CheckContext): AutomatedCheckResult {
  const result = checkCitationGrounding({
    answer: ctx.output,
    context: ctx.context,
    topSlugs: ctx.topSlugs ?? [],
  });

  const nonExistent = result.flags.filter((f) => f.type === "non_existent_law");
  const fabricated = result.flags.filter((f) => f.type === "fabricated_reference");

  const allBad = [...nonExistent, ...fabricated];

  return {
    passed: allBad.length === 0,
    details:
      allBad.length === 0
        ? "All law abbreviations are valid"
        : `${allBad.length} invalid law reference(s): ${allBad.map((f) => f.detail).join("; ")}`,
    critical: true,
    automated_check: "law_valid",
  };
}

/**
 * Check 3: substantiated_uncertainty
 * No unsubstantiated uncertainty (vague hedging without legal reasoning).
 */
export function checkSubstantiatedUncertainty(ctx: CheckContext): AutomatedCheckResult {
  const result = checkCitationGrounding({
    answer: ctx.output,
    context: ctx.context,
    topSlugs: ctx.topSlugs ?? [],
  });

  const uncertaintyFlags = result.flags.filter((f) => f.type === "unsubstantiated_uncertainty");

  return {
    passed: uncertaintyFlags.length === 0,
    details:
      uncertaintyFlags.length === 0
        ? "No unsubstantiated uncertainty detected"
        : `${uncertaintyFlags.length} unsubstantiated uncertainty phrase(s): ${result.unsubstantiated_uncertainty_phrases.join("; ")}`,
    critical: false,
    automated_check: "substantiated_uncertainty",
  };
}

/**
 * Check 4: language_german
 * Output must be written in German.
 */
export function checkLanguageGerman(ctx: CheckContext): AutomatedCheckResult {
  const germanWords = [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "wird",
    "nach",
    "von",
    "zu",
    "mit",
    "auf",
    "für",
    "nicht",
    "ein",
    "eine",
    "im",
    "in",
    "den",
    "dem",
    "des",
    "wird",
    "kann",
    "muss",
    "soll",
    "hat",
    "wird",
    "bei",
    "durch",
    "über",
  ];
  const words = ctx.output.toLowerCase().split(/\s+/);
  const germanCount = words.filter((w) => germanWords.includes(w.replace(/[^\wäöüß]/g, ""))).length;
  const isGerman = germanCount >= 5;

  return {
    passed: isGerman,
    details: isGerman
      ? `Output is in German (${germanCount} German function words detected)`
      : `Output does not appear to be German (only ${germanCount} German function words)`,
    critical: false,
    automated_check: "language_german",
  };
}

/**
 * Check 5: min_citations
 * Output must cite at least N legal sources.
 */
export function checkMinCitations(ctx: CheckContext): AutomatedCheckResult {
  const min = ctx.minCitations ?? 1;
  const citations = extractCitations(ctx.output);
  const uniqueLaws = new Set(citations.map((c) => c.law).filter(Boolean));

  return {
    passed: uniqueLaws.size >= min,
    details:
      uniqueLaws.size >= min
        ? `Output cites ${uniqueLaws.size} unique law(s): ${Array.from(uniqueLaws).join(", ")}`
        : `Output cites only ${uniqueLaws.size} law(s), expected at least ${min}`,
    critical: true,
    automated_check: "min_citations",
  };
}

/**
 * Check 6: jurisdiction_correct
 * Output must not cite laws from wrong jurisdiction (cross-law contamination).
 */
export function checkJurisdictionCorrect(ctx: CheckContext): AutomatedCheckResult {
  const result = checkCitationGrounding({
    answer: ctx.output,
    context: ctx.context,
    topSlugs: ctx.topSlugs ?? [],
  });

  const contamination = result.flags.filter((f) => f.type === "cross_law_contamination");

  return {
    passed: contamination.length === 0,
    details:
      contamination.length === 0
        ? `No cross-law contamination detected (jurisdiction: ${ctx.jurisdiction})`
        : `${contamination.length} cross-law contamination(s): ${contamination.map((f) => f.detail).join("; ")}`,
    critical: true,
    automated_check: "jurisdiction_correct",
  };
}

/**
 * Check 7: source_provenance
 * Cited laws must have valid corpus receipts with source_url.
 */
export function checkSourceProvenance(ctx: CheckContext): AutomatedCheckResult {
  const citations = extractCitations(ctx.output);
  const citedLaws = new Set(citations.map((c) => c.law).filter(Boolean));
  const receipts = ctx.corpusReceipts ?? [];

  const missing: string[] = [];
  const noSourceUrl: string[] = [];

  for (const law of citedLaws) {
    const receipt = receipts.find(
      (r) =>
        r.statute_code.toUpperCase() === law.toUpperCase() && r.jurisdiction === ctx.jurisdiction
    );
    if (!receipt) {
      missing.push(law);
    } else if (!receipt.source_url || receipt.source_url.trim() === "") {
      noSourceUrl.push(law);
    }
  }

  const passed = missing.length === 0 && noSourceUrl.length === 0;
  const details: string[] = [];
  if (missing.length > 0) details.push(`No corpus receipt for: ${missing.join(", ")}`);
  if (noSourceUrl.length > 0) details.push(`No source_url for: ${noSourceUrl.join(", ")}`);

  return {
    passed,
    details: passed
      ? `All ${citedLaws.size} cited law(s) have valid corpus receipts with source_url`
      : details.join("; "),
    critical: false,
    automated_check: "source_provenance",
  };
}

// ── Check Runner ──────────────────────────────────────────────────────

/**
 * Map of check ID to check function.
 */
const CHECK_FUNCTIONS: Record<AutomatedCheckId, (ctx: CheckContext) => AutomatedCheckResult> = {
  citation_grounded_v2: checkCitationGrounded,
  law_valid: checkLawValid,
  substantiated_uncertainty: checkSubstantiatedUncertainty,
  language_german: checkLanguageGerman,
  min_citations: checkMinCitations,
  jurisdiction_correct: checkJurisdictionCorrect,
  source_provenance: checkSourceProvenance,
};

/**
 * Run a single automated check by ID.
 */
export function runAutomatedCheck(
  checkId: AutomatedCheckId,
  ctx: CheckContext
): AutomatedCheckResult {
  const fn = CHECK_FUNCTIONS[checkId];
  if (!fn) {
    return {
      passed: false,
      details: `Unknown automated check: ${checkId}`,
      critical: false,
      automated_check: checkId,
    };
  }
  return fn(ctx);
}

/**
 * Run all automated checks for a task.
 * Returns CriterionResult[] for each automated criterion.
 */
export function runAllAutomatedChecks(
  automatedCheckIds: AutomatedCheckId[],
  ctx: CheckContext
): CriterionResult[] {
  return automatedCheckIds.map((checkId) => {
    const result = runAutomatedCheck(checkId, ctx);
    return {
      criterion_id: `auto-${checkId}`,
      passed: result.passed,
      details: result.details,
      critical: result.critical,
      score: result.passed ? 1.0 : 0.0,
      automated_check: checkId,
    };
  });
}

import type { Pool } from "pg";

// ── Types ─────────────────────────────────────────────────────────────

export type TreatmentLabel =
  | "positive"
  | "negative"
  | "neutral"
  | "distinguishing"
  | "overruled"
  | "limited" // eingeschränkt — judgment is confirmed but its scope is limited
  | "unknown";

export type OverallStatus = "good_law" | "bad_law" | "at_risk" | "mixed" | "unknown";

export interface BadLawSignal {
  /** The judgement ID that emits the bad-law signal. */
  source_judgement_id: string;
  /** The court that issued the negative treatment. */
  court: string;
  /** The treatment label that triggered the signal. */
  treatment: TreatmentLabel;
  /** Human-readable explanation. */
  explanation: string;
  /** Date of the negative citation. */
  date?: string;
  /** Severity: "critical" (overruled), "high" (negative by supreme court), "medium" (limited). */
  severity: "critical" | "high" | "medium";
}

export interface TreatmentClassification {
  treatment: TreatmentLabel;
  confidence: number;
  explanation: string;
}

export interface TreatmentAggregation {
  judgement_id: string;
  overall_status: OverallStatus;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  distinguishing_count: number;
  overruled_count: number;
  limited_count: number;
  unknown_count: number;
  total_citations: number;
  time_weighted_score: number;
  court_hierarchy: Record<string, { positive: number; negative: number; neutral: number }>;
  at_risk_reasons: string[];
  bad_law_signals: BadLawSignal[];
  last_citation_date: string | null;
}

// ── Court hierarchy weights (higher = more authoritative) ─────────────

const COURT_HIERARCHY_WEIGHTS: Record<string, number> = {
  supreme: 1.0,
  appeals: 0.7,
  specialized: 0.6,
  district: 0.4,
};

// ── Time decay function ───────────────────────────────────────────────
// Recent citations weigh more than old ones.
// Half-life: 5 years (citations older than 5 years weigh half as much)

function timeWeight(citationDate: Date, referenceDate: Date = new Date()): number {
  const yearsAgo =
    (referenceDate.getTime() - citationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.exp(-0.1386 * yearsAgo); // ln(2)/5 ≈ 0.1386 for 5-year half-life
}

// ── LLM-Ensemble Treatment Classification ─────────────────────────────
//
// Based on UC Berkeley/Wolters Kluwer Capstone (2025):
// "3-model LLM voting system with prompt engineering to classify citation treatment"
//
// We use a single-model approach here for cost-efficiency, but the architecture
// supports ensemble voting by adding multiple model calls and majority voting.

interface LLMClassificationInput {
  citingCourt: string;
  citingDate: string;
  citedReference: string;
  contextSnippet: string;
}

async function classifyTreatmentWithLLM(
  input: LLMClassificationInput
): Promise<TreatmentClassification> {
  // Try to use the app's AI gateway if available
  // Falls back to heuristic classification if no LLM is configured
  try {
    const { ENGINE_URL, engineHeadersForBrain } = await import("@/lib/engine");
    const { env } = await import("@/lib/env");
    const brainId = env("SUBSUMIO_SYSTEM_BRAIN_ID") || "system";

    const prompt = `Du bist ein juristischer Experte für Zitationsanalyse.
Klassifiziere, wie das zitierende Gericht das zitierte Urteil behandelt.

Zitierendes Gericht: ${input.citingCourt}
Zitierendes Datum: ${input.citingDate}
Zitierte Entscheidung: ${input.citedReference}

Kontext (Textauszug um das Zitat):
"""
${input.contextSnippet}
"""

Klassifiziere die Behandlung als genau eine von:
- "positive": Das zitierende Gericht folgt/stützt sich auf das zitierte Urteil
- "negative": Das zitierende Gericht kritisiert/lehnt das zitierte Urteil ab
- "neutral": Das zitierende Gericht erwähnt das Urteil neutral/erläuternd
- "distinguishing": Das Gericht unterscheidet den Sachverhalt vom zitierten Urteil
- "overruled": Das zitierende Gericht erklärt das zitierte Urteil als überholt/aufgehoben

Antworte NUR im JSON-Format:
{"treatment": "...", "confidence": 0.0-1.0, "explanation": "Kurze Begründung"}`;

    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...engineHeadersForBrain(brainId),
      },
      body: JSON.stringify({ query: prompt, mode: "conservative" }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`Engine HTTP ${res.status}`);

    const { collectSSEChunks } = await import("@/lib/sse-stream");
    const contentType = res.headers.get("Content-Type") || "";
    let text: string;
    if (contentType.includes("text/event-stream") && res.body) {
      text = await collectSSEChunks(res.body);
    } else {
      const data = (await res.json().catch(() => ({}))) as { answer?: string };
      text = data.answer || "";
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      treatment: validateTreatmentLabel(parsed.treatment),
      confidence: Math.min(Math.max(parseFloat(parsed.confidence) || 0.5, 0), 1),
      explanation: String(parsed.explanation || ""),
    };
  } catch {
    // Fallback: heuristic classification based on keywords in context
    return heuristicClassification(input);
  }
}

function validateTreatmentLabel(label: string): TreatmentLabel {
  const valid: TreatmentLabel[] = [
    "positive",
    "negative",
    "neutral",
    "distinguishing",
    "overruled",
    "limited",
    "unknown",
  ];
  const normalized = label.toLowerCase().trim() as TreatmentLabel;
  return valid.includes(normalized) ? normalized : "unknown";
}

function heuristicClassification(input: LLMClassificationInput): TreatmentClassification {
  const ctx = input.contextSnippet.toLowerCase();

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
  const limitedSignals = [
    "eingeschränkt",
    "einschränkend",
    "nur eingeschränkt",
    "mit einschränkung",
    "teilweise überholt",
    "insoweit aufgehoben",
    "jedenfalls insoweit nicht",
  ];

  if (overruledSignals.some((s) => ctx.includes(s))) {
    return {
      treatment: "overruled",
      confidence: 0.7,
      explanation: "Heuristic: overruled signal detected",
    };
  }
  if (limitedSignals.some((s) => ctx.includes(s))) {
    return {
      treatment: "limited",
      confidence: 0.65,
      explanation: "Heuristic: limited (eingeschränkt) signal detected",
    };
  }
  if (negativeSignals.some((s) => ctx.includes(s))) {
    return {
      treatment: "negative",
      confidence: 0.6,
      explanation: "Heuristic: negative signal detected",
    };
  }
  if (distinguishingSignals.some((s) => ctx.includes(s))) {
    return {
      treatment: "distinguishing",
      confidence: 0.6,
      explanation: "Heuristic: distinguishing signal detected",
    };
  }
  if (positiveSignals.some((s) => ctx.includes(s))) {
    return {
      treatment: "positive",
      confidence: 0.6,
      explanation: "Heuristic: positive signal detected",
    };
  }

  return {
    treatment: "neutral",
    confidence: 0.3,
    explanation: "Heuristic: no strong signal, defaulting to neutral",
  };
}

// ── Classify a single citation ────────────────────────────────────────

export async function classifyCitation(
  pool: Pool,
  citationId: number
): Promise<TreatmentClassification> {
  const result = await pool.query(
    `SELECT c.*, j_citing.court as citing_court, j_citing.decision_date as citing_date
     FROM subsumio_judgement_citations c
     JOIN subsumio_judgements j_citing ON c.citing_id = j_citing.id
     WHERE c.id = $1`,
    [citationId]
  );

  const row = result.rows[0];
  if (!row) throw new Error(`Citation ${citationId} not found`);

  const classification = await classifyTreatmentWithLLM({
    citingCourt: row.citing_court,
    citingDate: row.citing_date,
    citedReference: row.cited_reference,
    contextSnippet: row.context_snippet ?? "",
  });

  // Update citation with classification
  await pool.query(
    `UPDATE subsumio_judgement_citations
     SET treatment = $1, treatment_confidence = $2, treatment_explanation = $3,
         validated_at = now()
     WHERE id = $4`,
    [classification.treatment, classification.confidence, classification.explanation, citationId]
  );

  return classification;
}

// ── Aggregate treatments for a judgement (Shepard's Signal equivalent) ─

export async function aggregateTreatments(
  pool: Pool,
  judgementId: string
): Promise<TreatmentAggregation> {
  // Get all incoming citations (cases that cite this one)
  const result = await pool.query(
    `SELECT c.treatment, c.treatment_confidence, c.extracted_at,
            j_citing.court as citing_court, j_citing.court_level as citing_court_level,
            j_citing.decision_date as citing_date
     FROM subsumio_judgement_citations c
     JOIN subsumio_judgements j_citing ON c.citing_id = j_citing.id
     WHERE c.cited_id = $1 AND c.treatment != 'unknown'
     ORDER BY j_citing.decision_date DESC`,
    [judgementId]
  );

  const counts: Record<TreatmentLabel, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
    distinguishing: 0,
    overruled: 0,
    limited: 0,
    unknown: 0,
  };

  let timeWeightedScore = 0;
  const courtHierarchy: Record<string, { positive: number; negative: number; neutral: number }> =
    {};
  const atRiskReasons: string[] = [];
  const badLawSignals: BadLawSignal[] = [];
  let lastCitationDate: Date | null = null;

  for (const row of result.rows) {
    const treatment = row.treatment as TreatmentLabel;
    counts[treatment] = (counts[treatment] || 0) + 1;

    // Time-weighted score
    if (row.citing_date) {
      const citeDate = new Date(row.citing_date);
      const tw = timeWeight(citeDate);
      const courtWeight = COURT_HIERARCHY_WEIGHTS[row.citing_court_level ?? "district"] ?? 0.4;

      if (treatment === "positive") {
        timeWeightedScore += tw * courtWeight;
      } else if (treatment === "negative" || treatment === "overruled") {
        timeWeightedScore -= tw * courtWeight * 1.5; // Negative signals weigh 1.5x
      } else if (treatment === "limited") {
        timeWeightedScore -= tw * courtWeight * 0.5; // Limited signals weigh 0.5x (less severe)
      }

      if (!lastCitationDate || citeDate > lastCitationDate) {
        lastCitationDate = citeDate;
      }
    }

    // Court hierarchy breakdown
    const level = row.citing_court_level ?? "unknown";
    if (!courtHierarchy[level]) {
      courtHierarchy[level] = { positive: 0, negative: 0, neutral: 0 };
    }
    if (treatment === "positive") courtHierarchy[level].positive++;
    else if (treatment === "negative" || treatment === "overruled")
      courtHierarchy[level].negative++;
    else if (treatment === "neutral") courtHierarchy[level].neutral++;

    // At-risk detection: if a supreme court says negative
    if (treatment === "negative" && row.citing_court_level === "supreme") {
      atRiskReasons.push(`Negativ behandelt durch ${row.citing_court} (Obergericht)`);
      badLawSignals.push({
        source_judgement_id: row.citing_id ?? judgementId,
        court: row.citing_court ?? "unknown",
        treatment: "negative",
        explanation: `Negativ behandelt durch ${row.citing_court} (Obergericht)`,
        date: row.citing_date ? new Date(row.citing_date).toISOString().split("T")[0] : undefined,
        severity: "high",
      });
    }
    if (treatment === "overruled") {
      atRiskReasons.push(`Als überholt erklärt durch ${row.citing_court}`);
      badLawSignals.push({
        source_judgement_id: row.citing_id ?? judgementId,
        court: row.citing_court ?? "unknown",
        treatment: "overruled",
        explanation: `Als überholt erklärt durch ${row.citing_court}`,
        date: row.citing_date ? new Date(row.citing_date).toISOString().split("T")[0] : undefined,
        severity: "critical",
      });
    }
    if (treatment === "limited" && row.citing_court_level === "supreme") {
      atRiskReasons.push(`Eingeschränkt durch ${row.citing_court} (Obergericht)`);
      badLawSignals.push({
        source_judgement_id: row.citing_id ?? judgementId,
        court: row.citing_court ?? "unknown",
        treatment: "limited",
        explanation: `Eingeschränkt durch ${row.citing_court} (Obergericht)`,
        date: row.citing_date ? new Date(row.citing_date).toISOString().split("T")[0] : undefined,
        severity: "medium",
      });
    }
  }

  // Determine overall status
  let overallStatus: OverallStatus = "unknown";
  const total = result.rows.length;

  if (total === 0) {
    overallStatus = "unknown";
  } else if (counts.overruled > 0) {
    overallStatus = "bad_law";
  } else if (counts.negative > 0 && counts.positive === 0) {
    overallStatus = "bad_law";
  } else if (counts.negative > 0 && counts.positive > 0) {
    overallStatus = "mixed";
  } else if (counts.limited > 0 && counts.positive > 0 && counts.negative === 0) {
    // Limited + positive (no negative) → at_risk (scope narrowed but not overturned)
    overallStatus = "at_risk";
  } else if (counts.limited > 0 && counts.positive === 0 && counts.negative === 0) {
    // Only limited citations → at_risk
    overallStatus = "at_risk";
  } else if (counts.positive > 0 && counts.negative === 0) {
    // Check at-risk: positive citations that cite an overruled case
    if (atRiskReasons.length > 0) {
      overallStatus = "at_risk";
    } else {
      overallStatus = "good_law";
    }
  } else if (counts.neutral > 0 && counts.positive === 0 && counts.negative === 0) {
    overallStatus = "unknown";
  }

  const aggregation: TreatmentAggregation = {
    judgement_id: judgementId,
    overall_status: overallStatus,
    positive_count: counts.positive,
    negative_count: counts.negative,
    neutral_count: counts.neutral,
    distinguishing_count: counts.distinguishing,
    overruled_count: counts.overruled,
    limited_count: counts.limited,
    unknown_count: counts.unknown,
    total_citations: total,
    time_weighted_score: Math.round(timeWeightedScore * 100) / 100,
    court_hierarchy: courtHierarchy,
    at_risk_reasons: [...new Set(atRiskReasons)],
    bad_law_signals: badLawSignals,
    last_citation_date: lastCitationDate?.toISOString().split("T")[0] ?? null,
  };

  // Persist aggregation
  await pool.query(
    `INSERT INTO subsumio_judgement_treatments
      (judgement_id, overall_status, positive_count, negative_count, neutral_count,
       distinguishing_count, overruled_count, limited_count, unknown_count, total_citations,
       time_weighted_score, court_hierarchy, at_risk_reasons, bad_law_signals, last_citation_date, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
     ON CONFLICT (judgement_id) DO UPDATE SET
       overall_status = EXCLUDED.overall_status,
       positive_count = EXCLUDED.positive_count,
       negative_count = EXCLUDED.negative_count,
       neutral_count = EXCLUDED.neutral_count,
       distinguishing_count = EXCLUDED.distinguishing_count,
       overruled_count = EXCLUDED.overruled_count,
       limited_count = EXCLUDED.limited_count,
       unknown_count = EXCLUDED.unknown_count,
       total_citations = EXCLUDED.total_citations,
       time_weighted_score = EXCLUDED.time_weighted_score,
       court_hierarchy = EXCLUDED.court_hierarchy,
       at_risk_reasons = EXCLUDED.at_risk_reasons,
       bad_law_signals = EXCLUDED.bad_law_signals,
       last_citation_date = EXCLUDED.last_citation_date,
       computed_at = now()`,
    [
      judgementId,
      aggregation.overall_status,
      aggregation.positive_count,
      aggregation.negative_count,
      aggregation.neutral_count,
      aggregation.distinguishing_count,
      aggregation.overruled_count,
      aggregation.limited_count,
      aggregation.unknown_count,
      aggregation.total_citations,
      aggregation.time_weighted_score,
      JSON.stringify(aggregation.court_hierarchy),
      aggregation.at_risk_reasons,
      JSON.stringify(aggregation.bad_law_signals),
      aggregation.last_citation_date,
    ]
  );

  // Also update the judgement's treatment_status and summary
  const summaryText =
    aggregation.at_risk_reasons.length > 0
      ? aggregation.at_risk_reasons.join("; ")
      : `${aggregation.overall_status} (${aggregation.positive_count} positiv, ${aggregation.negative_count} negativ, ${aggregation.neutral_count} neutral)`;

  await pool.query(
    `UPDATE subsumio_judgements
     SET treatment_status = $1, treatment_summary = $2, treatment_updated_at = now()
     WHERE id = $3`,
    [aggregation.overall_status, summaryText, judgementId]
  );

  return aggregation;
}

// ── Batch classify citations for a judgement ──────────────────────────

export async function classifyCitationsForJudgement(
  pool: Pool,
  judgementId: string
): Promise<{ classified: number; errors: number }> {
  const result = await pool.query(
    `SELECT id FROM subsumio_judgement_citations
     WHERE citing_id = $1 AND treatment = 'unknown'
     ORDER BY extracted_at ASC`,
    [judgementId]
  );

  let classified = 0;
  let errors = 0;

  for (const row of result.rows) {
    try {
      await classifyCitation(pool, row.id);
      classified++;
    } catch (err) {
      errors++;
      console.error(`[legal-graph] Failed to classify citation ${row.id}:`, err);
    }
  }

  // After classifying all citations, aggregate treatments
  if (classified > 0) {
    await aggregateTreatments(pool, judgementId);
  }

  return { classified, errors };
}

// ── Batch validate all unvalidated citations ──────────────────────────

export async function batchValidateCitations(
  pool: Pool,
  opts: { batchSize?: number; maxItems?: number } = {}
): Promise<{ processed: number; classified: number; errors: number }> {
  const batchSize = opts.batchSize ?? 50;
  const maxItems = opts.maxItems ?? 500;

  let processed = 0;
  let classified = 0;
  let errors = 0;
  let offset = 0;

  while (processed < maxItems) {
    const result = await pool.query(
      `SELECT id FROM subsumio_judgement_citations
       WHERE treatment = 'unknown' AND validated_at IS NULL
       ORDER BY extracted_at ASC
       LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      try {
        await classifyCitation(pool, row.id);
        classified++;
      } catch (err) {
        errors++;
        console.error(`[legal-graph] Failed to classify citation ${row.id}:`, err);
      }
      processed++;
    }

    offset += batchSize;
  }

  // Re-aggregate treatments for all affected judgements
  const affectedResult = await pool.query(
    `SELECT DISTINCT cited_id FROM subsumio_judgement_citations
     WHERE validated_at > now() - interval '1 hour' AND cited_id IS NOT NULL`
  );

  for (const row of affectedResult.rows) {
    if (row.cited_id) {
      try {
        await aggregateTreatments(pool, row.cited_id);
      } catch (err) {
        console.error(`[legal-graph] Failed to aggregate treatments for ${row.cited_id}:`, err);
      }
    }
  }

  return { processed, classified, errors };
}

// ── Active Negative Authority Search ──────────────────────────────────
//
// Given a judgement, actively search for cases that might have negatively
// treated it (overruled, limited, or contradicted). This is the "negative
// authority" or "red flag" search — the complement of Shepard's/Signal.
//
// Instead of passively waiting for citation graph data, this function
// actively searches the corpus for known negative treatment patterns.

export interface NegativeAuthorityResult {
  /** The judgement that might be negatively treated. */
  judgementId: string;
  /** Potential negative treatments found. */
  findings: NegativeAuthorityFinding[];
  /** Whether any critical signals were found. */
  hasCriticalSignals: boolean;
  /** Summary for display. */
  summary: string;
}

export interface NegativeAuthorityFinding {
  /** The citing judgement that might treat the target negatively. */
  citingJudgementId?: string;
  /** The court of the citing judgement. */
  court?: string;
  /** The date of the citing judgement. */
  date?: string;
  /** The detected treatment type. */
  treatment: TreatmentLabel;
  /** The context snippet showing the treatment. */
  context: string;
  /** Confidence in the finding (0-1). */
  confidence: number;
  /** Whether this was verified via citation graph or heuristic. */
  verified: boolean;
}

/**
 * Actively search for negative authority (overruling, limitation, or contradiction)
 * for a given judgement.
 *
 * This function:
 * 1. Checks the existing citation graph for negative treatments
 * 2. Searches for the judgement's reference in other judgements' content
 *    using keyword patterns like "überholt", "aufgehoben", "eingeschränkt"
 * 3. Returns findings sorted by severity (critical > high > medium)
 */
export async function findNegativeAuthority(
  pool: Pool,
  judgementId: string
): Promise<NegativeAuthorityResult> {
  const findings: NegativeAuthorityFinding[] = [];

  // 1. Check existing citation graph for negative treatments
  const citationResult = await pool.query(
    `SELECT c.treatment, c.treatment_confidence, c.context_snippet,
            j_citing.id as citing_id, j_citing.court as citing_court,
            j_citing.decision_date as citing_date
     FROM subsumio_judgement_citations c
     JOIN subsumio_judgements j_citing ON c.citing_id = j_citing.id
     WHERE c.cited_id = $1
       AND c.treatment IN ('negative', 'overruled', 'limited', 'distinguishing')
     ORDER BY
       CASE c.treatment
         WHEN 'overruled' THEN 1
         WHEN 'negative' THEN 2
         WHEN 'limited' THEN 3
         WHEN 'distinguishing' THEN 4
       END,
       j_citing.decision_date DESC`,
    [judgementId]
  );

  for (const row of citationResult.rows) {
    findings.push({
      citingJudgementId: row.citing_id,
      court: row.citing_court,
      date: row.citing_date ? new Date(row.citing_date).toISOString().split("T")[0] : undefined,
      treatment: row.treatment as TreatmentLabel,
      context: row.context_snippet ?? "",
      confidence: row.treatment_confidence ?? 0.5,
      verified: true,
    });
  }

  // 2. Get the judgement's own reference (court + file number) for text search
  const judgementResult = await pool.query(
    "SELECT court, file_number, title, content FROM subsumio_judgements WHERE id = $1",
    [judgementId]
  );

  const judgement = judgementResult.rows[0];
  if (judgement?.file_number) {
    // Search for other judgements that mention this file number alongside negative signals
    const negativeKeywords = ["überholt", "aufgehoben", "eingeschränkt", "nicht mehr", "revidiert"];
    for (const keyword of negativeKeywords) {
      try {
        const searchResult = await pool.query(
          `SELECT id, court, decision_date, content
           FROM subsumio_judgements
           WHERE content ILIKE $1
             AND id != $2
           LIMIT 5`,
          [`%${judgement.file_number}%${keyword}%`]
        );

        for (const row of searchResult.rows) {
          // Extract context around the keyword
          const content = row.content as string;
          const idx = content.toLowerCase().indexOf(keyword);
          if (idx === -1) continue;

          const start = Math.max(0, idx - 200);
          const end = Math.min(content.length, idx + keyword.length + 200);
          const context = content.slice(start, end).trim();

          // Skip if already found via citation graph
          if (findings.some((f) => f.citingJudgementId === row.id)) continue;

          findings.push({
            citingJudgementId: row.id,
            court: row.court,
            date: row.decision_date
              ? new Date(row.decision_date).toISOString().split("T")[0]
              : undefined,
            treatment:
              keyword === "überholt" || keyword === "aufgehoben" || keyword === "nicht mehr"
                ? "overruled"
                : keyword === "eingeschränkt"
                  ? "limited"
                  : "negative",
            context,
            confidence: 0.5, // heuristic — not verified via citation graph
            verified: false,
          });
        }
      } catch {
        // fail-open
      }
    }
  }

  // Sort by severity: overruled > negative > limited > distinguishing
  const severityOrder: Record<TreatmentLabel, number> = {
    overruled: 0,
    negative: 1,
    limited: 2,
    distinguishing: 3,
    positive: 4,
    neutral: 5,
    unknown: 6,
  };
  findings.sort((a, b) => {
    const sevDiff = severityOrder[a.treatment] - severityOrder[b.treatment];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  const hasCriticalSignals = findings.some(
    (f) => f.treatment === "overruled" || (f.treatment === "negative" && f.confidence > 0.7)
  );

  const criticalCount = findings.filter((f) => f.treatment === "overruled").length;
  const negativeCount = findings.filter((f) => f.treatment === "negative").length;
  const limitedCount = findings.filter((f) => f.treatment === "limited").length;

  let summary: string;
  if (findings.length === 0) {
    summary = "Keine negativen Behandlungen gefunden (Red Flag Check: negativ)";
  } else if (hasCriticalSignals) {
    summary = `KRITISCH: ${criticalCount} überholt, ${negativeCount} negativ, ${limitedCount} eingeschränkt — Red Flag!`;
  } else {
    summary = `${findings.length} Hinweise gefunden (${criticalCount} überholt, ${negativeCount} negativ, ${limitedCount} eingeschränkt)`;
  }

  return {
    judgementId,
    findings,
    hasCriticalSignals,
    summary,
  };
}

/**
 * Get bad-law signals for a judgement — convenience function that
 * extracts just the bad-law signals from the treatment aggregation.
 *
 * This is the "signal propagation" function: it takes the aggregated
 * treatment data and produces a clean signal list that can be attached
 * to retrieval results.
 */
export async function getBadLawSignals(pool: Pool, judgementId: string): Promise<BadLawSignal[]> {
  const result = await pool.query(
    `SELECT bad_law_signals FROM subsumio_judgement_treatments WHERE judgement_id = $1`,
    [judgementId]
  );

  const signals = result.rows[0]?.bad_law_signals;
  if (!signals) return [];

  if (typeof signals === "string") {
    try {
      return JSON.parse(signals) as BadLawSignal[];
    } catch {
      return [];
    }
  }

  if (Array.isArray(signals)) return signals as BadLawSignal[];
  return [];
}

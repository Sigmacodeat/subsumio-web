/**
 * Pipeline Layer Registry — Declarative layer definitions for the modularized legal pipeline.
 *
 * Each layer declares its inputs, outputs, side effects, risk, timeout,
 * failure policy, and whether it is mandatory. This replaces the implicit
 * hardcoded layer numbering in legal-pipeline.ts with a self-documenting
 * registry that workflow definitions can reference.
 *
 * T5.4: Modularization — 27+ layers activated via feature flags / workflow definitions.
 * Only required layers execute per workflow. No hidden on_child_fail: "continue"
 * for mandatory steps.
 */

export type FailurePolicy = "fail" | "continue" | "retry_once";
export type LayerRisk = "low" | "medium" | "high";

export interface LayerDeclaration {
  /** Unique identifier, e.g. "forensic-analyst" */
  id: string;
  /** Numeric layer number for backward-compatible ordering (0-7 with sub-layers) */
  layerNumber: number;
  /** Human-readable name */
  name: string;
  /** Specialist name in EMBEDDED_SPECIALISTS. Undefined for non-specialist layers (heuristic/dedicated code). */
  specialist?: string;
  /** Input variables this layer consumes (from pipeline state or prior layers) */
  inputs: string[];
  /** Output variables this layer produces */
  outputs: string[];
  /** Side effects: page writes, DB mutations, external calls */
  sideEffects: string[];
  /** Risk level: determines verification strictness */
  risk: LayerRisk;
  /** Timeout in seconds for the layer execution */
  timeoutSec: number;
  /**
   * Failure policy for child jobs:
   * - "fail": pipeline halts if this layer fails (mandatory layers)
   * - "continue": pipeline continues with warning (non-mandatory layers)
   * - "retry_once": retry once, then fail if still failing
   */
  failurePolicy: FailurePolicy;
  /** If true, on_child_fail must NOT be "continue" — no hidden continue for mandatory steps */
  mandatory: boolean;
  /** Description of what this layer does */
  description: string;
}

// ── Layer Declarations ────────────────────────────────────────

export const LAYER_REGISTRY: LayerDeclaration[] = [
  // ── Layer 0: Document Classification ──
  {
    id: "doc-classifier",
    layerNumber: 0,
    name: "Document Classification",
    // No specialist — uses classifyLegalDocument() heuristic function
    inputs: ["part_slugs", "allTexts"],
    outputs: ["doc_types"],
    sideEffects: ["frontmatter:doc_type on each sub-page"],
    risk: "low",
    timeoutSec: 30,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Heuristic classification of each sub-page by document type (urteil, klage, vertrag, etc.)",
  },

  // ── Layer 1: ON-Scanner ──
  {
    id: "on-scanner",
    layerNumber: 1,
    name: "ON-Scanner",
    specialist: "on-scanner",
    inputs: ["part_slugs", "allTexts"],
    outputs: ["on_table", "verfahrenstyp"],
    sideEffects: ["writePage:on-index/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Extracts Gattungszeichen, Registerzeichen, Verfahrenstyp from court documents. Foundation for all downstream layers.",
  },

  // ── Layer 2: Entity-Extractor ──
  {
    id: "entity-extractor",
    layerNumber: 2,
    name: "Entity-Extractor",
    specialist: "entity-extractor",
    inputs: ["part_slugs", "allTexts", "on_table"],
    outputs: ["entities"],
    sideEffects: ["writePage:entities/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Extracts parties (client, opponent, witnesses, experts) with roles and aliases. Required for party-specific drafting.",
  },

  // ── Layer 3: Forensic Analyst ──
  {
    id: "forensic-analyst",
    layerNumber: 3,
    name: "Forensic Analyst",
    specialist: "forensic-analyst",
    inputs: [
      "on_table",
      "entities",
      "allTexts",
      "manual_overrides",
      "jurisdiction",
      "verfahrenstyp",
    ],
    outputs: ["forensic_report"],
    sideEffects: ["writePage:forensic-reports/{case_slug}"],
    risk: "high",
    timeoutSec: 300,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Structured forensic analysis: facts, timeline, legal issues, damage assessment. Core analysis layer.",
  },

  // ── Layer 3c: Fact Gap Detector ──
  {
    id: "fact-gap-detector",
    layerNumber: 3,
    name: "Fact Gap Detector",
    specialist: "fact-gap-detector",
    inputs: ["forensic_report", "legal_grounding_map"],
    outputs: ["fact_gaps", "client_questions"],
    sideEffects: ["writePage:fact-gaps/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Identifies missing facts needed for legal claims and generates targeted client questions.",
  },

  // ── Layer 4: Law Matcher ──
  {
    id: "law-matcher",
    layerNumber: 4,
    name: "Law Matcher",
    specialist: "law-matcher",
    inputs: ["forensic_report", "on_table", "entities", "jurisdiction", "verfahrenstyp"],
    outputs: ["legal_grounding_map"],
    sideEffects: ["writePage:legal-grounding/{case_slug}"],
    risk: "high",
    timeoutSec: 300,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "§-Retrieval against law corpus. Maps legal issues to specific paragraphs. Critical for citation grounding.",
  },

  // ── Layer 4b: Precedent Matcher ──
  {
    id: "precedent-matcher",
    layerNumber: 4,
    name: "Precedent Matcher",
    specialist: "precedent-matcher",
    inputs: ["legal_grounding_map", "forensic_report", "jurisdiction", "verfahrenstyp"],
    outputs: ["precedent_matches"],
    sideEffects: ["writePage:precedent-match/{case_slug}"],
    risk: "medium",
    timeoutSec: 180,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Searches for relevant case law (OGH/BGH/BVerfG) that supports or endangers legal claims.",
  },

  // ── Layer 4c: Burden of Proof ──
  {
    id: "burden-of-proof",
    layerNumber: 4,
    name: "Burden of Proof",
    specialist: "burden-of-proof-analyzer",
    inputs: [
      "forensic_report",
      "legal_grounding_map",
      "damage_table",
      "jurisdiction",
      "verfahrenstyp",
    ],
    outputs: ["burden_of_proof"],
    sideEffects: ["writePage:burden-of-proof/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Analyzes who must prove what, whether evidence is sufficient, and whether burden reversal applies.",
  },

  // ── Layer 4d: Admissibility Checker ──
  {
    id: "admissibility-checker",
    layerNumber: 4,
    name: "Admissibility Checker",
    specialist: "admissibility-checker",
    inputs: ["forensic_report", "legal_grounding_map", "jurisdiction", "verfahrenstyp"],
    outputs: ["admissibility_check"],
    sideEffects: ["writePage:admissibility-check/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Checks procedural admissibility: jurisdiction, exhaustion of remedies, statute of limitations, capacity.",
  },

  // ── Layer 4f: Evidence Quality ──
  {
    id: "evidence-quality",
    layerNumber: 4,
    name: "Evidence Quality Assessor",
    specialist: "evidence-quality-assessor",
    inputs: ["forensic_report", "entities", "jurisdiction"],
    outputs: ["evidence_quality"],
    sideEffects: ["writePage:evidence-quality/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Rates each piece of evidence by probative value and identifies evidence weaknesses.",
  },

  // ── Layer 4g: Witness & Expert ──
  {
    id: "witness-expert",
    layerNumber: 4,
    name: "Witness & Expert Analyzer",
    specialist: "witness-expert-analyzer",
    inputs: ["forensic_report", "entities", "jurisdiction"],
    outputs: ["witness_analysis"],
    sideEffects: ["writePage:witness-expert/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Evaluates witness credibility and identifies needed expert witnesses.",
  },

  // ── Layer 5: Damage + Deadline Extractor ──
  {
    id: "damage-deadline-extractor",
    layerNumber: 5,
    name: "Damage + Deadline Extractor",
    specialist: "damage-extractor",
    inputs: ["forensic_report", "on_table", "entities", "jurisdiction", "verfahrenstyp"],
    outputs: ["damage_table", "deadline_calendar"],
    sideEffects: ["writePage:damage-table/{case_slug}", "writePage:deadline-calendar/{case_slug}"],
    risk: "high",
    timeoutSec: 300,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Extracts damage claims and deadlines from case documents. Foundation for deadline validation and cost analysis.",
  },

  // ── Layer 5b: Deadline Validator ──
  {
    id: "deadline-validator",
    layerNumber: 5,
    name: "Deadline Validator",
    specialist: "deadline-validator",
    inputs: ["deadline_calendar", "damage_table", "jurisdiction"],
    outputs: ["deadline_validation"],
    sideEffects: ["writePage:deadline-validation/{case_slug}"],
    risk: "high",
    timeoutSec: 120,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Validates extracted deadlines against statutory limitation rules (§ 1489 ABGB, § 195 BGB, etc.) to prevent liability.",
  },

  // ── Layer 5c: Cost-Benefit Analyzer ──
  {
    id: "cost-benefit",
    layerNumber: 5,
    name: "Cost-Benefit Analyzer",
    specialist: "cost-benefit-analyzer",
    inputs: ["damage_table", "legal_grounding_map", "jurisdiction"],
    outputs: ["cost_benefit"],
    sideEffects: ["writePage:cost-benefit/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Calculates EV, win probability, costs (RVG/StBVV/AHGB), break-even, and risk.",
  },

  // ── Layer 5d: Settlement Analyzer ──
  {
    id: "settlement-analysis",
    layerNumber: 5,
    name: "Settlement Analyzer",
    specialist: "settlement-analyzer",
    inputs: ["damage_table", "cost_benefit", "jurisdiction"],
    outputs: ["settlement_analysis"],
    sideEffects: ["writePage:settlement-analysis/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Calculates BATNA, ZOPA, optimal settlement amount, and negotiation strategy.",
  },

  // ── Layer 5e: Enforcement Analyzer ──
  {
    id: "enforcement-analysis",
    layerNumber: 5,
    name: "Enforcement Analyzer",
    specialist: "enforcement-analyzer",
    inputs: ["damage_table", "jurisdiction"],
    outputs: ["enforcement_analysis"],
    sideEffects: ["writePage:enforcement-analysis/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Checks if a judgment can actually be enforced (assets, arrest, garnishment).",
  },

  // ── Layer 5f: Appeal Risk ──
  {
    id: "appeal-risk",
    layerNumber: 5,
    name: "Appeal Risk Analyzer",
    specialist: "appeal-risk-analyzer",
    inputs: ["forensic_report", "legal_grounding_map", "jurisdiction"],
    outputs: ["appeal_risk"],
    sideEffects: ["writePage:appeal-risk/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Assesses whether the opponent can successfully appeal.",
  },

  // ── Layer 5g: Procedural Strategy ──
  {
    id: "procedural-strategy",
    layerNumber: 5,
    name: "Procedural Strategist",
    specialist: "procedural-strategist",
    inputs: ["forensic_report", "legal_grounding_map", "damage_table", "jurisdiction"],
    outputs: ["procedural_strategy"],
    sideEffects: ["writePage:procedural-strategy/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Recommends optimal procedural steps (Arrest, Teilklage, Sicherungsmaßnahmen).",
  },

  // ── Layer 5h: Insurance Coverage ──
  {
    id: "insurance-coverage",
    layerNumber: 5,
    name: "Insurance Coverage Analyzer",
    specialist: "insurance-coverage-analyzer",
    inputs: ["damage_table", "entities", "jurisdiction"],
    outputs: ["insurance_coverage"],
    sideEffects: ["writePage:insurance-coverage/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Checks whether insurance covers the damage and if a direct action against the insurer is possible.",
  },

  // ── Layer 5i: Tax Impact ──
  {
    id: "tax-impact",
    layerNumber: 5,
    name: "Tax Impact Analyzer",
    specialist: "tax-impact-analyzer",
    inputs: ["damage_table", "cost_benefit", "jurisdiction"],
    outputs: ["tax_impact"],
    sideEffects: ["writePage:tax-impact/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Calculates net EV after taxes, compares settlement vs. judgment taxation.",
  },

  // ── Layer 5j: Counterclaim Risk ──
  {
    id: "counterclaim-risk",
    layerNumber: 5,
    name: "Counterclaim Risk Analyzer",
    specialist: "counterclaim-analyzer",
    inputs: ["forensic_report", "legal_grounding_map", "jurisdiction"],
    outputs: ["counterclaim_risk"],
    sideEffects: ["writePage:counterclaim-risk/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Identifies potential counterclaims, setoffs, and cross-claims from the opponent.",
  },

  // ── Layer 5k: Mediation/ADR ──
  {
    id: "mediation-adr",
    layerNumber: 5,
    name: "Mediation/ADR Analyzer",
    specialist: "mediation-adr-analyzer",
    inputs: ["forensic_report", "cost_benefit", "settlement_analysis", "jurisdiction"],
    outputs: ["mediation_adr"],
    sideEffects: ["writePage:mediation-adr/{case_slug}"],
    risk: "low",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Recommends mediation, arbitration, Schlichtung vs. gerichtlich.",
  },

  // ── Layer 5l: Limitation Scanner ──
  {
    id: "limitation-scanner",
    layerNumber: 5,
    name: "Limitation Scanner",
    specialist: "limitation-scanner",
    inputs: ["damage_table", "entities", "jurisdiction"],
    outputs: ["limitation_scan"],
    sideEffects: ["writePage:limitation-scan/{case_slug}"],
    risk: "high",
    timeoutSec: 120,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Scans each claim for Verjährungsfrist, identifies urgent and verjährte Ansprüche. Liability-critical.",
  },

  // ── Layer 5m: Cost Award ──
  {
    id: "cost-award",
    layerNumber: 5,
    name: "Cost Award Predictor",
    specialist: "cost-award-predictor",
    inputs: ["damage_table", "cost_benefit", "jurisdiction"],
    outputs: ["cost_award"],
    sideEffects: ["writePage:cost-award/{case_slug}"],
    risk: "medium",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Predicts who pays court costs in each scenario.",
  },

  // ── Layer 6: Legal Drafter ──
  {
    id: "legal-drafter",
    layerNumber: 6,
    name: "Legal Drafter",
    specialist: "legal-drafter",
    inputs: [
      "on_table",
      "entities",
      "forensic_report",
      "legal_grounding_map",
      "damage_table",
      "deadline_calendar",
      "parteirolle",
      "jurisdiction",
      "verfahrenstyp",
    ],
    outputs: ["drafts"],
    sideEffects: ["writePage:legal-drafts/{case_slug}"],
    risk: "high",
    timeoutSec: 300,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Generates jurisdiction-aware legal drafts (Klage, Klagebeantwortung, Berufung, etc.).",
  },

  // ── Layer 6.5: Counter-Argument (Opponent-Simulator) ──
  {
    id: "opponent-simulator",
    layerNumber: 6,
    name: "Counter-Argument Layer (Opponent-Simulator)",
    specialist: "opponent-simulator",
    inputs: ["drafts", "forensic_report", "legal_grounding_map"],
    outputs: ["counter_arguments", "revised_drafts"],
    sideEffects: [
      "writePage:counter-arguments/{case_slug}",
      "writePage:revised-drafts/{case_slug}",
    ],
    risk: "high",
    timeoutSec: 300,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Plays opposing counsel: reads all drafts, finds weaknesses, generates counter-arguments. Then drafter revises to refute.",
  },

  // ── Layer 7: Ensemble Critic ──
  {
    id: "ensemble-critic",
    layerNumber: 7,
    name: "Ensemble Critic",
    specialist: "legal-critic",
    inputs: ["all_layer_outputs", "jurisdiction", "verfahrenstyp"],
    outputs: ["quality_audit", "ensemble_verdict"],
    sideEffects: ["writePage:quality-audit/{case_slug}"],
    risk: "high",
    timeoutSec: 600,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "3-model consensus evaluation (GPT + DeepSeek + Grok). Majority vote on recommendation, min() on scores. Feedback loop max 2 retries.",
  },

  // ── Layer 7b: Subsumption Checker ──
  {
    id: "subsumption-checker",
    layerNumber: 7,
    name: "Subsumption Checker",
    specialist: "subsumption-checker",
    inputs: ["forensic_report", "legal_grounding_map", "drafts"],
    outputs: ["subsumption_check"],
    sideEffects: ["writePage:subsumption-check/{case_slug}"],
    risk: "high",
    timeoutSec: 300,
    failurePolicy: "fail",
    mandatory: true,
    description:
      "Pre-critic: Obersatz → Untersatz → Schluss subsumption verification. Checks legal logic chain.",
  },

  // ── Post-Pipeline: Contradiction Probe ──
  {
    id: "contradiction-probe",
    layerNumber: 8,
    name: "Contradiction Probe",
    // No specialist — uses runContradictionProbe() dedicated runner
    inputs: ["all_layer_output_pages", "part_slugs"],
    outputs: ["contradiction_findings"],
    sideEffects: ["writeRunRow:eval_contradictions_runs"],
    risk: "medium",
    timeoutSec: 300,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Auto-triggered post-pipeline: searches for contradictions between pipeline outputs and original case pages.",
  },

  // ── Post-Pipeline: Cross-Case Matrix ──
  {
    id: "cross-case-matrix",
    layerNumber: 8,
    name: "Cross-Case Liability Matrix",
    specialist: "cross-case-matrix",
    inputs: ["related_case_slugs", "entities", "damage_table"],
    outputs: ["cross_case_matrix"],
    sideEffects: ["writePage:cross-case-matrix/{case_slug}"],
    risk: "medium",
    timeoutSec: 180,
    failurePolicy: "continue",
    mandatory: false,
    description:
      "Generates fall-übergreifende Haftungsmatrix + Master-Schadenstabelle for multi-case mandates.",
  },

  // ── Post-Pipeline: Institution Checklist ──
  {
    id: "institution-checklist",
    layerNumber: 8,
    name: "Institution Checklist",
    specialist: "institution-checklist",
    inputs: ["jurisdiction", "verfahrenstyp", "additional_opponents"],
    outputs: ["institution_checklist"],
    sideEffects: ["writePage:institution-checklist/{case_slug}"],
    risk: "low",
    timeoutSec: 120,
    failurePolicy: "continue",
    mandatory: false,
    description: "Identifies which institutions need to be notified for this case.",
  },
];

// ── Helper Functions ──────────────────────────────────────────

const LAYER_MAP: Map<string, LayerDeclaration> = new Map(LAYER_REGISTRY.map((l) => [l.id, l]));

const LAYER_BY_NUMBER: Map<number, LayerDeclaration[]> = new Map();
for (const layer of LAYER_REGISTRY) {
  const existing = LAYER_BY_NUMBER.get(layer.layerNumber) ?? [];
  existing.push(layer);
  LAYER_BY_NUMBER.set(layer.layerNumber, existing);
}

export function getLayerDeclaration(id: string): LayerDeclaration | undefined {
  return LAYER_MAP.get(id);
}

export function getLayersByNumber(n: number): LayerDeclaration[] {
  return LAYER_BY_NUMBER.get(n) ?? [];
}

export function getAllLayerIds(): string[] {
  return LAYER_REGISTRY.map((l) => l.id);
}

/**
 * Resolve the failure policy for a layer.
 * Mandatory layers always use "fail" — no hidden "continue".
 */
export function resolveFailurePolicy(layerId: string): FailurePolicy {
  const layer = LAYER_MAP.get(layerId);
  if (!layer) return "continue";
  if (layer.mandatory) return "fail";
  return layer.failurePolicy;
}

/**
 * Check if a layer is mandatory.
 * Mandatory layers must NOT have on_child_fail: "continue".
 */
export function isMandatoryLayer(layerId: string): boolean {
  const layer = LAYER_MAP.get(layerId);
  return layer?.mandatory ?? false;
}

/**
 * Get the on_child_fail value for a layer.
 * Mandatory layers → "fail_parent", non-mandatory → "continue".
 * Matches the ChildFailPolicy type from types.ts.
 */
export function getChildFailPolicy(layerId: string): "fail_parent" | "continue" {
  const policy = resolveFailurePolicy(layerId);
  if (policy === "fail") return "fail_parent";
  return "continue";
}

/**
 * Validate that no mandatory layer has on_child_fail: "continue".
 * Returns list of violations (empty = OK).
 */
export function validateNoHiddenContinue(): Array<{ layerId: string; issue: string }> {
  const violations: Array<{ layerId: string; issue: string }> = [];
  for (const layer of LAYER_REGISTRY) {
    if (layer.mandatory && layer.failurePolicy === "continue") {
      violations.push({
        layerId: layer.id,
        issue: `Mandatory layer "${layer.name}" has failurePolicy "continue" — must be "fail" or "retry_once"`,
      });
    }
  }
  return violations;
}

/**
 * Get all mandatory layer IDs.
 */
export function getMandatoryLayerIds(): string[] {
  return LAYER_REGISTRY.filter((l) => l.mandatory).map((l) => l.id);
}

/**
 * Get all non-mandatory (optional) layer IDs.
 */
export function getOptionalLayerIds(): string[] {
  return LAYER_REGISTRY.filter((l) => !l.mandatory).map((l) => l.id);
}

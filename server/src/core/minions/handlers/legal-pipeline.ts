/**
 * Legal Pipeline Handler — 7-Layer Agent Pipeline V2 (v0.46).
 *
 * Automatische Fallaufarbeitung nach Upload eines Gerichtsakts.
 * Feste 7-Layer-Sequenz mit Map-Reduce, Cross-Layer-Validation,
 * Pipeline-State-Tracking und strukturierten Page-Outputs.
 *
 * Architektur:
 *   Layer 1: ON-Scanner (Haiku) → on_index page
 *   Layer 2: Entity-Extractor (Haiku) → entity pages
 *   Layer 3: Forensic Analyst (Sonnet) → forensic_report page
 *   Layer 3c: Fact Gap Detector (Sonnet) → fact_gap page (Sachverhaltslücken, Mandantenfragen)
 *   Layer 4: Law Matcher (Haiku) → legal_grounding_map page (§-Retrieval)
 *   Layer 4b: Precedent Matcher (Sonnet) → precedent_match page (OGH/BGH/BVerfG)
 *   Layer 4c: Burden of Proof (Sonnet) → burden_of_proof page (Beweislastverteilung)
 *   Layer 4d: Admissibility Checker (Sonnet) → admissibility_check page (Zulässigkeit)
 *   Layer 4f: Evidence Quality Assessor (Sonnet) → evidence_quality page (Beweiskraft, Schwachstellen)
 *   Layer 4g: Witness & Expert Analyzer (Sonnet) → witness_expert page (Zeugen, Gutachter)
 *   Layer 5: Damage+Deadline Extractor (Sonnet) → damage_table + deadline_calendar pages
 *   Layer 5b: Deadline Validator (Sonnet) → deadline_validation page (§-cross-check)
 *   Layer 5c: Cost-Benefit Analyzer (Sonnet) → cost_benefit page (EV, Break-Even, Risiko)
 *   Layer 5d: Settlement Analyzer (Sonnet) → settlement_analysis page (BATNA, ZOPA, Verhandlung)
 *   Layer 5e: Enforcement Analyzer (Sonnet) → enforcement_analysis page (Vollstreckung, Arrest)
 *   Layer 5f: Appeal Risk Analyzer (Sonnet) → appeal_risk page (Berufung, Revision, EGMR)
 *   Layer 5g: Procedural Strategist (Sonnet) → procedural_strategy page (Schritte, Arrest, Teilklage)
 *   Layer 5h: Insurance Coverage Analyzer (Sonnet) → insurance_coverage page (Deckung, Direktklage)
 *   Layer 5i: Tax Impact Analyzer (Sonnet) → tax_impact page (Netto-EV, Vergleich vs. Urteil)
 *   Layer 5j: Counterclaim Risk Analyzer (Sonnet) → counterclaim_risk page (Widerklage, Aufrechnung)
 *   Layer 5k: Mediation/ADR Analyzer (Sonnet) → mediation_adr page (Mediation, Schiedsverfahren, Schlichtung)
 *   Layer 5l: Limitation Scanner (Sonnet) → limitation_scan page (Verjährung pro Anspruch, URGENT/WARNUNG/OK)
 *   Layer 5m: Cost Award Predictor (Sonnet) → cost_award page (Kostenentscheidung, Netto-Kosten pro Szenario)
 *   Layer 6: Legal Drafter (Sonnet) → legal_draft pages (jurisdiction-aware: AT/DE/CH/EU)
 *   Layer 6.5: Counter-Argument Layer (Opponent-Simulator) → counter-arguments page
 *              + Draft Rebuttal (revised drafts with refutations)
 *   Layer 7: Ensemble Critic (3-Model Consensus: GPT-5.4 + DeepSeek + Gemini)
 *            + Subsumption Check (pre-critic: Obersatz → Untersatz → Schluss)
 *            → quality_audit page + Feedback Loop (max 2 retries)
 *   Post-Pipeline: Contradiction Probe Auto-Trigger → eval_contradictions_runs
 *
 * Ensemble Critic:
 *   - 3 models evaluate independently → majority vote on recommendation
 *   - min() on scores (conservative — worst-case wins)
 *   - If consensus ≠ 'publish': retry layers with score < 70
 *   - After max 2 retries: 'completed_with_warnings' or 'needs_human_review'
 *   - LEXam paper: min(DeepSeek, Qwen3) ensemble surpasses human judges
 *
 * Specialists geben JSON zurück. Der Pipeline-Handler (trusted local caller)
 * schreibt die strukturierten Pages via engine.putPage().
 *
 * Data interface:
 *   case_slug: string         — Slug der Hauptakte (parent document)
 *   part_slugs: string[]      — Sub-Page Slugs (aus splitAndImportLargeDocument)
 *   source_id?: string        — Tenant-Stempel
 *   trigger?: string          — 'post_upload' | 'manual' | 'rerun'
 *   rerun_layers?: number[]   — Bei Re-Run: nur diese Layer neu ausführen
 *   manual_overrides?: { client?: string; opponent?: string; focus?: string }
 */

import type { MinionJobContext } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { MinionQueue } from "../queue.ts";
import { resolveSpecialist } from "../specialist-defs.ts";
import { getLayerDeclaration } from "../pipeline-registry.ts";
import { parseMarkdown } from "../../markdown.ts";
import { groundQuotes, normalizeForMatch, tryParseJSON } from "../../legal/llm-util.ts";
import { BudgetTracker, BudgetExhausted } from "../../budget/budget-tracker.ts";
import { classifyLegalDocument, legalDocTypeLabel } from "../../legal/doc-classifier.ts";
import {
  validiereGZ,
  pruefeGZKonsistenz,
  type GZValidierung,
  type KonsistenzErgebnis,
  type Verfahrenstyp as GZVerfahrenstyp,
} from "../../legal/gz-validate.ts";
import {
  resolveDraftPackages,
  detectParteirolle,
  type DraftPackage,
  type Parteirolle,
  type Nebenverfahren,
} from "../../legal/draft-packages.ts";
import { runContradictionProbe } from "../../eval-contradictions/runner.ts";
import { writeRunRow } from "../../eval-contradictions/trends.ts";
import { FileSystemCorpusLookupAdapter } from "../../legal/corpus-lookup-adapter.ts";
import {
  GroundingMapValidator,
  type VerifiedGroundingEntry,
} from "../../legal/grounding-map-validator.ts";
import {
  buildGraphFromGroundingMap,
  computeClaimEvidenceCoverage,
  extractDependenciesFromGraph,
  mergePrecedentMatches,
  type ClaimEvidenceGraph,
  type PrecedentMatch,
} from "../../legal/claim-evidence.ts";
import type { Jurisdiction } from "../../legal/corpus-receipt.ts";
import {
  checkCitationGrounding,
  buildRegenerationPrompt,
  type GuardrailResult,
  KNOWN_LAWS,
} from "../../citation-guardrail.ts";
import {
  crossVerifyCitations,
  buildCrossVerifyRegenerationPrompt,
  type CrossVerifyResult,
} from "../../think/cross-verify.ts";
import {
  resolveVerificationState,
  classifyOutputRisk,
  canPublish,
  needsHumanReview,
  type VerificationState,
  type VerificationContext,
} from "../../verification/states.ts";
import {
  getChildFailPolicy,
  isMandatoryLayer,
  type LayerDeclaration,
} from "../pipeline-registry.ts";
import {
  getWorkflowLayerSet,
  getWorkflowDef,
  isApprovalGate,
  type WorkflowId,
} from "../workflow-defs.ts";

// ── Facts Fence Builder ─────────────────────────────────────
// Generates a ## Facts fence compatible with GBrain's parseFactsFence.
// The extract_facts cycle phase reads these fences and reconciles them
// into the facts DB index, enabling semantic contradiction detection.

interface FactRow {
  claim: string;
  kind?: string;
  confidence?: string;
  visibility?: string;
  notability?: string;
  valid_from?: string;
  valid_until?: string;
  source?: string;
  context?: string;
}

function buildFactsFence(rows: FactRow[]): string {
  if (rows.length === 0) return "";
  const lines: string[] = [];
  lines.push("## Facts");
  lines.push("");
  lines.push("<!--- gbrain:facts:begin -->");
  lines.push(
    "| # | claim | kind | confidence | visibility | notability | valid_from | valid_until | source | context |"
  );
  lines.push(
    "|---|-------|------|------------|------------|------------|------------|-------------|--------|---------|"
  );
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const cells = [
      String(i + 1),
      r.claim ?? "",
      r.kind ?? "fact",
      r.confidence ?? "1.0",
      r.visibility ?? "world",
      r.notability ?? "medium",
      r.valid_from ?? "",
      r.valid_until ?? "",
      r.source ?? "",
      r.context ?? "",
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("<!--- gbrain:facts:end -->");
  return lines.join("\n");
}

/**
 * Jurisdiction → law corpus sources mapping for the legal pipeline.
 * Mirrors the engine-side JURISDICTION_LAW_SOURCES in web-api.ts.
 * EU law applies to all DACH jurisdictions.
 */
const PIPELINE_JURISDICTION_LAW_SOURCES: Record<string, string[]> = {
  at: ["law-at", "law-at-judikatur", "law-eu"],
  de: ["law-de", "law-eu"],
  ch: ["law-ch", "law-eu"],
  eu: ["law-eu"],
};

/**
 * Resolve the federated law sources for a given jurisdiction.
 * Returns the law corpus sources the pipeline subagents may search.
 * Used to populate _source_ids on child subagent jobs so the Law Matcher
 * and other layers can actually access the law corpus via search tools.
 */
function resolveLawSourceIds(jurisdiction: string | undefined): string[] | undefined {
  if (!jurisdiction) return undefined;
  const sources = PIPELINE_JURISDICTION_LAW_SOURCES[jurisdiction.toLowerCase()];
  return sources && sources.length > 0 ? sources : undefined;
}

export interface LegalPipelineData {
  case_slug: string;
  part_slugs: string[];
  source_id?: string;
  trigger?: string;
  rerun_layers?: number[];
  /** Jurisdiction: 'at' (Austria), 'de' (Germany), 'ch' (Switzerland), 'eu' (EU/generic).
   *  Defaults to 'at' for backward compatibility.
   *  Controls which draft packages are generated. */
  jurisdiction?: "at" | "de" | "ch" | "eu";
  /** Verfahrenstyp: 'straf', 'zivil', 'arbeitsrecht', 'verwaltungsrecht', 'sonstiges'.
   *  Controls forensic report structure and damage topf selection.
   *  Auto-detected by ON-Scanner from Gattungszeichen/Registerzeichen, or set manually. */
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  /** Gap B: Parteirolle des Mandanten. Steuert das Draft-Paket (Kläger:
   *  Mahnklage/Klage — Beklagter: Klagebeantwortung/Einreden-Katalog).
   *  Wenn nicht gesetzt: Auto-Detection aus den Entity-Rollen + client-Override. */
  parteirolle?: Parteirolle;
  manual_overrides?: {
    client?: string;
    opponent?: string;
    focus?: string;
  };
  /**
   * Gap 16: Human-in-the-Loop Checkpoint.
   * When true, pipeline pauses after Layer 2 (Entity-Extractor) and
   * sets state.status to 'awaiting_review'. An attorney must confirm
   * or correct client/opponent, then submit a resume job with
   * resume_from_layer=3 and manual_overrides set.
   * When false (default), pipeline runs straight through (legacy behavior).
   */
  pause_for_review?: boolean;
  /**
   * Gap 16: Resume trigger. When set, pipeline loads existing state
   * and continues from the specified layer (3-7). Requires that
   * layers 1-2 are already completed in persisted state.
   */
  resume_from_layer?: number;
  /**
   * Gap 17: Cost cap in USD for the entire pipeline run.
   * When set, BudgetTracker gates every child submission.
   * Default: $50 per case (covers ~35 Sonnet batches + 6 drafts + 1 Opus critic).
   */
  max_cost_usd?: number;
  /** Immutable act snapshot and import provenance for large forensic imports. */
  snapshot_id?: string;
  import_session_id?: string;
  /**
   * Gap 3: Linked cases (Aktenzeichen) for cross-case analysis.
   * When set, the pipeline will:
   *   - Load entity pages from linked cases for cross-case entity matching
   *   - Run cross-case contradiction probe after post-pipeline
   *   - Flag entities that appear in multiple procedures with different roles
   * Example: ["39-st-116-22v", "63-st-85-25s", "23-st-4-22f"]
   */
  linked_cases?: string[];
  /**
   * Phase A: Additional opponents for multi-track cases.
   * When set, the draft resolver expands per-opponent packages (e.g. DSGVO-Beschwerde
   * per datenverantwortlicher) and the limitation scanner attributes claims to specific opponents.
   */
  additional_opponents?: Array<{
    name: string;
    slug?: string;
    rolle: string;
    verfahrensschiene?: string;
    haftungsgrund?: string;
  }>;
  /**
   * Phase C: Active Nebenverfahren (side tracks) for this case.
   * When set, the draft resolver appends the corresponding draft packages.
   */
  nebenverfahren?: string[];
  /** Phase B: Related case slugs for cross-case matrix (Mandats-Klammer). */
  related_case_slugs?: string[];
  /** Phase B: Mandate ID — shared key across multiple cases. */
  mandate_id?: string;
  /**
   * T5.4: Workflow ID for modular pipeline execution.
   * When set, only layers defined in the workflow are executed.
   * When unset, all layers run (legacy behavior).
   * Values: 'memo' | 'fristen_report' | 'schriftsatz' | 'full_pipeline'
   */
  workflow_id?: WorkflowId;
  /** Legal stichtag. Defaults explicitly to the pipeline start date when omitted. */
  as_of_date?: string;
}

interface PipelineState {
  case_slug: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "completed_with_warnings"
    | "needs_human_review"
    | "failed"
    | "revised"
    | "awaiting_review";
  current_layer: number;
  layers: Record<
    number,
    {
      status: "pending" | "running" | "completed" | "failed" | "skipped";
      started_at?: string;
      completed_at?: string;
      duration_ms?: number;
      output_slugs?: string[];
      error?: string;
    }
  >;
  manual_overrides?: LegalPipelineData["manual_overrides"];
  total_duration_ms: number;
  created_at: string;
  updated_at: string;
  /** Gap 16: Entity snapshot for attorney review checkpoint */
  review_entities?: Array<{ name: string; type: string; role: string; aliases: string[] }>;
  /** Gap 17: Cost tracking */
  cost_spent_usd?: number;
  cost_cap_usd?: number;
  /** Warnings accumulated during pipeline execution (e.g. state persistence failures) */
  warnings?: string[];
  /** Risk-based verification state from guardrail + cross-verify (Phase 0A) */
  verification_state?: VerificationState;
  /** Verification details: blocking flags and reason */
  verification_reason?: string;
  /** Contradiction probe auto-trigger result (Layer 8, non-blocking) */
  contradiction_run_id?: string;
  contradiction_findings?: number;
  /** Ensemble Critic verdict from Layer 7 (3-model consensus) */
  ensemble_verdict?: EnsembleCriticVerdict;
  /** Number of critic feedback loop retries (0 = first run, max 2) */
  retry_count?: number;
  /** Counter-arguments from Layer 6.5 (Opponent-Simulator) */
  counter_arguments?: CounterArgument[];
  /** Jurisdiction persisted in state for resume operations */
  jurisdiction?: "at" | "de" | "ch" | "eu";
  /** Verfahrenstyp persisted in state for resume operations */
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  /** Gap 3: Linked cases for cross-case analysis */
  linked_cases?: string[];
  /** Gap 3: Cross-case findings (entities appearing in multiple cases, contradictions across cases) */
  cross_case_findings?: CrossCaseFinding[];
  /** Gap 4: Damage overlap warnings (potential double-counting) */
  damage_overlap_warnings?: string[];
  /** Phase B2: Cross-case liability matrix page slug */
  cross_case_matrix_slug?: string;
  /** Phase D1: Institution checklist page slug */
  institution_checklist_slug?: string;
  snapshot_id?: string;
  import_session_id?: string;
  /** Per-layer citation guardrail results (Tier 0 deterministic checks) */
  guardrail_results?: Record<
    number,
    {
      passed: boolean;
      flags_count: number;
      flag_types: string[];
      regenerated: boolean;
      regen_passed?: boolean;
    }
  >;
  /** Cross-model verification results for draft layer (Tier 1 semantic checks) */
  cross_verify_results?: {
    clean: boolean;
    flags_count: number;
    flag_types: string[];
    regenerated: boolean;
    regen_clean?: boolean;
    /** True when the verifier itself failed (technical error) — Phase 0A */
    verifier_error?: boolean;
  };
}

/** A counter-argument found by the opponent-simulator. */
interface CounterArgument {
  target_draft: string;
  weakness_type: string;
  argument: string;
  counter_paragraphs: Array<{
    paragraph: string;
    source_text: string;
    verified: boolean;
  }>;
  severity: "kritisch" | "hoch" | "mittel" | "niedrig";
  suggested_refutation: string;
}

/** Single model's verdict in the ensemble critic. */
interface CriticModelVerdict {
  model: string;
  total_score: number;
  recommendation: "publish" | "revise" | "reject";
  issues: string[];
  layer_scores: Record<string, number>;
}

/** Consensus result from the ensemble critic. */
interface EnsembleCriticVerdict {
  models: CriticModelVerdict[];
  consensus: {
    recommendation: "publish" | "revise" | "reject";
    total_score: number;
    issues: string[];
    layer_scores: Record<string, number>;
    /** Gap 5: Narrative coherence score (0-100) — do all outputs follow the same central thesis? */
    narrative_coherence_score?: number;
    /** Gap 5: The central thesis identified across all pipeline outputs */
    central_thesis?: string;
    /** Gap 5: Layers that deviate from the central thesis */
    coherence_violations?: string[];
  };
  retry_count: number;
}

interface MapResult {
  batch_idx: number;
  text: string;
  result: unknown;
}

// ── Batching constants ──────────────────────────────────────

const HAIKU_BATCH_SIZE = 4; // ~200K tokens per batch (reduced for DeepSeek)
const SONNET_BATCH_SIZE = 4; // ~200K tokens per batch
const MAX_TURNS_DEFAULT = 20;
const CHILD_TIMEOUT_MS = 60 * 60 * 1000; // 60 min per child (DeepSeek is slower than Anthropic)
const DEFAULT_COST_CAP_USD = 50; // Gap 17: $50 default cost cap per case

// ── Handler factory ─────────────────────────────────────────

export function makeLegalPipelineHandler(opts: { engine: BrainEngine }) {
  const engine = opts.engine;

  return async function legalPipelineHandler(
    ctx: MinionJobContext
  ): Promise<Record<string, unknown>> {
    const data = (ctx.data ?? {}) as unknown as LegalPipelineData;
    if (!data.case_slug || typeof data.case_slug !== "string") {
      throw new Error("legal-pipeline: data.case_slug is required (string)");
    }
    if (!Array.isArray(data.part_slugs) || data.part_slugs.length === 0) {
      throw new Error("legal-pipeline: data.part_slugs is required (non-empty string[])");
    }
    if (!data.jurisdiction) {
      throw new Error(
        "legal-pipeline: data.jurisdiction is required; refusing implicit AT default"
      );
    }
    if (data.workflow_id && !getWorkflowDef(data.workflow_id)) {
      throw new Error(`legal-pipeline: unknown workflow_id "${String(data.workflow_id)}"`);
    }

    const rawData = data as unknown as Record<string, unknown>;
    const sourceStamp =
      typeof rawData._source_id === "string" && rawData._source_id
        ? (rawData._source_id as string)
        : undefined;
    // Resolve federated law corpus sources from the case's jurisdiction.
    // This gives pipeline subagents (Law Matcher, Counter-Arguments, etc.)
    // search access to the correct national law corpus + EU law.
    const lawSourceIds = resolveLawSourceIds(data.jurisdiction ?? "at");
    const queue = new MinionQueue(engine);
    const stateSlug = `pipeline/state-${data.case_slug}`;
    const startTime = Date.now();

    // ── Gap 17: Initialize BudgetTracker ─────────────────────
    const costCap =
      typeof data.max_cost_usd === "number" && data.max_cost_usd > 0
        ? data.max_cost_usd
        : DEFAULT_COST_CAP_USD;
    const budget = new BudgetTracker({
      maxCostUsd: costCap,
      label: `legal-pipeline/${data.case_slug}`,
    });

    // ── Gap 16: Resume from layer (if resume_from_layer is set) ──
    const resumeFromLayer =
      typeof data.resume_from_layer === "number" && data.resume_from_layer >= 3
        ? data.resume_from_layer
        : null;

    let onTable: OnEntry[] = [];
    let entities: EntityEntry[] = [];
    let forensicReport: ForensicReport | null = null;
    let legalGroundingMap: LegalGroundingEntry[] = [];
    let damageTable: DamageEntry[] = [];
    let deadlineCalendar: DeadlineEntry[] = [];

    let state: PipelineState;

    if (resumeFromLayer) {
      // Load existing state from page
      state = await loadPipelineState(engine, stateSlug, sourceStamp);
      state.status = "running";
      state.updated_at = new Date().toISOString();
      // Apply any new manual_overrides from the resume job
      if (data.manual_overrides) {
        state.manual_overrides = { ...state.manual_overrides, ...data.manual_overrides };
      }
      // Mark layers before resumeFromLayer as completed (they should already be)
      for (let n = 1; n < resumeFromLayer; n++) {
        if (state.layers[n] && state.layers[n]!.status !== "completed") {
          state.layers[n]!.status = "completed";
        }
      }
      // Load onTable and entities from existing pages
      onTable = await loadOnTableFromPage(engine, data.case_slug, sourceStamp);
      entities = await loadEntitiesFromPages(engine, data.case_slug, sourceStamp);
    } else {
      state = {
        case_slug: data.case_slug,
        status: "running",
        current_layer: 0,
        layers: {
          1: { status: "pending" },
          2: { status: "pending" },
          3: { status: "pending" },
          4: { status: "pending" },
          5: { status: "pending" },
          6: { status: "pending" },
          7: { status: "pending" },
        },
        manual_overrides: data.manual_overrides,
        total_duration_ms: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cost_cap_usd: costCap,
        jurisdiction: data.jurisdiction ?? "at",
        verfahrenstyp: data.verfahrenstyp ?? "sonstiges",
        snapshot_id: data.snapshot_id,
        import_session_id: data.import_session_id,
      };
    }

    // Determine which layers to run
    const rerunLayers = Array.isArray(data.rerun_layers) ? new Set(data.rerun_layers) : null;

    // T5.4: Workflow-based layer activation
    // When workflow_id is set, only layers in the workflow definition run.
    const workflowLayerIds = data.workflow_id ? getWorkflowLayerSet(data.workflow_id) : null;
    // T5.4: Layer IDs are authoritative for workflow selection. Numeric layer
    // numbers are retained only for legacy resume/rerun compatibility because
    // one numeric layer contains multiple independent sub-layers.
    const shouldRunLayerById = (layerId: string): boolean => {
      // A resume/rerun must never widen the workflow's explicitly declared
      // scope. Previously either flag returned true immediately, which meant
      // `workflow_id=memo&rerun_layers=[4]` could execute every optional
      // sub-layer in that numeric layer, including layers not belonging to
      // the selected work product.
      if (workflowLayerIds && !workflowLayerIds.has(layerId)) return false;

      if (resumeFromLayer || rerunLayers) {
        const declaration = getLayerDeclaration(layerId);
        if (!declaration) return false;
        if (resumeFromLayer && declaration.layerNumber < resumeFromLayer) return false;
        if (rerunLayers && !rerunLayers.has(declaration.layerNumber)) return false;
      }

      return true;
    };
    const shouldRunAnyLayer = (...layerIds: string[]): boolean =>
      layerIds.some((layerId) => shouldRunLayerById(layerId));

    // ── Load all sub-page texts (haystack for validation) ────
    const rawTexts = await loadAllSubPages(engine, data.part_slugs, sourceStamp);
    console.log(
      `[legal-pipeline] sourceStamp=${sourceStamp ?? "undefined"}, part_slugs=${JSON.stringify(data.part_slugs)}, rawTexts.length=${rawTexts.length}, rawTexts[0]?.length=${rawTexts[0]?.length ?? 0}`
    );
    // Gap 2: Decode AB-Bogen handwritten abbreviations (post-OCR enrichment)
    // This annotates known Austrian legal shorthand (e.g. "UH" → "UH [Untersuchungshaft]")
    // so downstream agents can understand handwritten A-Mappe notations.
    const allTexts = rawTexts.map((t) => decodeAbbBogenKuerzel(t));
    const allText = allTexts.join("\n\n");
    console.log(
      `[legal-pipeline] allTexts.length=${allTexts.length}, allText.length=${allText.length}`
    );

    // ── Layer 0: Semantic document classification (heuristic, $0) ──
    // Classify each sub-page and stamp frontmatter with doc_type.
    // Enables filtered search ("only witness statements") and targeted
    // contradiction detection ("compare all medical reports").
    if (shouldRunLayerById("doc-classifier")) {
      for (let i = 0; i < data.part_slugs.length; i++) {
        const partSlug = data.part_slugs[i]!;
        const partText = allTexts[i] ?? "";
        if (!partText) continue;
        const classification = classifyLegalDocument(partText);
        try {
          const existing = await engine.getPage(partSlug);
          if (existing) {
            const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
            if (!fm.doc_type || fm.doc_type === "legal_document") {
              await engine.putPage(
                partSlug,
                {
                  type: existing.type,
                  title: existing.title,
                  compiled_truth: existing.compiled_truth ?? "",
                  frontmatter: {
                    ...fm,
                    doc_type: classification.type,
                    doc_type_label: legalDocTypeLabel(classification.type),
                    doc_type_confidence: classification.confidence.toFixed(2),
                  },
                },
                { sourceId: sourceStamp }
              );
            }
          }
        } catch {
          // Classification is best-effort — don't fail the pipeline if a page can't be updated
        }
      }
    }

    try {
      // ── Layer 1: ON-Scanner (with retry on validation fail) ───
      let gzKonsistenz: KonsistenzErgebnis | null = null;
      if (shouldRunLayerById("on-scanner")) {
        await updateLayerState(ctx, state, stateSlug, 1, "running", engine, sourceStamp);
        const onResult = await runMapReduceLayer({
          ctx,
          queue,
          engine,
          specialistName: "on-scanner",
          partSlugs: data.part_slugs,
          allTexts,
          batchSize: HAIKU_BATCH_SIZE,
          sourceStamp,
          lawSourceIds,
          contextJson: JSON.stringify({ jurisdiction: data.jurisdiction ?? "at" }),
          layerId: "on-scanner",
        });
        onTable = extractOnEntries(onResult);
        let errors = await validateOnEntries(onTable, allText);

        // ── GZ structural validation (deterministic, catches OCR confusables) ──
        const gzRaws = onTable
          .map((e) => e.geschaeftszahl?.raw)
          .filter((r): r is string => !!r && r.trim().length > 0);
        if (gzRaws.length > 0) {
          gzKonsistenz = pruefeGZKonsistenz(gzRaws);
          const gzFehler = gzKonsistenz.befundeProGZ
            .flatMap((v) => v.befunde.filter((b) => b.schwere === "fehler"))
            .map((b) => `GZ-Validierung [${b.code}]: ${b.meldung}`);
          errors.push(...gzFehler);
        }

        // ── Retry with error feedback if validation failed ──
        if (errors.length > 0) {
          console.warn(`[legal-pipeline] Layer 1 validation: ${errors.length} errors, retrying...`);
          const retryResult = await runMapReduceLayer({
            ctx,
            queue,
            engine,
            specialistName: "on-scanner",
            partSlugs: data.part_slugs,
            allTexts,
            batchSize: HAIKU_BATCH_SIZE,
            sourceStamp,
            lawSourceIds,
            contextJson: JSON.stringify({ jurisdiction: data.jurisdiction ?? "at" }),
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
            layerId: "on-scanner",
          });
          onTable = extractOnEntries(retryResult);
          errors = await validateOnEntries(onTable, allText);

          // Re-run GZ validation after retry
          const gzRawsRetry = onTable
            .map((e) => e.geschaeftszahl?.raw)
            .filter((r): r is string => !!r && r.trim().length > 0);
          if (gzRawsRetry.length > 0) {
            gzKonsistenz = pruefeGZKonsistenz(gzRawsRetry);
            const gzFehlerRetry = gzKonsistenz.befundeProGZ
              .flatMap((v) => v.befunde.filter((b) => b.schwere === "fehler"))
              .map((b) => `GZ-Validierung [${b.code}]: ${b.meldung}`);
            errors.push(...gzFehlerRetry);
          }

          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 1 retry still has ${errors.length} validation errors — logged for review`
            );
            // If GZ validation still has fehler after retry, flag for human review
            const gzFehlerPersist =
              gzKonsistenz?.befundeProGZ.some((v) =>
                v.befunde.some((b) => b.schwere === "fehler")
              ) ?? false;
            if (gzFehlerPersist) {
              state.warnings = [
                ...(state.warnings ?? []),
                `GZ-Validierung: ${gzKonsistenz?.befundeProGZ
                  .flatMap((v) => v.befunde.filter((b) => b.schwere === "fehler"))
                  .map((b) => b.meldung)
                  .join("; ")}`,
              ];
            }
          }
        }

        // ── A2: Write validated GZ + verfahrenstyp to case frontmatter ──
        if (gzKonsistenz) {
          const aktenzeichenValidated =
            gzKonsistenz.einheitlich && gzKonsistenz.befundeProGZ.every((v) => v.gueltig);
          const verfahrenstyp =
            gzKonsistenz.befundeProGZ.find((v) => v.verfahrenstyp)?.verfahrenstyp ?? null;
          try {
            const casePage = await engine.getPage(data.case_slug, { sourceId: sourceStamp });
            if (casePage) {
              const caseFm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
              await engine.putPage(
                data.case_slug,
                {
                  ...casePage,
                  frontmatter: {
                    ...caseFm,
                    aktenzeichen_validated: aktenzeichenValidated,
                    ...(gzKonsistenz.leitzahl
                      ? { aktenzeichen_leitzahl: gzKonsistenz.leitzahl }
                      : {}),
                    ...(verfahrenstyp ? { verfahrenstyp } : {}),
                    gz_befunde: gzKonsistenz.befundeProGZ.flatMap((v) =>
                      v.befunde.map((b) => ({
                        schwere: b.schwere,
                        code: b.code,
                        meldung: b.meldung,
                      }))
                    ),
                  },
                },
                { sourceId: sourceStamp }
              );
            }
          } catch {
            // case frontmatter update failed; pipeline continues
          }
        }

        const onIndexSlug = `on-indexes/${data.case_slug}`;
        await writeOnIndexPage(
          engine,
          onIndexSlug,
          data.case_slug,
          onTable,
          sourceStamp,
          gzKonsistenz
        );

        // ── A3: ERV cross-check — compare pipeline GZ against ERV-imported GZ ──
        if (gzKonsistenz && gzKonsistenz.befundeProGZ.length > 0) {
          try {
            const ervPages = await engine.listPages({
              type: "erv_message",
              slugPrefix: "legal/erv/",
              limit: 200,
            });
            const caseErvPages = ervPages.filter((p) => {
              const fm = p.frontmatter as Record<string, unknown>;
              return fm.case_ref === data.case_slug || fm.case_slug === data.case_slug;
            });
            if (caseErvPages.length > 0) {
              const pipelineGZs = gzKonsistenz.befundeProGZ.map((v) => v.raw);
              const ervMismatches: string[] = [];
              for (const ervPage of caseErvPages) {
                const ervFm = ervPage.frontmatter as Record<string, unknown>;
                const ervGZ =
                  typeof ervFm.geschaeftszahl === "string" ? ervFm.geschaeftszahl : undefined;
                if (!ervGZ) continue;
                const normalizedErv = ervGZ.replace(/\s+/g, " ").trim();
                const normalizedPipeline = pipelineGZs.map((g) => g.replace(/\s+/g, " ").trim());
                if (!normalizedPipeline.includes(normalizedErv)) {
                  ervMismatches.push(
                    `ERV-GZ "${ervGZ}" (${ervPage.slug}) stimmt nicht mit Pipeline-GZ überein`
                  );
                }
              }
              if (ervMismatches.length > 0) {
                state.warnings = [...(state.warnings ?? []), ...ervMismatches];
              }
            }
          } catch {
            // ERV cross-check mismatch is non-blocking; continue pipeline
          }
        }

        await updateLayerState(ctx, state, stateSlug, 1, "completed", engine, sourceStamp, [
          onIndexSlug,
        ]);
      } else {
        // Load existing ON table from page
        onTable = await loadOnTableFromPage(engine, data.case_slug, sourceStamp);
        await updateLayerState(ctx, state, stateSlug, 1, "skipped", engine, sourceStamp);
      }

      // ── Layer 2: Entity-Extractor (with retry) ─────────────
      if (shouldRunLayerById("entity-extractor")) {
        await updateLayerState(ctx, state, stateSlug, 2, "running", engine, sourceStamp);
        const entityResult = await runMapReduceLayer({
          ctx,
          queue,
          engine,
          specialistName: "entity-extractor",
          partSlugs: data.part_slugs,
          allTexts,
          batchSize: HAIKU_BATCH_SIZE,
          sourceStamp,
          lawSourceIds,
          contextJson: JSON.stringify({
            on_table: onTable,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          }),
          layerId: "entity-extractor",
        });
        entities = extractEntityEntries(entityResult);
        let errors = await validateEntityEntries(entities, allText);

        if (errors.length > 0) {
          console.warn(`[legal-pipeline] Layer 2 validation: ${errors.length} errors, retrying...`);
          const retryResult = await runMapReduceLayer({
            ctx,
            queue,
            engine,
            specialistName: "entity-extractor",
            partSlugs: data.part_slugs,
            allTexts,
            batchSize: HAIKU_BATCH_SIZE,
            sourceStamp,
            lawSourceIds,
            contextJson: JSON.stringify({
              on_table: onTable,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            }),
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
            layerId: "entity-extractor",
          });
          entities = extractEntityEntries(retryResult);
          errors = await validateEntityEntries(entities, allText);
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 2 retry still has ${errors.length} validation errors — logged for review`
            );
          }
        }

        const entitySlugs = await writeEntityPages(engine, data.case_slug, entities, sourceStamp);
        await updateLayerState(
          ctx,
          state,
          stateSlug,
          2,
          "completed",
          engine,
          sourceStamp,
          entitySlugs
        );

        // ── Gap 16: Human-in-the-Loop Checkpoint ──────────────
        // After Layer 2, pause for attorney review if requested.
        // The attorney confirms/corrects client & opponent, then submits
        // a resume job with resume_from_layer=3.
        if (data.pause_for_review && !resumeFromLayer) {
          state.status = "awaiting_review";
          state.current_layer = 2;
          state.review_entities = entities.map((e) => ({
            name: e.name,
            type: e.type,
            role: e.role,
            aliases: e.aliases,
          }));
          state.updated_at = new Date().toISOString();
          await persistPipelineState(engine, stateSlug, state, sourceStamp);
          await ctx.updateProgress({
            step: 2,
            total: 8,
            message:
              "Pipeline paused for attorney review. Submit resume job with resume_from_layer=3 to continue.",
          });
          return {
            case_slug: data.case_slug,
            status: "awaiting_review",
            current_layer: 2,
            review_entities: state.review_entities,
            message:
              "Pipeline paused after Layer 2. Attorney must confirm/correct client & opponent, then submit resume job.",
          };
        }
      } else {
        await updateLayerState(ctx, state, stateSlug, 2, "skipped", engine, sourceStamp);
      }

      // ── Layer 3: Forensic Analyst (with retry) ─────────────
      if (shouldRunLayerById("forensic-analyst")) {
        await updateLayerState(ctx, state, stateSlug, 3, "running", engine, sourceStamp);
        const jurisdiction = data.jurisdiction ?? "at";
        const verfahrenstyp =
          onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges";
        const contextJson = JSON.stringify({
          on_table: onTable,
          entities,
          manual_overrides: data.manual_overrides,
          jurisdiction,
          verfahrenstyp,
        });
        const forensicResult = await runMapReduceLayer({
          ctx,
          queue,
          engine,
          specialistName: "forensic-analyst",
          partSlugs: data.part_slugs,
          allTexts,
          batchSize: SONNET_BATCH_SIZE,
          sourceStamp,
          lawSourceIds,
          contextJson,
          layerId: "forensic-analyst",
        });
        forensicReport = extractForensicReport(forensicResult);
        let errors = await validateForensicReport(forensicReport, onTable, entities, allText);

        if (errors.length > 0) {
          console.warn(`[legal-pipeline] Layer 3 validation: ${errors.length} errors, retrying...`);
          const retryResult = await runMapReduceLayer({
            ctx,
            queue,
            engine,
            specialistName: "forensic-analyst",
            partSlugs: data.part_slugs,
            allTexts,
            batchSize: SONNET_BATCH_SIZE,
            sourceStamp,
            lawSourceIds,
            contextJson,
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
            layerId: "forensic-analyst",
          });
          forensicReport = extractForensicReport(retryResult);
          errors = await validateForensicReport(forensicReport, onTable, entities, allText);
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 3 retry still has ${errors.length} validation errors — logged for review`
            );
          }
        }

        // ── Tier 0 Citation Guardrail (deterministic, zero-cost) ──
        const forensicText = JSON.stringify(forensicReport);
        const forensicGuard = runCitationGuardrailForLayer(
          state,
          3,
          forensicText,
          allText,
          data.part_slugs
        );
        if (!forensicGuard.passed && forensicGuard.flags.some((f) => f.severity === "high")) {
          const highCount = forensicGuard.flags.filter((f) => f.severity === "high").length;
          // Phase 0A: fail-closed — enforceGuardrailHardBlock throws
          enforceGuardrailHardBlock(3, "forensic-analyst", highCount);
        }

        const forensicSlug = `forensic-reports/${data.case_slug}`;
        await writeForensicReportPage(
          engine,
          forensicSlug,
          data.case_slug,
          forensicReport,
          sourceStamp
        );
        await updateLayerState(ctx, state, stateSlug, 3, "completed", engine, sourceStamp, [
          forensicSlug,
        ]);
      } else {
        await updateLayerState(ctx, state, stateSlug, 3, "skipped", engine, sourceStamp);
      }

      // ── Layer 4: Law Matcher (§-Retrieval gegen Gesetzeskorpus) ──
      if (
        shouldRunAnyLayer(
          "law-matcher",
          "precedent-matcher",
          "burden-of-proof",
          "admissibility-checker",
          "fact-gap-detector",
          "evidence-quality",
          "witness-expert"
        )
      ) {
        await updateLayerState(ctx, state, stateSlug, 4, "running", engine, sourceStamp);
        if (shouldRunLayerById("law-matcher")) {
          legalGroundingMap = await runLawMatcherLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            forensicReport,
            onTable,
            entities,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
        }
        let errors = await validateLegalGroundingMap(legalGroundingMap, onTable);

        if (errors.length > 0) {
          console.warn(
            `[legal-pipeline] Layer 4 validation: ${errors.length} errors — non-blocking, logged for review`
          );
        }

        // ── Tier 0 Citation Guardrail (deterministic, zero-cost) ──
        const groundingText = JSON.stringify(legalGroundingMap);
        const groundingGuard = runCitationGuardrailForLayer(
          state,
          4,
          groundingText,
          allText,
          data.part_slugs
        );
        if (!groundingGuard.passed && groundingGuard.flags.some((f) => f.severity === "high")) {
          const highCount = groundingGuard.flags.filter((f) => f.severity === "high").length;
          // Phase 0A: fail-closed — enforceGuardrailHardBlock throws
          enforceGuardrailHardBlock(4, "legal-grounding", highCount);
        }

        const groundingSlug = `legal-grounding/${data.case_slug}`;
        await writeLegalGroundingMapPage(
          engine,
          groundingSlug,
          data.case_slug,
          legalGroundingMap,
          sourceStamp
        );
        const claimEvidenceGraph = buildGraphFromGroundingMap({
          output_id: data.case_slug,
          output_type: data.workflow_id ?? "full_pipeline",
          jurisdiction: data.jurisdiction.toUpperCase() as Jurisdiction,
          as_of_date: data.as_of_date ?? new Date().toISOString().slice(0, 10),
          entries: legalGroundingMap as unknown as VerifiedGroundingEntry[],
          case_documents: data.part_slugs.map((source_slug, index) => ({
            source_slug,
            text: allTexts[index] ?? "",
          })),
          brain_id: sourceStamp,
        });
        const claimEvidenceSlug = `claim-evidence/${data.case_slug}`;
        await writeClaimEvidenceGraphPage(
          engine,
          claimEvidenceSlug,
          data.case_slug,
          claimEvidenceGraph,
          sourceStamp
        );
        await updateLayerState(ctx, state, stateSlug, 4, "completed", engine, sourceStamp, [
          groundingSlug,
          claimEvidenceSlug,
        ]);

        // Record dependencies from the claim-evidence graph
        try {
          await recordGraphDependencies(
            engine,
            claimEvidenceGraph,
            data.case_slug,
            data.workflow_id ?? "full_pipeline",
            sourceStamp
          );
        } catch (depErr) {
          console.warn(
            `[legal-pipeline] Dependency recording error: ${depErr instanceof Error ? depErr.message : String(depErr)}`
          );
        }

        // ── Layer 4b: Precedent Match (Rechtsprechung) ──────
        // Searches for relevant case law (OGH/BGH/BVerfG) that supports
        // or endangers the legal claims. Non-blocking.
        if (shouldRunLayerById("precedent-matcher"))
          try {
            const precedentSlug = await runPrecedentMatchLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              legalGroundingMap,
              forensicReport,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (precedentSlug) {
              state.layers[4]!.output_slugs = [
                ...(state.layers[4]!.output_slugs ?? []),
                precedentSlug,
              ];
              // Merge precedent matches into the claim-evidence graph
              try {
                await mergePrecedentsIntoGraph(
                  engine,
                  precedentSlug,
                  claimEvidenceSlug,
                  data.case_slug,
                  sourceStamp
                );
              } catch (mergeErr) {
                console.warn(
                  `[legal-pipeline] Precedent→graph merge error: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`
                );
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Precedent match failed: ${msg}`];
            console.warn(`[legal-pipeline] Precedent match error: ${msg}`);
          }

        // ── Layer 4c: Burden of Proof (Beweislast) ──────────
        // Analyzes who must prove what, whether evidence is sufficient,
        // and whether burden reversal applies. Non-blocking.
        if (shouldRunLayerById("burden-of-proof"))
          try {
            const burdenSlug = await runBurdenOfProofLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              forensicReport,
              legalGroundingMap,
              damageTable,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (burdenSlug) {
              state.layers[4]!.output_slugs = [
                ...(state.layers[4]!.output_slugs ?? []),
                burdenSlug,
              ];
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Burden of proof analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Burden of proof error: ${msg}`);
          }
      } else {
        await updateLayerState(ctx, state, stateSlug, 4, "skipped", engine, sourceStamp);
      }

      // ── Layer 4d: Admissibility Check (Zulässigkeitsprüfung) ──
      // Checks procedural admissibility: jurisdiction, exhaustion of
      // remedies, statute of limitations, capacity, attorney requirement.
      // Non-blocking.
      if (shouldRunLayerById("admissibility-checker") && legalGroundingMap.length > 0) {
        try {
          const admissibilitySlug = await runAdmissibilityCheckLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            legalGroundingMap,
            forensicReport,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          if (admissibilitySlug) {
            state.layers[4]!.output_slugs = [
              ...(state.layers[4]!.output_slugs ?? []),
              admissibilitySlug,
            ];
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Admissibility check failed: ${msg}`];
          console.warn(`[legal-pipeline] Admissibility check error: ${msg}`);
        }
      }

      // ── Layer 4e: Fact Gap Detection (Sachverhaltslücken) ──
      // Identifies missing facts needed for legal claims and generates
      // targeted client questions. Runs after Layer 4 so legalGroundingMap
      // is populated and Tatbestandsmerkmale can be checked.
      // Non-blocking.
      if (shouldRunLayerById("fact-gap-detector") && legalGroundingMap.length > 0) {
        try {
          const factGapSlug = await runFactGapDetectionLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            forensicReport,
            legalGroundingMap,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          if (factGapSlug) {
            state.layers[4]!.output_slugs = [...(state.layers[4]!.output_slugs ?? []), factGapSlug];
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Fact gap detection failed: ${msg}`];
          console.warn(`[legal-pipeline] Fact gap detection error: ${msg}`);
        }
      }

      // ── Layer 4f: Evidence Quality Assessment ──
      // Rates each piece of evidence by probative value.
      // Non-blocking.
      if (shouldRunLayerById("evidence-quality"))
        try {
          const evidenceQualitySlug = await runEvidenceQualityLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          if (evidenceQualitySlug) {
            state.layers[4]!.output_slugs = [
              ...(state.layers[4]!.output_slugs ?? []),
              evidenceQualitySlug,
            ];
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [
            ...(state.warnings ?? []),
            `Evidence quality assessment failed: ${msg}`,
          ];
          console.warn(`[legal-pipeline] Evidence quality error: ${msg}`);
        }

      // ── Layer 4g: Witness & Expert Analysis ──
      // Evaluates witness credibility and identifies needed expert witnesses.
      // Non-blocking.
      if (shouldRunLayerById("witness-expert"))
        try {
          const witnessSlug = await runWitnessExpertLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          if (witnessSlug) {
            state.layers[4]!.output_slugs = [...(state.layers[4]!.output_slugs ?? []), witnessSlug];
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Witness & expert analysis failed: ${msg}`];
          console.warn(`[legal-pipeline] Witness & expert error: ${msg}`);
        }

      // ── Layer 5: Damage + Deadline Extractor (with retry) ──
      if (
        shouldRunAnyLayer(
          "damage-deadline-extractor",
          "deadline-validator",
          "cost-benefit",
          "settlement-analysis",
          "enforcement-analysis",
          "appeal-risk",
          "procedural-strategy",
          "insurance-coverage",
          "tax-impact",
          "counterclaim-risk",
          "mediation-adr",
          "limitation-scanner",
          "cost-award"
        )
      ) {
        await updateLayerState(ctx, state, stateSlug, 5, "running", engine, sourceStamp);
        const damageContextJson = JSON.stringify({
          on_table: onTable,
          entities,
          forensic_report: forensicReport,
          legal_grounding_map: legalGroundingMap,
          manual_overrides: data.manual_overrides,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
        });
        const damageResult = await runMapReduceLayer({
          ctx,
          queue,
          engine,
          specialistName: "damage-extractor",
          partSlugs: data.part_slugs,
          allTexts,
          batchSize: SONNET_BATCH_SIZE,
          sourceStamp,
          lawSourceIds,
          contextJson: damageContextJson,
          layerId: "damage-deadline-extractor",
        });
        const extracted = extractDamageResult(damageResult);
        damageTable = extracted.damage_table;
        deadlineCalendar = extracted.deadline_calendar;
        let dmgErrors = await validateDamageTable(damageTable, onTable, allText);
        let dlnErrors = await validateDeadlineCalendar(deadlineCalendar, onTable, allText);
        let errors = [...dmgErrors, ...dlnErrors];

        if (errors.length > 0) {
          console.warn(`[legal-pipeline] Layer 5 validation: ${errors.length} errors, retrying...`);
          const retryResult = await runMapReduceLayer({
            ctx,
            queue,
            engine,
            specialistName: "damage-extractor",
            partSlugs: data.part_slugs,
            allTexts,
            batchSize: SONNET_BATCH_SIZE,
            sourceStamp,
            lawSourceIds,
            contextJson: damageContextJson,
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
            layerId: "damage-deadline-extractor",
          });
          const retryExtracted = extractDamageResult(retryResult);
          damageTable = retryExtracted.damage_table;
          deadlineCalendar = retryExtracted.deadline_calendar;
          dmgErrors = await validateDamageTable(damageTable, onTable, allText);
          dlnErrors = await validateDeadlineCalendar(deadlineCalendar, onTable, allText);
          errors = [...dmgErrors, ...dlnErrors];
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 5 retry still has ${errors.length} validation errors — logged for review`
            );
          }
        }

        // ── Tier 0 Citation Guardrail (deterministic, zero-cost) ──
        const damageDeadlineText = JSON.stringify({
          damage_table: damageTable,
          deadline_calendar: deadlineCalendar,
        });
        const damageGuard = runCitationGuardrailForLayer(
          state,
          5,
          damageDeadlineText,
          allText,
          data.part_slugs
        );
        if (!damageGuard.passed && damageGuard.flags.some((f) => f.severity === "high")) {
          const highCount = damageGuard.flags.filter((f) => f.severity === "high").length;
          // Phase 0A: fail-closed — enforceGuardrailHardBlock throws
          enforceGuardrailHardBlock(5, "damage-deadline", highCount);
        }

        // ── AP-6: Deterministic deadline statutory cross-check ──
        const deadlineWarnings = crossCheckDeadlineStatutory(
          deadlineCalendar,
          data.jurisdiction ?? "at"
        );
        if (deadlineWarnings.length > 0) {
          state.warnings = [...(state.warnings ?? []), ...deadlineWarnings];
          console.warn(
            `[legal-pipeline] Layer 5 deadline cross-check: ${deadlineWarnings.length} warning(s)`
          );
        }

        const damageSlug = `damage-tables/${data.case_slug}`;
        const deadlineSlug = `deadline-calendars/${data.case_slug}`;
        await writeDamageTablePage(engine, damageSlug, data.case_slug, damageTable, sourceStamp);
        await writeDeadlineCalendarPage(
          engine,
          deadlineSlug,
          data.case_slug,
          deadlineCalendar,
          sourceStamp
        );

        // ── Gap 4: Damage Overlap Detection ──────────────────
        // Detect potential double-counting between damage positions.
        // Non-blocking — warnings are stored in state and surfaced in the audit.
        const overlapWarnings = detectDamageOverlaps(damageTable);
        if (overlapWarnings.length > 0) {
          state.damage_overlap_warnings = overlapWarnings;
          state.warnings = [...(state.warnings ?? []), ...overlapWarnings];
          console.warn(
            `[legal-pipeline] Gap 4: ${overlapWarnings.length} potential damage overlap(s) detected`
          );
        }

        // ── Layer 5b: Deadline Validation ───────────────────
        // Validates extracted deadlines against statutory limitation rules
        // (§ 1489 ABGB, § 195 BGB, Art 82 DSGVO, etc.) to prevent
        // liability from using unverified or expired deadlines.
        const outputSlugs = [damageSlug, deadlineSlug];
        if (shouldRunLayerById("deadline-validator"))
          try {
            const deadlineValidationSlug = await runDeadlineValidationLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              deadlineSlug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (deadlineValidationSlug) outputSlugs.push(deadlineValidationSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Deadline validation failed: ${msg}`];
            console.warn(`[legal-pipeline] Deadline validation error: ${msg}`);
          }

        // ── Layer 5c: Cost-Benefit Analysis (Expected Value) ──
        // Calculates EV, win probability, costs (RVG/StBVV/AHGB),
        // break-even, and risk. Non-blocking.
        if (shouldRunLayerById("cost-benefit"))
          try {
            const costBenefitSlug = await runCostBenefitLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              damageTable,
              forensicReport,
              legalGroundingMap,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (costBenefitSlug) outputSlugs.push(costBenefitSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Cost-benefit analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Cost-benefit error: ${msg}`);
          }

        // ── Layer 5d: Settlement Analysis (Vergleichsanalyse) ──
        // Calculates BATNA, ZOPA, optimal settlement amount, and
        // negotiation strategy. Non-blocking.
        if (shouldRunLayerById("settlement-analysis"))
          try {
            const settlementSlug = await runSettlementAnalysisLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (settlementSlug) outputSlugs.push(settlementSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Settlement analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Settlement analysis error: ${msg}`);
          }

        // ── Layer 5e: Enforcement Analysis (Vollstreckung) ──
        // Checks if a judgment can actually be enforced.
        // Non-blocking.
        if (shouldRunLayerById("enforcement-analysis"))
          try {
            const enforcementSlug = await runEnforcementAnalysisLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              forensicReport,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (enforcementSlug) outputSlugs.push(enforcementSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Enforcement analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Enforcement analysis error: ${msg}`);
          }

        // ── Layer 5f: Appeal Risk (Berufungsrisiko) ──────────
        // Assesses whether the opponent can successfully appeal.
        // Non-blocking.
        if (shouldRunLayerById("appeal-risk"))
          try {
            const appealRiskSlug = await runAppealRiskLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (appealRiskSlug) outputSlugs.push(appealRiskSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Appeal risk analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Appeal risk error: ${msg}`);
          }

        // ── Layer 5g: Procedural Strategy (Prozessstrategie) ─
        // Recommends optimal procedural steps. Non-blocking.
        if (shouldRunLayerById("procedural-strategy"))
          try {
            const strategySlug = await runProceduralStrategyLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (strategySlug) outputSlugs.push(strategySlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Procedural strategy failed: ${msg}`];
            console.warn(`[legal-pipeline] Procedural strategy error: ${msg}`);
          }

        // ── Layer 5h: Insurance Coverage (Versicherungsdeckung) ──
        // Checks whether insurance covers the damage and if a
        // direct action against the insurer is possible.
        // Non-blocking.
        if (shouldRunLayerById("insurance-coverage"))
          try {
            const insuranceSlug = await runInsuranceCoverageLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              forensicReport,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (insuranceSlug) outputSlugs.push(insuranceSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [
              ...(state.warnings ?? []),
              `Insurance coverage analysis failed: ${msg}`,
            ];
            console.warn(`[legal-pipeline] Insurance coverage error: ${msg}`);
          }

        // ── Layer 5i: Tax Impact (Steuerliche Auswirkungen) ──
        // Calculates net EV after taxes, compares settlement
        // vs. judgment taxation. Non-blocking.
        if (shouldRunLayerById("tax-impact"))
          try {
            const taxSlug = await runTaxImpactLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (taxSlug) outputSlugs.push(taxSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Tax impact analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Tax impact error: ${msg}`);
          }

        // ── Layer 5j: Counterclaim Risk (Widerklungsrisiko) ──
        // Identifies potential counterclaims, setoffs, and
        // cross-claims from the opponent. Non-blocking.
        if (shouldRunLayerById("counterclaim-risk"))
          try {
            const counterclaimSlug = await runCounterclaimLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (counterclaimSlug) outputSlugs.push(counterclaimSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [
              ...(state.warnings ?? []),
              `Counterclaim risk analysis failed: ${msg}`,
            ];
            console.warn(`[legal-pipeline] Counterclaim risk error: ${msg}`);
          }

        // ── Layer 5k: Mediation/ADR (alternative Streitbeilegung) ──
        // Recommends mediation, arbitration, Schlichtung vs. gerichtlich.
        // Non-blocking.
        if (shouldRunLayerById("mediation-adr"))
          try {
            const adrSlug = await runMediationADRLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (adrSlug) outputSlugs.push(adrSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Mediation/ADR analysis failed: ${msg}`];
            console.warn(`[legal-pipeline] Mediation/ADR error: ${msg}`);
          }

        // ── Layer 5l: Limitation Scanner (Verjährungs-Scan) ──
        // Scans each claim for Verjährungsfrist, identifies urgent
        // and verjährte Ansprüche. Non-blocking.
        if (shouldRunLayerById("limitation-scanner"))
          try {
            const limitationSlug = await runLimitationScannerLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (limitationSlug) {
              outputSlugs.push(limitationSlug);
              // Auto-Trigger Wiedervorlage bei hohem Verjährungsrisiko
              try {
                const limPage = await engine.getPage(limitationSlug, { sourceId: sourceStamp });
                const limFm = (limPage?.frontmatter ?? {}) as Record<string, unknown>;
                const limScore =
                  typeof limFm.verjaehrung_risiko_score === "number"
                    ? limFm.verjaehrung_risiko_score
                    : 0;
                if (limScore >= 75) {
                  const rawUrgent = limFm.urgent_ansprueche;
                  const urgentAnsprueche = Array.isArray(rawUrgent)
                    ? rawUrgent
                    : typeof rawUrgent === "string"
                      ? ((tryParseJSON(rawUrgent) as unknown as unknown[]) ?? [])
                      : [];
                  if (urgentAnsprueche.length > 0) {
                    await autoCreateWiedervorlage(
                      engine,
                      data.case_slug,
                      limScore,
                      urgentAnsprueche,
                      sourceStamp
                    );
                    state.warnings = [
                      ...(state.warnings ?? []),
                      `Auto-Wiedervorlage erstellt: ${urgentAnsprueche.length} dringende Ansprüche (Score: ${limScore})`,
                    ];
                  }
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[legal-pipeline] Auto-Wiedervorlage failed: ${msg}`);
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Limitation scan failed: ${msg}`];
            console.warn(`[legal-pipeline] Limitation scan error: ${msg}`);
          }

        // ── Layer 5m: Cost Award (Kostenentscheidung) ──
        // Predicts who pays court costs in each scenario.
        // Non-blocking.
        if (shouldRunLayerById("cost-award"))
          try {
            const costAwardSlug = await runCostAwardLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              sourceStamp,
              lawSourceIds,
            });
            if (costAwardSlug) outputSlugs.push(costAwardSlug);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            state.warnings = [...(state.warnings ?? []), `Cost award prediction failed: ${msg}`];
            console.warn(`[legal-pipeline] Cost award error: ${msg}`);
          }

        await updateLayerState(
          ctx,
          state,
          stateSlug,
          5,
          "completed",
          engine,
          sourceStamp,
          outputSlugs
        );
      } else {
        await updateLayerState(ctx, state, stateSlug, 5, "skipped", engine, sourceStamp);
      }

      // ── Layer 6: Legal Drafter (6 Pakete parallel) ────────
      // Gap B: Parteirolle bestimmt das Draft-Paket (explizit > Auto-Detection
      // aus Entity-Rollen + client-Override).
      const parteirolle: Parteirolle =
        data.parteirolle ?? detectParteirolle(entities, { client: data.manual_overrides?.client });

      if (shouldRunLayerById("legal-drafter")) {
        await updateLayerState(ctx, state, stateSlug, 6, "running", engine, sourceStamp);
        const draftSlugs = await runDraftLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          onTable,
          entities,
          forensicReport,
          legalGroundingMap,
          damageTable,
          deadlineCalendar,
          manualOverrides: data.manual_overrides,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          parteirolle,
          additionalOpponents: data.additional_opponents,
          nebenverfahren: data.nebenverfahren,
          sourceStamp,
          lawSourceIds,
          state,
          allText,
          partSlugs: data.part_slugs,
        });
        await updateLayerState(
          ctx,
          state,
          stateSlug,
          6,
          "completed",
          engine,
          sourceStamp,
          draftSlugs
        );
      } else {
        await updateLayerState(ctx, state, stateSlug, 6, "skipped", engine, sourceStamp);
      }

      // ── Layer 6.5: Counter-Argument Layer (Opponent-Simulator) ──
      // Plays the opposing counsel: reads all drafts, finds weaknesses,
      // generates counter-arguments. Then the drafter revises drafts to
      // refute those arguments. This is what a real lawyer does — and
      // what Harvey AI does NOT have.
      let counterArguments: CounterArgument[] = [];
      if (shouldRunLayerById("opponent-simulator") && state.layers[6]?.output_slugs?.length) {
        const draftSlugsForCounter = state.layers[6]!.output_slugs!;
        const forensicSlug = state.layers[3]?.output_slugs?.[0];

        try {
          const counterResult = await runCounterArgumentLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            draftSlugs: draftSlugsForCounter,
            forensicReportSlug: forensicSlug,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          counterArguments = counterResult.counterArguments;
          state.counter_arguments = counterArguments;

          // If counter-arguments found, revise drafts to refute them
          if (counterArguments.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 6.5: ${counterArguments.length} counter-arguments found ` +
                `(${counterArguments.filter((c) => c.severity === "kritisch").length} kritisch) — revising drafts`
            );
            const revisedSlugs = await runDraftRebuttalLayer({
              ctx,
              queue,
              engine,
              caseSlug: data.case_slug,
              draftSlugs: draftSlugsForCounter,
              counterArguments,
              jurisdiction: data.jurisdiction ?? "at",
              verfahrenstyp:
                data.verfahrenstyp ??
                (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
              parteirolle,
              additionalOpponents: data.additional_opponents,
              nebenverfahren: data.nebenverfahren,
              sourceStamp,
              lawSourceIds,
            });
            state.layers[6]!.output_slugs = revisedSlugs;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Counter-argument layer failed: ${msg}`];
          console.warn(`[legal-pipeline] Counter-argument layer error: ${msg}`);
        }
      }

      // ── Layer 7: Ensemble Critic + Feedback Loop ─────────
      // 3 models (Opus + DeepSeek + Grok) evaluate independently.
      // Majority vote on recommendation, min() on scores.
      // If consensus is 'revise' or 'reject': retry layers with
      // score < 70, then re-run ensemble. Max 2 retry rounds.
      if (shouldRunLayerById("ensemble-critic")) {
        await updateLayerState(ctx, state, stateSlug, 7, "running", engine, sourceStamp);

        let retryCount = 0;
        let ensembleResult = await runEnsembleCriticLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          partSlugs: data.part_slugs,
          state,
          legalGroundingMap,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
          retryCount,
          enableSubsumptionCheck: shouldRunLayerById("subsumption-checker"),
        });

        state.ensemble_verdict = ensembleResult.verdict;

        // ── Feedback Loop: retry layers with low scores ──
        while (
          ensembleResult.verdict.consensus.recommendation !== "publish" &&
          retryCount < MAX_CRITIC_RETRIES
        ) {
          retryCount++;
          const retryLayers = layersToRetry(ensembleResult.verdict.consensus);

          if (retryLayers.length === 0) {
            // No specific layers to retry — issues are cross-cutting
            break;
          }

          console.warn(
            `[legal-pipeline] Ensemble critic round ${retryCount}: retrying layers ${retryLayers.join(", ")} ` +
              `(consensus: ${ensembleResult.verdict.consensus.recommendation}, score: ${ensembleResult.verdict.consensus.total_score})`
          );

          // Re-run the layers that scored below threshold
          for (const layerNum of retryLayers) {
            const layerIssues = ensembleResult.verdict.consensus.issues.filter(
              (i) => i.includes(`Layer ${layerNum}`) || i.includes(`layer ${layerNum}`)
            );
            const feedback =
              `## ENSEMBLE CRITIC FEEDBACK (Retry Round ${retryCount})\n` +
              `Consensus score: ${ensembleResult.verdict.consensus.total_score}/100\n` +
              `Recommendation: ${ensembleResult.verdict.consensus.recommendation}\n\n` +
              `Issues for Layer ${layerNum}:\n${layerIssues.length > 0 ? layerIssues.join("\n") : "See general issues below"}\n\n` +
              `All issues:\n${ensembleResult.verdict.consensus.issues.join("\n")}`;

            // Re-run the specific layer with critic feedback
            await rerunSpecificLayer(layerNum, {
              ctx,
              queue,
              engine,
              data,
              state,
              stateSlug,
              sourceStamp,
              lawSourceIds,
              onTable,
              entities,
              forensicReport,
              legalGroundingMap,
              damageTable,
              deadlineCalendar,
              allTexts,
              retryFeedback: feedback,
            });
          }

          // Re-run ensemble critic after retries
          ensembleResult = await runEnsembleCriticLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            partSlugs: data.part_slugs,
            state,
            legalGroundingMap,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
            retryCount,
            enableSubsumptionCheck: shouldRunLayerById("subsumption-checker"),
          });
          state.ensemble_verdict = ensembleResult.verdict;
          state.retry_count = retryCount;
        }

        // Determine final status based on ensemble verdict
        const finalRec = ensembleResult.verdict.consensus.recommendation;
        if (finalRec === "publish") {
          await updateLayerState(ctx, state, stateSlug, 7, "completed", engine, sourceStamp, [
            ensembleResult.auditSlug,
          ]);
        } else if (finalRec === "revise") {
          // After max retries, still needs work — mark as completed_with_warnings
          state.status = "completed_with_warnings";
          state.warnings = [
            ...(state.warnings ?? []),
            `Ensemble critic consensus: 'revise' after ${retryCount} retries (score: ${ensembleResult.verdict.consensus.total_score})`,
          ];
          await updateLayerState(ctx, state, stateSlug, 7, "completed", engine, sourceStamp, [
            ensembleResult.auditSlug,
          ]);
        } else {
          // 'reject' after max retries — needs human review
          state.status = "needs_human_review";
          state.warnings = [
            ...(state.warnings ?? []),
            `Ensemble critic consensus: 'reject' after ${retryCount} retries (score: ${ensembleResult.verdict.consensus.total_score}). Human review required.`,
          ];
          await updateLayerState(ctx, state, stateSlug, 7, "completed", engine, sourceStamp, [
            ensembleResult.auditSlug,
          ]);
        }
      } else {
        await updateLayerState(ctx, state, stateSlug, 7, "skipped", engine, sourceStamp);
      }

      // ── Post-Pipeline: Contradiction Probe Auto-Trigger ──
      // Non-blocking: runs after all 7 layers, persists results separately.
      // The probe generates queries from pipeline output pages + original
      // case pages, searches for similar chunks, and judges pairs for
      // contradictions. Results are persisted to eval_contradictions_runs.
      try {
        const probeResult = await runContradictionProbeAuto({
          engine,
          caseSlug: data.case_slug,
          state,
          partSlugs: data.part_slugs,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
        });
        if (probeResult) {
          state.contradiction_run_id = probeResult.run_id;
          state.contradiction_findings = probeResult.total_findings;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.warnings = [...(state.warnings ?? []), `Contradiction probe failed: ${msg}`];
        console.warn(`[legal-pipeline] Contradiction probe auto-trigger error: ${msg}`);
      }

      // ── Gap 3: Cross-Case Entity Analysis ──────────────────
      // When linked_cases is provided, load entity pages from those cases
      // and cross-reference: entities appearing in multiple cases with
      // different roles, or with contradictory accusations.
      if (data.linked_cases && data.linked_cases.length > 0) {
        state.linked_cases = data.linked_cases;
        try {
          const crossCaseFindings = await runCrossCaseAnalysis({
            engine,
            caseSlug: data.case_slug,
            currentEntities: entities,
            linkedCases: data.linked_cases,
            sourceStamp,
            lawSourceIds,
          });
          if (crossCaseFindings.length > 0) {
            state.cross_case_findings = crossCaseFindings;
            state.warnings = [
              ...(state.warnings ?? []),
              ...crossCaseFindings.map((f) => `[${f.type}] ${f.description}`),
            ];
            console.warn(
              `[legal-pipeline] Gap 3: ${crossCaseFindings.length} cross-case finding(s)`
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Cross-case analysis failed: ${msg}`];
          console.warn(`[legal-pipeline] Cross-case analysis error: ${msg}`);
        }
      }

      // ── Phase B2: Cross-Case Liability Matrix ──────────────
      // When related_case_slugs or linked_cases are provided, run the
      // cross-case-matrix specialist to generate a fall-übergreifende
      // Haftungsmatrix + Master-Schadenstabelle.
      const relatedCaseSlugs = data.related_case_slugs ?? data.linked_cases ?? [];
      if (relatedCaseSlugs.length > 0) {
        try {
          const matrixSlug = await runCrossCaseMatrixLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            relatedCaseSlugs,
            mandateId: data.mandate_id,
            sourceStamp,
            lawSourceIds,
          });
          state.cross_case_matrix_slug = matrixSlug;
          console.warn(`[legal-pipeline] Phase B2: Cross-case matrix generated at ${matrixSlug}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Cross-case matrix layer failed: ${msg}`];
          console.warn(`[legal-pipeline] Cross-case matrix error: ${msg}`);
        }
      }

      // ── Phase D1: Institutionen-Checkliste ──────────────────
      // Runs the institution-checklist specialist to identify which
      // institutions need to be notified for this case.
      try {
        const instSlug = await runInstitutionChecklistLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          additionalOpponents: data.additional_opponents,
          sourceStamp,
          lawSourceIds,
        });
        state.institution_checklist_slug = instSlug;
        console.warn(`[legal-pipeline] Phase D1: Institution checklist generated at ${instSlug}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.warnings = [...(state.warnings ?? []), `Institution checklist failed: ${msg}`];
        console.warn(`[legal-pipeline] Institution checklist error: ${msg}`);
      }

      // ── Finalize ───────────────────────────────────────────
      // Preserve status set by ensemble critic (completed_with_warnings or
      // needs_human_review) — only default to "completed" if no status was set.
      if (state.status !== "needs_human_review" && state.status !== "completed_with_warnings") {
        state.status = "completed";
      }
      state.current_layer = 7;
      state.total_duration_ms = Date.now() - startTime;
      state.cost_spent_usd = budget.totalSpent;
      state.updated_at = new Date().toISOString();
      await persistPipelineState(engine, stateSlug, state, sourceStamp);

      await ctx.updateProgress({ step: 8, total: 8, message: "Pipeline completed" });

      return {
        case_slug: data.case_slug,
        status: state.status,
        layers: state.layers,
        total_duration_ms: state.total_duration_ms,
        cost_spent_usd: budget.totalSpent,
        contradiction_run_id: state.contradiction_run_id,
        contradiction_findings: state.contradiction_findings,
        ensemble_verdict: state.ensemble_verdict,
        retry_count: state.retry_count,
        counter_arguments: state.counter_arguments?.length ?? 0,
      };
    } catch (err) {
      state.status = "failed";
      state.updated_at = new Date().toISOString();
      state.total_duration_ms = Date.now() - startTime;
      state.cost_spent_usd = budget.totalSpent;
      const msg = err instanceof Error ? err.message : String(err);

      // Gap 17: BudgetExhausted — set a clear error message
      if (err instanceof BudgetExhausted) {
        const budgetMsg = `Cost cap exceeded: $${err.spent.toFixed(2)} > $${err.cap.toFixed(2)} (reason: ${err.reason}). Pipeline stopped at layer ${state.current_layer}.`;
        const currentLayer = Object.entries(state.layers).find(
          ([, v]) => v.status === "running"
        )?.[0];
        if (currentLayer) {
          state.layers[Number(currentLayer)]!.status = "failed";
          state.layers[Number(currentLayer)]!.error = budgetMsg;
        }
        await persistPipelineState(engine, stateSlug, state, sourceStamp);
        throw new Error(budgetMsg);
      }

      const currentLayer = Object.entries(state.layers).find(
        ([, v]) => v.status === "running"
      )?.[0];
      if (currentLayer) {
        state.layers[Number(currentLayer)]!.status = "failed";
        state.layers[Number(currentLayer)]!.error = msg;
      }
      await persistPipelineState(engine, stateSlug, state, sourceStamp);
      throw err;
    }
  };
}

// ── Map-Reduce Layer Runner ─────────────────────────────────

async function runMapReduceLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  specialistName: string;
  partSlugs: string[];
  allTexts: string[];
  batchSize: number;
  sourceStamp?: string;
  lawSourceIds?: string[];
  contextJson: string;
  /** Extra context appended to contextJson for retry runs (validation errors) */
  retryFeedback?: string;
  /** T5.4: Layer ID from pipeline registry — determines failure policy */
  layerId?: string;
}): Promise<unknown> {
  const {
    ctx,
    queue,
    engine,
    specialistName,
    partSlugs,
    allTexts,
    batchSize,
    sourceStamp,
    lawSourceIds,
    contextJson,
    retryFeedback,
    layerId,
  } = opts;
  const def = resolveSpecialist(specialistName);
  if (!def) throw new Error(`legal-pipeline: unknown specialist "${specialistName}"`);

  // ── Map phase: batch sub-pages and submit ALL in parallel ─────
  const batches = batchTexts(allTexts, batchSize);
  console.log(
    `[legal-pipeline] runMapReduceLayer: specialist=${specialistName}, allTexts.length=${allTexts.length}, batchSize=${batchSize}, batches.length=${batches.length}, batch[0].text.length=${batches[0]?.text.length ?? 0}`
  );
  const childIds: number[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const userPrompt = buildMapPrompt(
      batch.text,
      contextJson,
      i + 1,
      batches.length,
      specialistName
    );

    const childData: Record<string, unknown> = {
      prompt: retryFeedback
        ? userPrompt + "\n\n## KORREKTUR-HINWEISE (Retry)\n" + retryFeedback
        : userPrompt,
      subagent_def: specialistName,
      max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
      allowed_tools: [],
    };
    if (def.model) childData.model = def.model;
    if (sourceStamp) childData._source_id = sourceStamp;
    if (lawSourceIds) childData._source_ids = lawSourceIds;

    // T5.4: Resolve failure policy from registry — mandatory layers use "fail_parent"
    const mapFailPolicy = layerId ? getChildFailPolicy(layerId) : "continue";
    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: mapFailPolicy,
        max_stalled: 3,
      },
      { allowProtectedSubmit: true }
    );
    childIds.push(child.id);
  }

  // ── Collect all map results in parallel ──────────────────────
  const mapResults: MapResult[] = [];
  const collectPromises = childIds.map(async (childId, i) => {
    const result = await waitForChild(ctx, childId);
    return {
      batch_idx: i,
      text: batches[i]!.text,
      result,
    };
  });

  const settled = await Promise.allSettled(collectPromises);
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]!;
    if (s.status === "fulfilled") {
      mapResults.push(s.value);
    } else {
      const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
      console.error(`[legal-pipeline] Map batch ${i + 1} failed: ${reason}`);
      // Push a minimal result so reduce can still proceed
      mapResults.push({ batch_idx: i, text: batches[i]!.text, result: { error: reason } });
    }
  }

  // Sort by batch_idx to maintain order
  mapResults.sort((a, b) => a.batch_idx - b.batch_idx);

  await ctx.updateProgress({
    step: batches.length,
    total: batches.length + 1,
    message: `${specialistName} all ${batches.length} map batches complete, reducing...`,
  });

  // ── Reduce phase: synthesize ──────────────────────────────
  const reducePrompt = buildReducePrompt(mapResults, specialistName, contextJson);
  const reduceChildData: Record<string, unknown> = {
    prompt: retryFeedback
      ? reducePrompt + "\n\n## KORREKTUR-HINWEISE (Retry)\n" + retryFeedback
      : reducePrompt,
    subagent_def: specialistName,
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) reduceChildData.model = def.model;
  if (sourceStamp) reduceChildData._source_id = sourceStamp;

  // T5.4: Resolve failure policy for reduce phase — same as map phase
  const reduceFailPolicy = layerId ? getChildFailPolicy(layerId) : "continue";
  const reduceChild = await queue.add(
    "subagent",
    reduceChildData,
    {
      parent_job_id: ctx.id,
      on_child_fail: reduceFailPolicy,
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const reduceResult = await waitForChild(ctx, reduceChild.id);
  return reduceResult;
}

// ── Law Matcher Layer (single specialist call) ──────────────

async function runLawMatcherLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  forensicReport: ForensicReport | null;
  onTable: OnEntry[];
  entities: EntityEntry[];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<LegalGroundingEntry[]> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    forensicReport,
    onTable,
    entities,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("law-matcher");
  if (!def) throw new Error("legal-pipeline: law-matcher specialist not found");

  const contextJson = JSON.stringify({
    on_table: onTable,
    entities,
    forensic_report: forensicReport,
    jurisdiction,
    verfahrenstyp,
  });

  const prompt = [
    "## AUFGABE: Legal Grounding — Match forensische Befunde gegen Gesetzeskorpus",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction.toUpperCase()}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    "",
    "Du erhältst den forensischen Bericht, die ON-Tabelle und die Entity-Liste.",
    "Für JEDEN Amtshaftungspunkt und Jede unterlassene Maßnahme:",
    "1. Extrahiere die rechtlichen Kernbegriffe",
    `2. Suche im Brain (law-${jurisdiction}, law-eu) nach relevanten §§ mit search/query`,
    "3. Lese gefundene §§ mit get_page und prüfe Relevanz",
    "4. Bestätige nur §§, deren source_text du gelesen hast (verified: true)",
    "",
    "## KONTEXT",
    contextJson,
    "",
    'Gib JSON zurück: { "grounding_entries": [...] }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "law-matcher",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  // T5.4: law-matcher is mandatory — on_child_fail: "fail"
  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("law-matcher"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const claimedEntries = extractLegalGroundingMap(result);

  // Backend-authoritative verification: the LLM only claims; we load the
  // corpus source ourselves and set verified + provenance fields.
  const adapter = new FileSystemCorpusLookupAdapter();
  const validator = new GroundingMapValidator(adapter);
  return await validator.verify({ jurisdiction, entries: claimedEntries });
}

// ── Draft Layer (Jurisdiction + Verfahrenstyp + Parteirolle) ──
//
// Gap B: the package matrix lives in src/core/legal/draft-packages.ts.
// AT packages are resolved per Verfahrenstyp + Parteirolle (Kläger:
// Mahnklage/Klage — Beklagter: Klagebeantwortung/Einreden — jeweils mit
// RATG-Kostenverzeichnis). straf/sonstiges keep the legacy flagship set.

// ── Counter-Argument Layer (Layer 6.5: Opponent-Simulator) ────────────────

/**
 * Run the opponent-simulator: plays the opposing counsel, reads all drafts
 * and the forensic report, and generates counter-arguments.
 *
 * This is what a real lawyer does: anticipate the opponent's moves.
 * Harvey AI does NOT have this — it's our competitive advantage.
 */
async function runCounterArgumentLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  draftSlugs: string[];
  forensicReportSlug?: string;
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<{ counterArguments: CounterArgument[]; counterSlug: string }> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    draftSlugs,
    forensicReportSlug,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("opponent-simulator");
  if (!def) throw new Error("legal-pipeline: opponent-simulator specialist not found");

  const prompt = [
    "Du bist die GEGENSEITE. Lies alle Entwürfe und den forensischen Bericht, und widerlege die Klageargumentation.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction.toUpperCase()}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Entwurf-Pages: ${draftSlugs.join(", ")}`,
    forensicReportSlug ? `Forensischer Bericht: ${forensicReportSlug}` : "",
    "",
    "Lade jede Page mit get_page und analysiere systematisch die Schwächen.",
    `Suche im Brain (law-${jurisdiction}, law-eu) nach §§ die GEGEN die Klage sprechen.`,
    "",
    'Gib JSON zurück: { counter_arguments: [...], overall_assessment: "...", recommended_strategy: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "opponent-simulator",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  // T5.4: opponent-simulator is mandatory — on_child_fail: "fail"
  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("opponent-simulator"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const counterArguments = extractCounterArguments(result);

  // Write counter-arguments page
  const counterSlug = `counter-arguments/${caseSlug}`;
  await writeCounterArgumentsPage(engine, counterSlug, caseSlug, counterArguments, sourceStamp);

  return { counterArguments, counterSlug };
}

/** Extract counter-arguments from the opponent-simulator result. */
function extractCounterArguments(result: unknown): CounterArgument[] {
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return [];
  const ca = json.counter_arguments;
  if (!Array.isArray(ca)) return [];
  return ca
    .filter((c) => typeof c === "object" && c !== null)
    .map((c) => {
      const obj = c as Record<string, unknown>;
      return {
        target_draft: String(obj.target_draft ?? ""),
        weakness_type: String(obj.weakness_type ?? ""),
        argument: String(obj.argument ?? ""),
        counter_paragraphs: Array.isArray(obj.counter_paragraphs)
          ? obj.counter_paragraphs
              .filter((p) => typeof p === "object")
              .map((p) => {
                const pp = p as Record<string, unknown>;
                return {
                  paragraph: String(pp.paragraph ?? ""),
                  source_text: String(pp.source_text ?? ""),
                  verified: Boolean(pp.verified),
                };
              })
          : [],
        severity: (obj.severity === "kritisch" ||
        obj.severity === "hoch" ||
        obj.severity === "mittel" ||
        obj.severity === "niedrig"
          ? obj.severity
          : "mittel") as CounterArgument["severity"],
        suggested_refutation: String(obj.suggested_refutation ?? ""),
      };
    });
}

/** Write the counter-arguments page. */
async function writeCounterArgumentsPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  counterArguments: CounterArgument[],
  sourceId?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Gegenseitige Argumente — ${caseSlug}"`);
  lines.push(`type: counter_arguments`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`total_counter_arguments: ${counterArguments.length}`);
  const kritisch = counterArguments.filter((c) => c.severity === "kritisch").length;
  const hoch = counterArguments.filter((c) => c.severity === "hoch").length;
  lines.push(`kritisch_count: ${kritisch}`);
  lines.push(`hoch_count: ${hoch}`);
  lines.push("---");
  lines.push("");
  lines.push("## Gegenseitige Argumente (Opponent-Simulator)");
  lines.push("");
  if (counterArguments.length === 0) {
    lines.push("_Keine Gegenargumente gefunden._");
  } else {
    lines.push("| # | Ziel | Schwäche-Typ | Severity | Argument |");
    lines.push("|---|------|-------------|----------|----------|");
    for (let i = 0; i < counterArguments.length; i++) {
      const c = counterArguments[i]!;
      lines.push(
        `| ${i + 1} | ${c.target_draft} | ${c.weakness_type} | ${c.severity} | ${c.argument.slice(0, 80)}... |`
      );
    }
    lines.push("");
    for (let i = 0; i < counterArguments.length; i++) {
      const c = counterArguments[i]!;
      lines.push(`### Gegenargument ${i + 1}: ${c.weakness_type} (${c.severity})`);
      lines.push("");
      lines.push(`**Ziel-Draft:** ${c.target_draft}`);
      lines.push(`**Argument:** ${c.argument}`);
      lines.push("");
      if (c.counter_paragraphs.length > 0) {
        lines.push("**Gegen-§§:**");
        for (const p of c.counter_paragraphs) {
          lines.push(
            `- ${p.paragraph} ${p.verified ? "✅" : "❌"}: ${p.source_text.slice(0, 200)}`
          );
        }
        lines.push("");
      }
      lines.push(`**Empfohlene Widerlegung:** ${c.suggested_refutation}`);
      lines.push("");
    }
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "counter_arguments",
      title: parsed.title ?? `Gegenseitige Argumente — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

/**
 * Re-run the drafter with counter-argument context.
 * The drafter reads the counter-arguments and refutes them in revised drafts.
 */
async function runDraftRebuttalLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  draftSlugs: string[];
  counterArguments: CounterArgument[];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  parteirolle?: Parteirolle;
  additionalOpponents?: LegalPipelineData["additional_opponents"];
  nebenverfahren?: string[];
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string[]> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    draftSlugs,
    counterArguments,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    parteirolle = "unbekannt",
    additionalOpponents,
    nebenverfahren,
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("legal-drafter");
  if (!def) throw new Error("legal-pipeline: legal-drafter specialist not found");
  const packages = resolveDraftPackages({
    jurisdiction,
    verfahrenstyp,
    parteirolle,
    additionalOpponents,
    nebenverfahren: nebenverfahren as Nebenverfahren[] | undefined,
  });

  // Group counter-arguments by target draft
  const byDraft = new Map<string, CounterArgument[]>();
  for (const ca of counterArguments) {
    const existing = byDraft.get(ca.target_draft) ?? [];
    existing.push(ca);
    byDraft.set(ca.target_draft, existing);
  }

  // Re-run only drafts that have counter-arguments
  const childIds: number[] = [];
  const draftTypesToRevise: string[] = [];

  for (const pkg of packages) {
    const cas = byDraft.get(pkg.type);
    if (!cas || cas.length === 0) continue; // No counter-arguments for this draft

    const counterContext = cas
      .map(
        (c, i) =>
          `### Gegenargument ${i + 1} (${c.severity}): ${c.weakness_type}\n${c.argument}\n\nGegen-§§: ${c.counter_paragraphs.map((p) => p.paragraph).join(", ")}\n\nEmpfohlene Widerlegung: ${c.suggested_refutation}`
      )
      .join("\n\n");

    const prompt = [
      `Überarbeite den Entwurf "${pkg.title}" (${pkg.type}) für Akte ${caseSlug}.`,
      "",
      `Jurisdiktion: ${jurisdiction}`,
      `Verfahrenstyp: ${verfahrenstyp}`,
      "",
      "## GEGENARGUMENTE DER GEGENSEITE (zu entkräften)",
      "",
      counterContext,
      "",
      "Lade den bisherigen Entwurf mit get_page, überarbeite ihn und entkräfte jedes Gegenargument.",
      "Füge einen 'Widerlegung der Gegenargumente' Abschnitt hinzu.",
      "",
      "Lade den bisherigen Entwurf: legal-drafts/" + caseSlug + "-" + pkg.type,
    ].join("\n");

    const childData: Record<string, unknown> = {
      prompt,
      subagent_def: "legal-drafter",
      max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
    };
    if (def.model) childData.model = def.model;
    if (sourceStamp) childData._source_id = sourceStamp;
    if (lawSourceIds) childData._source_ids = lawSourceIds;

    // T5.4: legal-drafter is mandatory — on_child_fail: "fail"
    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: getChildFailPolicy("legal-drafter"),
        max_stalled: 3,
      },
      { allowProtectedSubmit: true }
    );
    childIds.push(child.id);
    draftTypesToRevise.push(pkg.type);
  }

  // Collect revised drafts
  const revisedSlugs: string[] = [...draftSlugs];
  for (let i = 0; i < childIds.length; i++) {
    const result = await waitForChild(ctx, childIds[i]!);
    const pkgType = draftTypesToRevise[i]!;
    const slug = `legal-drafts/${caseSlug}-${pkgType}`;
    const pkg = packages.find((p) => p.type === pkgType)!;
    await writeLegalDraftPage(engine, slug, caseSlug, pkg, result, sourceStamp);
    // Slug already in revisedSlugs (it was in draftSlugs)
  }
  return revisedSlugs;
}

// ── Deadline Validation Layer (Layer 5b) ────────────────────

/**
 * Run the deadline-validator: reads the extracted deadline calendar,
 * validates each deadline against statutory limitation rules (§ 1489 ABGB,
 * § 195 BGB, Art 82 DSGVO, etc.), and flags expired/missing/uncertain deadlines.
 *
 * This prevents the liability risk of using unverified deadlines from the
 * court file — a real lawyer always cross-checks deadlines against the law.
 */
async function runDeadlineValidationLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  deadlineSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    deadlineSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("deadline-validator");
  if (!def) throw new Error("legal-pipeline: deadline-validator specialist not found");

  const fristHint =
    verfahrenstyp === "straf"
      ? "STRAF: § 28 StPO AT (6 Mo Strafantrag), § 106 StPO AT (1 Wo Einspruch), § 47 StPO DE (3 Mo), § 74 VwGO DE (1 Mo Widerspruch)"
      : verfahrenstyp === "zivil"
        ? "ZIVIL: § 1489 ABGB AT (3 J), § 195 BGB DE (3 J), Art 60 OR CH (10 J), Art 127 OR CH (10 J)"
        : verfahrenstyp === "arbeitsrecht"
          ? "ARBEITSRECHT: § 39 ArbVG AT, § 4 KSchG DE (3 Wo Kündigungsschutz), Art 328 OR CH"
          : verfahrenstyp === "verwaltungsrecht"
            ? "VERWALTUNGSRECHT: § 34 AVG AT (4 Wo Bescheidbeschwerde), § 70 VwGO DE (1 Mo Widerspruch), Art 55 VwVG CH"
            : "Alle Verjährungsregeln";

  const prompt = [
    "Prüfe alle extrahierten Fristen gegen die gesetzlichen Verjährungs- und Ausschlussregeln.",
    "",
    `Akte: ${caseSlug}`,
    `Fristenkalender: ${deadlineSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Relevante Fristen: ${fristHint}`,
    "",
    "Lade den Fristenkalender mit get_page und validiere jede Frist.",
    `Suche im Brain (law-${jurisdiction}, law-eu) nach den relevanten Verjährungs-§§.`,
    `WICHTIG: Verwende die Fristenregeln die zum Verfahrenstyp passen (${fristHint}).`,
    "",
    'Gib JSON zurück: { validated_deadlines: [...], missing_deadlines: [...], overall_assessment: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "deadline-validator",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  // T5.4: deadline-validator is mandatory — on_child_fail: "fail"
  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("deadline-validator"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const validation = extractDeadlineValidation(result);

  if (!validation) return null;

  const validationSlug = `deadline-validations/${caseSlug}`;
  await writeDeadlineValidationPage(engine, validationSlug, caseSlug, validation, sourceStamp);
  return validationSlug;
}

/** Extract deadline validation result from the specialist output. */
function extractDeadlineValidation(result: unknown): {
  validated_deadlines: Array<{
    original_frist: string;
    original_datum: string;
    rechtsgrundlage: string;
    status: string;
    verjaehrungsfrist_jahre?: number;
    berechnetes_enddatum?: string;
    warnung?: string | null;
    gefundener_paragraph?: { paragraph: string; source_text: string; verified: boolean };
  }>;
  missing_deadlines: Array<{
    frist: string;
    rechtsgrundlage: string;
    frist_jahre?: number;
    warnung: string;
    gefundener_paragraph?: { paragraph: string; source_text: string; verified: boolean };
  }>;
  overall_assessment: string;
} | null {
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;
  return {
    validated_deadlines: Array.isArray(json.validated_deadlines) ? json.validated_deadlines : [],
    missing_deadlines: Array.isArray(json.missing_deadlines) ? json.missing_deadlines : [],
    overall_assessment: String(json.overall_assessment ?? ""),
  };
}

/** Write the deadline validation page. */
async function writeDeadlineValidationPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  validation: {
    validated_deadlines: Array<{
      original_frist: string;
      original_datum: string;
      rechtsgrundlage: string;
      status: string;
      warnung?: string | null;
    }>;
    missing_deadlines: Array<{
      frist: string;
      rechtsgrundlage: string;
      warnung: string;
    }>;
    overall_assessment: string;
  },
  sourceId?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Fristen-Validierung — ${caseSlug}"`);
  lines.push(`type: deadline_validation`);
  lines.push(`case_ref: ${caseSlug}`);
  const abgelaufen = validation.validated_deadlines.filter((d) => d.status === "abgelaufen").length;
  const fehlt = validation.missing_deadlines.length;
  lines.push(`abgelaufen_count: ${abgelaufen}`);
  lines.push(`fehlt_count: ${fehlt}`);
  lines.push("---");
  lines.push("");
  lines.push("## Fristen-Validierung");
  lines.push("");
  lines.push(`**Gesamtbewertung:** ${validation.overall_assessment}`);
  lines.push("");

  if (validation.validated_deadlines.length > 0) {
    lines.push("### Validierte Fristen");
    lines.push("");
    lines.push("| Frist | Datum | Rechtsgrundlage | Status | Warnung |");
    lines.push("|-------|-------|-----------------|--------|---------|");
    for (const d of validation.validated_deadlines) {
      const warn = d.warnung ?? "";
      lines.push(
        `| ${d.original_frist} | ${d.original_datum} | ${d.rechtsgrundlage} | ${d.status} | ${warn} |`
      );
    }
    lines.push("");
  }

  if (validation.missing_deadlines.length > 0) {
    lines.push("### ⚠️ Fehlende Fristen (Haftungsrisiko!)");
    lines.push("");
    for (const m of validation.missing_deadlines) {
      lines.push(`- **${m.frist}** (${m.rechtsgrundlage}): ${m.warnung}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "deadline_validation",
      title: parsed.title ?? `Fristen-Validierung — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function runDraftLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  onTable: OnEntry[];
  entities: EntityEntry[];
  forensicReport: ForensicReport | null;
  legalGroundingMap: LegalGroundingEntry[];
  damageTable: DamageEntry[];
  deadlineCalendar: DeadlineEntry[];
  manualOverrides?: LegalPipelineData["manual_overrides"];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  parteirolle?: Parteirolle;
  additionalOpponents?: LegalPipelineData["additional_opponents"];
  nebenverfahren?: string[];
  sourceStamp?: string;
  lawSourceIds?: string[];
  state?: PipelineState;
  allText?: string;
  partSlugs?: string[];
}): Promise<string[]> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    onTable,
    entities,
    forensicReport,
    legalGroundingMap,
    damageTable,
    deadlineCalendar,
    manualOverrides,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    parteirolle = "unbekannt",
    additionalOpponents,
    nebenverfahren,
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("legal-drafter");
  if (!def) throw new Error("legal-pipeline: legal-drafter specialist not found");

  const packages = resolveDraftPackages({
    jurisdiction,
    verfahrenstyp,
    parteirolle,
    additionalOpponents,
    nebenverfahren: nebenverfahren as Nebenverfahren[] | undefined,
  });

  const contextJson = JSON.stringify({
    on_table: onTable,
    entities,
    forensic_report: forensicReport,
    legal_grounding_map: legalGroundingMap,
    damage_table: damageTable,
    deadline_calendar: deadlineCalendar,
    manual_overrides: manualOverrides,
    jurisdiction,
    verfahrenstyp,
    parteirolle,
  });

  const childIds: number[] = [];
  for (const pkg of packages) {
    const prompt = buildDraftPrompt(pkg, caseSlug, contextJson);
    const childData: Record<string, unknown> = {
      prompt,
      subagent_def: "legal-drafter",
      max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
    };
    if (def.model) childData.model = def.model;
    if (sourceStamp) childData._source_id = sourceStamp;
    if (lawSourceIds) childData._source_ids = lawSourceIds;

    // T5.4: legal-drafter is mandatory — on_child_fail: "fail"
    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: getChildFailPolicy("legal-drafter"),
        max_stalled: 3,
      },
      { allowProtectedSubmit: true }
    );
    childIds.push(child.id);
  }

  const slugs: string[] = [];
  const draftTexts: string[] = [];
  for (let i = 0; i < childIds.length; i++) {
    const result = await waitForChild(ctx, childIds[i]!);
    const slug = `legal-drafts/${caseSlug}-${packages[i]!.type}`;
    const draftText = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    draftTexts.push(draftText);

    // ── Tier 0 Citation Guardrail on each draft ──
    if (opts.state && opts.allText && opts.partSlugs) {
      const draftGuard = runCitationGuardrailForLayer(
        opts.state,
        6,
        draftText,
        opts.allText,
        opts.partSlugs
      );
      if (!draftGuard.passed && draftGuard.flags.some((f) => f.severity === "high")) {
        const highCount = draftGuard.flags.filter((f) => f.severity === "high").length;
        // Phase 0A: fail-closed — enforceGuardrailHardBlock now always throws
        enforceGuardrailHardBlock(6, `draft-${packages[i]!.type}`, highCount);
      }
    }

    await writeLegalDraftPage(engine, slug, caseSlug, packages[i]!, result, sourceStamp);
    slugs.push(slug);
  }

  // ── Tier 1 Cross-Model Verification on combined draft text ──
  if (opts.state && opts.allText && draftTexts.length > 0) {
    const combinedDraftText = draftTexts.join("\n\n---\n\n");
    const guardContext = opts.allText + "\n" + JSON.stringify(legalGroundingMap);
    let verifyResult: CrossVerifyResult | null = null;
    let crossVerifyError = false;
    try {
      verifyResult = await runCrossVerifyForDrafts(
        opts.state,
        combinedDraftText,
        guardContext,
        opts.jurisdiction
      );
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      console.error(`[legal-pipeline] Layer 6 cross-verify failed: ${msg}`);
      crossVerifyError = true;
      opts.state.warnings = [...(opts.state.warnings ?? []), "CROSS_VERIFY_ERROR"];
    }

    // ── Phase 0A: Compute verification state ──
    const draftGuardResult = opts.state.guardrail_results?.[6]
      ? checkCitationGrounding({
          answer: combinedDraftText,
          context: guardContext,
          topSlugs: opts.partSlugs ?? [],
        })
      : null;

    const riskLevel = classifyOutputRisk("draft");
    const verifyCtx: VerificationContext = {
      risk_level: riskLevel,
      guardrail_ran: !!draftGuardResult,
      cross_verify_ran: !!verifyResult,
      cross_verify_error: crossVerifyError || verifyResult?.verifier_error,
      jurisdiction: opts.jurisdiction,
    };

    const decision = resolveVerificationState(draftGuardResult, verifyResult, verifyCtx);
    opts.state.verification_state = decision.state;
    opts.state.verification_reason = decision.reason;

    if (decision.state === "BLOCKED") {
      console.error(`[legal-pipeline] Layer 6 BLOCKED: ${decision.reason}`);
      opts.state.status = "needs_human_review";
      opts.state.warnings = [
        ...(opts.state.warnings ?? []),
        `VERIFICATION_BLOCKED: ${decision.reason}`,
      ];
      throw new Error(`[legal-pipeline] Layer 6 verification BLOCKED: ${decision.reason}`);
    }

    if (needsHumanReview(decision.state)) {
      console.warn(`[legal-pipeline] Layer 6 ${decision.state}: ${decision.reason}`);
      opts.state.warnings = [
        ...(opts.state.warnings ?? []),
        `VERIFICATION_${decision.state}: ${decision.reason}`,
      ];
      if (decision.state === "VERIFIER_ERROR") {
        opts.state.status = "needs_human_review";
      }
    }
  }

  return slugs;
}

// ── Ensemble Critic Layer (3-Model Consensus) ──────────────

/** Default models for the ensemble critic — diverse perspectives for robust quality gate. */
const DEFAULT_ENSEMBLE_CRITIC_MODELS = [
  "openrouter:openai/gpt-5.4", // Strong legal reasoning (BenGER 83.5)
  "openrouter:deepseek/deepseek-chat", // Different training, cost-effective (LEXam 57.42)
  "openrouter:google/gemini-3-flash-preview", // Different perspective, fast
];

/**
 * Resolves the ensemble critic models from the `SUBSUMIO_ENSEMBLE_CRITIC_MODELS`
 * env var (comma-separated `provider:model` strings) or falls back to the
 * hardcoded defaults. Validates that at least 3 models are configured for
 * meaningful consensus voting.
 */
function resolveEnsembleCriticModels(): string[] {
  const envVal = process.env.SUBSUMIO_ENSEMBLE_CRITIC_MODELS;
  if (!envVal) return DEFAULT_ENSEMBLE_CRITIC_MODELS;
  const parsed = envVal
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parsed.length < 3) {
    console.warn(
      `[legal-pipeline] SUBSUMIO_ENSEMBLE_CRITIC_MODELS has only ${parsed.length} models — need ≥3 for consensus. Falling back to defaults.`
    );
    return DEFAULT_ENSEMBLE_CRITIC_MODELS;
  }
  return parsed;
}

/** Models for the ensemble critic — resolved at pipeline start for this run. */
const ENSEMBLE_CRITIC_MODELS = resolveEnsembleCriticModels();

/** Score threshold below which a layer should be retried. */
const LAYER_RETRY_THRESHOLD = 70;
/** Max retry rounds in the feedback loop. */
const MAX_CRITIC_RETRIES = 2;

// ── Subsumption Check (Pre-Critic) ──────────────────────────

/**
 * Run the subsumption-checker: verifies the legal syllogism
 * (Obersatz → Untersatz → Schluss) of all pipeline outputs.
 *
 * This is the core competency of a jurist — checking whether the
 * conclusion follows logically from the legal rule and the facts.
 * The results are fed into the ensemble critic prompt.
 */
async function runSubsumptionCheck(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  outputSlugs: string[];
  legalGroundingMap?: LegalGroundingEntry[];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    outputSlugs,
    legalGroundingMap,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("subsumption-checker");
  if (!def) throw new Error("legal-pipeline: subsumption-checker specialist not found");

  const groundingSlugs = legalGroundingMap ? [`legal-grounding-maps/${caseSlug}`] : [];

  const subsumptionHint =
    verfahrenstyp === "straf"
      ? "STRAF: Subsumiere nach Strafrecht (StGB/StPO). Prüfe Tatbestandsmerkmale, Rechtswidrigkeit, Schuld. Keine zivilrechtliche Subsumtion!"
      : verfahrenstyp === "zivil"
        ? "ZIVIL: Subsumiere nach Zivilrecht (ABGB/BGB/OR). Prüfe Anspruchsvoraussetzungen, Kausalität, Schaden."
        : verfahrenstyp === "arbeitsrecht"
          ? "ARBEITSRECHT: Subsumiere nach Arbeitsrecht (ArbVG/KSchG/ArbGG). Prüfe Kündigungsschutz, Mitbestimmung."
          : verfahrenstyp === "verwaltungsrecht"
            ? "VERWALTUNGSRECHT: Subsumiere nach Verwaltungsrecht (AVG/VwVfG/VwGO). Prüfe Ermessensspielraum, Verhältnismäßigkeit."
            : "Allgemeine juristische Subsumtion.";

  const prompt = [
    "Prüfe die juristische Subsumtion (Obersatz → Untersatz → Schluss) aller Pipeline-Outputs.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Output-Pages: ${outputSlugs.join(", ")}`,
    `Legal Grounding Map: ${groundingSlugs.join(", ")}`,
    "",
    "WICHTIG: Verwende die Gesetze der angegebenen Jurisdiktion für den Obersatz:",
    "- AT: ABGB, StPO, AHG, AVG, ArbVG, B-VG",
    "- DE: BGB, ZPO, StGB, VwVfG, KSchG, BUrlG",
    "- CH: OR, ZGB, BV, ZPO, StPO, VwVG",
    "- EU: AEUV, DSGVO, EU-Verordnungen",
    `Subsumtions-Modus: ${subsumptionHint}`,
    "Markiere Subsumtionen die §§ der falschen Rechtsordnung verwenden als 'falscher_oberstatz' mit severity 'kritisch'.",
    "",
    "Lade jede Page mit get_page und prüfe für jede Behauptung:",
    "1. OBERsatz: Ist die zitierte Rechtsregel korrekt?",
    "2. UNTERsatz: Ist der Sachverhalt richtig dargestellt? Stimmt das Zitat?",
    "3. SCHLUSS: Folgt die Schlussfolgerung logisch aus Obersatz + Untersatz?",
    "4. Sind alle Tatbestandsmerkmale des § erfüllt?",
    "",
    "Gib JSON zurück: { subsumption_checks: [...], overall_subsumption_score: 0-100, critical_errors: [...] }",
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "subsumption-checker",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  // T5.4: subsumption-checker is mandatory — on_child_fail: "fail"
  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("subsumption-checker"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  // Return a formatted summary for the ensemble critic prompt
  const checks = Array.isArray(json.subsumption_checks) ? json.subsumption_checks : [];
  const score = clampScore(json.overall_subsumption_score);
  const criticalErrors = Array.isArray(json.critical_errors) ? json.critical_errors : [];

  const summary = [
    `Subsumption Score: ${score}/100`,
    `Critical Errors: ${criticalErrors.length}`,
    "",
    ...checks.slice(0, 20).map((c: unknown, i: number) => {
      const check = c as Record<string, unknown>;
      const verdict = String(check.verdict ?? "unsicher");
      const claim = String(check.claim ?? "").slice(0, 200);
      const errors = Array.isArray(check.errors) ? check.errors : [];
      const errorSummary = errors
        .map((e: unknown) => {
          const err = e as Record<string, unknown>;
          return `  - [${err.severity ?? "?"}] ${err.type ?? "?"}: ${String(err.description ?? "").slice(0, 150)}`;
        })
        .join("\n");
      return `Check ${i + 1} [${verdict}]: ${claim}\n${errorSummary}`;
    }),
  ].join("\n");

  return summary;
}

/** Write the subsumption check page. */
async function writeSubsumptionCheckPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  subsumptionText: string,
  sourceId?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Subsumptions-Prüfung — ${caseSlug}"`);
  lines.push(`type: subsumption_check`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push("---");
  lines.push("");
  lines.push("## Subsumptions-Prüfung (Juristischer Syllogismus)");
  lines.push("");
  lines.push("```");
  lines.push(subsumptionText);
  lines.push("```");

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "subsumption_check",
      title: parsed.title ?? `Subsumptions-Prüfung — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Precedent Match Layer (Layer 4b) ────────────────────────

/**
 * Run the precedent-matcher: searches for relevant case law (OGH/BGH/BVerfG)
 * that supports or endangers the legal claims.
 *
 * A real lawyer always checks: is there a court decision that confirms
 * or contradicts our position? Harvey AI does NOT do this.
 */
async function runPrecedentMatchLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  legalGroundingMap: LegalGroundingEntry[];
  forensicReport: ForensicReport | null;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    legalGroundingMap,
    forensicReport,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const safeSlug = sanitizeSlug(caseSlug);
  if (!safeSlug) {
    console.warn(`[legal-pipeline] Precedent match: invalid caseSlug "${caseSlug}"`);
    return null;
  }

  const groundingSlug = `legal-grounding-maps/${safeSlug}`;
  const forensicSlug = `forensic-reports/${safeSlug}`;

  const gerichtHint =
    verfahrenstyp === "straf"
      ? "Strafsenate: OGH 15 Os/16 Os, BGH 5 StR/3 StR, VwGH 19/20"
      : verfahrenstyp === "zivil"
        ? "Zivilsenate: OGH 1 Ob/2 Ob/3 Ob, BGH VI ZR/VIII ZR, VwGH 1/2"
        : verfahrenstyp === "arbeitsrecht"
          ? "Arbeitsrecht: OGH 9 ObA, BGH 2 AZR/6 AZR"
          : verfahrenstyp === "verwaltungsrecht"
            ? "Verwaltungsrecht: VwGH, BVerfG, BVG"
            : "Alle Senate";

  // Build context JSON with verfahrenstyp for the specialist
  const contextJson = JSON.stringify({
    jurisdiction,
    verfahrenstyp,
    gericht_hint: gerichtHint,
    legal_grounding_count: legalGroundingMap.length,
    has_forensic_report: !!forensicReport,
  });

  const prompt = [
    "Suche nach relevanter Rechtsprechung für diesen Fall.",
    "",
    `Akte: ${safeSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Relevante Senate: ${gerichtHint}`,
    `Legal Grounding Map: ${groundingSlug}`,
    `Forensischer Bericht: ${forensicSlug}`,
    `Kontext: ${contextJson}`,
    "",
    "Lade die Legal Grounding Map und den forensischen Bericht mit get_page.",
    `Suche im Brain nach Judikaten: search('OGH' + §-Nummer), search('BGH' + Thema).`,
    `WICHTIG: Konzentriere die Suche auf ${verfahrenstyp}-rechtliche Judikate (${gerichtHint}).`,
    "",
    'Gib JSON zurück: { precedent_matches: [...], precedent_gaps: [...], overall_precedent_score: 0-100, strategy_note: "..." }',
  ].join("\n");

  const json = await runSpecialistLayer({
    ctx,
    queue,
    specialistName: "precedent-matcher",
    prompt,
    sourceStamp,
    layerId: "precedent-matcher",
  });
  if (!json) return null;

  const slug = `precedent-matches/${safeSlug}`;
  await writePrecedentMatchPage(engine, slug, safeSlug, json, sourceStamp);
  return slug;
}

/** Write the precedent match page. */
async function writePrecedentMatchPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const matches = Array.isArray(data.precedent_matches) ? data.precedent_matches : [];
  const gaps = Array.isArray(data.precedent_gaps) ? data.precedent_gaps : [];
  const score = clampScore(data.overall_precedent_score);
  const strategy = String(data.strategy_note ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Rechtsprechungs-Analyse — ${caseSlug}"`);
  lines.push(`type: precedent_match`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`precedent_score: ${score}`);
  lines.push(`matches_count: ${matches.length}`);
  lines.push(`gaps_count: ${gaps.length}`);
  lines.push("---");
  lines.push("");
  lines.push("## Rechtsprechungs-Analyse");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Strategie:** ${strategy}`);
  lines.push("");

  if (matches.length > 0) {
    lines.push("### Gefundene Judikate");
    lines.push("");
    lines.push("| Gericht | Entscheidung | Datum | Position | Ähnlichkeit | Leitsatz |");
    lines.push("|---------|-------------|-------|----------|-------------|----------|");
    for (const m of matches) {
      const r = m as Record<string, unknown>;
      lines.push(
        `| ${r.gericht ?? "?"} | ${r.entscheidung ?? "?"} | ${r.datum ?? "?"} | ${r.position ?? "?"} | ${r.sachverhalt_aehnlichkeit ?? "?"} | ${String(r.leitsatz ?? "").slice(0, 100)} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (let i = 0; i < matches.length; i++) {
      const r = matches[i] as Record<string, unknown>;
      lines.push(`#### ${i + 1}. ${r.gericht ?? ""} ${r.entscheidung ?? ""} (${r.datum ?? ""})`);
      lines.push(`- **Anspruch:** ${r.claim ?? ""}`);
      lines.push(`- **§:** ${r.paragraph ?? ""}`);
      lines.push(`- **Position:** ${r.position ?? ""}`);
      lines.push(`- **Relevanz:** ${r.relevanz ?? ""}`);
      lines.push(`- **Begründung:** ${r.begründung ?? ""}`);
      if (r.source_text) {
        lines.push(`- **Quelle:** ${String(r.source_text).slice(0, 300)}`);
      }
      lines.push(`- **Verifiziert:** ${r.verified ? "✅" : "❌"}`);
      lines.push("");
    }
  }

  if (gaps.length > 0) {
    lines.push("### ⚠️ Rechtsprechungslücken");
    lines.push("");
    for (const g of gaps) {
      const r = g as Record<string, unknown>;
      lines.push(`- **${r.claim ?? ""}** (${r.paragraph ?? ""}): ${r.warnung ?? ""}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await safePutPage(
    engine,
    slug,
    {
      type: "precedent_match",
      title: parsed.title ?? `Rechtsprechungs-Analyse — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    sourceId
  );
}

// ── Burden of Proof Layer (Layer 4c) ────────────────────────

/**
 * Run the burden-of-proof-analyzer: determines who must prove what,
 * whether evidence is sufficient, and whether burden reversal applies.
 */
async function runBurdenOfProofLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  forensicReport: ForensicReport | null;
  legalGroundingMap: LegalGroundingEntry[];
  damageTable: DamageEntry[];
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    forensicReport,
    legalGroundingMap,
    damageTable,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("burden-of-proof-analyzer");
  if (!def) throw new Error("legal-pipeline: burden-of-proof-analyzer specialist not found");

  const prompt = [
    "Analysiere die Beweislastverteilung für jeden rechtlichen Anspruch.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    `Damage Table: damage-tables/${caseSlug}`,
    "",
    "WICHTIG: Verwende die Beweislastregeln die zum Verfahrenstyp passen (siehe System-Prompt).",
    "Bei Strafverfahren: Inquisitionsgrundsatz, in dubio pro reo.",
    "Bei Zivilverfahren: Beibringungsgrundsatz, Beweislast beim Behauptenden.",
    "",
    "Lade alle Pages mit get_page und analysiere für jeden Anspruch:",
    "1. Wer muss was beweisen?",
    "2. Ist Beweislastumkehr möglich? (nur bei Zivil)",
    "3. Reichen die Beweise aus?",
    "",
    'Gib JSON zurück: { burden_analysis: [...], missing_evidence: [...], overall_beweis_score: 0-100, beweis_strategie: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "burden-of-proof-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("burden-of-proof"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `burden-of-proof/${caseSlug}`;
  await writeBurdenOfProofPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the burden of proof page. */
async function writeBurdenOfProofPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const analysis = Array.isArray(data.burden_analysis) ? data.burden_analysis : [];
  const missing = Array.isArray(data.missing_evidence) ? data.missing_evidence : [];
  const score = clampScore(data.overall_beweis_score);
  const strategie = String(data.beweis_strategie ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Beweislast-Analyse — ${caseSlug}"`);
  lines.push(`type: burden_of_proof`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`beweis_score: ${score}`);
  lines.push(`missing_evidence_count: ${missing.length}`);
  lines.push("---");
  lines.push("");
  lines.push("## Beweislast-Analyse");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Strategie:** ${strategie}`);
  lines.push("");

  for (const a of analysis) {
    const r = a as Record<string, unknown>;
    lines.push(`### ${r.claim ?? ""} (${r.paragraph ?? ""})`);
    lines.push(`- **Beweislast:** ${r.overall_beweislast ?? "?"}`);
    lines.push(`- **Beweiskraft:** ${r.beweis_kraft ?? "?"}`);
    lines.push(`- **Umkehr möglich:** ${r.beweislastumkehr_moeglich ? "✅" : "❌"}`);
    if (r.warnung) lines.push(`- **⚠️ Warnung:** ${r.warnung}`);
    const merkmale = Array.isArray(r.tatbestandsmerkmale) ? r.tatbestandsmerkmale : [];
    if (merkmale.length > 0) {
      lines.push("");
      lines.push("| Merkmal | Beweislast | Beweis vorhanden | Beweisnot |");
      lines.push("|---------|-----------|------------------|-----------|");
      for (const m of merkmale) {
        const mr = m as Record<string, unknown>;
        lines.push(
          `| ${mr.merkmal ?? ""} | ${mr.beweislast ?? ""} | ${mr.beweis_vorhanden ? "✅" : "❌"} | ${mr.beweis_not ?? ""} |`
        );
      }
    }
    lines.push("");
  }

  if (missing.length > 0) {
    lines.push("### ⚠️ Fehlende Beweise");
    lines.push("");
    for (const m of missing) {
      const r = m as Record<string, unknown>;
      lines.push(
        `- **${r.merkmal ?? ""}** (${r.claim ?? ""}): ${r.benoetigtes_beweismittel ?? ""} — Priorität: ${r.prioritaet ?? "?"}`
      );
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "burden_of_proof",
      title: parsed.title ?? `Beweislast-Analyse — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Cost-Benefit Layer (Layer 5c) ───────────────────────────

/**
 * Run the cost-benefit-analyzer: calculates expected value (EV),
 * win probability, costs (RVG/StBVV/AHGB), break-even, and risk.
 */
async function runCostBenefitLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  damageTable: DamageEntry[];
  forensicReport: ForensicReport | null;
  legalGroundingMap: LegalGroundingEntry[];
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    damageTable,
    forensicReport,
    legalGroundingMap,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("cost-benefit-analyzer");
  if (!def) throw new Error("legal-pipeline: cost-benefit-analyzer specialist not found");

  const prompt = [
    "Berechne den Expected Value (EV) und die Kosten-Nutzen-Analyse für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Damage Table: damage-tables/${caseSlug}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page.",
    "Berechne: Streitwert, Win Probability, Anwaltskosten, Gerichtskosten, EV, Break-Even.",
    "WICHTIG: Verwende die Kostenstruktur die zum Verfahrenstyp passt (siehe System-Prompt).",
    "",
    'Gib JSON zurück: { streitwert, win_probability, schadenshoehe, kosten_schaetzung: {...}, expected_value: {...}, risk_assessment: {...}, szenarien: [...], kosten_nutzen_urteil: "EMPFOHLEN|BEDINGT EMPFOHLEN|NICHT EMPFOHLEN", zusammenfassung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "cost-benefit-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("cost-benefit"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `cost-benefit/${caseSlug}`;
  await writeCostBenefitPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the cost-benefit page. */
async function writeCostBenefitPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const streitwert = typeof data.streitwert === "number" ? data.streitwert : 0;
  const winProb = typeof data.win_probability === "number" ? data.win_probability : 0;
  const schaden = typeof data.schadenshoehe === "number" ? data.schadenshoehe : 0;
  const kosten = data.kosten_schaetzung as Record<string, unknown> | undefined;
  const ev = data.expected_value as Record<string, unknown> | undefined;
  const risk = data.risk_assessment as Record<string, unknown> | undefined;
  const szenarien = Array.isArray(data.szenarien) ? data.szenarien : [];
  const urteil = String(data.kosten_nutzen_urteil ?? "");
  const zusammenfassung = String(data.zusammenfassung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Kosten-Nutzen-Analyse — ${caseSlug}"`);
  lines.push(`type: cost_benefit`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`streitwert: ${streitwert}`);
  lines.push(`win_probability: ${winProb}`);
  lines.push(`urteil: ${urteil}`);
  lines.push("---");
  lines.push("");
  lines.push("## Kosten-Nutzen-Analyse");
  lines.push("");
  lines.push(`**Urteil:** ${urteil}`);
  lines.push("");
  lines.push(`**Zusammenfassung:** ${zusammenfassung}`);
  lines.push("");

  lines.push("### Kennzahlen");
  lines.push("");
  lines.push("| Kennzahl | Wert |");
  lines.push("|----------|------|");
  lines.push(`| Streitwert | €${streitwert.toLocaleString("de-DE")} |`);
  lines.push(`| Schadenshöhe | €${schaden.toLocaleString("de-DE")} |`);
  lines.push(`| Gewinnwahrscheinlichkeit | ${winProb}% |`);
  if (ev?.ev !== undefined)
    lines.push(`| Expected Value | €${Number(ev.ev).toLocaleString("de-DE")} |`);
  if (ev?.break_even_schaden !== undefined)
    lines.push(
      `| Break-Even (Schaden) | €${Number(ev.break_even_schaden).toLocaleString("de-DE")} |`
    );
  if (ev?.break_even_wahrscheinlichkeit !== undefined)
    lines.push(`| Break-Even (Wahrscheinlichkeit) | ${ev.break_even_wahrscheinlichkeit} |`);
  if (risk?.risk_reward_ratio !== undefined)
    lines.push(`| Risk/Reward Ratio | ${risk.risk_reward_ratio} |`);
  lines.push("");

  if (kosten) {
    lines.push("### Kostenschätzung");
    lines.push("");
    lines.push("| Kostenart | Betrag |");
    lines.push("|-----------|--------|");
    if (kosten.anwaltskosten_klageerstellung !== undefined)
      lines.push(
        `| Anwaltskosten Klageerstellung | €${Number(kosten.anwaltskosten_klageerstellung).toLocaleString("de-DE")} |`
      );
    if (kosten.anwaltskosten_verhandlung !== undefined)
      lines.push(
        `| Anwaltskosten Verhandlung | €${Number(kosten.anwaltskosten_verhandlung).toLocaleString("de-DE")} |`
      );
    if (kosten.gerichtskosten_erstinstanz !== undefined)
      lines.push(
        `| Gerichtskosten Erstinstanz | €${Number(kosten.gerichtskosten_erstinstanz).toLocaleString("de-DE")} |`
      );
    if (kosten.sachverstaendige !== undefined)
      lines.push(
        `| Sachverständige | €${Number(kosten.sachverstaendige).toLocaleString("de-DE")} |`
      );
    if (kosten.eigene_kosten_gesamt !== undefined)
      lines.push(
        `| **Eigene Kosten gesamt** | **€${Number(kosten.eigene_kosten_gesamt).toLocaleString("de-DE")}** |`
      );
    if (kosten.gegenerische_kosten_bei_verlust !== undefined)
      lines.push(
        `| Gegnerische Kosten bei Verlust | €${Number(kosten.gegenerische_kosten_bei_verlust).toLocaleString("de-DE")} |`
      );
    lines.push("");
  }

  if (szenarien.length > 0) {
    lines.push("### Szenarien");
    lines.push("");
    lines.push("| Szenario | Wahrscheinlichkeit | Schaden | Ergebnis |");
    lines.push("|----------|-------------------|---------|----------|");
    for (const s of szenarien) {
      const r = s as Record<string, unknown>;
      lines.push(
        `| ${r.name ?? ""} | ${r.wahrscheinlichkeit ?? ""}% | €${Number(r.schaden ?? 0).toLocaleString("de-DE")} | €${Number(r.ergebnis ?? 0).toLocaleString("de-DE")} |`
      );
    }
    lines.push("");
  }

  if (risk?.begruendung) {
    lines.push("### Risiko-Assessment");
    lines.push("");
    lines.push(String(risk.begruendung));
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "cost_benefit",
      title: parsed.title ?? `Kosten-Nutzen-Analyse — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Admissibility Check Layer (Layer 3b) ────────────────────

/**
 * Run the admissibility-checker: verifies that all planned legal
 * actions are procedurally admissible (jurisdiction, exhaustion,
 * statute of limitations, capacity, attorney requirement).
 */
async function runAdmissibilityCheckLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  legalGroundingMap: LegalGroundingEntry[];
  forensicReport: ForensicReport | null;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    legalGroundingMap,
    forensicReport,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("admissibility-checker");
  if (!def) throw new Error("legal-pipeline: admissibility-checker specialist not found");

  const prompt = [
    "Prüfe die Zulässigkeit aller geplanten Rechtsbehelfe für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Fristen-Validierung: deadline-validations/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und prüfe für jeden Rechtsbehelf:",
    "1. Zuständigkeit (sachlich, örtlich, funktionell)",
    "2. Rechtswegerschöpfung (Vorverfahren ausgeschöpft?)",
    "3. Verjährung (Anspruch noch nicht verjährt?)",
    "4. Klagefristen (gesetzliche Fristen eingehalten?)",
    "5. Parteifähigkeit & Prozessfähigkeit",
    "6. Postulationsfähigkeit (Anwaltszwang)",
    "",
    'Gib JSON zurück: { admissibility_checks: [...], overall_zulaessigkeit_score: 0-100, critical_blockers: [...], empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "admissibility-checker",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("admissibility-checker"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `admissibility-checks/${caseSlug}`;
  await writeAdmissibilityCheckPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the admissibility check page. */
async function writeAdmissibilityCheckPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const checks = Array.isArray(data.admissibility_checks) ? data.admissibility_checks : [];
  const score = clampScore(data.overall_zulaessigkeit_score);
  const blockers = Array.isArray(data.critical_blockers) ? data.critical_blockers : [];
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Zulässigkeits-Prüfung — ${caseSlug}"`);
  lines.push(`type: admissibility_check`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`zulaessigkeit_score: ${score}`);
  lines.push(`blockers_count: ${blockers.length}`);
  lines.push("---");
  lines.push("");
  lines.push("## Zulässigkeits-Prüfung");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  for (const c of checks) {
    const r = c as Record<string, unknown>;
    const zulaessig = r.zulaessig;
    lines.push(`### ${r.rechtsbehelf ?? ""} — ${zulaessig ? "✅ Zulässig" : "❌ Unzulässig"}`);
    const pruefungen = Array.isArray(r.pruefungen) ? r.pruefungen : [];
    if (pruefungen.length > 0) {
      lines.push("");
      lines.push("| Kriterium | Status | Detail | Warnung |");
      lines.push("|-----------|--------|--------|---------|");
      for (const p of pruefungen) {
        const pr = p as Record<string, unknown>;
        lines.push(
          `| ${pr.kriterium ?? ""} | ${pr.status ?? ""} | ${String(pr.detail ?? "").slice(0, 80)} | ${pr.warnung ?? ""} |`
        );
      }
    }
    const blockErrors = Array.isArray(r.blockierende_fehler) ? r.blockierende_fehler : [];
    if (blockErrors.length > 0) {
      lines.push("");
      lines.push("**Blockierende Fehler:**");
      for (const e of blockErrors) lines.push(`- ❌ ${e}`);
    }
    const warnungen = Array.isArray(r.warnungen) ? r.warnungen : [];
    if (warnungen.length > 0) {
      lines.push("");
      lines.push("**Warnungen:**");
      for (const w of warnungen) lines.push(`- ⚠️ ${w}`);
    }
    lines.push("");
  }

  if (blockers.length > 0) {
    lines.push("### 🚨 Kritische Blocker");
    lines.push("");
    for (const b of blockers) lines.push(`- ${b}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "admissibility_check",
      title: parsed.title ?? `Zulässigkeits-Prüfung — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Settlement Analysis Layer (Layer 5d) ────────────────────

/**
 * Run the settlement-analyzer: calculates BATNA, ZOPA, optimal
 * settlement amount, and negotiation strategy.
 */
async function runSettlementAnalysisLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("settlement-analyzer");
  if (!def) throw new Error("legal-pipeline: settlement-analyzer specialist not found");

  // Bei Strafverfahren: Vergleich nicht sinnvoll — Diversion/Wiedergutmachung stattdessen
  const isStraf = verfahrenstyp === "straf";

  const prompt = [
    isStraf
      ? "Berechne die Diversions-/Wiedergutmachungsanalyse für dieses STRAFVERFAHREN."
      : "Berechne die Vergleichsanalyse (BATNA, ZOPA, optimaler Vergleich) für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    `Damage Table: damage-tables/${caseSlug}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Beweislast-Analyse: burden-of-proof/${caseSlug}`,
    "",
    isStraf
      ? "WICHTIG: Bei Strafverfahren gibt es keinen zivilrechtlichen Vergleich. Analysiere stattdessen:"
      : "Lade alle Pages mit get_page.",
    isStraf
      ? "1. DIVERSION: Ist Diversion möglich? (AT: § 90 StPO — Geldbuße, Bewährung, Wiedergutmachung)"
      : "Berechne: BATNA (Mandant & Gegner), ZOPA, optimaler Vergleich, Walk-away, Verhandlungsstrategie.",
    isStraf
      ? "2. WIEDERGUTMACHUNG: Schadensersatz durch Täter als Alternative zur Privatbeteiligung"
      : "",
    isStraf
      ? "3. STRAFZUMESSUNG: Welche Faktoren wirken strafmindernd? (Geständnis, Wiedergutmachung, Reue)"
      : "",
    isStraf
      ? "4. DEAL/VERSTÄNDIGUNG: Ist eine Verständigung im Strafverfahren möglich? (AT: § 210a StPO)"
      : "",
    "",
    isStraf
      ? 'Gib JSON zurück: { diversion_moeglich: true/false, wiedergutmachung: {...}, strafzumessung: {...}, verstaendigung: {...}, empfehlung: "...", zusammenfassung: "..." }'
      : 'Gib JSON zurück: { batna_mandant: {...}, batna_gegner: {...}, zopa: {...}, optimaler_vergleich: {...}, walk_away_punkt: {...}, verhandlungsstrategie: {...}, vergleich_empfehlung: "EMPFOHLEN|BEDINGT EMPFOHLEN|NICHT EMPFOHLEN", zusammenfassung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "settlement-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("settlement-analysis"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `settlement-analysis/${caseSlug}`;
  await writeSettlementAnalysisPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the settlement analysis page. */
async function writeSettlementAnalysisPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const batnaM = data.batna_mandant as Record<string, unknown> | undefined;
  const batnaG = data.batna_gegner as Record<string, unknown> | undefined;
  const zopa = data.zopa as Record<string, unknown> | undefined;
  const optimal = data.optimaler_vergleich as Record<string, unknown> | undefined;
  const walkAway = data.walk_away_punkt as Record<string, unknown> | undefined;
  const strategy = data.verhandlungsstrategie as Record<string, unknown> | undefined;
  const empfehlung = String(data.vergleich_empfehlung ?? "");
  const zusammenfassung = String(data.zusammenfassung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Vergleichsanalyse — ${caseSlug}"`);
  lines.push(`type: settlement_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`empfehlung: ${empfehlung}`);
  lines.push("---");
  lines.push("");
  lines.push("## Vergleichsanalyse (Settlement)");
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");
  lines.push(`**Zusammenfassung:** ${zusammenfassung}`);
  lines.push("");

  lines.push("### BATNA (Best Alternative To Negotiated Agreement)");
  lines.push("");
  lines.push("| Partei | EV | Beschreibung |");
  lines.push("|--------|-----|-------------|");
  if (batnaM)
    lines.push(
      `| Mandant | €${Number(batnaM.ev ?? 0).toLocaleString("de-DE")} | ${batnaM.beschreibung ?? ""} |`
    );
  if (batnaG)
    lines.push(
      `| Gegner | €${Number(batnaG.ev ?? 0).toLocaleString("de-DE")} | ${batnaG.beschreibung ?? ""} |`
    );
  lines.push("");

  if (zopa) {
    lines.push("### ZOPA (Zone of Possible Agreement)");
    lines.push("");
    lines.push("| Untergrenze | Obergrenze | Breite | Überlappung |");
    lines.push("|-------------|-----------|--------|-------------|");
    lines.push(
      `| €${Number(zopa.untergrenze ?? 0).toLocaleString("de-DE")} | €${Number(zopa.obergrenze ?? 0).toLocaleString("de-DE")} | €${Number(zopa.breite ?? 0).toLocaleString("de-DE")} | ${zopa.ueberlappung ? "✅" : "❌"} |`
    );
    lines.push("");
    if (zopa.beschreibung) lines.push(`**Beschreibung:** ${zopa.beschreibung}`);
    lines.push("");
  }

  if (optimal) {
    lines.push("### Optimaler Vergleich");
    lines.push("");
    lines.push(`- **Betrag:** €${Number(optimal.betrag ?? 0).toLocaleString("de-DE")}`);
    if (optimal.begruendung) lines.push(`- **Begründung:** ${optimal.begruendung}`);
    if (optimal.mandant_vorteil !== undefined)
      lines.push(
        `- **Mandant-Vorteil:** €${Number(optimal.mandant_vorteil).toLocaleString("de-DE")}`
      );
    lines.push("");
  }

  if (walkAway) {
    lines.push("### Walk-away-Punkt");
    lines.push("");
    lines.push(`- **Betrag:** €${Number(walkAway.betrag ?? 0).toLocaleString("de-DE")}`);
    if (walkAway.beschreibung) lines.push(`- **Beschreibung:** ${walkAway.beschreibung}`);
    lines.push("");
  }

  if (strategy) {
    lines.push("### Verhandlungsstrategie");
    lines.push("");
    lines.push(
      `- **Erste Forderung:** €${Number(strategy.erste_forderung ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(`- **Ziel-Betrag:** €${Number(strategy.ziel_betrag ?? 0).toLocaleString("de-DE")}`);
    lines.push(`- **Walk-away:** €${Number(strategy.walk_away ?? 0).toLocaleString("de-DE")}`);
    if (strategy.anker) lines.push(`- **Anker:** ${strategy.anker}`);
    if (strategy.konzessionen) lines.push(`- **Konzessionen:** ${strategy.konzessionen}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "settlement_analysis",
      title: parsed.title ?? `Vergleichsanalyse — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Fact Gap Detection Layer (Layer 3c) ─────────────────────

/**
 * Run the fact-gap-detector: identifies missing facts needed for
 * legal claims and generates targeted client questions.
 */
async function runFactGapDetectionLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  forensicReport: ForensicReport | null;
  legalGroundingMap: LegalGroundingEntry[];
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    forensicReport,
    legalGroundingMap,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("fact-gap-detector");
  if (!def) throw new Error("legal-pipeline: fact-gap-detector specialist not found");

  const factGapHint =
    verfahrenstyp === "straf"
      ? "STRAF: Prüfe strafrechtliche Tatbestandsmerkmale (Vorsatz/Fahrlässigkeit, Rechtswidrigkeit, Schuld). Frag ob der Mandant den Tatbestand erfüllt hat."
      : verfahrenstyp === "zivil"
        ? "ZIVIL: Prüfe zivilrechtliche Anspruchsvoraussetzungen (Kausalität, Schadenshöhe, Mitverschulden). Frag nach Belegen für jeden Anspruch."
        : verfahrenstyp === "arbeitsrecht"
          ? "ARBEITSRECHT: Prüfe Kündigungsschutz-Voraussetzungen, Mitbestimmungsrechte, Sozialplanansprüche."
          : verfahrenstyp === "verwaltungsrecht"
            ? "VERWALTUNGSRECHT: Prüfe Bescheid-Voraussetzungen, Ermessensausübung, Verhältnismäßigkeit."
            : "Allgemeine Sachverhaltslücken.";

  const prompt = [
    "Identifiziere Sachverhaltslücken und generiere Klärungsfragen für den Mandanten.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    `Beweislast-Analyse: burden-of-proof/${caseSlug}`,
    "",
    `Fokus: ${factGapHint}`,
    "",
    "Lade alle Pages mit get_page.",
    "Für jedes Tatbestandsmerkmal: prüfe ob ein Fakt aus dem Sachverhalt belegt ist.",
    "Generiere für jede Lücke eine gezielte Klärungsfrage an den Mandanten.",
    "",
    'Gib JSON zurück: { fact_gaps: [...], mandanten_fragen: [...], overall_vollstaendigkeit_score: 0-100, kritische_luecken: [...], empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "fact-gap-detector",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("fact-gap-detector"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `fact-gaps/${caseSlug}`;
  await writeFactGapPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the fact gap page. */
async function writeFactGapPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const gaps = Array.isArray(data.fact_gaps) ? data.fact_gaps : [];
  const fragen = Array.isArray(data.mandanten_fragen) ? data.mandanten_fragen : [];
  const score = clampScore(data.overall_vollstaendigkeit_score);
  const kritische = Array.isArray(data.kritische_luecken) ? data.kritische_luecken : [];
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Sachverhaltslücken — ${caseSlug}"`);
  lines.push(`type: fact_gap_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`vollstaendigkeit_score: ${score}`);
  lines.push(`kritische_luecken: ${kritische.length}`);
  lines.push("---");
  lines.push("");
  lines.push("## Sachverhaltslücken-Analyse");
  lines.push("");
  lines.push(`**Vollständigkeit:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (gaps.length > 0) {
    lines.push("### Identifizierte Lücken");
    lines.push("");
    lines.push("| Anspruch | Merkmal | Status | Priorität | Klärungsfrage |");
    lines.push("|----------|---------|--------|-----------|---------------|");
    for (const g of gaps) {
      const r = g as Record<string, unknown>;
      lines.push(
        `| ${r.anspruch ?? ""} | ${r.tatbestandsmerkmal ?? ""} | ${r.status ?? ""} | ${r.prioritaet ?? ""} | ${String(r.klaerungsfrage ?? "").slice(0, 100)} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (let i = 0; i < gaps.length; i++) {
      const r = gaps[i] as Record<string, unknown>;
      lines.push(
        `#### ${i + 1}. ${r.anspruch ?? ""} — ${r.tatbestandsmerkmal ?? ""} [${r.status ?? ""}]`
      );
      const vorhandene = Array.isArray(r.vorhandene_fakten) ? r.vorhandene_fakten : [];
      if (vorhandene.length > 0) {
        lines.push("- **Vorhandene Fakten:**");
        for (const f of vorhandene) lines.push(`  - ${f}`);
      }
      const fehlende = Array.isArray(r.fehlende_fakten) ? r.fehlende_fakten : [];
      if (fehlende.length > 0) {
        lines.push("- **Fehlende Fakten:**");
        for (const f of fehlende) lines.push(`  - ${f}`);
      }
      if (r.klaerungsfrage) lines.push(`- **❓ Klärungsfrage:** ${r.klaerungsfrage}`);
      if (r.beweismittel) lines.push(`- **Beweismittel:** ${r.beweismittel}`);
      lines.push("");
    }
  }

  if (fragen.length > 0) {
    lines.push("### 📋 Mandanten-Fragen");
    lines.push("");
    for (let i = 0; i < fragen.length; i++) {
      const r = fragen[i] as Record<string, unknown>;
      lines.push(`${i + 1}. **[${r.prioritaet ?? "?"}]** ${r.frage ?? ""}`);
      if (r.hintergrund) lines.push(`   _Hintergrund: ${r.hintergrund}_`);
    }
    lines.push("");
  }

  if (kritische.length > 0) {
    lines.push("### 🚨 Kritische Lücken");
    lines.push("");
    for (const k of kritische) lines.push(`- ${k}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "fact_gap_analysis",
      title: parsed.title ?? `Sachverhaltslücken — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Enforcement Analysis Layer (Layer 5e) ───────────────────

/**
 * Run the enforcement-analyzer: checks if a judgment can actually
 * be enforced — asset situation, insolvency risk, attachment options.
 */
async function runEnforcementAnalysisLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  forensicReport: ForensicReport | null;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    forensicReport,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("enforcement-analyzer");
  if (!def) throw new Error("legal-pipeline: enforcement-analyzer specialist not found");

  const prompt = [
    "Prüfe die Vollstreckbarkeit eines künftigen Urteils für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    `ON-Tabelle: on-index/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und prüfe:",
    "1. Vermögenslage des Gegners (bekannte Vermögenswerte)",
    "2. Insolvenzrisiko (Zahlungsunfähigkeit, Überschuldung)",
    "3. Pfändbarkeit der Vermögenswerte",
    "4. Arrestgründe (Vermögensverschiebungsgefahr)",
    "5. Vollstreckungskosten",
    "6. Vollstreckungsrisiko (was kann schiefgehen?)",
    "",
    'Gib JSON zurück: { vermoegenslage: {...}, insolvenzrisiko: {...}, pfaendbarkeit: [...], arrestgruende: {...}, vollstreckungskosten: {...}, vollstreckungsrisiko: {...}, overall_vollstreckbarkeit_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "enforcement-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("enforcement-analysis"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `enforcement-analysis/${caseSlug}`;
  await writeEnforcementAnalysisPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the enforcement analysis page. */
async function writeEnforcementAnalysisPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const vermoegen = data.vermoegenslage as Record<string, unknown> | undefined;
  const insolvenz = data.insolvenzrisiko as Record<string, unknown> | undefined;
  const pfaendbarkeit = Array.isArray(data.pfaendbarkeit) ? data.pfaendbarkeit : [];
  const arrest = data.arrestgruende as Record<string, unknown> | undefined;
  const kosten = data.vollstreckungskosten as Record<string, unknown> | undefined;
  const risiko = data.vollstreckungsrisiko as Record<string, unknown> | undefined;
  const score = clampScore(data.overall_vollstreckbarkeit_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Vollstreckungsanalyse — ${caseSlug}"`);
  lines.push(`type: enforcement_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`vollstreckbarkeit_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Vollstreckungsanalyse");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (vermoegen) {
    lines.push("### Vermögenslage des Gegners");
    lines.push("");
    const werte = Array.isArray(vermoegen.bekannte_vermoegenswerte)
      ? vermoegen.bekannte_vermoegenswerte
      : [];
    if (werte.length > 0) {
      lines.push("**Bekannte Vermögenswerte:**");
      for (const w of werte) lines.push(`- ${w}`);
    } else {
      lines.push("**Bekannte Vermögenswerte:** Keine Informationen verfügbar");
    }
    lines.push("");
    lines.push(
      `- **Geschätzte Vermögenshöhe:** €${Number(vermoegen.geschaetzte_vermoegenshoehe ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(`- **Unsicherheit:** ${vermoegen.unsicherheit ?? "hoch"}`);
    if (vermoegen.quelle) lines.push(`- **Quelle:** ${vermoegen.quelle}`);
    lines.push("");
  }

  if (insolvenz) {
    lines.push("### Insolvenzrisiko");
    lines.push("");
    lines.push(`- **Risiko:** ${insolvenz.risiko ?? "unbekannt"}`);
    const indikatoren = Array.isArray(insolvenz.indikatoren) ? insolvenz.indikatoren : [];
    if (indikatoren.length > 0) {
      lines.push("- **Indikatoren:**");
      for (const i of indikatoren) lines.push(`  - ${i}`);
    }
    if (insolvenz.einschaetzung) lines.push(`- **Einschätzung:** ${insolvenz.einschaetzung}`);
    lines.push("");
  }

  if (pfaendbarkeit.length > 0) {
    lines.push("### Pfändbarkeit");
    lines.push("");
    lines.push("| Vermögenswert | Pfändbar | Art | Erwarteter Erlös | Risiken |");
    lines.push("|---------------|----------|-----|------------------|---------|");
    for (const p of pfaendbarkeit) {
      const r = p as Record<string, unknown>;
      const risiken = Array.isArray(r.risiken) ? (r.risiken as string[]).join("; ") : "";
      lines.push(
        `| ${r.vermoegenswert ?? ""} | ${r.pfandbar ? "✅" : "❌"} | ${r.art ?? ""} | €${Number(r.erwarteter_erloes ?? 0).toLocaleString("de-DE")} | ${risiken} |`
      );
    }
    lines.push("");
  }

  if (arrest) {
    lines.push("### Arrestgründe");
    lines.push("");
    lines.push(`- **Vorhanden:** ${arrest.vorhanden ? "✅ Ja" : "❌ Nein"}`);
    const gruende = Array.isArray(arrest.gruende) ? arrest.gruende : [];
    if (gruende.length > 0) {
      lines.push("- **Gründe:**");
      for (const g of gruende) lines.push(`  - ${g}`);
    }
    if (arrest.empfehlung) lines.push(`- **Empfehlung:** ${arrest.empfehlung}`);
    lines.push("");
  }

  if (kosten) {
    lines.push("### Vollstreckungskosten");
    lines.push("");
    lines.push(
      `- **Geschätzte Kosten:** €${Number(kosten.geschaetzte_kosten ?? 0).toLocaleString("de-DE")}`
    );
    const aufschl = Array.isArray(kosten.aufschluesselung) ? kosten.aufschluesselung : [];
    if (aufschl.length > 0) {
      lines.push("- **Aufschlüsselung:**");
      for (const a of aufschl) lines.push(`  - ${a}`);
    }
    lines.push("");
  }

  if (risiko) {
    lines.push("### Vollstreckungsrisiko");
    lines.push("");
    lines.push(`- **Gesamtrisiko:** ${risiko.gesamt_risiko ?? "unbekannt"}`);
    const risiken = Array.isArray(risiko.risiken) ? risiko.risiken : [];
    if (risiken.length > 0) {
      lines.push("- **Risiken:**");
      for (const r of risiken) lines.push(`  - ${r}`);
    }
    const gegenmass = Array.isArray(risiko.gegenmassnahmen) ? risiko.gegenmassnahmen : [];
    if (gegenmass.length > 0) {
      lines.push("- **Gegenmaßnahmen:**");
      for (const g of gegenmass) lines.push(`  - ${g}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "enforcement_analysis",
      title: parsed.title ?? `Vollstreckungsanalyse — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Appeal Risk Layer (Layer 5f) ────────────────────────────

/**
 * Run the appeal-risk-analyzer: assesses whether the opponent can
 * successfully appeal, and evaluates revision risk.
 */
async function runAppealRiskLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("appeal-risk-analyzer");
  if (!def) throw new Error("legal-pipeline: appeal-risk-analyzer specialist not found");

  const prompt = [
    "Bewerte das Berufungsrisiko für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    `Subsumtions-Prüfung: subsumption-checks/${caseSlug}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und bewerte:",
    "1. Berufungsgründe (Rechtsfehler, Verfahrensfehler, Tatsachenfehler)",
    "2. Berufungsaussicht des Gegners (Wahrscheinlichkeit)",
    "3. Revisionsrisiko (OGH/BGH/BG)",
    "4. Europarecht (EuGH Vorabentscheidung)",
    "5. EMRK (EGMR Beschwerde)",
    "6. Kostenrisiko der Berufung",
    "",
    'Gib JSON zurück: { berufungsgruende: [...], berufungsaussicht_gegner: {...}, revisionsrisiko: {...}, europa_recht: {...}, emrk_beschwerde: {...}, kostenrisiko_berufung: {...}, overall_berufungsrisiko_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "appeal-risk-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("appeal-risk"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `appeal-risk/${caseSlug}`;
  await writeAppealRiskPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the appeal risk page. */
async function writeAppealRiskPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const gruende = Array.isArray(data.berufungsgruende) ? data.berufungsgruende : [];
  const aussicht = data.berufungsaussicht_gegner as Record<string, unknown> | undefined;
  const revision = data.revisionsrisiko as Record<string, unknown> | undefined;
  const europa = data.europa_recht as Record<string, unknown> | undefined;
  const emrk = data.emrk_beschwerde as Record<string, unknown> | undefined;
  const kosten = data.kostenrisiko_berufung as Record<string, unknown> | undefined;
  const score = clampScore(data.overall_berufungsrisiko_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Berufungsrisiko — ${caseSlug}"`);
  lines.push(`type: appeal_risk_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`berufungsrisiko_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Berufungsrisiko-Analyse");
  lines.push("");
  lines.push(`**Score:** ${score}/100 (höher = höheres Risiko)`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (gruende.length > 0) {
    lines.push("### Berufungsgründe");
    lines.push("");
    lines.push("| Grund | Typ | Wahrscheinlichkeit | Erfolgsaussicht | Detail |");
    lines.push("|-------|-----|-------------------|----------------|--------|");
    for (const g of gruende) {
      const r = g as Record<string, unknown>;
      lines.push(
        `| ${String(r.grund ?? "").slice(0, 60)} | ${r.typ ?? ""} | ${r.wahrscheinlichkeit ?? ""} | ${r.erfolgsaussicht ?? 0}% | ${String(r.detail ?? "").slice(0, 80)} |`
      );
    }
    lines.push("");
  }

  if (aussicht) {
    lines.push("### Berufungsaussicht des Gegners");
    lines.push("");
    lines.push(`- **Gesamtwahrscheinlichkeit:** ${aussicht.gesamt_wahrscheinlichkeit ?? 0}%`);
    if (aussicht.hauptargument) lines.push(`- **Hauptargument:** ${aussicht.hauptargument}`);
    if (aussicht.instanz) lines.push(`- **Instanz:** ${aussicht.instanz}`);
    lines.push("");
  }

  if (revision) {
    lines.push("### Revisionsrisiko");
    lines.push("");
    lines.push(`- **Wahrscheinlichkeit:** ${revision.wahrscheinlichkeit ?? 0}%`);
    if (revision.instanz) lines.push(`- **Instanz:** ${revision.instanz}`);
    if (revision.voraussetzung) lines.push(`- **Voraussetzung:** ${revision.voraussetzung}`);
    if (revision.begruendung) lines.push(`- **Begründung:** ${revision.begruendung}`);
    lines.push("");
  }

  if (europa) {
    lines.push("### Europarecht");
    lines.push("");
    lines.push(
      `- **EuGH Vorabentscheidung möglich:** ${europa.eugh_vorabentscheidung_moeglich ? "✅ Ja" : "❌ Nein"}`
    );
    if (europa.grund) lines.push(`- **Grund:** ${europa.grund}`);
    lines.push("");
  }

  if (emrk) {
    lines.push("### EMRK / EGMR");
    lines.push("");
    lines.push(`- **EGMR-Beschwerde möglich:** ${emrk.moeglich ? "✅ Ja" : "❌ Nein"}`);
    if (emrk.grund) lines.push(`- **Grund:** ${emrk.grund}`);
    lines.push("");
  }

  if (kosten) {
    lines.push("### Kostenrisiko der Berufung");
    lines.push("");
    lines.push(
      `- **Geschätzte Kosten (Gegner):** €${Number(kosten.geschaetzte_kosten_gegner ?? 0).toLocaleString("de-DE")}`
    );
    const aufschl = Array.isArray(kosten.aufschluesselung) ? kosten.aufschluesselung : [];
    if (aufschl.length > 0) {
      lines.push("- **Aufschlüsselung:**");
      for (const a of aufschl) lines.push(`  - ${a}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "appeal_risk_analysis",
      title: parsed.title ?? `Berufungsrisiko — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Procedural Strategy Layer (Layer 5g) ────────────────────

/**
 * Run the procedural-strategist: recommends the optimal procedural
 * steps — interim measures, evidence preservation, partial claims.
 */
async function runProceduralStrategyLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("procedural-strategist");
  if (!def) throw new Error("legal-pipeline: procedural-strategist specialist not found");

  const prompt = [
    "Empfiehl die optimale prozessuale Strategie für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    `Beweislast-Analyse: burden-of-proof/${caseSlug}`,
    `Zulässigkeits-Prüfung: admissibility-checks/${caseSlug}`,
    `Vollstreckungsanalyse: enforcement-analysis/${caseSlug}`,
    `Settlement-Analyse: settlement-analysis/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und empfiehl:",
    "1. Optimale Reihenfolge der prozessualen Schritte",
    "2. Einstweilige Verfügung / Arrest",
    "3. Beweissicherungsverfahren",
    "4. Prozesskostensicherheit",
    "5. Teilklage vs. Gesamtklage",
    "6. Mediation / Schlichtung",
    "",
    'Gib JSON zurück: { empfohlene_schritte: [...], einstweilige_verfuegung: {...}, beweissicherung: {...}, prozesskostensicherheit: {...}, teilklage_empfohlen: {...}, mediation: {...}, gesamt_strategie: "...", overall_strategie_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "procedural-strategist",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("procedural-strategy"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `procedural-strategy/${caseSlug}`;
  await writeProceduralStrategyPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the procedural strategy page. */
async function writeProceduralStrategyPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const schritte = Array.isArray(data.empfohlene_schritte) ? data.empfohlene_schritte : [];
  const verfuegung = data.einstweilige_verfuegung as Record<string, unknown> | undefined;
  const beweissicherung = data.beweissicherung as Record<string, unknown> | undefined;
  const sicherheit = data.prozesskostensicherheit as Record<string, unknown> | undefined;
  const teilklage = data.teilklage_empfohlen as Record<string, unknown> | undefined;
  const mediation = data.mediation as Record<string, unknown> | undefined;
  const gesamtStrategie = String(data.gesamt_strategie ?? "");
  const gesamtdauer = String(data.geschaetzte_gesamtdauer ?? "");
  const gesamtKosten =
    typeof data.geschaetzte_gesamtkosten === "number" ? data.geschaetzte_gesamtkosten : 0;
  const score = clampScore(data.overall_strategie_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Prozessstrategie — ${caseSlug}"`);
  lines.push(`type: procedural_strategy`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`strategie_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Prozessstrategie");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");
  lines.push(`**Gesamtstrategie:** ${gesamtStrategie}`);
  lines.push("");
  lines.push(`- **Geschätzte Gesamtdauer:** ${gesamtdauer}`);
  lines.push(`- **Geschätzte Gesamtkosten:** €${gesamtKosten.toLocaleString("de-DE")}`);
  lines.push("");

  if (schritte.length > 0) {
    lines.push("### Empfohlene Schritte");
    lines.push("");
    lines.push("| # | Aktion | Dringlichkeit | Dauer | Kosten | Erfolgsaussicht | Begründung |");
    lines.push("|---|--------|---------------|-------|--------|-----------------|------------|");
    for (const s of schritte) {
      const r = s as Record<string, unknown>;
      lines.push(
        `| ${r.schritt ?? ""} | ${r.aktion ?? ""} | ${r.dringlichkeit ?? ""} | ${r.dauer ?? ""} | €${Number(r.kosten ?? 0).toLocaleString("de-DE")} | ${r.erfolgsaussicht ?? 0}% | ${String(r.begruendung ?? "").slice(0, 80)} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Begründung");
    lines.push("");
    for (const s of schritte) {
      const r = s as Record<string, unknown>;
      lines.push(`#### Schritt ${r.schritt}: ${r.aktion}`);
      lines.push(`- **Dringlichkeit:** ${r.dringlichkeit ?? ""}`);
      lines.push(`- **Dauer:** ${r.dauer ?? ""}`);
      lines.push(`- **Kosten:** €${Number(r.kosten ?? 0).toLocaleString("de-DE")}`);
      lines.push(`- **Erfolgsaussicht:** ${r.erfolgsaussicht ?? 0}%`);
      lines.push(`- **Begründung:** ${r.begruendung ?? ""}`);
      lines.push("");
    }
  }

  if (verfuegung) {
    lines.push("### Einstweilige Verfügung / Arrest");
    lines.push("");
    lines.push(`- **Empfohlen:** ${verfuegung.empfohlen ? "✅ Ja" : "❌ Nein"}`);
    if (verfuegung.grund) lines.push(`- **Grund:** ${verfuegung.grund}`);
    lines.push(
      `- **Voraussetzungen erfüllt:** ${verfuegung.voraussetzungen_erfuellt ? "✅" : "❌"}`
    );
    if (verfuegung.paragraph) lines.push(`- **Paragraph:** ${verfuegung.paragraph}`);
    lines.push("");
  }

  if (beweissicherung) {
    lines.push("### Beweissicherungsverfahren");
    lines.push("");
    lines.push(`- **Empfohlen:** ${beweissicherung.empfohlen ? "✅ Ja" : "❌ Nein"}`);
    if (beweissicherung.grund) lines.push(`- **Grund:** ${beweissicherung.grund}`);
    if (beweissicherung.paragraph) lines.push(`- **Paragraph:** ${beweissicherung.paragraph}`);
    lines.push("");
  }

  if (sicherheit) {
    lines.push("### Prozesskostensicherheit");
    lines.push("");
    lines.push(`- **Erforderlich:** ${sicherheit.erforderlich ? "✅ Ja" : "❌ Nein"}`);
    if (sicherheit.grund) lines.push(`- **Grund:** ${sicherheit.grund}`);
    lines.push("");
  }

  if (teilklage) {
    lines.push("### Teilklage");
    lines.push("");
    lines.push(`- **Empfohlen:** ${teilklage.empfohlen ? "✅ Ja" : "❌ Nein"}`);
    if (teilklage.teilbetrag !== undefined)
      lines.push(`- **Teilbetrag:** €${Number(teilklage.teilbetrag).toLocaleString("de-DE")}`);
    if (teilklage.begruendung) lines.push(`- **Begründung:** ${teilklage.begruendung}`);
    lines.push("");
  }

  if (mediation) {
    lines.push("### Mediation / Schlichtung");
    lines.push("");
    lines.push(`- **Empfohlen:** ${mediation.empfohlen ? "✅ Ja" : "❌ Nein"}`);
    if (mediation.grund) lines.push(`- **Grund:** ${mediation.grund}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "procedural_strategy",
      title: parsed.title ?? `Prozessstrategie — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Hardening Utilities ─────────────────────────────────────

/** Validate and sanitize a case slug. Returns null if invalid. */
function sanitizeSlug(slug: string): string | null {
  if (!slug || typeof slug !== "string") return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Clamp a numeric score to 0-100 range. Returns 0 for non-numbers. */
function clampScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Safe JSON.stringify that won't throw on circular references. */
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    try {
      return JSON.stringify(String(obj));
    } catch {
      return "[unserializable]";
    }
  }
}

/** Extract text from a child result safely. */
function extractChildText(result: unknown): string {
  if (typeof result === "string") return result;
  const obj = result as { text?: string } | null;
  if (obj && typeof obj.text === "string") return obj.text;
  return safeStringify(result);
}

/**
 * Generic specialist layer runner — eliminates boilerplate duplication.
 * Resolves specialist, builds prompt, spawns child, waits, parses JSON.
 * Returns parsed JSON or null on any failure.
 */
async function runSpecialistLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  specialistName: string;
  prompt: string;
  sourceStamp?: string;
  lawSourceIds?: string[];
  /** T5.4: Layer ID from pipeline registry — determines failure policy */
  layerId?: string;
}): Promise<Record<string, unknown> | null> {
  const { ctx, queue, specialistName, prompt, sourceStamp, lawSourceIds, layerId } = opts;
  const def = resolveSpecialist(specialistName);
  if (!def) throw new Error(`legal-pipeline: ${specialistName} specialist not found`);

  // T5.4: Resolve failure policy from registry — mandatory layers use "fail"
  const childFailPolicy = layerId ? getChildFailPolicy(layerId) : "continue";

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: specialistName,
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: childFailPolicy,
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text = extractChildText(result);
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  return json;
}

/** Safe wrapper for engine.putPage with error logging. */
async function safePutPage(
  engine: BrainEngine,
  slug: string,
  page: {
    type: string;
    title: string;
    compiled_truth: string;
    frontmatter?: Record<string, unknown>;
  },
  sourceId?: string
): Promise<boolean> {
  try {
    await engine.putPage(slug, page, { sourceId });
    return true;
  } catch (err) {
    console.warn(
      `[legal-pipeline] putPage failed for "${slug}": ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

// ── Insurance Coverage Layer (Layer 5h) ─────────────────────

/**
 * Run the insurance-coverage-analyzer: checks whether insurance
 * covers the damage and whether a direct action against the insurer
 * is possible.
 */
async function runInsuranceCoverageLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  forensicReport: ForensicReport | null;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    forensicReport,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("insurance-coverage-analyzer");
  if (!def) throw new Error("legal-pipeline: insurance-coverage-analyzer specialist not found");

  const prompt = [
    "Prüfe die Versicherungsdeckung für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    `Vollstreckungsanalyse: enforcement-analysis/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und prüfe:",
    "1. Relevante Versicherungen (Kfz, Amtshaftung, Berufshaftpflicht, etc.)",
    "2. Deckungsprüfung (Deckungssumme, Ausschlüsse)",
    "3. Direktklage gegen Versicherung möglich?",
    "4. Regressrisiko",
    "5. Versicherungsstatus (bekannt/unbekannt)",
    "",
    'Gib JSON zurück: { versicherungen: [...], direktklage_moeglich: {...}, regressrisiko: {...}, versicherungsstatus: {...}, overall_versicherungsscore: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "insurance-coverage-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("insurance-coverage"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `insurance-coverage/${caseSlug}`;
  await writeInsuranceCoveragePage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the insurance coverage page. */
async function writeInsuranceCoveragePage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const versicherungen = Array.isArray(data.versicherungen) ? data.versicherungen : [];
  const direktklage = data.direktklage_moeglich as Record<string, unknown> | undefined;
  const regress = data.regressrisiko as Record<string, unknown> | undefined;
  const status = data.versicherungsstatus as Record<string, unknown> | undefined;
  const score = clampScore(data.overall_versicherungsscore);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Versicherungsdeckung — ${caseSlug}"`);
  lines.push(`type: insurance_coverage`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`versicherungsscore: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Versicherungsdeckung");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (versicherungen.length > 0) {
    lines.push("### Relevante Versicherungen");
    lines.push("");
    lines.push("| Typ | Versicherer | Deckungssumme | Gedeckt | Ausschlüsse | Quelle |");
    lines.push("|-----|-------------|---------------|---------|-------------|--------|");
    for (const v of versicherungen) {
      const r = v as Record<string, unknown>;
      const ausschl = Array.isArray(r.deckungsausschluesse)
        ? (r.deckungsausschluesse as string[]).join("; ")
        : "";
      const gedeckt = r.schaden_gedeckt;
      const gedecktStr = gedeckt === true ? "✅" : gedeckt === false ? "❌" : "❓";
      lines.push(
        `| ${r.typ ?? ""} | ${r.versicherer ?? ""} | €${Number(r.deckungssumme ?? 0).toLocaleString("de-DE")} | ${gedecktStr} | ${ausschl} | ${r.quelle ?? ""} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (const v of versicherungen) {
      const r = v as Record<string, unknown>;
      lines.push(`#### ${r.typ ?? ""} — ${r.versicherer ?? "unbekannt"}`);
      lines.push(`- **Deckungssumme:** €${Number(r.deckungssumme ?? 0).toLocaleString("de-DE")}`);
      lines.push(
        `- **Schaden gedeckt:** ${r.schaden_gedeckt === true ? "✅ Ja" : r.schaden_gedeckt === false ? "❌ Nein" : "❓ Unsicher"}`
      );
      if (r.detail) lines.push(`- **Detail:** ${r.detail}`);
      lines.push("");
    }
  } else {
    lines.push("### Keine Versicherungen identifiziert");
    lines.push("");
    lines.push("Keine Versicherungsinformationen im Sachverhalt gefunden.");
    lines.push("");
  }

  if (direktklage) {
    lines.push("### Direktklage gegen Versicherung");
    lines.push("");
    lines.push(`- **Möglich:** ${direktklage.moeglich ? "✅ Ja" : "❌ Nein"}`);
    if (direktklage.gegen) lines.push(`- **Gegen:** ${direktklage.gegen}`);
    if (direktklage.paragraph) lines.push(`- **Paragraph:** ${direktklage.paragraph}`);
    if (direktklage.voraussetzungen)
      lines.push(`- **Voraussetzungen:** ${direktklage.voraussetzungen}`);
    lines.push("");
  }

  if (regress) {
    lines.push("### Regressrisiko");
    lines.push("");
    lines.push(`- **Vorhanden:** ${regress.vorhanden ? "⚠️ Ja" : "✅ Nein"}`);
    if (regress.grund) lines.push(`- **Grund:** ${regress.grund}`);
    if (regress.risiko_fuer_mandanten)
      lines.push(`- **Risiko für Mandanten:** ${regress.risiko_fuer_mandanten}`);
    lines.push("");
  }

  if (status) {
    lines.push("### Versicherungsstatus");
    lines.push("");
    lines.push(`- **Bekannt:** ${status.bekannt ? "✅ Ja" : "❌ Nein"}`);
    if (status.detail) lines.push(`- **Detail:** ${status.detail}`);
    if (status.recherche_empfehlung)
      lines.push(`- **Recherche-Empfehlung:** ${status.recherche_empfehlung}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "insurance_coverage",
      title: parsed.title ?? `Versicherungsdeckung — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Tax Impact Layer (Layer 5i) ─────────────────────────────

/**
 * Run the tax-impact-analyzer: calculates net EV after taxes,
 * compares settlement vs. judgment taxation.
 */
async function runTaxImpactLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("tax-impact-analyzer");
  if (!def) throw new Error("legal-pipeline: tax-impact-analyzer specialist not found");

  const prompt = [
    "Berechne die steuerlichen Auswirkungen für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    `Damage Table: damage-tables/${caseSlug}`,
    `Settlement-Analyse: settlement-analysis/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und berechne:",
    "1. Schadensersatz-Besteuerung (Schmerzensgeld steuerfrei, Verdienstentgang steuerpflichtig)",
    "2. Prozesskosten-Abzug (außergewöhnliche Belastung / Betriebsausgaben)",
    "3. Netto-EV Urteil vs. Netto-EV Vergleich",
    "4. Gestaltungsempfehlung für Vergleich",
    "",
    'Gib JSON zurück: { schadensersatz_aufschluesselung: [...], prozesskosten_abzug: {...}, netto_ev_urteil: {...}, netto_ev_vergleich: {...}, vergleich_vs_urteil: {...}, gestaltungsempfehlung: {...}, overall_steuer_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "tax-impact-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("tax-impact"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `tax-impact/${caseSlug}`;
  await writeTaxImpactPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the tax impact page. */
async function writeTaxImpactPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const aufschluesselung = Array.isArray(data.schadensersatz_aufschluesselung)
    ? data.schadensersatz_aufschluesselung
    : [];
  const prozesskosten = data.prozesskosten_abzug as Record<string, unknown> | undefined;
  const nettoUrteil = data.netto_ev_urteil as Record<string, unknown> | undefined;
  const nettoVergleich = data.netto_ev_vergleich as Record<string, unknown> | undefined;
  const vergleich = data.vergleich_vs_urteil as Record<string, unknown> | undefined;
  const gestaltung = data.gestaltungsempfehlung as Record<string, unknown> | undefined;
  const score = clampScore(data.overall_steuer_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Steuerliche Auswirkungen — ${caseSlug}"`);
  lines.push(`type: tax_impact_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`steuer_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Steuerliche Auswirkungen");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (aufschluesselung.length > 0) {
    lines.push("### Schadensersatz-Aufschlüsselung");
    lines.push("");
    lines.push("| Kategorie | Betrag | Steuerpflichtig | Steuersatz | Steuer | Netto |");
    lines.push("|-----------|--------|-----------------|------------|--------|-------|");
    for (const a of aufschluesselung) {
      const r = a as Record<string, unknown>;
      lines.push(
        `| ${r.kategorie ?? ""} | €${Number(r.betrag ?? 0).toLocaleString("de-DE")} | ${r.steuerpflichtig ? "✅ Ja" : "❌ Nein"} | ${r.steuersatz ?? 0}% | €${Number(r.steuer ?? 0).toLocaleString("de-DE")} | €${Number(r.netto ?? 0).toLocaleString("de-DE")} |`
      );
    }
    lines.push("");
  }

  if (prozesskosten) {
    lines.push("### Prozesskosten-Abzug");
    lines.push("");
    lines.push(`- **Betrag:** €${Number(prozesskosten.betrag ?? 0).toLocaleString("de-DE")}`);
    lines.push(`- **Abzugsfähig:** ${prozesskosten.abzugsfaehig ? "✅ Ja" : "❌ Nein"}`);
    if (prozesskosten.paragraph) lines.push(`- **Paragraph:** ${prozesskosten.paragraph}`);
    lines.push(
      `- **Steuerersparnis:** €${Number(prozesskosten.steuerersparnis ?? 0).toLocaleString("de-DE")}`
    );
    lines.push("");
  }

  if (nettoUrteil) {
    lines.push("### Netto-EV: Urteil");
    lines.push("");
    lines.push(`- **Brutto-EV:** €${Number(nettoUrteil.brutto_ev ?? 0).toLocaleString("de-DE")}`);
    lines.push(
      `- **Steuern auf Schadensersatz:** €${Number(nettoUrteil.steuern_auf_schadensersatz ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(
      `- **Steuerersparnis Prozesskosten:** €${Number(nettoUrteil.steuerersparnis_prozesskosten ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(`- **Netto-EV:** €${Number(nettoUrteil.netto_ev ?? 0).toLocaleString("de-DE")}`);
    lines.push("");
  }

  if (nettoVergleich) {
    lines.push("### Netto-EV: Vergleich");
    lines.push("");
    lines.push(
      `- **Vergleichsbetrag:** €${Number(nettoVergleich.vergleichsbetrag ?? 0).toLocaleString("de-DE")}`
    );
    const aufteilung = nettoVergleich.aufteilung as Record<string, unknown> | undefined;
    if (aufteilung) {
      lines.push("- **Aufteilung:**");
      for (const [key, val] of Object.entries(aufteilung)) {
        lines.push(`  - ${key}: €${Number(val).toLocaleString("de-DE")}`);
      }
    }
    lines.push(`- **Steuern:** €${Number(nettoVergleich.steuern ?? 0).toLocaleString("de-DE")}`);
    lines.push(
      `- **Steuerersparnis Prozesskosten:** €${Number(nettoVergleich.steuerersparnis_prozesskosten ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(`- **Netto-EV:** €${Number(nettoVergleich.netto_ev ?? 0).toLocaleString("de-DE")}`);
    lines.push("");
  }

  if (vergleich) {
    lines.push("### Vergleich vs. Urteil");
    lines.push("");
    lines.push(
      `- **Steuervorteil Vergleich:** €${Number(vergleich.steuervorteil_vergleich ?? 0).toLocaleString("de-DE")}`
    );
    if (vergleich.empfehlung) lines.push(`- **Empfehlung:** ${vergleich.empfehlung}`);
    lines.push("");
  }

  if (gestaltung) {
    lines.push("### Gestaltungsempfehlung");
    lines.push("");
    if (gestaltung.aufteilung) lines.push(`- **Aufteilung:** ${gestaltung.aufteilung}`);
    if (gestaltung.begruendung) lines.push(`- **Begründung:** ${gestaltung.begruendung}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "tax_impact_analysis",
      title: parsed.title ?? `Steuerliche Auswirkungen — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Witness & Expert Layer (Layer 4e) ───────────────────────

/**
 * Run the witness-expert-analyzer: evaluates witness credibility
 * and recommends expert witnesses / reports.
 */
async function runWitnessExpertLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("witness-expert-analyzer");
  if (!def) throw new Error("legal-pipeline: witness-expert-analyzer specialist not found");

  const prompt = [
    "Bewerte die Zeugen und identifiziere Gutachter-Bedarf für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `ON-Tabelle: on-index/${caseSlug}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Beweislast-Analyse: burden-of-proof/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und bewerte:",
    "1. Zeugen: Glaubwürdigkeit, Belastbarkeit, Widersprüche, Parteilichkeit",
    "2. Zeugenlücken: Welche Zeugen fehlen?",
    "3. Gutachten-Bedarf: Medizinisch, Technisch, Wirtschaftlich, Psychologisch",
    "4. Gutachter-Kosten: Geschätzte Kosten pro Gutachten",
    "",
    'Gib JSON zurück: { zeugen: [...], zeugenluecken: [...], gutachten_bedarf: [...], gutachter_kosten_gesamt: 0, zeugen_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "witness-expert-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("witness-expert"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `witness-expert/${caseSlug}`;
  await writeWitnessExpertPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the witness & expert page. */
async function writeWitnessExpertPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const zeugen = Array.isArray(data.zeugen) ? data.zeugen : [];
  const zeugenluecken = Array.isArray(data.zeugenluecken) ? data.zeugenluecken : [];
  const gutachtenBedarf = Array.isArray(data.gutachten_bedarf) ? data.gutachten_bedarf : [];
  const gutachterKosten =
    typeof data.gutachter_kosten_gesamt === "number" ? data.gutachter_kosten_gesamt : 0;
  const score = clampScore(data.zeugen_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Zeugen- & Gutachteranalyse — ${caseSlug}"`);
  lines.push(`type: witness_expert_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`zeugen_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Zeugen- & Gutachteranalyse");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (zeugen.length > 0) {
    lines.push("### Zeugenbewertung");
    lines.push("");
    lines.push(
      "| Zeuge | Glaubwürdigkeit | Belastbarkeit | Parteilichkeit | Aussagekraft | Relevant für |"
    );
    lines.push(
      "|-------|-----------------|---------------|----------------|--------------|--------------|"
    );
    for (const z of zeugen) {
      const r = z as Record<string, unknown>;
      lines.push(
        `| ${r.name ?? ""} | ${r.glaubwuerdigkeit ?? ""} | ${r.belastbarkeit ?? ""} | ${r.parteilichkeit ?? ""} | ${r.aussagekraft ?? ""} | ${r.aussage_relevant_fuer ?? ""} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (const z of zeugen) {
      const r = z as Record<string, unknown>;
      const widersprueche = Array.isArray(r.widersprueche)
        ? (r.widersprueche as string[]).join("; ")
        : "";
      lines.push(`#### ${r.name ?? ""}`);
      lines.push(`- **Glaubwürdigkeit:** ${r.glaubwuerdigkeit ?? ""}`);
      lines.push(`- **Belastbarkeit:** ${r.belastbarkeit ?? ""}`);
      if (widersprueche) lines.push(`- **Widersprüche:** ${widersprueche}`);
      if (r.empfehlung) lines.push(`- **Empfehlung:** ${r.empfehlung}`);
      lines.push("");
    }
  } else {
    lines.push("### Keine Zeugen identifiziert");
    lines.push("");
  }

  if (zeugenluecken.length > 0) {
    lines.push("### Zeugenlücken");
    lines.push("");
    lines.push("| Fehlt | Relevanz | Beschaffung | Priorität |");
    lines.push("|-------|----------|-------------|-----------|");
    for (const z of zeugenluecken) {
      const r = z as Record<string, unknown>;
      lines.push(
        `| ${r.fehlt ?? ""} | ${r.relevanz ?? ""} | ${r.beschaffung ?? ""} | ${r.prioritaet ?? ""} |`
      );
    }
    lines.push("");
  }

  if (gutachtenBedarf.length > 0) {
    lines.push("### Gutachten-Bedarf");
    lines.push("");
    lines.push("| Typ | Thema | Dringlichkeit | Gerichtlich/Privat | § | Kosten |");
    lines.push("|-----|-------|--------------|-------------------|---|--------|");
    for (const g of gutachtenBedarf) {
      const r = g as Record<string, unknown>;
      lines.push(
        `| ${r.typ ?? ""} | ${r.thema ?? ""} | ${r.dringlichkeit ?? ""} | ${r.gerichtlich_oder_privat ?? ""} | ${r.paragraph ?? ""} | €${Number(r.geschätzte_kosten ?? 0).toLocaleString("de-DE")} |`
      );
    }
    lines.push("");
    lines.push(
      `**Geschätzte Gesamtkosten Gutachten:** €${gutachterKosten.toLocaleString("de-DE")}`
    );
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "witness_expert_analysis",
      title: parsed.title ?? `Zeugen- & Gutachteranalyse — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Counterclaim Risk Layer (Layer 5j) ──────────────────────

/**
 * Run the counterclaim-analyzer: identifies potential counterclaims,
 * setoffs, and cross-claims from the opponent.
 */
async function runCounterclaimLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("counterclaim-analyzer");
  if (!def) throw new Error("legal-pipeline: counterclaim-analyzer specialist not found");

  const prompt = [
    "Analysiere das Widerklage-Risiko für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Cost-Benefit-Analyse: cost-benefit/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    `Counter-Arguments: counter-arguments/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und analysiere:",
    "1. Gegenansprüche des Gegners (Schadensersatz, Bereicherung, Vertrag)",
    "2. Widerklage möglich? (§ 229 ZPO AT, § 33 ZPO DE, Art 224 ZPO CH)",
    "3. Aufrechnung möglich? (§ 1441 ABGB, § 387 BGB, Art 120 OR)",
    "4. Prozessuale Einwendungen (Verjährung, Zurückbehaltung)",
    "5. Netto-EV nach Widerklage-Risiko",
    "",
    'Gib JSON zurück: { gegenansprueche: [...], widerklage_moeglich: {...}, aufrechnung: {...}, prozessuale_einwendungen: [...], netto_ev_nach_widerklage: {...}, overall_widerklage_risiko_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "counterclaim-analyzer",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("counterclaim-risk"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `counterclaim-risk/${caseSlug}`;
  await writeCounterclaimPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the counterclaim risk page. */
async function writeCounterclaimPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const gegenansprueche = Array.isArray(data.gegenansprueche) ? data.gegenansprueche : [];
  const widerklage = data.widerklage_moeglich as Record<string, unknown> | undefined;
  const aufrechnung = data.aufrechnung as Record<string, unknown> | undefined;
  const einwendungen = Array.isArray(data.prozessuale_einwendungen)
    ? data.prozessuale_einwendungen
    : [];
  const nettoEV = data.netto_ev_nach_widerklage as Record<string, unknown> | undefined;
  const score = clampScore(data.overall_widerklage_risiko_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Widerklungsrisiko — ${caseSlug}"`);
  lines.push(`type: counterclaim_risk_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`widerklage_risiko_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Widerklungsrisiko");
  lines.push("");
  lines.push(`**Score:** ${score}/100 (höher = grösseres Risiko)`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (gegenansprueche.length > 0) {
    lines.push("### Gegenansprüche des Gegners");
    lines.push("");
    lines.push("| Typ | Anspruch | § | Wahrscheinlichkeit | Betrag | EV |");
    lines.push("|-----|----------|---|-------------------|--------|----|");
    for (const g of gegenansprueche) {
      const r = g as Record<string, unknown>;
      lines.push(
        `| ${r.typ ?? ""} | ${r.anspruch ?? ""} | ${r.paragraph ?? ""} | ${r.wahrscheinlichkeit ?? ""} | €${Number(r.betrag ?? 0).toLocaleString("de-DE")} | €${Number(r.ev ?? 0).toLocaleString("de-DE")} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (const g of gegenansprueche) {
      const r = g as Record<string, unknown>;
      lines.push(`#### ${r.typ ?? ""} — ${r.anspruch ?? ""}`);
      if (r.paragraph) lines.push(`- **Paragraph:** ${r.paragraph}`);
      lines.push(`- **Wahrscheinlichkeit:** ${r.wahrscheinlichkeit ?? ""}`);
      lines.push(`- **Betrag:** €${Number(r.betrag ?? 0).toLocaleString("de-DE")}`);
      lines.push(`- **Erwartungswert:** €${Number(r.ev ?? 0).toLocaleString("de-DE")}`);
      if (r.begruendung) lines.push(`- **Begründung:** ${r.begruendung}`);
      lines.push("");
    }
  } else {
    lines.push("### Keine Gegenansprüche erkennbar");
    lines.push("");
  }

  if (widerklage) {
    lines.push("### Widerklage");
    lines.push("");
    lines.push(`- **Möglich:** ${widerklage.moeglich ? "⚠️ Ja" : "✅ Nein"}`);
    if (widerklage.paragraph) lines.push(`- **Paragraph:** ${widerklage.paragraph}`);
    if (widerklage.voraussetzung) lines.push(`- **Voraussetzung:** ${widerklage.voraussetzung}`);
    if (typeof widerklage.wahrscheinlichkeit === "number")
      lines.push(`- **Wahrscheinlichkeit:** ${widerklage.wahrscheinlichkeit}%`);
    lines.push("");
  }

  if (aufrechnung) {
    lines.push("### Aufrechnung");
    lines.push("");
    lines.push(`- **Möglich:** ${aufrechnung.moeglich ? "⚠️ Ja" : "✅ Nein"}`);
    if (aufrechnung.paragraph) lines.push(`- **Paragraph:** ${aufrechnung.paragraph}`);
    lines.push(
      `- **Voraussetzungen erfüllt:** ${aufrechnung.voraussetzungen_erfuellt ? "Ja" : "Nein"}`
    );
    if (typeof aufrechnung.betrag === "number")
      lines.push(`- **Betrag:** €${aufrechnung.betrag.toLocaleString("de-DE")}`);
    lines.push("");
  }

  if (einwendungen.length > 0) {
    lines.push("### Prozessuale Einwendungen");
    lines.push("");
    lines.push("| Einrede | § | Wahrscheinlichkeit | Auswirkung |");
    lines.push("|---------|---|-------------------|------------|");
    for (const e of einwendungen) {
      const r = e as Record<string, unknown>;
      lines.push(
        `| ${r.einrede ?? ""} | ${r.paragraph ?? ""} | ${r.wahrscheinlichkeit ?? ""} | ${r.auswirkung ?? ""} |`
      );
    }
    lines.push("");
  }

  if (nettoEV) {
    lines.push("### Netto-EV nach Widerklage-Risiko");
    lines.push("");
    lines.push(`- **Brutto-EV:** €${Number(nettoEV.brutto_ev ?? 0).toLocaleString("de-DE")}`);
    lines.push(
      `- **Widerklage-Risiko (EV):** €${Number(nettoEV.widerklage_risiko_ev ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(
      `- **Aufrechnungsbetrag:** €${Number(nettoEV.aufrechnungsbetrag ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(`- **Netto-EV:** €${Number(nettoEV.netto_ev ?? 0).toLocaleString("de-DE")}`);
    if (typeof nettoEV.anpassung === "number") {
      const sign = nettoEV.anpassung >= 0 ? "+" : "";
      lines.push(`- **Anpassung:** ${sign}€${nettoEV.anpassung.toLocaleString("de-DE")}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "counterclaim_risk_analysis",
      title: parsed.title ?? `Widerklungsrisiko — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Evidence Quality Layer (Layer 4e2) ──────────────────────

/**
 * Run the evidence-quality-assessor: rates each piece of evidence
 * by probative value, identifies weak evidence and gaps.
 */
async function runEvidenceQualityLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("evidence-quality-assessor");
  if (!def) throw new Error("legal-pipeline: evidence-quality-assessor specialist not found");

  const prompt = [
    "Bewerte die Beweisqualität jedes Beweismittels für diesen Fall.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `ON-Tabelle: on-index/${caseSlug}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Beweislast-Analyse: burden-of-proof/${caseSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${caseSlug}`,
    "",
    "Lade alle Pages mit get_page und bewerte:",
    "1. Beweiskraft jedes Beweismittels (sehr_hoch bis sehr_gering)",
    "2. Schwachstellen: angreifbare Beweise",
    "3. Verifikationsempfehlung: wie Beweise stärken?",
    "4. Beweislücken: was fehlt für streitentscheidende Frage?",
    "",
    'Gib JSON zurück: { beweise: [...], schwachstellen: [...], beweisluecken: [...], beweisqualitaet_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "evidence-quality-assessor",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("evidence-quality"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) return null;

  const slug = `evidence-quality/${caseSlug}`;
  await writeEvidenceQualityPage(engine, slug, caseSlug, json, sourceStamp);
  return slug;
}

/** Write the evidence quality page. */
async function writeEvidenceQualityPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const beweise = Array.isArray(data.beweise) ? data.beweise : [];
  const schwachstellen = Array.isArray(data.schwachstellen) ? data.schwachstellen : [];
  const beweisluecken = Array.isArray(data.beweisluecken) ? data.beweisluecken : [];
  const score = clampScore(data.beweisqualitaet_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Beweisqualität — ${caseSlug}"`);
  lines.push(`type: evidence_quality_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`beweisqualitaet_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Beweisqualität");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (beweise.length > 0) {
    lines.push("### Beweismittel");
    lines.push("");
    lines.push("| ON | Bezeichnung | Beweisart | Beweiskraft | Angreifbar |");
    lines.push("|----|-------------|-----------|-------------|------------|");
    for (const b of beweise) {
      const r = b as Record<string, unknown>;
      const kraftStr =
        r.beweiskraft === "sehr_hoch"
          ? "⭐⭐⭐⭐⭐"
          : r.beweiskraft === "hoch"
            ? "⭐⭐⭐⭐"
            : r.beweiskraft === "mittel"
              ? "⭐⭐⭐"
              : r.beweiskraft === "gering"
                ? "⭐⭐"
                : "⭐";
      lines.push(
        `| ${r.on_nummer ?? ""} | ${r.bezeichnung ?? ""} | ${r.beweisart ?? ""} | ${kraftStr} | ${r.angreifbar ? "⚠️ Ja" : "✅ Nein"} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (const b of beweise) {
      const r = b as Record<string, unknown>;
      const vektoren = Array.isArray(r.angriffsvektoren)
        ? (r.angriffsvektoren as string[]).join("; ")
        : "";
      lines.push(`#### ${r.on_nummer ?? ""} — ${r.bezeichnung ?? ""}`);
      lines.push(`- **Beweisart:** ${r.beweisart ?? ""}`);
      lines.push(`- **Beweiskraft:** ${r.beweiskraft ?? ""}`);
      if (r.begruendung) lines.push(`- **Begründung:** ${r.begruendung}`);
      if (r.angreifbar) {
        lines.push(`- **Angreifbar:** ⚠️ Ja`);
        if (vektoren) lines.push(`- **Angriffsvektoren:** ${vektoren}`);
      } else {
        lines.push(`- **Angreifbar:** ✅ Nein`);
      }
      if (r.verifikation) lines.push(`- **Verifikation:** ${r.verifikation}`);
      lines.push("");
    }
  } else {
    lines.push("### Keine Beweise in der ON-Tabelle");
    lines.push("");
  }

  if (schwachstellen.length > 0) {
    lines.push("### Schwachstellen");
    lines.push("");
    lines.push("| ON | Problem | Auswirkung | Gegenmaßnahme |");
    lines.push("|----|---------|------------|----------------|");
    for (const s of schwachstellen) {
      const r = s as Record<string, unknown>;
      lines.push(
        `| ${r.on_nummer ?? ""} | ${r.problem ?? ""} | ${r.auswirkung ?? ""} | ${r.gegenmassnahme ?? ""} |`
      );
    }
    lines.push("");
  }

  if (beweisluecken.length > 0) {
    lines.push("### Beweislücken");
    lines.push("");
    lines.push("| Streitfrage | Fehlender Beweis | Beschaffung | Priorität |");
    lines.push("|-------------|-----------------|-------------|-----------|");
    for (const l of beweisluecken) {
      const r = l as Record<string, unknown>;
      lines.push(
        `| ${r.streitfrage ?? ""} | ${r.fehlender_beweis ?? ""} | ${r.beschaffung ?? ""} | ${r.prioritaet ?? ""} |`
      );
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "evidence_quality_analysis",
      title: parsed.title ?? `Beweisqualität — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── Mediation/ADR Layer (Layer 5k) ──────────────────────────

async function runMediationADRLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const safeSlug = sanitizeSlug(caseSlug);
  if (!safeSlug) {
    console.warn(`[legal-pipeline] Mediation/ADR: invalid caseSlug "${caseSlug}"`);
    return null;
  }

  const prompt = [
    "Empfiehl alternative Streitbeilegung (ADR) für diesen Fall.",
    "",
    `Akte: ${safeSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Settlement-Analyse: settlement-analysis/${safeSlug}`,
    `Cost-Benefit-Analyse: cost-benefit/${safeSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${safeSlug}`,
    `Forensischer Bericht: forensic-reports/${safeSlug}`,
    "",
    "Lade alle Pages mit get_page und bewerte:",
    "1. Mediation (§ 227 ZPO AT, § 278a ZPO DE, Art 138 ZPO CH)",
    "2. Schiedsverfahren (§ 577 ZPO AT, § 1029 ZPO DE, Art 176 ZPO CH)",
    "3. Schlichtung (§ 15a EGZPO, kantonale Schlichtungsbehörde CH)",
    "4. Gerichtlich (Benchmark)",
    "5. ADR-Eignung und Empfehlung",
    "",
    'Gib JSON zurück: { adr_optionen: [...], empfohlener_weg: "...", vergleich_gerichtlich: {...}, obligatorische_schlichtung: {...}, overall_adr_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const json = await runSpecialistLayer({
    ctx,
    queue,
    specialistName: "mediation-adr-analyzer",
    prompt,
    sourceStamp,
    layerId: "mediation-adr",
  });
  if (!json) return null;

  const slug = `mediation-adr/${safeSlug}`;
  await writeMediationADRPage(engine, slug, safeSlug, json, sourceStamp);
  return slug;
}

async function writeMediationADRPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const optionen = Array.isArray(data.adr_optionen) ? data.adr_optionen : [];
  const empfohlen = String(data.empfohlener_weg ?? "");
  const empfohlenGruend = String(data.empfohlener_weg_begruendung ?? "");
  const vergleich = data.vergleich_gerichtlich as Record<string, unknown> | undefined;
  const oblSchlichtung = data.obligatorische_schlichtung as Record<string, unknown> | undefined;
  const score = clampScore(data.overall_adr_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Mediation/ADR — ${caseSlug}"`);
  lines.push(`type: mediation_adr_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`adr_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Mediation & ADR-Analyse");
  lines.push("");
  lines.push(`**Score:** ${score}/100`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (oblSchlichtung?.erforderlich) {
    lines.push(
      "> ⚠️ **Obligatorische Schlichtung erforderlich** — Klage erst nach Schlichtungsversuch möglich!"
    );
    if (oblSchlichtung.paragraph)
      lines.push(`> ${oblSchlichtung.paragraph}: ${oblSchlichtung.grund ?? ""}`);
    lines.push("");
  }

  if (optionen.length > 0) {
    lines.push("### ADR-Optionen im Vergleich");
    lines.push("");
    lines.push("| Typ | § | Dauer | Kosten | Erfolg | Empfohlen |");
    lines.push("|-----|---|-------|--------|--------|-----------|");
    for (const o of optionen) {
      const r = o as Record<string, unknown>;
      const empfohlenStr = r.empfohlen ? "✅ Ja" : "❌ Nein";
      lines.push(
        `| ${r.typ ?? ""} | ${r.paragraph ?? ""} | ${r.geschätzte_dauer_wochen ?? ""} Wo | €${Number(r.geschätzte_kosten ?? 0).toLocaleString("de-DE")} | ${r.erfolgswahrscheinlichkeit ?? ""}% | ${empfohlenStr} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (const o of optionen) {
      const r = o as Record<string, unknown>;
      const vorteile = Array.isArray(r.vorteile) ? (r.vorteile as string[]).join(", ") : "";
      const nachteile = Array.isArray(r.nachteile) ? (r.nachteile as string[]).join(", ") : "";
      lines.push(`#### ${r.typ ?? ""}`);
      if (r.paragraph) lines.push(`- **Paragraph:** ${r.paragraph}`);
      if (r.voraussetzungen) lines.push(`- **Voraussetzungen:** ${r.voraussetzungen}`);
      if (vorteile) lines.push(`- **Vorteile:** ${vorteile}`);
      if (nachteile) lines.push(`- **Nachteile:** ${nachteile}`);
      if (r.begruendung) lines.push(`- **Begründung:** ${r.begruendung}`);
      lines.push("");
    }
  }

  if (empfohlen) {
    lines.push(`### Empfohlener Weg: ${empfohlen}`);
    lines.push("");
    if (empfohlenGruend) lines.push(`${empfohlenGruend}`);
    lines.push("");
  }

  if (vergleich) {
    lines.push("### Vergleich: ADR vs. Gerichtlich");
    lines.push("");
    lines.push(`- **Gerichtlich Dauer:** ${vergleich.gerichtlich_dauer_wochen ?? ""} Wochen`);
    lines.push(
      `- **Gerichtlich Kosten:** €${Number(vergleich.gerichtlich_kosten ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(
      `- **Gerichtlich Erfolg:** ${vergleich.gerichtlich_erfolgswahrscheinlichkeit ?? ""}%`
    );
    if (vergleich.adr_vorteil_zeit)
      lines.push(`- **ADR-Vorteil Zeit:** ${vergleich.adr_vorteil_zeit}`);
    if (vergleich.adr_vorteil_kosten)
      lines.push(`- **ADR-Vorteil Kosten:** ${vergleich.adr_vorteil_kosten}`);
    if (vergleich.adr_vorteil_erfolg)
      lines.push(`- **ADR-Vorteil Erfolg:** ${vergleich.adr_vorteil_erfolg}`);
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await safePutPage(
    engine,
    slug,
    {
      type: "mediation_adr_analysis",
      title: parsed.title ?? `Mediation/ADR — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    sourceId
  );
}

// ── Limitation Scanner Layer (Layer 5l) ─────────────────────

async function runLimitationScannerLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const safeSlug = sanitizeSlug(caseSlug);
  if (!safeSlug) {
    console.warn(`[legal-pipeline] Limitation scan: invalid caseSlug "${caseSlug}"`);
    return null;
  }

  const prompt = [
    "Prüfe jeden Anspruch auf Verjährung für diesen Fall.",
    "",
    `Akte: ${safeSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Schadentabelle: damage-tables/${safeSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${safeSlug}`,
    `Forensischer Bericht: forensic-reports/${safeSlug}`,
    `Fristen-Validierung: deadline-validations/${safeSlug}`,
    "",
    "Lade alle Pages mit get_page und prüfe pro Anspruch:",
    "1. Verjährungsfrist (3J, 5J, 10J, 30J) mit §",
    "2. Beginn (Fälligkeit / Kenntnis / Entstehung)",
    "3. Fristende (konkretes Datum)",
    "4. Verjährt? Restzeit in Tagen",
    "5. Hemmung/Unterbrechung vorhanden?",
    "6. Handlungsbedarf: URGENT / WARNUNG / OK",
    "7. GEGNER: Gegen wen richtet sich dieser Anspruch? (PFLICHTFELD)",
    "",
    "WICHTIG: Bei mehreren Gegnern (additional_opponents im Case-Frontmatter)",
    "kann derselbe Anspruchstyp gegen verschiedene Gegner unterschiedliche",
    "Kenntnis-Anker und damit unterschiedliche Fristenden haben.",
    "Prüfe JEDEN Anspruch gegen JEDEN relevanten Gegner separat.",
    "",
    'Gib JSON zurück: { ansprueche: [...], urgent_ansprueche: [...], verjaehrte_ansprueche: [...], hemmungen_aktiv: [...], overall_verjaehrung_risiko_score: 0-100, empfehlung: "..." }',
  ].join("\n");

  const json = await runSpecialistLayer({
    ctx,
    queue,
    specialistName: "limitation-scanner",
    prompt,
    sourceStamp,
    layerId: "limitation-scanner",
  });
  if (!json) return null;

  const slug = `limitation-scan/${safeSlug}`;
  await writeLimitationScannerPage(engine, slug, safeSlug, json, sourceStamp);
  return slug;
}

// ── Auto-Wiedervorlage (auto-triggered after Layer 5l when score >= 75) ──

async function autoCreateWiedervorlage(
  engine: BrainEngine,
  caseSlug: string,
  verjaehrungScore: number,
  urgentAnsprueche: unknown[],
  sourceId?: string
): Promise<string[]> {
  const now = new Date();
  const createdSlugs: string[] = [];

  for (const entry of urgentAnsprueche) {
    const r = entry as Record<string, unknown>;
    const anspruch = String(r.anspruch ?? "Unbekannter Anspruch");
    const restzeitTage = typeof r.restzeit_tage === "number" ? r.restzeit_tage : 30;
    const paragraph = String(r.paragraph ?? "");
    const handlungsbedarf = String(r.handlungsbedarf ?? "Sofortige Prüfung erforderlich");

    const days = Math.max(1, Math.ceil(restzeitTage));
    const dueDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const dueIso = dueDate.toISOString().split("T")[0]!;

    const safeName = anspruch
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase()
      .slice(0, 40);
    const slug = `deadlines/wiedervorlage-${caseSlug}-${safeName}`;

    const fmLines = [
      "---",
      `title: "Wiedervorlage: ${anspruch} — ${caseSlug}"`,
      `type: deadline`,
      `case_ref: ${caseSlug}`,
      `deadline_type: wiedervorlage`,
      `due_date: ${dueIso}`,
      `status: ${days <= 7 ? "critical" : days <= 30 ? "warning" : "pending"}`,
      `priority: high`,
      `verjaehrung_score: ${verjaehrungScore}`,
      `auto_generated: true`,
      `created_at: ${now.toISOString()}`,
      "---",
    ];

    const body = [
      "## Wiedervorlage (auto-generiert)",
      "",
      `**Akte:** ${caseSlug}`,
      `**Anspruch:** ${anspruch}`,
      `**Restzeit:** ${days} Tage`,
      `**§:** ${paragraph}`,
      `**Handlungsbedarf:** ${handlungsbedarf}`,
      `**Verjährungs-Score:** ${verjaehrungScore}/100`,
      "",
      "> ⚠️ Verjährung droht — sofortige Maßnahme erforderlich!",
    ].join("\n");

    const md = `${fmLines.join("\n")}\n\n${body}`;
    const parsed = parseMarkdown(md);

    try {
      await engine.putPage(
        slug,
        {
          type: "deadline",
          title: parsed.title ?? `Wiedervorlage: ${anspruch} — ${caseSlug}`,
          compiled_truth: md,
          frontmatter: { ...(parsed.frontmatter ?? {}) },
        },
        { sourceId }
      );
      createdSlugs.push(slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[legal-pipeline] Auto-Wiedervorlage create failed for "${anspruch}": ${msg}`);
    }
  }

  // Update case frontmatter to flag wiedervorlage
  try {
    const casePage = await engine.getPage(caseSlug, { sourceId });
    if (casePage) {
      const caseFm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
      await engine.putPage(
        caseSlug,
        {
          ...casePage,
          frontmatter: {
            ...caseFm,
            wiedervorlage_urgent: true,
            wiedervorlage_count: createdSlugs.length,
            wiedervorlage_created_at: now.toISOString(),
          },
        },
        { sourceId }
      );
    }
  } catch {
    // best effort — don't fail the pipeline for this
  }

  return createdSlugs;
}

async function writeLimitationScannerPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const ansprueche = Array.isArray(data.ansprueche) ? data.ansprueche : [];
  const urgent = Array.isArray(data.urgent_ansprueche) ? data.urgent_ansprueche : [];
  const verjaehrte = Array.isArray(data.verjaehrte_ansprueche) ? data.verjaehrte_ansprueche : [];
  const hemmungen = Array.isArray(data.hemmungen_aktiv) ? data.hemmungen_aktiv : [];
  const score = clampScore(data.overall_verjaehrung_risiko_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Verjährungs-Scan — ${caseSlug}"`);
  lines.push(`type: limitation_scan_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`verjaehrung_risiko_score: ${score}`);
  lines.push(`urgent_count: ${urgent.length}`);
  lines.push(`verjaehrte_count: ${verjaehrte.length}`);
  if (urgent.length > 0) {
    lines.push(`urgent_ansprueche: ${safeStringify(urgent)}`);
  }
  if (verjaehrte.length > 0) {
    lines.push(`verjaehrte_ansprueche: ${safeStringify(verjaehrte)}`);
  }
  lines.push("---");
  lines.push("");
  lines.push("## Verjährungs-Scan");
  lines.push("");
  lines.push(`**Score:** ${score}/100 (höher = grösseres Risiko)`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (urgent.length > 0) {
    lines.push("> 🚨 **DRINGEND — Ansprüche verjähren bald!**");
    lines.push("");
    lines.push("| Anspruch | Gegner | Restzeit | Handlungsbedarf | § |");
    lines.push("|----------|--------|----------|-----------------|---|");
    for (const u of urgent) {
      const r = u as Record<string, unknown>;
      lines.push(
        `| ${r.anspruch ?? ""} | ${r.gegner ?? "—"} | ${r.restzeit_tage ?? ""} Tage | ${r.handlungsbedarf ?? ""} | ${r.paragraph ?? ""} |`
      );
    }
    lines.push("");
  }

  if (verjaehrte.length > 0) {
    lines.push("> ⛔ **Verjährte Ansprüche — nicht mehr durchsetzbar!**");
    lines.push("");
    lines.push("| Anspruch | Gegner | § | Grund |");
    lines.push("|----------|--------|---|-------|");
    for (const v of verjaehrte) {
      const r = v as Record<string, unknown>;
      lines.push(
        `| ${r.anspruch ?? ""} | ${r.gegner ?? "—"} | ${r.paragraph ?? ""} | ${r.grund ?? ""} |`
      );
    }
    lines.push("");
  }

  if (ansprueche.length > 0) {
    lines.push("### Alle Ansprüche im Überblick");
    lines.push("");
    lines.push(
      "| Anspruch | Gegner | Höhe | Frist | § | Beginn | Fristende | Verjährt | Restzeit | Status |"
    );
    lines.push(
      "|----------|--------|------|-------|---|--------|-----------|----------|----------|--------|"
    );
    for (const a of ansprueche) {
      const r = a as Record<string, unknown>;
      const statusStr =
        r.handlungsbedarf === "URGENT"
          ? "🚨 URGENT"
          : r.handlungsbedarf === "WARNUNG"
            ? "⚠️ WARNUNG"
            : "✅ OK";
      lines.push(
        `| ${r.anspruch ?? ""} | ${r.gegner ?? "—"} | €${Number(r.anspruchshoehe ?? 0).toLocaleString("de-DE")} | ${r.verjaehrungsfrist_jahre ?? ""}J | ${r.paragraph ?? ""} | ${r.beginn ?? ""} | ${r.frist_ende ?? ""} | ${r.verjaehrt ? "Ja" : "Nein"} | ${r.restzeit_tage ?? ""}T | ${statusStr} |`
      );
    }
    lines.push("");
  } else {
    lines.push("### Keine Ansprüche in der Schadentabelle");
    lines.push("");
  }

  if (hemmungen.length > 0) {
    lines.push("### Aktive Hemmungen");
    lines.push("");
    lines.push("| Anspruch | Gegner | Hemmungsgrund | Seit |");
    lines.push("|----------|--------|---------------|------|");
    for (const h of hemmungen) {
      const r = h as Record<string, unknown>;
      lines.push(
        `| ${r.anspruch ?? ""} | ${r.gegner ?? "—"} | ${r.hemmung_grund ?? ""} | ${r.hemmung_seit ?? ""} |`
      );
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await safePutPage(
    engine,
    slug,
    {
      type: "limitation_scan_analysis",
      title: parsed.title ?? `Verjährungs-Scan — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    sourceId
  );
}

// ── Cost Award Layer (Layer 5m) ─────────────────────────────

async function runCostAwardLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string | null> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const safeSlug = sanitizeSlug(caseSlug);
  if (!safeSlug) {
    console.warn(`[legal-pipeline] Cost award: invalid caseSlug "${caseSlug}"`);
    return null;
  }

  const prompt = [
    "Sage voraus, wer die Prozesskosten trägt für diesen Fall.",
    "",
    `Akte: ${safeSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Cost-Benefit-Analyse: cost-benefit/${safeSlug}`,
    `Legal Grounding Map: legal-grounding-maps/${safeSlug}`,
    `Settlement-Analyse: settlement-analysis/${safeSlug}`,
    `Schadentabelle: damage-tables/${safeSlug}`,
    "",
    "Lade alle Pages mit get_page und analysiere:",
    "1. Vollgewinn (100%): Gegner trägt alle Kosten (§ 78 ZPO / § 91 ZPO / Art 106 ZPO)",
    "2. Teilgewinn (60%): Kosten 60/40 geteilt (§ 78(2) ZPO / § 92 ZPO / Art 107 ZPO)",
    "3. Vollverlust (0%): Mandant trägt alle Kosten",
    "4. Vergleich: Jeder trägt eigene (§ 78(3) ZPO / § 98 ZPO / Art 111 ZPO)",
    "5. Netto-Kosten pro Szenario und wahrscheinlichstes Szenario",
    "",
    'Gib JSON zurück: { szenarien: [...], wahrscheinlichstes_szenario: "...", erwartete_netto_kosten: 0, erwartete_erstattung: 0, kostenrisiko_score: 0-100, vergleich_kosten_vorteil: {...}, empfehlung: "..." }',
  ].join("\n");

  const json = await runSpecialistLayer({
    ctx,
    queue,
    specialistName: "cost-award-predictor",
    prompt,
    sourceStamp,
    layerId: "cost-award",
  });
  if (!json) return null;

  const slug = `cost-award/${safeSlug}`;
  await writeCostAwardPage(engine, slug, safeSlug, json, sourceStamp);
  return slug;
}

async function writeCostAwardPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  data: Record<string, unknown>,
  sourceId?: string
): Promise<void> {
  const szenarien = Array.isArray(data.szenarien) ? data.szenarien : [];
  const wahrscheinlich = String(data.wahrscheinlichstes_szenario ?? "");
  const erwarteteNetto =
    typeof data.erwartete_netto_kosten === "number" ? data.erwartete_netto_kosten : 0;
  const erwarteteErstattung =
    typeof data.erwartete_erstattung === "number" ? data.erwartete_erstattung : 0;
  const vergleichVorteil = data.vergleich_kosten_vorteil as Record<string, unknown> | undefined;
  const score = clampScore(data.kostenrisiko_score);
  const empfehlung = String(data.empfehlung ?? "");

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Kostenentscheidung — ${caseSlug}"`);
  lines.push(`type: cost_award_analysis`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`kostenrisiko_score: ${score}`);
  lines.push("---");
  lines.push("");
  lines.push("## Kostenentscheidung-Prognose");
  lines.push("");
  lines.push(`**Score:** ${score}/100 (höher = grösseres Kostenrisiko)`);
  lines.push("");
  lines.push(`**Empfehlung:** ${empfehlung}`);
  lines.push("");

  if (szenarien.length > 0) {
    lines.push("### Szenarien");
    lines.push("");
    lines.push("| Szenario | Quote | Eigene Kosten | Erstattung | Netto-Kosten | § |");
    lines.push("|----------|-------|---------------|------------|--------------|---|");
    for (const s of szenarien) {
      const r = s as Record<string, unknown>;
      const quoteStr =
        r.erfolgsquote === null || r.erfolgsquote === undefined ? "—" : `${r.erfolgsquote}%`;
      lines.push(
        `| ${r.szenario ?? ""} | ${quoteStr} | €${Number(r.eigene_kosten ?? 0).toLocaleString("de-DE")} | €${Number(r.erstattung_durch_gegner ?? 0).toLocaleString("de-DE")} | €${Number(r.netto_kosten ?? 0).toLocaleString("de-DE")} | ${r.paragraph ?? ""} |`
      );
    }
    lines.push("");

    lines.push("### Detail-Analyse");
    lines.push("");
    for (const s of szenarien) {
      const r = s as Record<string, unknown>;
      lines.push(`#### ${r.szenario ?? ""}`);
      if (r.paragraph) lines.push(`- **Paragraph:** ${r.paragraph}`);
      lines.push(`- **Eigene Kosten:** €${Number(r.eigene_kosten ?? 0).toLocaleString("de-DE")}`);
      lines.push(
        `- **Erstattung durch Gegner:** €${Number(r.erstattung_durch_gegner ?? 0).toLocaleString("de-DE")}`
      );
      lines.push(`- **Netto-Kosten:** €${Number(r.netto_kosten ?? 0).toLocaleString("de-DE")}`);
      if (r.begruendung) lines.push(`- **Begründung:** ${r.begruendung}`);
      lines.push("");
    }
  }

  if (wahrscheinlich) {
    lines.push(`### Wahrscheinlichstes Szenario: ${wahrscheinlich}`);
    lines.push("");
    lines.push(`- **Erwartete Netto-Kosten:** €${erwarteteNetto.toLocaleString("de-DE")}`);
    lines.push(`- **Erwartete Erstattung:** €${erwarteteErstattung.toLocaleString("de-DE")}`);
    lines.push("");
  }

  if (vergleichVorteil) {
    lines.push("### Vergleich: Gerichtlich vs. Vergleich");
    lines.push("");
    lines.push(
      `- **Gerichtlich Netto-Kosten:** €${Number(vergleichVorteil.gerichtlich_netto_kosten ?? 0).toLocaleString("de-DE")}`
    );
    lines.push(
      `- **Vergleich Netto-Kosten:** €${Number(vergleichVorteil.vergleich_netto_kosten ?? 0).toLocaleString("de-DE")}`
    );
    if (vergleichVorteil.vorteil) lines.push(`- **Vorteil:** ${vergleichVorteil.vorteil}`);
    if (typeof vergleichVorteil.differenz === "number") {
      const sign = vergleichVorteil.differenz >= 0 ? "+" : "";
      lines.push(`- **Differenz:** ${sign}€${vergleichVorteil.differenz.toLocaleString("de-DE")}`);
    }
    lines.push("");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await safePutPage(
    engine,
    slug,
    {
      type: "cost_award_analysis",
      title: parsed.title ?? `Kostenentscheidung — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    sourceId
  );
}

/**
 * Run 3 critic models in parallel and compute consensus.
 *
 * Consensus rules:
 *   - recommendation: majority vote (2+ of 3). Tie-break: conservative (reject > revise > publish).
 *   - total_score: min() across all models (conservative — worst-case wins).
 *   - layer_scores: min() per layer across all models.
 *   - issues: union of all issues from all models (deduped).
 *
 * LEXam paper (July 2026): min(DeepSeek-V3, Qwen3-32B) ensemble surpasses
 * human judges on legal reasoning. We extend this to 3 models for robustness.
 */
async function runEnsembleCriticLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  partSlugs: string[];
  state: PipelineState;
  legalGroundingMap?: LegalGroundingEntry[];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
  retryCount?: number;
  enableSubsumptionCheck?: boolean;
}): Promise<{ verdict: EnsembleCriticVerdict; auditSlug: string }> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    partSlugs,
    state,
    legalGroundingMap,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
    retryCount = 0,
    enableSubsumptionCheck = true,
  } = opts;
  const def = resolveSpecialist("legal-critic");
  if (!def) throw new Error("legal-pipeline: legal-critic specialist not found");

  // Collect all output slugs for the critic to review
  const outputSlugs: string[] = [];
  for (const layer of Object.values(state.layers)) {
    if (layer.output_slugs) outputSlugs.push(...layer.output_slugs);
  }

  // ── Pre-Step: Subsumption Check ──────────────────────
  // Runs the subsumption-checker specialist to verify the legal syllogism
  // (Obersatz → Untersatz → Schluss) of all outputs. Results are fed
  // into the ensemble critic prompt so all 3 models can factor subsumption
  // errors into their scores.
  let subsumptionContext = "";
  if (enableSubsumptionCheck) {
    try {
      const subsumptionResult = await runSubsumptionCheck({
        ctx,
        queue,
        engine,
        caseSlug,
        outputSlugs,
        legalGroundingMap,
        jurisdiction,
        verfahrenstyp,
        sourceStamp,
      });
      if (subsumptionResult) {
        subsumptionContext = subsumptionResult;
        // Write subsumption check page
        const subSlug = `subsumption-checks/${caseSlug}`;
        await writeSubsumptionCheckPage(engine, subSlug, caseSlug, subsumptionResult, sourceStamp);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[legal-pipeline] Subsumption check failed (non-blocking): ${msg}`);
    }
  }

  const criticVerfahrenstypHint =
    verfahrenstyp === "straf"
      ? "STRAF: Prüfe strafrechtliche Subsumtion (Tatbestand → Rechtswidrigkeit → Schuld), in dubio pro reo, StPO-Verfahrensregeln."
      : verfahrenstyp === "zivil"
        ? "ZIVIL: Prüfe zivilrechtliche Anspruchsvoraussetzungen (Kausalität, Schadenshöhe, Mitverschulden), ABGB/BGB/OR."
        : verfahrenstyp === "arbeitsrecht"
          ? "ARBEITSRECHT: Prüfe Kündigungsschutz, Mitbestimmung, Sozialplan nach ArbVG/KSchG/ArbGG."
          : verfahrenstyp === "verwaltungsrecht"
            ? "VERWALTUNGSRECHT: Prüfe Ermessensspielraum, Verhältnismäßigkeit, Bescheidmängel nach AVG/VwVfG/VwGO."
            : "Allgemeine juristische Prüfung.";

  const prompt = [
    "Überprüfe alle Pipeline-Outputs für diese Akte auf Halluzinationen, Citation-Accuracy, Vollständigkeit und juristische Logik.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Output-Pages: ${outputSlugs.join(", ")}`,
    `Original-Akt Sub-Pages: ${partSlugs.join(", ")}`,
    "",
    "WICHTIG: Prüfe §-Angaben gegen die korrekte Rechtsordnung (Jurisdiktion oben).",
    "- AT: ABGB, StPO, AHG, GVgo (RIS)",
    "- DE: BGB, ZPO, StGB, RVG (gesetze-im-internet.de)",
    "- CH: OR, ZGB, BV, StBVV (admin.ch)",
    "- EU: AEUV, DSGVO, Verordnungen (eur-lex.europa.eu)",
    "Markiere §-Angaben der falschen Rechtsordnung als Issue mit severity 'critical'.",
    "",
    `Verfahrenstyp-spezifische Prüfung: ${criticVerfahrenstypHint}`,
    "",
    "Lade jede Page mit get_page und prüfe:",
    "1. Jede Behauptung hat ein wörtliches Zitat, das im Originalakt vorkommt",
    "2. Jede ON-Nummer existiert in der ON-Tabelle",
    "3. Jede Personen-Referenz existiert in der Entity-Tabelle",
    "4. Jeder Betrag kommt als Ziffer im Originalakt vor",
    "5. Jede §-Angabe ist verifizierbar (gegen Legal Grounding Map und Brain)",
    "6. Keine Fristen wurden berechnet (alle verbatim)",
    "7. Legal Grounding Map: alle §§ wurden durch search/get_page verifiziert",
    "8. SUBSUMTION: Ist der juristische Syllogismus (Obersatz → Untersatz → Schluss) korrekt?",
    "9. NARRATIVE KOHÄRENZ (Gap 5): Tragen alle Pipeline-Outputs dieselbe zentrale These?",
    "   Identifiziere die zentrale These (z.B. 'Asymmetrie der Verfolgung: Opfer wird verfolgt, Täter nicht').",
    "   Prüfe, ob forensischer Bericht, Legal Grounding, Damage Table, Drafts und Counter-Arguments",
    "   alle diese These konsistent tragen. Flagge Layer, die von der These abweichen.",
    "",
    subsumptionContext
      ? `## SUBSUMPTIONS-PRÜFUNG (vorab durchgeführt):\n${subsumptionContext}\n`
      : "",
    "Gib ein JSON zurück:",
    '{ "total_score": 0-100, "recommendation": "publish|revise|reject", "issues": [...], "layer_scores": { "1": 90, "2": 85, ... }, "narrative_coherence_score": 0-100, "central_thesis": "...", "coherence_violations": ["Layer 6 weicht ab: ..."] }',
  ].join("\n");

  // Submit all 3 critic models in parallel
  const childIds: number[] = [];
  for (const model of ENSEMBLE_CRITIC_MODELS) {
    const childData: Record<string, unknown> = {
      prompt,
      subagent_def: "legal-critic",
      max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
      model, // Override model for this ensemble member
    };
    if (sourceStamp) childData._source_id = sourceStamp;
    if (lawSourceIds) childData._source_ids = lawSourceIds;

    // T5.4: ensemble-critic is mandatory — on_child_fail: "fail"
    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: getChildFailPolicy("ensemble-critic"),
        max_stalled: 3,
      },
      { allowProtectedSubmit: true }
    );
    childIds.push(child.id);
  }

  // Collect all verdicts in parallel
  const verdictPromises = childIds.map(async (childId, i) => {
    try {
      const result = await waitForChild(ctx, childId);
      const parsed = parseCriticVerdict(result);
      return {
        model: ENSEMBLE_CRITIC_MODELS[i]!,
        total_score: parsed.total_score,
        recommendation: parsed.recommendation,
        issues: parsed.issues,
        layer_scores: parsed.layer_scores,
      } satisfies CriticModelVerdict;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[legal-pipeline] Ensemble critic ${ENSEMBLE_CRITIC_MODELS[i]} failed: ${msg}`);
      // Fallback: neutral verdict that doesn't skew consensus
      return {
        model: ENSEMBLE_CRITIC_MODELS[i]!,
        total_score: 50,
        recommendation: "revise" as const,
        issues: [`Critic model failed: ${msg}`],
        layer_scores: {},
      } satisfies CriticModelVerdict;
    }
  });

  const modelVerdicts = await Promise.all(verdictPromises);

  // Compute consensus
  const consensus = computeEnsembleConsensus(modelVerdicts);

  const verdict: EnsembleCriticVerdict = {
    models: modelVerdicts,
    consensus,
    retry_count: retryCount,
  };

  // Write quality audit page with ensemble results
  const auditSlug = `quality-audits/${caseSlug}`;
  await writeEnsembleQualityAuditPage(engine, auditSlug, caseSlug, verdict, sourceStamp);
  return { verdict, auditSlug };
}

/** Parse a critic subagent result into a structured verdict. */
function parseCriticVerdict(result: unknown): {
  total_score: number;
  recommendation: "publish" | "revise" | "reject";
  issues: string[];
  layer_scores: Record<string, number>;
  narrative_coherence_score?: number;
  central_thesis?: string;
  coherence_violations?: string[];
} {
  const text =
    typeof result === "string"
      ? result
      : ((result as { text?: string })?.text ?? JSON.stringify(result));
  const json = tryParseJSON(text) as Record<string, unknown> | null;
  if (!json) {
    return {
      total_score: 50,
      recommendation: "revise",
      issues: ["Critic returned unparseable output"],
      layer_scores: {},
    };
  }
  const totalScore = clampScore(json.total_score) || 50;
  const rec = json.recommendation;
  const recommendation = rec === "publish" || rec === "revise" || rec === "reject" ? rec : "revise";
  const issues = Array.isArray(json.issues) ? json.issues.filter((i) => typeof i === "string") : [];
  const layerScores =
    typeof json.layer_scores === "object" && json.layer_scores !== null
      ? (json.layer_scores as Record<string, number>)
      : {};
  // Gap 5: Narrative coherence fields
  const narrativeCoherenceScore =
    typeof json.narrative_coherence_score === "number"
      ? clampScore(json.narrative_coherence_score)
      : undefined;
  const centralThesis = typeof json.central_thesis === "string" ? json.central_thesis : undefined;
  const coherenceViolations = Array.isArray(json.coherence_violations)
    ? json.coherence_violations.filter((v) => typeof v === "string")
    : undefined;
  return {
    total_score: totalScore,
    recommendation,
    issues,
    layer_scores: layerScores,
    narrative_coherence_score: narrativeCoherenceScore,
    central_thesis: centralThesis,
    coherence_violations: coherenceViolations,
  };
}

/**
 * Compute consensus from multiple model verdicts.
 *
 * - recommendation: majority vote (2+ of 3). Tie-break: conservative order (reject > revise > publish).
 * - total_score: min() — worst-case wins (conservative for legal).
 * - layer_scores: min() per layer.
 * - issues: union, deduped.
 */
function computeEnsembleConsensus(
  models: CriticModelVerdict[]
): EnsembleCriticVerdict["consensus"] {
  // Majority vote on recommendation
  const recCounts: Record<string, number> = { publish: 0, revise: 0, reject: 0 };
  for (const m of models) {
    recCounts[m.recommendation]++;
  }
  let recommendation: "publish" | "revise" | "reject" = "publish";
  if (recCounts.reject >= 2) recommendation = "reject";
  else if (recCounts.revise >= 2) recommendation = "revise";
  else if (recCounts.publish >= 2) recommendation = "publish";
  else {
    // Tie (1-1-1 or no majority): conservative fallback
    if (recCounts.reject >= 1) recommendation = "reject";
    else if (recCounts.revise >= 1) recommendation = "revise";
  }

  // min() total score
  const totalScore = Math.min(...models.map((m) => m.total_score));

  // min() per layer
  const allLayerKeys = new Set<string>();
  for (const m of models) {
    for (const k of Object.keys(m.layer_scores)) allLayerKeys.add(k);
  }
  const layerScores: Record<string, number> = {};
  for (const k of allLayerKeys) {
    const scores = models.map((m) => m.layer_scores[k]).filter((s) => typeof s === "number");
    if (scores.length > 0) layerScores[k] = Math.min(...scores);
  }

  // Union of issues (deduped)
  const issueSet = new Set<string>();
  for (const m of models) {
    for (const issue of m.issues) issueSet.add(issue);
  }

  // Gap 5: Narrative coherence — min() across models (conservative)
  const coherenceScores = models
    .map(
      (m) =>
        (m as CriticModelVerdict & { narrative_coherence_score?: number }).narrative_coherence_score
    )
    .filter((s): s is number => typeof s === "number");
  const narrativeCoherenceScore =
    coherenceScores.length > 0 ? Math.min(...coherenceScores) : undefined;

  // Central thesis: pick the most common non-empty thesis across models
  const theses = models
    .map((m) => (m as CriticModelVerdict & { central_thesis?: string }).central_thesis)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  const centralThesis = theses.length > 0 ? theses[0] : undefined;

  // Coherence violations: union across models
  const violationSet = new Set<string>();
  for (const m of models) {
    const violations = (m as CriticModelVerdict & { coherence_violations?: string[] })
      .coherence_violations;
    if (Array.isArray(violations)) {
      for (const v of violations) violationSet.add(v);
    }
  }

  return {
    recommendation,
    total_score: totalScore,
    issues: [...issueSet],
    layer_scores: layerScores,
    narrative_coherence_score: narrativeCoherenceScore,
    central_thesis: centralThesis,
    coherence_violations: violationSet.size > 0 ? [...violationSet] : undefined,
  };
}

/** Identify which layers should be retried based on ensemble consensus scores. */
function layersToRetry(consensus: EnsembleCriticVerdict["consensus"]): number[] {
  const retry: number[] = [];
  for (const [layerStr, score] of Object.entries(consensus.layer_scores)) {
    const layerNum = parseInt(layerStr, 10);
    if (!Number.isNaN(layerNum) && score < LAYER_RETRY_THRESHOLD) {
      // Only retry layers 1-6 (not 7=critic itself, not post-pipeline)
      if (layerNum >= 1 && layerNum <= 6) retry.push(layerNum);
    }
  }
  return retry.sort((a, b) => a - b);
}

/**
 * Re-run a specific pipeline layer (1-6) with critic feedback.
 * Dispatches to the appropriate layer runner based on layerNum.
 * Updates the layer's output in state so the next ensemble critic
 * run sees the corrected output.
 */
async function rerunSpecificLayer(
  layerNum: number,
  opts: {
    ctx: MinionJobContext;
    queue: MinionQueue;
    engine: BrainEngine;
    data: LegalPipelineData;
    state: PipelineState;
    stateSlug: string;
    sourceStamp?: string;
    lawSourceIds?: string[];
    onTable: OnEntry[];
    entities: EntityEntry[];
    forensicReport: ForensicReport | null;
    legalGroundingMap: LegalGroundingEntry[];
    damageTable: DamageEntry[];
    deadlineCalendar: DeadlineEntry[];
    allTexts: string[];
    retryFeedback: string;
  }
): Promise<void> {
  const {
    ctx,
    queue,
    engine,
    data,
    state,
    stateSlug,
    sourceStamp,
    lawSourceIds,
    onTable,
    entities,
    forensicReport,
    legalGroundingMap,
    damageTable,
    deadlineCalendar,
    allTexts,
    retryFeedback,
  } = opts;

  console.warn(`[legal-pipeline] Re-running Layer ${layerNum} with critic feedback`);

  switch (layerNum) {
    case 1: {
      // ON-Scanner
      const result = await runMapReduceLayer({
        ctx,
        queue,
        engine,
        specialistName: "on-scanner",
        partSlugs: data.part_slugs,
        allTexts,
        batchSize: HAIKU_BATCH_SIZE,
        sourceStamp,
        contextJson: JSON.stringify({ jurisdiction: data.jurisdiction ?? "at" }),
        retryFeedback,
        layerId: "on-scanner",
      });
      const newOnTable = extractOnEntries(result);
      const onSlug = `on-indices/${data.case_slug}`;
      await writeOnIndexPage(engine, onSlug, data.case_slug, newOnTable, sourceStamp);
      // Update state with new output
      state.layers[1]!.output_slugs = [onSlug];
      break;
    }
    case 2: {
      // Entity-Extractor
      const result = await runMapReduceLayer({
        ctx,
        queue,
        engine,
        specialistName: "entity-extractor",
        partSlugs: data.part_slugs,
        allTexts,
        batchSize: HAIKU_BATCH_SIZE,
        sourceStamp,
        contextJson: JSON.stringify({
          on_table: onTable,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
        }),
        retryFeedback,
        layerId: "entity-extractor",
      });
      const newEntities = extractEntityEntries(result);
      const entitySlugs = await writeEntityPages(engine, data.case_slug, newEntities, sourceStamp);
      state.layers[2]!.output_slugs = entitySlugs;
      break;
    }
    case 3: {
      // Forensic Analyst
      const contextJson = JSON.stringify({
        on_table: onTable,
        entities,
        manual_overrides: data.manual_overrides,
        jurisdiction: data.jurisdiction ?? "at",
        verfahrenstyp:
          data.verfahrenstyp ??
          (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
      });
      const result = await runMapReduceLayer({
        ctx,
        queue,
        engine,
        specialistName: "forensic-analyst",
        partSlugs: data.part_slugs,
        allTexts,
        batchSize: SONNET_BATCH_SIZE,
        sourceStamp,
        contextJson,
        retryFeedback,
        layerId: "forensic-analyst",
      });
      const newForensicReport = extractForensicReport(result);
      const forensicSlug = `forensic-reports/${data.case_slug}`;
      await writeForensicReportPage(
        engine,
        forensicSlug,
        data.case_slug,
        newForensicReport,
        sourceStamp
      );
      state.layers[3]!.output_slugs = [forensicSlug];
      break;
    }
    case 4: {
      // Law Matcher
      const newGroundingMap = await runLawMatcherLayer({
        ctx,
        queue,
        engine,
        caseSlug: data.case_slug,
        forensicReport,
        onTable,
        entities,
        jurisdiction: data.jurisdiction ?? "at",
        verfahrenstyp:
          data.verfahrenstyp ??
          (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
        sourceStamp,
      });
      const groundingSlug = `legal-grounding-maps/${data.case_slug}`;
      await writeLegalGroundingMapPage(
        engine,
        groundingSlug,
        data.case_slug,
        newGroundingMap,
        sourceStamp
      );
      const claimEvidenceGraph = buildGraphFromGroundingMap({
        output_id: data.case_slug,
        output_type: data.workflow_id ?? "full_pipeline",
        jurisdiction: data.jurisdiction!.toUpperCase() as Jurisdiction,
        as_of_date: data.as_of_date ?? new Date().toISOString().slice(0, 10),
        entries: newGroundingMap as unknown as VerifiedGroundingEntry[],
        case_documents: data.part_slugs.map((source_slug, index) => ({
          source_slug,
          text: allTexts[index] ?? "",
        })),
        brain_id: sourceStamp,
      });
      const claimEvidenceSlug = `claim-evidence/${data.case_slug}`;
      await writeClaimEvidenceGraphPage(
        engine,
        claimEvidenceSlug,
        data.case_slug,
        claimEvidenceGraph,
        sourceStamp
      );
      state.layers[4]!.output_slugs = [groundingSlug, claimEvidenceSlug];

      // Record dependencies from the claim-evidence graph
      try {
        await recordGraphDependencies(
          engine,
          claimEvidenceGraph,
          data.case_slug,
          data.workflow_id ?? "full_pipeline",
          sourceStamp
        );
      } catch (depErr) {
        console.warn(
          `[legal-pipeline] Retry: dependency recording error: ${depErr instanceof Error ? depErr.message : String(depErr)}`
        );
      }

      // Re-run Sub-Layer 4b: Precedent Match
      try {
        const precedentSlug = await runPrecedentMatchLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          legalGroundingMap: newGroundingMap,
          forensicReport,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
        });
        if (precedentSlug) {
          state.layers[4]!.output_slugs = [...(state.layers[4]!.output_slugs ?? []), precedentSlug];
          // Merge precedent matches into the claim-evidence graph
          try {
            await mergePrecedentsIntoGraph(
              engine,
              precedentSlug,
              claimEvidenceSlug,
              data.case_slug,
              sourceStamp
            );
          } catch (mergeErr) {
            console.warn(
              `[legal-pipeline] Retry: precedent→graph merge error: ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`
            );
          }
        }
      } catch (err) {
        console.warn(
          `[legal-pipeline] Retry: precedent match failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // Re-run Sub-Layer 4c: Burden of Proof
      try {
        const burdenSlug = await runBurdenOfProofLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          forensicReport,
          legalGroundingMap: newGroundingMap,
          damageTable,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
        });
        if (burdenSlug) {
          state.layers[4]!.output_slugs = [...(state.layers[4]!.output_slugs ?? []), burdenSlug];
        }
      } catch (err) {
        console.warn(
          `[legal-pipeline] Retry: burden of proof failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // Re-run Sub-Layer 4d: Admissibility Check
      if (newGroundingMap.length > 0) {
        try {
          const admissibilitySlug = await runAdmissibilityCheckLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            legalGroundingMap: newGroundingMap,
            forensicReport,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          if (admissibilitySlug) {
            state.layers[4]!.output_slugs = [
              ...(state.layers[4]!.output_slugs ?? []),
              admissibilitySlug,
            ];
          }
        } catch (err) {
          console.warn(
            `[legal-pipeline] Retry: admissibility check failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Re-run Sub-Layer 4e: Fact Gap Detection
      if (newGroundingMap.length > 0) {
        try {
          const factGapSlug = await runFactGapDetectionLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            forensicReport,
            legalGroundingMap: newGroundingMap,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            sourceStamp,
            lawSourceIds,
          });
          if (factGapSlug) {
            state.layers[4]!.output_slugs = [...(state.layers[4]!.output_slugs ?? []), factGapSlug];
          }
        } catch (err) {
          console.warn(
            `[legal-pipeline] Retry: fact gap detection failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      break;
    }
    case 5: {
      // Damage+Deadline Extractor
      const contextJson = JSON.stringify({
        on_table: onTable,
        entities,
        forensic_report: forensicReport,
        legal_grounding_map: legalGroundingMap,
        manual_overrides: data.manual_overrides,
        jurisdiction: data.jurisdiction ?? "at",
        verfahrenstyp:
          data.verfahrenstyp ??
          (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
      });
      const result = await runMapReduceLayer({
        ctx,
        queue,
        engine,
        specialistName: "damage-extractor",
        partSlugs: data.part_slugs,
        allTexts,
        batchSize: SONNET_BATCH_SIZE,
        sourceStamp,
        contextJson,
        retryFeedback,
        layerId: "damage-deadline-extractor",
      });
      const extracted = extractDamageResult(result);
      const damageSlug = `damage-tables/${data.case_slug}`;
      const deadlineSlug = `deadline-calendars/${data.case_slug}`;
      await writeDamageTablePage(
        engine,
        damageSlug,
        data.case_slug,
        extracted.damage_table,
        sourceStamp
      );
      await writeDeadlineCalendarPage(
        engine,
        deadlineSlug,
        data.case_slug,
        extracted.deadline_calendar,
        sourceStamp
      );
      // Gap 4: Damage overlap detection in retry path
      const retryOverlapWarnings = detectDamageOverlaps(extracted.damage_table);
      if (retryOverlapWarnings.length > 0) {
        state.damage_overlap_warnings = retryOverlapWarnings;
        state.warnings = [...(state.warnings ?? []), ...retryOverlapWarnings];
      }
      state.layers[5]!.output_slugs = [damageSlug, deadlineSlug];

      // Re-run Sub-Layer 5b: Deadline Validator
      try {
        const validationSlug = await runDeadlineValidationLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          deadlineSlug,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
        });
        if (validationSlug) {
          state.layers[5]!.output_slugs = [
            ...(state.layers[5]!.output_slugs ?? []),
            validationSlug,
          ];
        }
      } catch (err) {
        console.warn(
          `[legal-pipeline] Retry: deadline validation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // Re-run Sub-Layer 5c: Cost-Benefit Analysis
      try {
        const costBenefitSlug = await runCostBenefitLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          damageTable: extracted.damage_table,
          forensicReport,
          legalGroundingMap,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
        });
        if (costBenefitSlug) {
          state.layers[5]!.output_slugs = [
            ...(state.layers[5]!.output_slugs ?? []),
            costBenefitSlug,
          ];
        }
      } catch (err) {
        console.warn(
          `[legal-pipeline] Retry: cost-benefit failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      break;
    }
    case 6: {
      // Legal Drafter
      const draftSlugs = await runDraftLayer({
        ctx,
        queue,
        engine,
        caseSlug: data.case_slug,
        onTable,
        entities,
        forensicReport,
        legalGroundingMap,
        damageTable,
        deadlineCalendar,
        manualOverrides: data.manual_overrides,
        jurisdiction: data.jurisdiction ?? "at",
        verfahrenstyp:
          data.verfahrenstyp ??
          (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
        additionalOpponents: data.additional_opponents,
        nebenverfahren: data.nebenverfahren,
        sourceStamp,
      });
      state.layers[6]!.output_slugs = draftSlugs;

      // Re-run Sub-Layer 6.5: Counter-Argument (Opponent-Simulator) + Rebuttal
      const forensicSlug = state.layers[3]?.output_slugs?.[0];
      try {
        const counterResult = await runCounterArgumentLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          draftSlugs,
          forensicReportSlug: forensicSlug,
          jurisdiction: data.jurisdiction ?? "at",
          verfahrenstyp:
            data.verfahrenstyp ??
            (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
          sourceStamp,
          lawSourceIds,
        });
        const counterArguments = counterResult.counterArguments;
        state.counter_arguments = counterArguments;

        if (counterArguments.length > 0) {
          console.warn(
            `[legal-pipeline] Retry Layer 6.5: ${counterArguments.length} counter-arguments found ` +
              `(${counterArguments.filter((c) => c.severity === "kritisch").length} kritisch) — revising drafts`
          );
          const revisedSlugs = await runDraftRebuttalLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            draftSlugs,
            counterArguments,
            jurisdiction: data.jurisdiction ?? "at",
            verfahrenstyp:
              data.verfahrenstyp ??
              (onTable.length > 0 ? (onTable[0]?.verfahrenstyp ?? "sonstiges") : "sonstiges"),
            parteirolle:
              data.parteirolle ??
              detectParteirolle(entities, { client: data.manual_overrides?.client }),
            additionalOpponents: data.additional_opponents,
            nebenverfahren: data.nebenverfahren,
            sourceStamp,
            lawSourceIds,
          });
          state.layers[6]!.output_slugs = revisedSlugs;
        }
      } catch (err) {
        console.warn(
          `[legal-pipeline] Retry: counter-argument layer failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      break;
    }
    default:
      console.warn(`[legal-pipeline] rerunSpecificLayer: Layer ${layerNum} is not retryable`);
  }

  // Persist updated state
  await persistPipelineState(engine, stateSlug, state, sourceStamp);
}

/**
 * Write the ensemble quality audit page with all 3 model verdicts + consensus.
 */
async function writeEnsembleQualityAuditPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  verdict: EnsembleCriticVerdict,
  sourceStamp?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Quality Audit — ${caseSlug}"`);
  lines.push(`type: quality_audit`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`ensemble_recommendation: ${verdict.consensus.recommendation}`);
  lines.push(`ensemble_score: ${verdict.consensus.total_score}`);
  lines.push(`retry_count: ${verdict.retry_count}`);
  lines.push("---");
  lines.push("");
  lines.push("## Ensemble Critic Verdict (3-Model Consensus)");
  lines.push("");
  lines.push(`**Consensus Recommendation:** ${verdict.consensus.recommendation}`);
  lines.push(`**Consensus Score:** ${verdict.consensus.total_score}/100 (min of all models)`);
  lines.push(`**Retry Count:** ${verdict.retry_count}/${MAX_CRITIC_RETRIES}`);
  lines.push("");
  lines.push("### Per-Model Verdicts");
  lines.push("");
  lines.push("| Model | Score | Recommendation | Issues |");
  lines.push("|-------|-------|----------------|--------|");
  for (const m of verdict.models) {
    lines.push(`| ${m.model} | ${m.total_score} | ${m.recommendation} | ${m.issues.length} |`);
  }
  lines.push("");
  lines.push("### Per-Layer Scores (min across models)");
  lines.push("");
  lines.push("| Layer | Score |");
  lines.push("|-------|-------|");
  for (const [layer, score] of Object.entries(verdict.consensus.layer_scores).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    lines.push(`| ${layer} | ${score} |`);
  }
  lines.push("");
  lines.push("### Issues (union across all models)");
  lines.push("");
  if (verdict.consensus.issues.length === 0) {
    lines.push("_No issues found._");
  } else {
    for (const issue of verdict.consensus.issues) {
      lines.push(`- ${issue}`);
    }
  }

  // ── Gap 5: Narrative Coherence ──
  if (typeof verdict.consensus.narrative_coherence_score === "number") {
    lines.push("");
    lines.push("### Narrative Kohärenz (Gap 5)");
    lines.push("");
    lines.push(`**Coherence Score:** ${verdict.consensus.narrative_coherence_score}/100`);
    if (verdict.consensus.central_thesis) {
      lines.push(`**Central Thesis:** ${verdict.consensus.central_thesis}`);
    }
    if (
      verdict.consensus.coherence_violations &&
      verdict.consensus.coherence_violations.length > 0
    ) {
      lines.push("");
      lines.push("**Kohärenz-Verletzungen:**");
      for (const v of verdict.consensus.coherence_violations) {
        lines.push(`- ${v}`);
      }
    }
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "quality_audit",
      title: parsed.title ?? `Quality Audit — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId: sourceStamp }
  );
}

// ── Critic Layer (Legacy Single-Model — kept for fallback) ────────────────

async function runCriticLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  partSlugs: string[];
  state: PipelineState;
  legalGroundingMap?: LegalGroundingEntry[];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    partSlugs,
    state,
    legalGroundingMap,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;
  const def = resolveSpecialist("legal-critic");
  if (!def) throw new Error("legal-pipeline: legal-critic specialist not found");

  // Collect all output slugs for the critic to review
  const outputSlugs: string[] = [];
  for (const layer of Object.values(state.layers)) {
    if (layer.output_slugs) outputSlugs.push(...layer.output_slugs);
  }

  const prompt = [
    "Überprüfe alle Pipeline-Outputs für diese Akte auf Halluzinationen, Citation-Accuracy und Vollständigkeit.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Output-Pages: ${outputSlugs.join(", ")}`,
    `Original-Akt Sub-Pages: ${partSlugs.join(", ")}`,
    "",
    "Lade jede Page mit get_page und prüfe:",
    "1. Jede Behauptung hat ein wörtliches Zitat, das im Originalakt vorkommt",
    "2. Jede ON-Nummer existiert in der ON-Tabelle",
    "3. Jede Personen-Referenz existiert in der Entity-Tabelle",
    "4. Jeder Betrag kommt als Ziffer im Originalakt vor",
    "5. Jede §-Angabe ist verifizierbar (gegen Legal Grounding Map und Brain)",
    "6. Keine Fristen wurden berechnet (alle verbatim)",
    "7. Legal Grounding Map: alle §§ wurden durch search/get_page verifiziert",
    "",
    "Gib ein JSON zurück:",
    '{ "total_score": 0-100, "recommendation": "publish|revise|reject", "issues": [...], "layer_scores": { "1": 90, "2": 85, ... } }',
  ].join("\n");

  const childData: Record<string, unknown> = {
    prompt,
    subagent_def: "legal-critic",
    max_turns: def.maxTurns ?? MAX_TURNS_DEFAULT,
  };
  if (def.model) childData.model = def.model;
  if (sourceStamp) childData._source_id = sourceStamp;
  if (lawSourceIds) childData._source_ids = lawSourceIds;

  // T5.4: ensemble-critic is mandatory — on_child_fail: "fail"
  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: getChildFailPolicy("ensemble-critic"),
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  const auditSlug = `quality-audits/${caseSlug}`;
  await writeQualityAuditPage(engine, auditSlug, caseSlug, result, sourceStamp);
  return auditSlug;
}

// ── Contradiction Probe Auto-Trigger ────────────────────────

async function runContradictionProbeAuto(opts: {
  engine: BrainEngine;
  caseSlug: string;
  state: PipelineState;
  partSlugs: string[];
  jurisdiction?: "at" | "de" | "ch" | "eu";
  verfahrenstyp?: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<{ run_id: string; total_findings: number } | null> {
  const {
    engine,
    caseSlug,
    state,
    partSlugs,
    jurisdiction = "at",
    verfahrenstyp = "sonstiges",
    sourceStamp,
    lawSourceIds,
  } = opts;

  // Collect all output slugs from pipeline layers
  const outputSlugs: string[] = [];
  for (const layer of Object.values(state.layers)) {
    if (layer.output_slugs) outputSlugs.push(...layer.output_slugs);
  }

  if (outputSlugs.length === 0) return null;

  // Generate queries from pipeline output pages — use the first 200 chars
  // of each page's compiled_truth as a search query. The probe will retrieve
  // similar chunks and judge them for contradictions.
  const queries: string[] = [];
  for (const slug of outputSlugs) {
    try {
      const page = await engine.getPage(slug, { sourceId: sourceStamp });
      if (page?.compiled_truth) {
        const q = page.compiled_truth.replace(/\s+/g, " ").trim().slice(0, 200);
        if (q.length > 20) queries.push(q);
      }
    } catch {
      // skip unreadable pages
    }
  }

  // Also add queries from the original case sub-pages
  for (const slug of partSlugs) {
    try {
      const page = await engine.getPage(slug, { sourceId: sourceStamp });
      if (page?.compiled_truth) {
        const q = page.compiled_truth.replace(/\s+/g, " ").trim().slice(0, 200);
        if (q.length > 20) queries.push(q);
      }
    } catch {
      // skip unreadable pages
    }
  }

  if (queries.length === 0) return null;

  // Inject verfahrenstyp-specific context query to focus contradiction
  // detection on the relevant legal domain (straf vs zivil vs arbeitsrecht).
  const verfahrenstypQuery =
    verfahrenstyp === "straf"
      ? `Strafverfahren ${jurisdiction}: Tatbestand Rechtswidrigkeit Schuld Beweisverwertung`
      : verfahrenstyp === "zivil"
        ? `Zivilverfahren ${jurisdiction}: Anspruchsvoraussetzungen Kausalität Schadensersatz Verjährung`
        : verfahrenstyp === "arbeitsrecht"
          ? `Arbeitsrecht ${jurisdiction}: Kündigungsschutz Mitbestimmung Sozialplan`
          : verfahrenstyp === "verwaltungsrecht"
            ? `Verwaltungsrecht ${jurisdiction}: Bescheid Ermessen Verhältnismäßigkeit`
            : `Rechtsstreit ${jurisdiction}`;
  queries.unshift(verfahrenstypQuery);

  // Cap at 30 queries to keep cost reasonable
  const cappedQueries = queries.slice(0, 30);

  try {
    const probeResult = await runContradictionProbe({
      engine,
      queries: cappedQueries,
      topK: 5,
      budgetUsd: 3.0,
      yesOverride: true,
      noCache: false,
    });

    // Persist to eval_contradictions_runs table
    await writeRunRow(engine, probeResult.report, probeResult.report.duration_ms);

    return {
      run_id: probeResult.report.run_id,
      total_findings: probeResult.report.total_contradictions_flagged,
    };
  } catch (err) {
    console.warn(
      `[legal-pipeline] Contradiction probe auto-trigger failed (non-blocking): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

// ── Child Result Collector ──────────────────────────────────

async function waitForChild(ctx: MinionJobContext, childId: number): Promise<unknown> {
  const deadline = Date.now() + CHILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const messages = await ctx.readInbox();
    for (const m of messages) {
      const payload = parseChildDone(m.payload);
      if (payload && payload.child_id === childId) {
        if (payload.outcome === "complete") return payload.result;
        throw new Error(`Child ${childId} failed: ${payload.error ?? "unknown error"}`);
      }
    }
    await sleep(3000);
  }
  throw new Error(`Child ${childId} timed out after ${CHILD_TIMEOUT_MS / 1000}s`);
}

function parseChildDone(
  payload: unknown
): { child_id: number; outcome: string; result: unknown; error: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.child_id !== "number") return null;
  return {
    child_id: p.child_id,
    outcome: String(p.outcome ?? "failed"),
    result: p.result,
    error: typeof p.error === "string" ? p.error : null,
  };
}

// ── Batching ────────────────────────────────────────────────

function batchTexts(
  texts: string[],
  batchSize: number
): Array<{ text: string; indices: number[] }> {
  const batches: Array<{ text: string; indices: number[] }> = [];
  let currentText = "";
  let currentIndices: number[] = [];
  let currentCount = 0;

  for (let i = 0; i < texts.length; i++) {
    currentText += (currentText ? "\n\n" : "") + texts[i]!;
    currentIndices.push(i);
    currentCount++;
    if (currentCount >= batchSize) {
      batches.push({ text: currentText, indices: currentIndices });
      currentText = "";
      currentIndices = [];
      currentCount = 0;
    }
  }
  if (currentText.trim()) {
    batches.push({ text: currentText, indices: currentIndices });
  }
  return batches;
}

// ── Prompt Builders ─────────────────────────────────────────

function buildMapPrompt(
  text: string,
  contextJson: string,
  batchNum: number,
  totalBatches: number,
  specialistName: string
): string {
  const lines: string[] = [];
  if (contextJson) {
    lines.push("## KONTEXT (aus vorherigen Layern)");
    lines.push(contextJson);
    lines.push("");
  }
  lines.push(`## AKTEN-TEXT (Teil ${batchNum}/${totalBatches})`);
  lines.push(text);
  lines.push("");
  lines.push(
    `Analysiere diesen Teil und gib JSON zurück. Berücksichtige den Kontext aus vorherigen Layern.`
  );
  return lines.join("\n");
}

function buildReducePrompt(
  mapResults: MapResult[],
  specialistName: string,
  contextJson: string
): string {
  const lines: string[] = [];
  lines.push("## REDUCE — Führe alle Teil-Ergebnisse zusammen");
  lines.push("");
  if (contextJson) {
    lines.push("## KONTEXT (aus vorherigen Layern)");
    lines.push(contextJson);
    lines.push("");
  }
  lines.push("## TEIL-ERGEBNISSE (Map-Phase)");
  for (const mr of mapResults) {
    const text = typeof mr.result === "string" ? mr.result : JSON.stringify(mr.result, null, 2);
    lines.push(`### Batch ${mr.batch_idx + 1}`);
    lines.push(text);
    lines.push("");
  }
  lines.push(
    "Führe alle Teil-Ergebnisse zusammen. Dedupliziere, sortiere nach ON-Nummer, synthetisiere zu einem Gesamtergebnis."
  );
  return lines.join("\n");
}

function buildDraftPrompt(pkg: DraftPackage, caseSlug: string, contextJson: string): string {
  const lines: string[] = [];
  lines.push(`Erstelle einen Entwurf für: ${pkg.title}`);
  lines.push(`Akte: ${caseSlug}`);
  lines.push("");
  lines.push("## KONTEXT");
  lines.push(contextJson);
  lines.push("");
  lines.push(
    "Formuliere präzise, formell und gerichtssicher. Kennzeichne Platzhalter mit [PLATZHALTER]."
  );
  lines.push("Zitiere ON-Nummern und §§ korrekt. Jede Behauptung muss durch den Akt belegt sein.");
  if (pkg.hinweis) {
    lines.push("");
    lines.push(`## PAKET-HINWEIS\n${pkg.hinweis}`);
  }
  return lines.join("\n");
}

// ── Types for structured outputs ────────────────────────────

/** Strukturierte Geschäftszahl nach § 372 GVgo (österreichisches Aktenzeichen). */
interface Geschaeftszahl {
  abteilung?: string;
  gattungszeichen?: string;
  aktenzahl?: string;
  jahr?: string;
  pruefzeichen?: string;
  on?: string;
  raw?: string;
}

/** Beilagen-Typ nach § 379 GVgo. */
type BeilagenTyp = "klaeger" | "gegner" | "dritt" | null;

/** Verfahrenstyp abgeleitet vom Gattungszeichen. */
type VerfahrensTyp = "zivil" | "straf" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";

interface OnEntry {
  on_nummer: string;
  datum: string;
  typ: string;
  seiten: string;
  personen: string[];
  verfahren?: string;
  anwaelte?: string[];
  quote: string;
  /** Thematische Mappe bei Strafakten (StPO): "Anordnungsbogen", "Haftangelegenheiten", "Gebühren", "Beweismittel", "Berichte", "Verschlusssachen", etc. */
  mappe?: string;
  /** Mappen-Buchstabe: A (blau), H (rot), G (gelb), B/C/D... (weiß) — § 87 StPO */
  mappen_buchstabe?: string;
  /** Beilagen-Klassifikation nach § 379 GVgo: klaeger (A,B,C), gegner (1,2,3), dritt (I,II,III) */
  beilagen_typ?: BeilagenTyp;
  /** Beilagen-Kennung: "A", "B", "1", "2", "I", "II", etc. */
  beilagen_kennung?: string;
  /** Strukturierte Geschäftszahl (Aktenzeichen + ON) */
  geschaeftszahl?: Geschaeftszahl;
  /** Verfahrenstyp: zivil, straf, arbeitsrecht, verwaltungsrecht */
  verfahrenstyp?: VerfahrensTyp;
  /** ON-Nummern, die in diesem Dokument referenziert werden (z.B. "ON 1.34 urgiert ON 54") — Gap 1: ON-Querverweis-Graph */
  references?: string[];
}

interface EntityEntry {
  name: string;
  type: string;
  role: string;
  aliases: string[];
  on_references: string[];
  quote: string;
  metadata?: Record<string, unknown>;
  /** What is this person accused of? (Vorwürfe — verbatim from the act) */
  accusations?: string[];
  /** Brief description of the person's involvement in the case */
  context_description?: string;
  /** For lawyers: which person/party they represent */
  represents?: string;
  /** Which procedures (Aktenzeichen) this person appears in — for cross-case linking */
  verfahren_refs?: string[];
}

interface ForensicReport {
  summary: Record<string, unknown>;
  chronologie: Array<Record<string, unknown>>;
  unterlassene_massnahmen: Array<Record<string, unknown>>;
  nicht_vernommene_personen: Array<Record<string, unknown>>;
  geldfluss: Array<Record<string, unknown>>;
  amtshaftungspunkte: Array<Record<string, unknown>>;
  verfahrensverstoesse_gegenseite?: Array<Record<string, unknown>>;
}

interface DamageEntry {
  position: string;
  topf: string;
  betrag: number;
  waehrung: string;
  beleg_on: string;
  beleg_seite?: string;
  beleg_quote: string;
  status: string;
  begruendung: string;
}

interface DeadlineEntry {
  datum: string;
  ampel: string;
  frist: string;
  rechtsgrundlage?: string;
  folge_bei_versaeumnis: string;
  beleg_on: string;
  beleg_quote: string;
}

interface MatchedParagraph {
  paragraph: string;
  statute: string;
  source_text?: string;
  confidence: string;
  verified: boolean;
  // Backend-authoritative provenance fields (never trusted from the LLM)
  source_slug?: string;
  source_url?: string;
  snapshot_hash?: string;
  valid_from?: string;
  valid_to?: string | null;
  evidence_start?: number;
  evidence_end?: number;
}

interface LegalGroundingEntry {
  finding: string;
  finding_type: string;
  on_reference: string;
  quote: string;
  matched_paragraphs: MatchedParagraph[];
}

// ── Extraction helpers ──────────────────────────────────────

function extractOnEntries(result: unknown): OnEntry[] {
  const parsed =
    typeof result === "string" ? tryParseJSON(result) : (result as Record<string, unknown> | null);
  if (!parsed) return [];
  const entries = parsed.on_entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (e): e is OnEntry =>
        e != null &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).on_nummer === "string" &&
        typeof (e as Record<string, unknown>).quote === "string"
    )
    .map((e) => {
      const raw = e as unknown as Record<string, unknown>;
      // Parse structured geschaeftszahl if the LLM provided it
      let gz: Geschaeftszahl | undefined;
      if (raw.geschaeftszahl && typeof raw.geschaeftszahl === "object") {
        const g = raw.geschaeftszahl as Record<string, unknown>;
        gz = {
          abteilung: typeof g.abteilung === "string" ? g.abteilung : undefined,
          gattungszeichen: typeof g.gattungszeichen === "string" ? g.gattungszeichen : undefined,
          aktenzahl: typeof g.aktenzahl === "string" ? g.aktenzahl : undefined,
          jahr: typeof g.jahr === "string" ? g.jahr : undefined,
          pruefzeichen: typeof g.pruefzeichen === "string" ? g.pruefzeichen : undefined,
          on: typeof g.on === "string" ? g.on : undefined,
          raw: typeof g.raw === "string" ? g.raw : undefined,
        };
      }
      // Derive verfahrenstyp from gattungszeichen if not explicitly set
      let verfahrenstyp: VerfahrensTyp | undefined;
      const gzStr = gz?.gattungszeichen ?? (raw.verfahren as string | undefined);
      if (gzStr) {
        verfahrenstyp = inferVerfahrensTyp(gzStr);
      }
      // Normalize beilagen_typ
      let beilagen_typ: BeilagenTyp = null;
      const bt = raw.beilagen_typ;
      if (bt === "klaeger" || bt === "gegner" || bt === "dritt") {
        beilagen_typ = bt;
      }
      return {
        ...e,
        mappe: typeof raw.mappe === "string" ? raw.mappe : undefined,
        mappen_buchstabe:
          typeof raw.mappen_buchstabe === "string" ? raw.mappen_buchstabe : undefined,
        beilagen_typ,
        beilagen_kennung:
          typeof raw.beilagen_kennung === "string" ? raw.beilagen_kennung : undefined,
        geschaeftszahl: gz,
        verfahrenstyp,
        references: Array.isArray(raw.references)
          ? raw.references.filter((r): r is string => typeof r === "string")
          : undefined,
      } as OnEntry;
    });
}

/** Infer verfahrenstyp from Gattungszeichen (§ 373 GVgo). */
function inferVerfahrensTyp(gz: string): VerfahrensTyp {
  const lower = gz.toLowerCase().trim();
  // Strafsachen: Vr (Vorverfahren), St (Strafsachen), Os (Oberster Gerichtshof Straf), Ne (Nichtigkeitsbeschwerde)
  if (/^(vr|st|os|ne|gj)/.test(lower)) return "straf";
  // Arbeitsrecht: Ra (Revisionsarbeitsrecht), Ag (Arbeitsgericht), Ga (Gewerkschaftsarbeitsgericht)
  if (/^(ra|ag|ga)/.test(lower)) return "arbeitsrecht";
  // Verwaltungsrechtlich: Vw (Verwaltungsgericht), Vg (Verwaltungsgerichtshof)
  if (/^(vw|vg)/.test(lower)) return "verwaltungsrecht";
  // Zivil: C, D, F, G, H, P, N, M, T, U, E, B, K, L, S, R, W, Y, Z
  if (/^[a-z]{1,3}$/.test(lower)) return "zivil";
  return "sonstiges";
}

function extractEntityEntries(result: unknown): EntityEntry[] {
  const parsed =
    typeof result === "string" ? tryParseJSON(result) : (result as Record<string, unknown> | null);
  if (!parsed) return [];
  const entities = parsed.entities;
  if (!Array.isArray(entities)) return [];
  return entities.filter(
    (e): e is EntityEntry =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).name === "string" &&
      typeof (e as Record<string, unknown>).quote === "string"
  );
}

function extractForensicReport(result: unknown): ForensicReport {
  const parsed =
    typeof result === "string" ? tryParseJSON(result) : (result as Record<string, unknown> | null);
  if (!parsed)
    return {
      summary: {},
      chronologie: [],
      unterlassene_massnahmen: [],
      nicht_vernommene_personen: [],
      geldfluss: [],
      amtshaftungspunkte: [],
      verfahrensverstoesse_gegenseite: [],
    };
  return {
    summary: (parsed.summary as Record<string, unknown>) ?? {},
    chronologie: Array.isArray(parsed.chronologie) ? parsed.chronologie : [],
    unterlassene_massnahmen: Array.isArray(parsed.unterlassene_massnahmen)
      ? parsed.unterlassene_massnahmen
      : [],
    nicht_vernommene_personen: Array.isArray(parsed.nicht_vernommene_personen)
      ? parsed.nicht_vernommene_personen
      : [],
    geldfluss: Array.isArray(parsed.geldfluss) ? parsed.geldfluss : [],
    amtshaftungspunkte: Array.isArray(parsed.amtshaftungspunkte) ? parsed.amtshaftungspunkte : [],
    verfahrensverstoesse_gegenseite: Array.isArray(parsed.verfahrensverstoesse_gegenseite)
      ? parsed.verfahrensverstoesse_gegenseite
      : [],
  };
}

function extractDamageResult(result: unknown): {
  damage_table: DamageEntry[];
  deadline_calendar: DeadlineEntry[];
} {
  const parsed =
    typeof result === "string" ? tryParseJSON(result) : (result as Record<string, unknown> | null);
  if (!parsed) return { damage_table: [], deadline_calendar: [] };
  return {
    damage_table: Array.isArray(parsed.damage_table) ? (parsed.damage_table as DamageEntry[]) : [],
    deadline_calendar: Array.isArray(parsed.deadline_calendar)
      ? (parsed.deadline_calendar as DeadlineEntry[])
      : [],
  };
}

function extractLegalGroundingMap(result: unknown): LegalGroundingEntry[] {
  const parsed =
    typeof result === "string" ? tryParseJSON(result) : (result as Record<string, unknown> | null);
  if (!parsed) return [];
  const entries = parsed.grounding_entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e): e is LegalGroundingEntry =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).finding === "string" &&
      Array.isArray((e as Record<string, unknown>).matched_paragraphs)
  );
}

// ── Validation (Cross-Layer) ────────────────────────────────

async function validateOnEntries(entries: OnEntry[], allText: string): Promise<string[]> {
  const haystack = normalizeForMatch(allText);
  const errors: string[] = [];
  const validMappenBuchstaben = new Set([
    "A",
    "H",
    "G",
    "B",
    "C",
    "D",
    "E",
    "F",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
  ]);
  for (const e of entries) {
    const q = normalizeForMatch(e.quote);
    if (q.length >= 8 && !haystack.includes(q)) {
      errors.push(`ON ${e.on_nummer}: Zitat nicht im Originalakt gefunden`);
    }
    // Validate mappen_buchstabe: if present, must be a single uppercase letter
    if (e.mappen_buchstabe) {
      const mb = e.mappen_buchstabe.toUpperCase();
      if (!validMappenBuchstaben.has(mb)) {
        errors.push(`ON ${e.on_nummer}: Ungültiger Mappen-Buchstabe "${e.mappen_buchstabe}"`);
      }
    }
    // Validate beilagen_kennung: if beilagen_typ is set, kennung must be present
    if (e.beilagen_typ && e.beilagen_typ !== null && !e.beilagen_kennung) {
      errors.push(
        `ON ${e.on_nummer}: beilagen_typ "${e.beilagen_typ}" gesetzt aber beilagen_kennung fehlt`
      );
    }
    // Validate beilagen_kennung format matches beilagen_typ
    if (e.beilagen_typ === "klaeger" && e.beilagen_kennung) {
      if (!/^[A-Z]$/.test(e.beilagen_kennung)) {
        errors.push(
          `ON ${e.on_nummer}: Kläger-Beilagenkennung muss ein Großbuchstabe sein (A-Z), ist "${e.beilagen_kennung}"`
        );
      }
    } else if (e.beilagen_typ === "gegner" && e.beilagen_kennung) {
      if (!/^\d+$/.test(e.beilagen_kennung)) {
        errors.push(
          `ON ${e.on_nummer}: Gegner-Beilagenkennung muss eine Zahl sein (1,2,3...), ist "${e.beilagen_kennung}"`
        );
      }
    } else if (e.beilagen_typ === "dritt" && e.beilagen_kennung) {
      if (!/^[IVXLCDM]+$/.test(e.beilagen_kennung)) {
        errors.push(
          `ON ${e.on_nummer}: Dritt-Beilagenkennung muss römische Ziffern sein (I,II,III...), ist "${e.beilagen_kennung}"`
        );
      }
    }
    // Validate geschaeftszahl components if present
    if (e.geschaeftszahl) {
      const gz = e.geschaeftszahl;
      if (gz.aktenzahl && !/^\d{1,5}$/.test(gz.aktenzahl)) {
        errors.push(
          `ON ${e.on_nummer}: Aktenzahl muss 1-5 stellig numerisch sein, ist "${gz.aktenzahl}"`
        );
      }
      if (gz.jahr && !/^\d{2,4}$/.test(gz.jahr)) {
        errors.push(`ON ${e.on_nummer}: Jahresangabe muss 2-4 stellig sein, ist "${gz.jahr}"`);
      }
      if (gz.pruefzeichen && !/^[a-z]$/.test(gz.pruefzeichen)) {
        errors.push(
          `ON ${e.on_nummer}: Prüfzeichen muss ein Kleinbuchstabe sein, ist "${gz.pruefzeichen}"`
        );
      }
    }
  }
  return errors;
}

async function validateEntityEntries(entities: EntityEntry[], allText: string): Promise<string[]> {
  const haystack = normalizeForMatch(allText);
  const errors: string[] = [];
  for (const e of entities) {
    const q = normalizeForMatch(e.quote);
    if (q.length >= 8 && !haystack.includes(q)) {
      errors.push(`Entity "${e.name}": Zitat nicht im Originalakt gefunden`);
    }
  }
  return errors;
}

async function validateForensicReport(
  report: ForensicReport,
  onTable: OnEntry[],
  entities: EntityEntry[],
  allText: string
): Promise<string[]> {
  const haystack = normalizeForMatch(allText);
  const validOns = new Set(onTable.map((e) => e.on_nummer));
  const validNames = new Set(
    entities.flatMap((e) => [e.name, ...e.aliases].map((n) => n.toLowerCase()))
  );
  const errors: string[] = [];

  const checkItems = (items: Array<Record<string, unknown>>, label: string) => {
    for (const item of items) {
      const quote = typeof item.quote === "string" ? normalizeForMatch(item.quote) : "";
      if (quote.length >= 8 && !haystack.includes(quote)) {
        errors.push(`Forensic ${label}: Zitat nicht im Originalakt gefunden`);
      }
      const on =
        typeof item.on === "string"
          ? item.on
          : typeof item.beantragt_on === "string"
            ? item.beantragt_on
            : undefined;
      if (on && !validOns.has(on)) {
        errors.push(`Forensic ${label}: ON "${on}" nicht in ON-Tabelle`);
      }
      const name = typeof item.name === "string" ? item.name.toLowerCase() : undefined;
      if (name && !validNames.has(name)) {
        errors.push(`Forensic ${label}: Name "${item.name}" nicht in Entity-Tabelle`);
      }
    }
  };

  checkItems(report.chronologie, "chronologie");
  checkItems(report.unterlassene_massnahmen, "unterlassene_massnahmen");
  checkItems(report.nicht_vernommene_personen, "nicht_vernommene_personen");
  checkItems(report.geldfluss, "geldfluss");
  checkItems(report.amtshaftungspunkte, "amtshaftungspunkte");
  return errors;
}

async function validateDamageTable(
  entries: DamageEntry[],
  onTable: OnEntry[],
  allText: string
): Promise<string[]> {
  const haystack = normalizeForMatch(allText);
  const validOns = new Set(onTable.map((e) => e.on_nummer));
  const errors: string[] = [];

  for (const e of entries) {
    const q = normalizeForMatch(e.beleg_quote);
    if (q.length >= 8 && !haystack.includes(q)) {
      errors.push(`Damage "${e.position}": Zitat nicht im Originalakt gefunden`);
    }
    if (e.beleg_on && !validOns.has(e.beleg_on)) {
      errors.push(`Damage "${e.position}": ON "${e.beleg_on}" nicht in ON-Tabelle`);
    }
    // Amount check: betrag must appear in text (with variant formatting)
    if (typeof e.betrag === "number" && e.betrag > 0) {
      const variants = formatAmountVariants(e.betrag);
      if (!variants.some((v) => haystack.includes(normalizeForMatch(v)))) {
        errors.push(`Damage "${e.position}": Betrag ${e.betrag} nicht im Originalakt gefunden`);
      }
    }
  }
  return errors;
}

/**
 * Gap 4: Detect potential double-counting in damage positions.
 *
 * Compares all pairs of damage entries for:
 * - Similar amounts (within 5% of each other) in the same topf
 * - Overlapping ON references (same beleg_on)
 * - Similar position descriptions (token overlap > 60%)
 *
 * Returns warnings (not errors — these are potential overlaps, not certain ones).
 */
function detectDamageOverlaps(entries: DamageEntry[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const key = `${i}-${j}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const reasons: string[] = [];

      // Check 1: Same topf + similar amount (within 5%)
      if (a.topf === b.topf && a.betrag > 0 && b.betrag > 0) {
        const ratio = Math.min(a.betrag, b.betrag) / Math.max(a.betrag, b.betrag);
        if (ratio > 0.95) {
          reasons.push(
            `ähnlicher Betrag: ${a.betrag} vs ${b.betrag} (${(ratio * 100).toFixed(0)}% overlap)`
          );
        }
      }

      // Check 2: Same beleg_on
      if (a.beleg_on && b.beleg_on && a.beleg_on === b.beleg_on) {
        reasons.push(`gleicher Beleg: ${a.beleg_on}`);
      }

      // Check 3: Token overlap in position description > 60%
      const tokensA = new Set(
        a.position
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3)
      );
      const tokensB = new Set(
        b.position
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3)
      );
      if (tokensA.size > 0 && tokensB.size > 0) {
        const intersection = [...tokensA].filter((t) => tokensB.has(t));
        const union = new Set([...tokensA, ...tokensB]);
        const overlap = intersection.length / union.size;
        if (overlap > 0.6) {
          reasons.push(
            `ähnliche Beschreibung: "${a.position}" vs "${b.position}" (${(overlap * 100).toFixed(0)}% overlap)`
          );
        }
      }

      if (reasons.length > 0) {
        warnings.push(
          `Mögliche Doppelzählung: "${a.position}" (${a.topf}, ${a.betrag} ${a.waehrung}) ↔ "${b.position}" (${b.topf}, ${b.betrag} ${b.waehrung}) — ${reasons.join(", ")}`
        );
      }
    }
  }
  return warnings;
}

async function validateDeadlineCalendar(
  entries: DeadlineEntry[],
  onTable: OnEntry[],
  allText: string
): Promise<string[]> {
  const haystack = normalizeForMatch(allText);
  const validOns = new Set(onTable.map((e) => e.on_nummer));
  const errors: string[] = [];

  for (const e of entries) {
    const q = normalizeForMatch(e.beleg_quote);
    if (q.length >= 8 && !haystack.includes(q)) {
      errors.push(`Deadline "${e.frist}": Zitat nicht im Originalakt gefunden`);
    }
    if (e.beleg_on && !validOns.has(e.beleg_on)) {
      errors.push(`Deadline "${e.frist}": ON "${e.beleg_on}" nicht in ON-Tabelle`);
    }
    // Datum must appear verbatim in text
    if (e.datum && !haystack.includes(normalizeForMatch(e.datum))) {
      errors.push(`Deadline "${e.frist}": Datum "${e.datum}" nicht im Originalakt gefunden`);
    }
  }
  return errors;
}

/** Known statutory limitation periods per jurisdiction (AP-6). */
const STATUTORY_LIMITATION_PERIODS: Record<
  string,
  Array<{
    paragraph: string;
    law: string;
    years: number;
    description: string;
  }>
> = {
  at: [
    { paragraph: "§ 1489", law: "ABGB", years: 3, description: "Allgemeine Verjährung" },
    {
      paragraph: "§ 6",
      law: "AHG",
      years: 3,
      description: "Verjährung von Amtshaftungsansprüchen",
    },
    { paragraph: "Art 82", law: "DSGVO", years: 3, description: "Datenschutz Schadensersatz" },
  ],
  de: [
    { paragraph: "§ 195", law: "BGB", years: 3, description: "Regelmäßige Verjährung" },
    {
      paragraph: "§ 852",
      law: "BGB",
      years: 30,
      description: "Haftung bei Vorsatz (Schadensersatz)",
    },
    { paragraph: "Art 82", law: "DSGVO", years: 3, description: "Datenschutz Schadensersatz" },
  ],
  ch: [
    { paragraph: "Art 127", law: "OR", years: 10, description: "Allgemeine Verjährung" },
    {
      paragraph: "Art 60",
      law: "OR",
      years: 10,
      description: "Schadensersatz aus unerlaubter Handlung",
    },
    {
      paragraph: "Art 82",
      law: "DSGVO",
      years: 3,
      description: "Datenschutz Schadensersatz (falls anwendbar)",
    },
  ],
  eu: [{ paragraph: "Art 82", law: "DSGVO", years: 3, description: "Datenschutz Schadensersatz" }],
};

/**
 * Deterministic deadline statutory cross-check (AP-6).
 *
 * Zero-cost complement to the LLM-based deadline-validator (Layer 5b).
 * Verifies that:
 *   1. Each deadline's `rechtsgrundlage` contains a §-citation
 *   2. The cited law abbreviation is a known law (in KNOWN_LAWS)
 *   3. The deadline date is not in the past (basic date parsing)
 *   4. The `ampel` status is consistent with the date
 *   5. The deadline's statutory basis matches known limitation periods
 *
 * Returns warnings (not errors) — these are advisory flags that
 * surface in pipeline state for attorney review.
 */
function crossCheckDeadlineStatutory(entries: DeadlineEntry[], jurisdiction: string): string[] {
  const warnings: string[] = [];
  const now = new Date();
  const knownLaws = KNOWN_LAWS;
  const knownPeriods = STATUTORY_LIMITATION_PERIODS[jurisdiction] ?? [];

  for (const e of entries) {
    // Check 1: rechtsgrundlage must contain a § citation
    if (e.rechtsgrundlage && e.rechtsgrundlage.trim().length > 0) {
      const hasCitation = /§§?\s*\d+/i.test(e.rechtsgrundlage);
      if (!hasCitation) {
        warnings.push(
          `Deadline "${e.frist}": rechtsgrundlage "${e.rechtsgrundlage}" enthält keine §-Zitat`
        );
      } else {
        // Check 2: extract law abbreviation and verify it's known
        const lawMatch = e.rechtsgrundlage.match(
          /§§?\s*\d+[a-z]?\s*(?:Abs\.\s*\d+)?\s*(?:Satz\s*\d+)?\s*([A-Z][A-Za-z]{1,10})\b/
        );
        if (lawMatch) {
          const law = lawMatch[1];
          if (!knownLaws.has(law)) {
            warnings.push(
              `Deadline "${e.frist}": rechtsgrundlage zitiert unbekanntes Gesetz "${law}"`
            );
          }
        }
      }
    } else {
      warnings.push(`Deadline "${e.frist}": keine rechtsgrundlage angegeben`);
    }

    // Check 3: deadline date not in the past
    if (e.datum) {
      const parsed = new Date(e.datum);
      if (!isNaN(parsed.getTime())) {
        if (parsed < now) {
          const daysPast = Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
          warnings.push(
            `Deadline "${e.frist}": Datum "${e.datum}" liegt ${daysPast} Tag(e) in der Vergangenheit`
          );
        }
        // Check 4: ampel consistency — if date is past but ampel is green, flag
        if (parsed < now && (e.ampel === "grün" || e.ampel === "green" || e.ampel === "ok")) {
          warnings.push(
            `Deadline "${e.frist}": Datum in der Vergangenheit aber ampel="${e.ampel}" — inkonsistent`
          );
        }
      }
    }

    // Check 5: cross-reference against known statutory limitation periods
    if (e.rechtsgrundlage && knownPeriods.length > 0) {
      const matchedPeriod = knownPeriods.find(
        (p) => e.rechtsgrundlage!.includes(p.paragraph) && e.rechtsgrundlage!.includes(p.law)
      );
      if (matchedPeriod && e.datum) {
        const parsed = new Date(e.datum);
        if (!isNaN(parsed.getTime())) {
          const yearsUntilDeadline =
            (parsed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          if (yearsUntilDeadline > matchedPeriod.years + 1) {
            warnings.push(
              `Deadline "${e.frist}": Frist liegt ${yearsUntilDeadline.toFixed(1)} Jahre in der Zukunft, aber ${matchedPeriod.paragraph} ${matchedPeriod.law} beträgt ${matchedPeriod.years} Jahre — möglicher Fristablauf`
            );
          }
        }
      }
    }
  }
  return warnings;
}

function formatAmountVariants(amount: number): string[] {
  const variants: string[] = [];
  variants.push(String(amount));
  variants.push(amount.toLocaleString("de-DE"));
  variants.push(amount.toLocaleString("en-US"));
  // With dots as thousand separators
  variants.push(amount.toLocaleString("de-DE").replace(/\./g, "."));
  return variants;
}

async function validateLegalGroundingMap(
  entries: LegalGroundingEntry[],
  onTable: OnEntry[]
): Promise<string[]> {
  const validOns = new Set(onTable.map((e) => e.on_nummer));
  const errors: string[] = [];

  for (const e of entries) {
    if (e.on_reference && !validOns.has(e.on_reference)) {
      errors.push(`Grounding "${e.finding}": ON "${e.on_reference}" nicht in ON-Tabelle`);
    }
    for (const mp of e.matched_paragraphs) {
      if (!mp.verified) {
        errors.push(`Grounding "${e.finding}": § "${mp.paragraph}" als nicht verifiziert markiert`);
      }
      if (!mp.source_text || mp.source_text.trim().length < 10) {
        errors.push(`Grounding "${e.finding}": § "${mp.paragraph}" hat keinen source_text`);
      }
    }
  }
  return errors;
}

// ── Page Writers ────────────────────────────────────────────

async function writeOnIndexPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  entries: OnEntry[],
  sourceId?: string,
  gzKonsistenz?: KonsistenzErgebnis | null
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "ON-Verzeichnis — ${caseSlug}"`);
  lines.push(`type: on_index`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`total_on: ${entries.length}`);
  lines.push(`total_pages: 0`);
  if (gzKonsistenz) {
    lines.push(
      `gz_validated: ${gzKonsistenz.einheitlich && gzKonsistenz.befundeProGZ.every((v) => v.gueltig)}`
    );
    if (gzKonsistenz.leitzahl) {
      lines.push(`gz_leitzahl: "${gzKonsistenz.leitzahl}"`);
    }
    lines.push(`gz_einheitlich: ${gzKonsistenz.einheitlich}`);
    if (gzKonsistenz.abweichungen.length > 0) {
      lines.push(`gz_abweichungen: ${gzKonsistenz.abweichungen.length}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push("| ON | Datum | Typ | Seiten | Personen | Verfahren | Anwälte |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const e of entries) {
    lines.push(
      `| ${e.on_nummer} | ${e.datum} | ${e.typ} | ${e.seiten} | ${e.personen.join(", ")} | ${e.verfahren ?? ""} | ${(e.anwaelte ?? []).join(", ")} |`
    );
  }
  // ── Gap 1: ON-Querverweis-Graph ──
  const entriesWithRefs = entries.filter((e) => e.references && e.references.length > 0);
  if (entriesWithRefs.length > 0) {
    lines.push("");
    lines.push("## ON-Querverweise");
    lines.push("");
    lines.push("| ON | Referenziert |");
    lines.push("|---|---|");
    for (const e of entriesWithRefs) {
      lines.push(`| ${e.on_nummer} | ${(e.references ?? []).join(", ")} |`);
    }
  }
  // ── GZ validation report section ──
  if (gzKonsistenz && gzKonsistenz.befundeProGZ.length > 0) {
    lines.push("");
    lines.push("## GZ-Validierung");
    lines.push("");
    const hasFehler = gzKonsistenz.befundeProGZ.some((v) =>
      v.befunde.some((b) => b.schwere === "fehler")
    );
    const hasWarnung = gzKonsistenz.befundeProGZ.some((v) =>
      v.befunde.some((b) => b.schwere === "warnung")
    );
    if (gzKonsistenz.einheitlich && !hasFehler) {
      lines.push("> ✅ Alle Geschäftszahlen strukturell gültig und konsistent.");
    } else if (hasFehler) {
      lines.push(
        "> ⚠️ **Fehler** in der GZ-Validierung — OCR-Verdacht oder Inkonsistenz. Manuelle Prüfung erforderlich."
      );
    } else if (hasWarnung) {
      lines.push("> ⚠️ Warnungen in der GZ-Validierung — prüfen, aber nicht blockierend.");
    }
    lines.push("");
    lines.push("| GZ | Gültig | Befunde |");
    lines.push("|---|---|---|");
    for (const v of gzKonsistenz.befundeProGZ) {
      const befundText =
        v.befunde.length > 0 ? v.befunde.map((b) => `[${b.schwere}] ${b.meldung}`).join("; ") : "—";
      lines.push(`| ${v.raw} | ${v.gueltig ? "✅" : "❌"} | ${befundText} |`);
    }
    if (gzKonsistenz.abweichungen.length > 0) {
      lines.push("");
      lines.push("**Abweichungen:**");
      for (const a of gzKonsistenz.abweichungen) {
        lines.push(`- \`${a.raw}\` — ${a.grund}`);
      }
    }
  }
  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "on_index",
      title: parsed.title ?? `ON-Verzeichnis — ${caseSlug}`,
      compiled_truth: parsed.compiled_truth ?? md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function writeEntityPages(
  engine: BrainEngine,
  caseSlug: string,
  entities: EntityEntry[],
  sourceId?: string
): Promise<string[]> {
  const slugs: string[] = [];
  for (const e of entities) {
    const slugBase = e.name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `people/${slugBase}`;
    const lines: string[] = [];
    lines.push("---");
    lines.push(`title: "${e.name}"`);
    lines.push(`type: person`);
    lines.push(`case_ref: ${caseSlug}`);
    lines.push(`role: ${e.role}`);
    lines.push(`entity_type: ${e.type}`);
    lines.push(`aliases: [${e.aliases.map((a) => `"${a}"`).join(", ")}]`);
    lines.push(`on_references: [${e.on_references.map((r) => `"${r}"`).join(", ")}]`);
    if (e.accusations && e.accusations.length > 0) {
      lines.push(
        `accusations: [${e.accusations.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ")}]`
      );
    }
    if (e.represents) {
      lines.push(`represents: "${e.represents.replace(/"/g, '\\"')}"`);
    }
    if (e.verfahren_refs && e.verfahren_refs.length > 0) {
      lines.push(`verfahren_refs: [${e.verfahren_refs.map((v) => `"${v}"`).join(", ")}]`);
    }
    lines.push("---");
    lines.push("");
    lines.push(`> ${e.quote}`);
    if (e.context_description) {
      lines.push("");
      lines.push("## Kontext");
      lines.push("");
      lines.push(e.context_description);
    }
    if (e.accusations && e.accusations.length > 0) {
      lines.push("");
      lines.push("## Vorwürfe");
      lines.push("");
      for (const a of e.accusations) {
        lines.push(`- ${a}`);
      }
    }
    if (e.represents) {
      lines.push("");
      lines.push(`**Vertritt:** ${e.represents}`);
    }
    if (e.metadata) {
      lines.push("");
      lines.push("## Metadaten");
      for (const [k, v] of Object.entries(e.metadata)) {
        lines.push(`- **${k}**: ${String(v)}`);
      }
    }
    // Facts fence: structured facts for extract_facts cycle phase
    const factRows: FactRow[] = [
      {
        claim: `Rolle im Fall: ${e.role}`,
        kind: "fact",
        confidence: "1.0",
        visibility: "world",
        notability: "high",
        source: `ON ${e.on_references.join(", ")}`,
        context: caseSlug,
      },
      ...(e.aliases.length > 0
        ? [
            {
              claim: `Auch bekannt als: ${e.aliases.join(", ")}`,
              kind: "fact",
              confidence: "1.0",
              visibility: "world",
              notability: "medium",
              source: `ON ${e.on_references.join(", ")}`,
              context: caseSlug,
            },
          ]
        : []),
      ...(e.accusations && e.accusations.length > 0
        ? e.accusations.map((a) => ({
            claim: `Vorwurf: ${a}`,
            kind: "fact" as const,
            confidence: "1.0",
            visibility: "world" as const,
            notability: "high" as const,
            source: `ON ${e.on_references.join(", ")}`,
            context: caseSlug,
          }))
        : []),
      ...(e.represents
        ? [
            {
              claim: `Vertritt: ${e.represents}`,
              kind: "fact" as const,
              confidence: "1.0",
              visibility: "world" as const,
              notability: "high" as const,
              source: `ON ${e.on_references.join(", ")}`,
              context: caseSlug,
            },
          ]
        : []),
    ];
    const factsFence = buildFactsFence(factRows);
    if (factsFence) {
      lines.push("");
      lines.push(factsFence);
    }
    const md = lines.join("\n");
    const parsed = parseMarkdown(md);
    await engine.putPage(
      slug,
      {
        type: "person",
        title: e.name,
        compiled_truth: parsed.compiled_truth ?? md,
        frontmatter: { ...(parsed.frontmatter ?? {}) },
      },
      { sourceId }
    );
    slugs.push(slug);
  }
  return slugs;
}

async function writeForensicReportPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  report: ForensicReport,
  sourceId?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Forensischer Bericht — ${caseSlug}"`);
  lines.push(`type: forensic_report`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`status: draft`);
  lines.push(`critic_score: 0`);
  lines.push("---");
  lines.push("");
  lines.push("## Bericht");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report, null, 2));
  lines.push("```");

  // Facts fence: forensic findings as structured facts
  const factRows: FactRow[] = [];
  for (const item of report.chronologie ?? []) {
    const datum = String(item.datum ?? "");
    const ereignis = String(item.ereignis ?? "");
    const on = String(item.on ?? "");
    if (ereignis) {
      factRows.push({
        claim: `Chronologie: ${ereignis}${datum ? ` (${datum})` : ""}`,
        kind: "fact",
        confidence: "0.9",
        notability: "high",
        source: on ? `ON ${on}` : "forensic-report",
        context: caseSlug,
      });
    }
  }
  for (const item of report.unterlassene_massnahmen ?? []) {
    const massnahme = String(item.massnahme ?? "");
    if (massnahme) {
      factRows.push({
        claim: `Unterlassene Maßnahme: ${massnahme}`,
        kind: "fact",
        confidence: "0.85",
        notability: "high",
        source: String(item.beantragt_on ?? "forensic-report"),
        context: caseSlug,
      });
    }
  }
  for (const item of report.amtshaftungspunkte ?? []) {
    const punkt = String(item.punkt ?? "");
    const paragraph = String(item.paragraph ?? "");
    if (punkt) {
      factRows.push({
        claim: `Amtshaftung: ${punkt}${paragraph ? ` (${paragraph})` : ""}`,
        kind: "fact",
        confidence: "0.85",
        notability: "high",
        source: String(item.on ?? "forensic-report"),
        context: caseSlug,
      });
    }
  }
  for (const item of report.verfahrensverstoesse_gegenseite ?? []) {
    const verstoß = String(item.verstoß ?? item.verstoss ?? "");
    const paragraph = String(item.paragraph ?? "");
    const severity = String(item.severity ?? "info");
    if (verstoß) {
      factRows.push({
        claim: `Verfahrensverstoß Gegenseite: ${verstoß}${paragraph ? ` (${paragraph})` : ""}`,
        kind: "fact",
        confidence: "0.85",
        notability: severity === "kritisch" ? "high" : severity === "warnung" ? "medium" : "low",
        source: String(item.on ?? "forensic-report"),
        context: caseSlug,
      });
    }
  }
  const factsFence = buildFactsFence(factRows);
  if (factsFence) {
    lines.push("");
    lines.push(factsFence);
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "forensic_report",
      title: parsed.title ?? `Forensischer Bericht — ${caseSlug}`,
      compiled_truth: parsed.compiled_truth ?? md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function writeDamageTablePage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  entries: DamageEntry[],
  sourceId?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Schadenstabelle — ${caseSlug}"`);
  lines.push(`type: damage_table`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`total_pots: ${new Set(entries.map((e) => e.topf)).size}`);
  lines.push(`currency: EUR`);
  lines.push("---");
  lines.push("");
  lines.push("| Position | Topf | Betrag | Beleg | Status | Begründung |");
  lines.push("|---|---|---|---|---|---|");
  for (const e of entries) {
    lines.push(
      `| ${e.position} | ${e.topf} | ${e.betrag} ${e.waehrung} | ${e.beleg_on} | ${e.status} | ${e.begruendung} |`
    );
  }
  // Facts fence: damage positions as structured facts
  const factRows: FactRow[] = entries.map((e) => ({
    claim: `Schadensposition: ${e.position} — ${e.betrag} ${e.waehrung} (${e.topf}, Status: ${e.status})`,
    kind: "fact",
    confidence: e.status === "EISEN" ? "0.95" : e.status === "STARK" ? "0.8" : "0.6",
    notability: "high",
    source: e.beleg_on,
    context: caseSlug,
  }));
  const factsFence = buildFactsFence(factRows);
  if (factsFence) {
    lines.push("");
    lines.push(factsFence);
  }
  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "damage_table",
      title: parsed.title ?? `Schadenstabelle — ${caseSlug}`,
      compiled_truth: parsed.compiled_truth ?? md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function writeDeadlineCalendarPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  entries: DeadlineEntry[],
  sourceId?: string
): Promise<void> {
  const criticalCount = entries.filter((e) => e.ampel === "rot").length;
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Fristenkalender — ${caseSlug}"`);
  lines.push(`type: deadline_calendar`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`critical_count: ${criticalCount}`);
  lines.push("---");
  lines.push("");
  lines.push("| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |");
  lines.push("|---|---|---|---|---|---|");
  for (const e of entries) {
    lines.push(
      `| ${e.datum} | ${e.ampel} | ${e.frist} | ${e.rechtsgrundlage ?? ""} | ${e.folge_bei_versaeumnis} | ${e.beleg_on} |`
    );
  }
  // Facts fence: deadlines as structured facts
  const factRows: FactRow[] = entries.map((e) => ({
    claim: `Frist: ${e.frist} am ${e.datum} — ${e.folge_bei_versaeumnis}`,
    kind: "fact",
    confidence: "1.0",
    notability: e.ampel === "rot" ? "high" : e.ampel === "gelb" ? "medium" : "low",
    valid_from: "",
    valid_until: e.datum,
    source: e.beleg_on,
    context: caseSlug,
  }));
  const factsFence = buildFactsFence(factRows);
  if (factsFence) {
    lines.push("");
    lines.push(factsFence);
  }
  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "deadline_calendar",
      title: parsed.title ?? `Fristenkalender — ${caseSlug}`,
      compiled_truth: parsed.compiled_truth ?? md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function writeLegalGroundingMapPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  entries: LegalGroundingEntry[],
  sourceId?: string
): Promise<void> {
  const totalMatches = entries.reduce((sum, e) => sum + e.matched_paragraphs.length, 0);
  const verifiedCount = entries.reduce(
    (sum, e) => sum + e.matched_paragraphs.filter((mp) => mp.verified).length,
    0
  );
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Legal Grounding Map — ${caseSlug}"`);
  lines.push(`type: legal_grounding_map`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`total_findings: ${entries.length}`);
  lines.push(`total_matches: ${totalMatches}`);
  lines.push(`verified_matches: ${verifiedCount}`);
  lines.push("---");
  lines.push("");
  lines.push("## Befund → §-Matching");
  lines.push("");
  lines.push("| Befund | Typ | ON | § | Gesetz | Verifiziert | Konfidenz |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const e of entries) {
    if (e.matched_paragraphs.length === 0) {
      lines.push(`| ${e.finding} | ${e.finding_type} | ${e.on_reference} | — | — | — | — |`);
    }
    for (const mp of e.matched_paragraphs) {
      lines.push(
        `| ${e.finding} | ${e.finding_type} | ${e.on_reference} | ${mp.paragraph} | ${mp.statute} | ${mp.verified ? "✅" : "❌"} | ${mp.confidence} |`
      );
    }
  }
  lines.push("");
  lines.push("## Quelltexte");
  lines.push("");
  for (const e of entries) {
    for (const mp of e.matched_paragraphs) {
      if (mp.verified && mp.source_text) {
        lines.push(`### ${mp.paragraph} (${mp.statute}) — für: ${e.finding}`);
        lines.push("");
        lines.push("> " + mp.source_text.replace(/\n/g, "\n> "));
        lines.push("");
      }
    }
  }
  // Facts fence: grounding entries as structured facts
  const factRows: FactRow[] = [];
  for (const e of entries) {
    for (const mp of e.matched_paragraphs) {
      if (mp.verified) {
        factRows.push({
          claim: `Legal Grounding: ${e.finding} → ${mp.paragraph} ${mp.statute}`,
          kind: "fact",
          confidence:
            mp.confidence === "hoch" ? "0.95" : mp.confidence === "mittel" ? "0.75" : "0.5",
          notability: "high",
          source: e.on_reference,
          context: caseSlug,
        });
      }
    }
  }
  const factsFence = buildFactsFence(factRows);
  if (factsFence) {
    lines.push("");
    lines.push(factsFence);
  }
  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "legal_grounding_map",
      title: parsed.title ?? `Legal Grounding Map — ${caseSlug}`,
      compiled_truth: parsed.compiled_truth ?? md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function writeClaimEvidenceGraphPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  graph: ClaimEvidenceGraph,
  sourceId?: string
): Promise<void> {
  const coverage = computeClaimEvidenceCoverage(graph);
  const evidenceById = new Map(graph.evidence.map((evidence) => [evidence.id, evidence]));
  const lines: string[] = [
    `# Claim–Evidence Graph — ${caseSlug}`,
    "",
    `- Stichtag: ${graph.as_of_date}`,
    `- Jurisdiktion: ${graph.jurisdiction}`,
    `- Claims: ${coverage.total_claims}`,
    `- Gewichtete Evidence Coverage: ${(coverage.weighted_coverage * 100).toFixed(1)} %`,
    `- Publizierbar: ${coverage.publishable ? "ja" : "nein"}`,
    "",
    "## Warum?-Pfade",
    "",
  ];

  for (const claim of graph.claims) {
    const claimCoverage = coverage.claims.find((candidate) => candidate.claim_id === claim.id);
    lines.push(`### ${claim.text}`);
    lines.push("");
    lines.push(
      `Status: **${claimCoverage?.resolution ?? "unsupported"}** · Risiko: **${claim.risk}**`
    );
    lines.push("");
    const linkedEdges = graph.edges.filter((edge) => edge.from_id === claim.id);
    if (linkedEdges.length === 0) {
      lines.push("- Kein Beleg zugeordnet — bleibt ungeklärt.");
    } else {
      for (const edge of linkedEdges) {
        const evidence = evidenceById.get(edge.to_id);
        if (!evidence) continue;
        lines.push(
          `- ${edge.relation}: ${evidence.paragraph_ref ?? evidence.source_slug} ` +
            `(${evidence.verification}) — „${evidence.text.replace(/\s+/g, " ").slice(0, 240)}“`
        );
      }
    }
    lines.push("");
  }

  const compiledTruth = lines.join("\n");
  await engine.putPage(
    slug,
    {
      type: "claim_evidence_graph",
      title: `Claim–Evidence Graph — ${caseSlug}`,
      compiled_truth: compiledTruth,
      frontmatter: {
        graph_id: graph.graph_id,
        case_ref: caseSlug,
        jurisdiction: graph.jurisdiction,
        as_of_date: graph.as_of_date,
        claim_count: coverage.total_claims,
        weighted_coverage: coverage.weighted_coverage,
        contradiction_coverage: coverage.contradiction_coverage,
        publishable: coverage.publishable,
        claim_evidence_graph: graph,
      },
    },
    { sourceId }
  );
}

/**
 * Read a precedent-match page, parse the JSON matches, and merge them
 * into the claim-evidence graph. Re-persists the updated graph.
 *
 * This closes the gap between Layer 4b (precedent search) and the
 * claim-evidence contract: decisions become `decision` evidence nodes
 * with deterministic relations, never trusting LLM-asserted verification.
 */
async function mergePrecedentsIntoGraph(
  engine: BrainEngine,
  precedentSlug: string,
  claimEvidenceSlug: string,
  caseSlug: string,
  sourceId?: string
): Promise<void> {
  // Read the precedent match page
  const precedentPage = await engine.getPage(
    precedentSlug,
    sourceId !== undefined ? { sourceId } : undefined
  );
  if (!precedentPage) return;

  // Extract the JSON from the compiled_truth (markdown)
  const text = String(precedentPage.compiled_truth ?? "");
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]!);
  } catch {
    // The specialist output is markdown tables, not raw JSON.
    // Parse from frontmatter instead.
    const fm = (precedentPage.frontmatter ?? {}) as Record<string, unknown>;
    const matches = Array.isArray(fm.precedent_matches) ? fm.precedent_matches : [];
    if (matches.length === 0) return;
    parsed = { precedent_matches: matches };
  }

  const matches = Array.isArray(parsed.precedent_matches)
    ? (parsed.precedent_matches as PrecedentMatch[])
    : [];
  if (matches.length === 0) return;

  // Read the existing claim-evidence graph page
  const graphPage = await engine.getPage(
    claimEvidenceSlug,
    sourceId !== undefined ? { sourceId } : undefined
  );
  if (!graphPage) return;

  const fm = (graphPage.frontmatter ?? {}) as Record<string, unknown>;
  const existingGraph = fm.claim_evidence_graph as ClaimEvidenceGraph | undefined;
  if (!existingGraph) return;

  // Merge precedent matches into the graph
  const mergedGraph = mergePrecedentMatches(existingGraph, matches);

  // Re-persist the updated graph
  await writeClaimEvidenceGraphPage(engine, claimEvidenceSlug, caseSlug, mergedGraph, sourceId);
}

// ── Citation Guardrail (Tier 0) Integration ─────────────────

/**
 * Record dependencies from a Claim–Evidence graph into the output_dependencies
 * table using engine.executeRaw. This wires the DependencyGraphStore contract
 * (E6.1.3) without requiring a direct Pool reference.
 *
 * Each evidence node with a snapshot_hash becomes a dependency record linking
 * the output to the source snapshot. When a law changes, statute-freshness can
 * find all affected outputs via this table.
 */
async function recordGraphDependencies(
  engine: BrainEngine,
  graph: ClaimEvidenceGraph,
  outputId: string,
  outputType: string,
  brainId?: string,
  userId?: string
): Promise<void> {
  const deps = extractDependenciesFromGraph(graph);
  if (deps.length === 0) return;

  for (const dep of deps) {
    try {
      await engine.executeRaw(
        `INSERT INTO output_dependencies
         (output_id, output_type, claim_hash, source_slug, snapshot_hash,
          paragraph_ref, brain_id, user_id, reverify_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         ON CONFLICT (output_id, source_slug, paragraph_ref, snapshot_hash) DO NOTHING`,
        [
          outputId,
          outputType,
          dep.claim_hash,
          dep.source_slug,
          dep.snapshot_hash,
          dep.paragraph_ref,
          brainId ?? null,
          userId ?? null,
        ]
      );
    } catch (err) {
      // Table may not exist in PGLite test mode — fail open
      console.warn(
        `[legal-pipeline] Dependency insert skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/**
 * AP-8: High-severity guardrail failures halt the pipeline by throwing —
 * forcing `needs_human_review`. This is now ALWAYS active (Phase 0A).
 * Previously gated behind SUBSUMIO_GUARDRAIL_HARD_BLOCK env var which
 * defaulted to false (fail-open). Now fail-closed by default.
 */
function enforceGuardrailHardBlock(layerNum: number, layerName: string, flagsCount: number): void {
  const msg = `[legal-pipeline] Layer ${layerNum} (${layerName}) guardrail HARD-BLOCK: ${flagsCount} high-severity flags — pipeline halted (fail-closed, Phase 0A)`;
  console.error(msg);
  throw new Error(msg);
}

/**
 * Run the deterministic citation guardrail on a layer's output text.
 * Returns the guardrail result and logs a summary to pipeline state warnings.
 * If high-severity flags are found, the caller can use `buildRegenerationPrompt`
 * to retry the layer with a stricter prompt.
 */
function runCitationGuardrailForLayer(
  state: PipelineState,
  layerNum: number,
  outputText: string,
  context: string,
  topSlugs: string[]
): GuardrailResult {
  const result = checkCitationGrounding({
    answer: outputText,
    context,
    topSlugs,
  });

  const flagTypes = [...new Set(result.flags.map((f) => f.type))];
  const highSeverityCount = result.flags.filter((f) => f.severity === "high").length;

  if (!state.guardrail_results) state.guardrail_results = {};
  state.guardrail_results[layerNum] = {
    passed: result.passed,
    flags_count: result.flags.length,
    flag_types: flagTypes,
    regenerated: false,
  };

  if (result.passed) {
    state.warnings = [...(state.warnings ?? []), `GUARDRAIL_PASSED_L${layerNum}`];
  } else {
    state.warnings = [
      ...(state.warnings ?? []),
      `GUARDRAIL_FLAGGED_L${layerNum}: ${result.flags.length} flags (${flagTypes.join(", ")})`,
    ];
    if (highSeverityCount > 0) {
      // Build regeneration prompt for the caller to use in a retry
      const regenPrompt = buildRegenerationPrompt("", result, context);
      state.warnings = [...(state.warnings ?? []), `GUARDRAIL_REGENERATION_REQUESTED_L${layerNum}`];
      console.warn(
        `[legal-pipeline] Layer ${layerNum} guardrail: ${result.flags.length} flags (${highSeverityCount} high-severity) — types: ${flagTypes.join(", ")}`
      );
      console.warn(
        `[legal-pipeline] Layer ${layerNum} regeneration prompt: ${regenPrompt.slice(0, 200)}...`
      );
    }
  }

  return result;
}

/**
 * Run cross-model verification (Tier 1) on draft text.
 * Uses Grok 4.3 (deep tier) for semantic hallucination detection.
 * Returns the verify result and logs to pipeline state.
 */
async function runCrossVerifyForDrafts(
  state: PipelineState,
  draftText: string,
  context: string,
  jurisdiction?: string
): Promise<CrossVerifyResult> {
  const result = await crossVerifyCitations(draftText, context, jurisdiction);

  const flagTypes = [...new Set(result.flags.map((f) => f.type))];
  const highSeverityCount = result.flags.filter((f) => f.severity === "high").length;

  state.cross_verify_results = {
    clean: result.clean,
    flags_count: result.flags.length,
    flag_types: flagTypes,
    regenerated: false,
    verifier_error: result.verifier_error ?? false,
  };

  if (result.verifier_error) {
    state.warnings = [
      ...(state.warnings ?? []),
      "CROSS_VERIFY_VERIFIER_ERROR: technical failure — human review required",
    ];
    console.error(
      `[legal-pipeline] Cross-verify VERIFIER_ERROR: ${result.flags.length} flags — technical failure`
    );
  } else if (result.clean) {
    state.warnings = [...(state.warnings ?? []), "CROSS_VERIFY_PASSED"];
  } else {
    state.warnings = [
      ...(state.warnings ?? []),
      `CROSS_VERIFY_FLAGGED: ${result.flags.length} flags (${flagTypes.join(", ")})`,
    ];
    if (highSeverityCount > 0) {
      // Build regeneration prompt for draft retry
      const regenPrompt = buildCrossVerifyRegenerationPrompt("", result);
      state.warnings = [...(state.warnings ?? []), "CROSS_VERIFY_REGENERATION_REQUESTED"];
      console.warn(
        `[legal-pipeline] Cross-verify: ${result.flags.length} flags (${highSeverityCount} high-severity) — types: ${flagTypes.join(", ")}`
      );
      console.warn(
        `[legal-pipeline] Cross-verify regeneration prompt: ${regenPrompt.slice(0, 200)}...`
      );
    }
  }

  return result;
}

async function writeLegalDraftPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  pkg: DraftPackage,
  result: unknown,
  sourceId?: string
): Promise<void> {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const md = `---\ntitle: "${pkg.title}"\ntype: legal_draft\ncase_ref: ${caseSlug}\ndraft_type: ${pkg.type}\nstatus: draft\nattorney_review_required: true\n---\n\n${text}`;
  const parsed = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "legal_draft",
      title: parsed.title ?? pkg.title,
      compiled_truth: parsed.compiled_truth ?? md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

async function writeQualityAuditPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  result: unknown,
  sourceId?: string
): Promise<void> {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const parsed = tryParseJSON(text);
  const score = parsed ? clampScore(parsed.total_score) : 0;
  const recommendation =
    parsed && typeof parsed.recommendation === "string" ? parsed.recommendation : "revise";
  const md = `---\ntitle: "Qualitäts-Audit — ${caseSlug}"\ntype: quality_audit\ncase_ref: ${caseSlug}\ntotal_score: ${score}\nrecommendation: ${recommendation}\n---\n\n${text}`;
  const parsedMd = parseMarkdown(md);
  await engine.putPage(
    slug,
    {
      type: "quality_audit",
      title: parsedMd.title ?? `Qualitäts-Audit — ${caseSlug}`,
      compiled_truth: parsedMd.compiled_truth ?? md,
      frontmatter: { ...(parsedMd.frontmatter ?? {}) },
    },
    { sourceId }
  );
}

// ── State Management ────────────────────────────────────────

async function updateLayerState(
  ctx: MinionJobContext,
  state: PipelineState,
  stateSlug: string,
  layerNum: number,
  status: PipelineState["layers"][number]["status"],
  engine: BrainEngine,
  sourceId?: string,
  outputSlugs?: string[]
): Promise<void> {
  const now = new Date().toISOString();
  const layer = state.layers[layerNum]!;
  const prevStatus = layer.status;
  layer.status = status;
  if (status === "running" && !layer.started_at) {
    layer.started_at = now;
  }
  if (status === "completed" || status === "failed") {
    layer.completed_at = now;
    if (layer.started_at) {
      layer.duration_ms = new Date(now).getTime() - new Date(layer.started_at).getTime();
    }
    if (outputSlugs) layer.output_slugs = outputSlugs;
  }
  state.current_layer = layerNum;
  state.updated_at = now;
  await persistPipelineState(engine, stateSlug, state, sourceId);
  await ctx.updateProgress({
    step: layerNum,
    total: 7,
    message: `Layer ${layerNum} ${status}${prevStatus !== "pending" ? ` (was ${prevStatus})` : ""}`,
  });
}

async function persistPipelineState(
  engine: BrainEngine,
  slug: string,
  state: PipelineState,
  sourceId?: string
): Promise<void> {
  const totalScore = state.ensemble_verdict?.consensus?.total_score;
  const recommendation = state.ensemble_verdict?.consensus?.recommendation;
  const fmLines = [
    "---",
    `title: "Pipeline-State — ${state.case_slug}"`,
    `type: pipeline_state`,
    `case_ref: ${state.case_slug}`,
    `status: ${state.status}`,
    `current_layer: ${state.current_layer}`,
  ];
  if (typeof totalScore === "number") fmLines.push(`total_score: ${totalScore}`);
  if (recommendation) fmLines.push(`ensemble_recommendation: ${recommendation}`);
  if (typeof state.retry_count === "number") fmLines.push(`retry_count: ${state.retry_count}`);
  if (typeof state.cost_spent_usd === "number")
    fmLines.push(`cost_spent_usd: ${state.cost_spent_usd.toFixed(4)}`);
  if (state.jurisdiction) fmLines.push(`jurisdiction: ${state.jurisdiction}`);
  if (state.verfahrenstyp) fmLines.push(`verfahrenstyp: ${state.verfahrenstyp}`);
  if (state.snapshot_id) fmLines.push(`snapshot_id: "${state.snapshot_id}"`);
  if (state.import_session_id) fmLines.push(`import_session_id: "${state.import_session_id}"`);
  if (typeof state.contradiction_findings === "number")
    fmLines.push(`contradiction_findings: ${state.contradiction_findings}`);
  if (state.linked_cases && state.linked_cases.length > 0)
    fmLines.push(`linked_cases: [${state.linked_cases.map((c) => `"${c}"`).join(", ")}]`);
  if (state.cross_case_findings && state.cross_case_findings.length > 0)
    fmLines.push(`cross_case_findings: ${state.cross_case_findings.length}`);
  if (state.damage_overlap_warnings && state.damage_overlap_warnings.length > 0)
    fmLines.push(`damage_overlap_warnings: ${state.damage_overlap_warnings.length}`);
  if (state.cross_case_matrix_slug)
    fmLines.push(`cross_case_matrix_slug: "${state.cross_case_matrix_slug}"`);
  if (state.institution_checklist_slug)
    fmLines.push(`institution_checklist_slug: "${state.institution_checklist_slug}"`);
  fmLines.push("---");

  const md = `${fmLines.join("\n")}\n\n${JSON.stringify(state, null, 2)}`;
  const parsed = parseMarkdown(md);
  try {
    await engine.putPage(
      slug,
      {
        type: "pipeline_state",
        title: parsed.title ?? `Pipeline-State — ${state.case_slug}`,
        compiled_truth: parsed.compiled_truth ?? md,
        frontmatter: { ...(parsed.frontmatter ?? {}) },
      },
      { sourceId }
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[legal-pipeline] Failed to persist state: ${errMsg}`);
    if (!state.warnings) state.warnings = [];
    state.warnings.push(`STATE_PERSIST_FAILED: ${errMsg}`);
  }
}

// ── Helpers ─────────────────────────────────────────────────

async function loadAllSubPages(
  engine: BrainEngine,
  partSlugs: string[],
  sourceId?: string
): Promise<string[]> {
  const texts: string[] = [];
  for (const slug of partSlugs) {
    const page = await engine.getPage(slug, sourceId !== undefined ? { sourceId } : undefined);
    if (page) {
      const text = String((page as { compiled_truth?: string }).compiled_truth ?? "");
      if (text.trim()) texts.push(text);
    }
  }
  return texts;
}

async function loadOnTableFromPage(
  engine: BrainEngine,
  caseSlug: string,
  sourceId?: string
): Promise<OnEntry[]> {
  const slug = `on-indexes/${caseSlug}`;
  const page = await engine.getPage(slug, sourceId !== undefined ? { sourceId } : undefined);
  if (!page) return [];
  const text = String((page as { compiled_truth?: string }).compiled_truth ?? "");
  // Parse markdown table rows
  // New format: | ON | GZ | Datum | Typ | Mappe | Beilage | Seiten | Personen | Verfahren | Anwälte |
  // Old format: | ON | Datum | Typ | Seiten | Personen | Verfahren | Anwälte |
  const entries: OnEntry[] = [];
  const rows = text
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("|---") && !l.startsWith("| ON"));
  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 7) {
      // New format (10 columns): ON, GZ, Datum, Typ, Mappe, Beilage, Seiten, Personen, Verfahren, Anwälte
      if (cells.length >= 10) {
        const mappeStr = cells[4] ?? "";
        const beilageStr = cells[5] ?? "";
        // Parse mappen_buchstabe from "A (Anordnungsbogen)" format
        let mappen_buchstabe: string | undefined;
        let mappe: string | undefined;
        if (mappeStr) {
          const mbMatch = mappeStr.match(/^([A-Z])\s*\((.+)\)$/);
          if (mbMatch) {
            mappen_buchstabe = mbMatch[1];
            mappe = mbMatch[2];
          } else {
            mappe = mappeStr;
          }
        }
        // Parse beilagen from "A (klaeger)" format
        let beilagen_typ: BeilagenTyp = null;
        let beilagen_kennung: string | undefined;
        if (beilageStr) {
          const blMatch = beilageStr.match(/^(\S+)\s*\((klaeger|gegner|dritt)\)$/);
          if (blMatch) {
            beilagen_kennung = blMatch[1];
            beilagen_typ = blMatch[2] as BeilagenTyp;
          } else {
            beilagen_kennung = beilageStr;
          }
        }
        entries.push({
          on_nummer: cells[0] ?? "",
          datum: cells[2] ?? "",
          typ: cells[3] ?? "",
          seiten: cells[6] ?? "",
          personen: (cells[7] ?? "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          verfahren: cells[8] || undefined,
          anwaelte: (cells[9] ?? "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          quote: "",
          mappe,
          mappen_buchstabe,
          beilagen_typ,
          beilagen_kennung,
          geschaeftszahl: cells[1] ? { raw: cells[1] } : undefined,
        });
      } else {
        // Old format (7 columns): ON, Datum, Typ, Seiten, Personen, Verfahren, Anwälte
        entries.push({
          on_nummer: cells[0] ?? "",
          datum: cells[1] ?? "",
          typ: cells[2] ?? "",
          seiten: cells[3] ?? "",
          personen: (cells[4] ?? "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          verfahren: cells[5] || undefined,
          anwaelte: (cells[6] ?? "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          quote: "",
        });
      }
    }
  }
  return entries;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Gap 16: Resume helpers ───────────────────────────────────

async function loadPipelineState(
  engine: BrainEngine,
  slug: string,
  sourceId?: string
): Promise<PipelineState> {
  const page = await engine.getPage(slug, sourceId !== undefined ? { sourceId } : undefined);
  if (!page) throw new Error(`legal-pipeline: cannot resume — state page "${slug}" not found`);
  const text = String((page as { compiled_truth?: string }).compiled_truth ?? "");
  // Extract JSON from after the frontmatter
  const jsonMatch = text.match(/---\n[\s\S]*?\n---\n\n([\s\S]*)/);
  if (!jsonMatch) throw new Error(`legal-pipeline: cannot resume — state page has no JSON body`);
  const parsed = tryParseJSON(jsonMatch[1]!);
  if (!parsed || typeof parsed !== "object")
    throw new Error(`legal-pipeline: cannot resume — state page JSON invalid`);
  return parsed as unknown as PipelineState;
}

async function loadEntitiesFromPages(
  engine: BrainEngine,
  caseSlug: string,
  sourceId?: string
): Promise<EntityEntry[]> {
  // List all person pages — they are stored under people/ slug prefix
  const pages = await engine.listPages({
    type: "person",
    slugPrefix: "people/",
    limit: 200,
  });
  const entities: EntityEntry[] = [];
  for (const page of pages) {
    const fm = (page as { frontmatter?: Record<string, unknown> }).frontmatter;
    if (!fm) continue;
    // Only include entities for this case
    const caseRef = String(fm.case_ref ?? "");
    if (caseRef !== caseSlug) continue;
    const name = String(fm.title ?? fm.name ?? "");
    if (!name) continue;
    entities.push({
      name,
      type: String(fm.type ?? "person"),
      role: String(fm.role ?? ""),
      aliases: Array.isArray(fm.aliases) ? (fm.aliases as string[]) : [],
      on_references: Array.isArray(fm.on_references) ? (fm.on_references as string[]) : [],
      quote:
        String((page as { compiled_truth?: string }).compiled_truth ?? "")
          .split("\n")
          .find((l) => l.startsWith("> "))
          ?.slice(2) ?? "",
      accusations: Array.isArray(fm.accusations) ? (fm.accusations as string[]) : undefined,
      context_description:
        typeof fm.context_description === "string" ? fm.context_description : undefined,
      represents: typeof fm.represents === "string" ? fm.represents : undefined,
      verfahren_refs: Array.isArray(fm.verfahren_refs)
        ? (fm.verfahren_refs as string[])
        : undefined,
    });
  }
  return entities;
}

// ── Gap 3: Cross-Case Entity Analysis ───────────────────────

/**
 * Load entities from linked cases and cross-reference them with the current case.
 *
 * Detects:
 * - Same person appearing in multiple cases with different roles (e.g. opfer in one, beschuldigter in another)
 * - Same person with contradictory accusations across cases
 * - Lawyers representing different parties in different cases (conflict of interest)
 *
 * Returns a list of human-readable findings (warnings).
 */
interface CrossCaseFinding {
  type:
    | "role_conflict"
    | "role_difference"
    | "accusation_contradiction"
    | "mandate_conflict"
    | "error";
  severity: "high" | "medium" | "low";
  description: string;
  case_a: string;
  case_b: string;
  entity_name?: string;
}

async function runCrossCaseAnalysis(opts: {
  engine: BrainEngine;
  caseSlug: string;
  currentEntities: EntityEntry[];
  linkedCases: string[];
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<CrossCaseFinding[]> {
  const { engine, caseSlug, currentEntities, linkedCases, sourceStamp } = opts;
  const findings: CrossCaseFinding[] = [];

  // Build a map of normalized name → current case entity
  const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  const currentMap = new Map<string, EntityEntry>();
  for (const e of currentEntities) {
    const key = normalizeName(e.name);
    currentMap.set(key, e);
    for (const alias of e.aliases) {
      const aliasKey = normalizeName(alias);
      if (!currentMap.has(aliasKey)) currentMap.set(aliasKey, e);
    }
  }

  // Load entities from each linked case
  for (const linkedSlug of linkedCases) {
    if (linkedSlug === caseSlug) continue; // skip self
    try {
      const linkedEntities = await loadEntitiesFromPages(engine, linkedSlug, sourceStamp);
      for (const linked of linkedEntities) {
        const key = normalizeName(linked.name);
        const current = currentMap.get(key);
        if (!current) continue;

        // Same person found in linked case!
        // Check for role conflicts
        if (current.role && linked.role && current.role !== linked.role) {
          // Define opposing roles
          const opposingPairs: Array<[string, string]> = [
            ["beschuldigter", "opfer"],
            ["klaeger", "beklagter"],
            ["arbeitnehmer", "arbeitgeber"],
            ["beschwerdefuehrer", "behoerde"],
          ];
          const isOpposing = opposingPairs.some(
            ([a, b]) =>
              (current.role === a && linked.role === b) || (current.role === b && linked.role === a)
          );
          if (isOpposing) {
            findings.push({
              type: "role_conflict",
              severity: "high",
              description: `"${current.name}" ist "${current.role}" in Fall ${caseSlug}, aber "${linked.role}" in Fall ${linkedSlug} — Rollenkonflikt!`,
              case_a: caseSlug,
              case_b: linkedSlug,
              entity_name: current.name,
            });
          } else {
            findings.push({
              type: "role_difference",
              severity: "low",
              description: `"${current.name}" hat unterschiedliche Rollen: "${current.role}" (${caseSlug}) vs "${linked.role}" (${linkedSlug})`,
              case_a: caseSlug,
              case_b: linkedSlug,
              entity_name: current.name,
            });
          }
        }

        // Check for conflicting accusations
        const currentAccusations = current.accusations ?? [];
        const linkedAccusations = linked.accusations ?? [];
        if (currentAccusations.length > 0 && linkedAccusations.length > 0) {
          // Check if accusations contradict (one says X did Y, other says X is victim of Y)
          const hasContradiction = currentAccusations.some((a) =>
            linkedAccusations.some((la) => {
              // Simple heuristic: if one mentions "Täter"/"Beschuldigter" and other "Opfer"/"Geschädigter"
              const aLower = a.toLowerCase();
              const laLower = la.toLowerCase();
              return (
                (aLower.includes("täter") && laLower.includes("opfer")) ||
                (aLower.includes("opfer") && laLower.includes("täter")) ||
                (aLower.includes("beschuldigter") && laLower.includes("geschädigter")) ||
                (aLower.includes("geschädigter") && laLower.includes("beschuldigter"))
              );
            })
          );
          if (hasContradiction) {
            findings.push({
              type: "accusation_contradiction",
              severity: "high",
              description: `"${current.name}" hat widersprüchliche Vorwürfe: [${currentAccusations.join("; ")}] (${caseSlug}) vs [${linkedAccusations.join("; ")}] (${linkedSlug})`,
              case_a: caseSlug,
              case_b: linkedSlug,
              entity_name: current.name,
            });
          }
        }

        // Check for lawyer conflict of interest
        if (
          current.type === "lawyer" &&
          linked.type === "lawyer" &&
          current.represents &&
          linked.represents
        ) {
          const normRep = (r: string) => normalizeName(r);
          if (normRep(current.represents) !== normRep(linked.represents)) {
            findings.push({
              type: "mandate_conflict",
              severity: "medium",
              description: `Anwalt "${current.name}" vertritt "${current.represents}" in ${caseSlug} aber "${linked.represents}" in ${linkedSlug} — möglicher Interessenkonflikt`,
              case_a: caseSlug,
              case_b: linkedSlug,
              entity_name: current.name,
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      findings.push({
        type: "error",
        severity: "low",
        description: `Fehler beim Laden von Fall ${linkedSlug}: ${msg}`,
        case_a: caseSlug,
        case_b: linkedSlug,
      });
    }
  }

  return findings;
}

// ── Gap 2: AB-Bogen Kürzel-Dekodierung ───────────────────────

/**
 * Decode handwritten abbreviations commonly found in Austrian Anordnungsbogen (AB-Bogen).
 *
 * These are shorthand notations written by prosecutors/judges on the blue A-Mappe cover sheets.
 * The decoder maps known abbreviations to their full meaning, preserving the original text.
 *
 * This is a post-OCR enrichment step: it takes raw extracted text and annotates
 * recognized abbreviations with their decoded meaning in brackets.
 *
 * Example: "Kal 5 Wo" → "Kal 5 Wo [Kalkulation 5 Wochen]"
 */
const ABBOGEN_KUERZEL: Record<string, string> = {
  // Haft-Abkürzungen
  UH: "Untersuchungshaft",
  "U-Haft": "Untersuchungshaft",
  "UH-Vollzug": "Untersuchungshaft-Vollzug",
  FA: "Fluchtgefahr/Auslieferung",
  Vf: "Verfahren",
  "Vf-Hindernis": "Verfahrenshindernis",
  // Einstellungs-Abkürzungen
  Einst: "Einstellung",
  "Einst §": "Einstellung gemäß §",
  "Einst.": "Einstellung",
  Zurück: "Zurückgelegt",
  "Zurückg.": "Zurückgelegt",
  // Vernehmungs-Abkürzungen
  "Vern.": "Vernehmung",
  Vern: "Vernehmung",
  BV: "Befragungsverbot",
  AV: "Aussageverweigerungsrecht",
  // Beweis-Abkürzungen
  Beweis: "Beweismittel",
  BwM: "Beweismittel",
  Sich: "Sicherung",
  "Sichg.": "Sicherung",
  "Durchs.": "Durchsuchung",
  Durchs: "Durchsuchung",
  "Kontosp.": "Kontosperre",
  Kontosp: "Kontosperre",
  "FA-Verf.": "Finanzamt-Verfahren",
  // Fristen-Abkürzungen
  Frist: "Frist",
  "Urg.": "Urgenz",
  Urg: "Urgenz",
  "Wied.": "Wiedereinsetzung",
  Wied: "Wiedereinsetzung",
  // Gebühren-Abkürzungen
  "Geb.": "Gebühren",
  Geb: "Gebühren",
  KV: "Kostenverzeichnis",
  "Vorsch.": "Vorschreibung",
  Vorsch: "Vorschreibung",
  // Sonstige
  Kal: "Kalkulation",
  Wo: "Wochen",
  Mo: "Monate",
  J: "Jahre",
  Jahre: "Jahre",
  Tg: "Tage",
  Tage: "Tage",
  "Stdl.": "Stundung",
  "Erl.": "Erledigung",
  Erl: "Erledigung",
  Vst: "Vorstellung",
  "Vstl.": "Vorstellung",
  "Beschl.": "Beschluss",
  Beschl: "Beschluss",
  "Aufh.": "Aufhebung",
  Aufh: "Aufhebung",
  "Abg.": "Abgabe",
  Abg: "Abgabe",
  "Zust.": "Zustellung",
  Zust: "Zustellung",
  Akt: "Aktenstück",
  AktE: "Akteneinsicht",
  "AktE-G.": "Akteneinsichtsgesuch",
  "Dring.": "Dringender Tatverdacht",
  Dring: "Dringender Tatverdacht",
  "Verd.": "Verdacht",
  Verd: "Verdacht",
  TV: "Tatverdächtiger",
  PB: "Privatbeteiligter",
  PBt: "Privatbeteiligter",
  NHF: "Nebenkläger/Hinterbliebener/Familienangehöriger",
  SchE: "Schuldeinsicht",
  Gest: "Geständnis",
  "Leug.": "Leugnung",
  Leug: "Leugnung",
  RA: "Rechtsanwalt",
  RAin: "Rechtsanwältin",
  Vtd: "Verteidiger",
  StA: "Staatsanwalt",
  StAin: "Staatsanwältin",
  Ri: "Richter",
  Riin: "Richterin",
  "U-Ri": "Untersuchungsrichter",
  Erm: "Ermittler",
  "Erm.": "Ermittler",
  Sachv: "Sachverhalt",
  "Sachv.": "Sachverhalt",
  Strfb: "Strafbar",
  "Strfb.": "Strafbar",
  Unstr: "Unstrafbar",
  "Unstr.": "Unstrafbar",
};

/**
 * Decode AB-Bogen abbreviations in extracted text.
 * Returns the text with decoded annotations in brackets.
 * Only annotates abbreviations that appear as standalone tokens (word-boundary match).
 */
function decodeAbbBogenKuerzel(text: string): string {
  let result = text;
  // Sort by length descending so longer abbreviations match first
  const sortedKeys = Object.keys(ABBOGEN_KUERZEL).sort((a, b) => b.length - a.length);
  for (const kuerzel of sortedKeys) {
    // Escape regex special characters
    const escaped = kuerzel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match as whole word, case-sensitive for abbreviations
    // Only annotate if not already annotated (no [ already following)
    const regex = new RegExp(`\\b${escaped}\\b(?!\\s*\\[)`, "g");
    result = result.replace(regex, `${kuerzel} [${ABBOGEN_KUERZEL[kuerzel]}]`);
  }
  return result;
}

// ── Phase B2: Cross-Case Liability Matrix ──────────────────────

async function runCrossCaseMatrixLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  relatedCaseSlugs: string[];
  mandateId?: string;
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string> {
  const { ctx, queue, engine, caseSlug, relatedCaseSlugs, mandateId, sourceStamp, lawSourceIds } =
    opts;
  const allSlugs = [caseSlug, ...relatedCaseSlugs.filter((s) => s !== caseSlug)];

  const prompt = [
    "Erstelle eine fall-übergreifende Haftungsmatrix und Master-Schadenstabelle.",
    "",
    `Mandats-ID: ${mandateId ?? "nicht gesetzt"}`,
    `Verknüpfte Akten: ${allSlugs.join(", ")}`,
    "",
    "Lade für JEDEN verknüpften Fall die folgenden Pages mit get_page:",
    ...allSlugs.flatMap((slug) => [
      `- damage-tables/${slug}`,
      `- forensic-reports/${slug}`,
      `- entities/${slug}`,
    ]),
    "",
    "Erstelle dann:",
    "1. MASTER-SCHADENSTABELLE: Alle Schäden aus allen Akten, mit case_slug und Gegner-Zuordnung.",
    "2. HAFTUNGSMATRIX: Welcher Gegner haftet für welchen Schaden in welcher Akte?",
    "3. HAFTUNGSLÜCKEN: Schäden ohne Gegner-Zuordnung.",
    "4. DOPPELGEFAHREN: Schäden, die gegen mehrere Gegner parallel geltend gemacht werden.",
    "",
    'Gib JSON zurück: { master_schadenstabelle: [...], haftungsmatrix: [...], haftungsluecken: [...], doppelgefahren: [...], gesamt_schaden_summe: N, gesamt_haftungssumme: N, empfehlung: "..." }',
  ].join("\n");

  const json = await runSpecialistLayer({
    ctx,
    queue,
    specialistName: "cross-case-matrix",
    prompt,
    sourceStamp,
    lawSourceIds,
    layerId: "cross-case-matrix",
  });

  const slug = `cross-case-matrices/${caseSlug}`;
  const lines: string[] = [];
  lines.push(`# Cross-Case Haftungsmatrix — ${mandateId ?? caseSlug}`);
  lines.push("");
  lines.push(`**Verknüpfte Akten:** ${allSlugs.join(", ")}`);
  lines.push("");

  if (json) {
    const master = Array.isArray(json.master_schadenstabelle)
      ? (json.master_schadenstabelle as Record<string, unknown>[])
      : [];
    const matrix = Array.isArray(json.haftungsmatrix)
      ? (json.haftungsmatrix as Record<string, unknown>[])
      : [];
    const luecken = Array.isArray(json.haftungsluecken)
      ? (json.haftungsluecken as Record<string, unknown>[])
      : [];
    const doppel = Array.isArray(json.doppelgefahren)
      ? (json.doppelgefahren as Record<string, unknown>[])
      : [];
    const totalSumme = Number(json.gesamt_schaden_summe ?? 0);
    const haftungSumme = Number(json.gesamt_haftungssumme ?? 0);
    const empfehlung = String(json.empfehlung ?? "");

    if (master.length > 0) {
      lines.push("## Master-Schadenstabelle");
      lines.push("");
      lines.push("| Schaden | Betrag | Akte | Gegner | Haftungsgrund | Status |");
      lines.push("|---------|--------|------|--------|---------------|--------|");
      for (const e of master) {
        lines.push(
          `| ${e.schaden ?? ""} | €${Number(e.betrag ?? 0).toLocaleString("de-DE")} | ${e.case_slug ?? ""} | ${e.gegner ?? "—"} | ${e.haftungsgrund ?? ""} | ${e.status ?? ""} |`
        );
      }
      lines.push("");
    }

    if (matrix.length > 0) {
      lines.push("## Haftungsmatrix");
      lines.push("");
      lines.push("| Schaden | Gegner | Rolle | Haftet | § | Akte |");
      lines.push("|---------|--------|-------|--------|---|------|");
      for (const m of matrix) {
        lines.push(
          `| ${m.schaden ?? ""} | ${m.gegner ?? ""} | ${m.rolle ?? ""} | ${m.haftet ? "Ja" : "Nein"} | ${m.paragraph ?? ""} | ${m.case_slug ?? ""} |`
        );
      }
      lines.push("");
    }

    if (luecken.length > 0) {
      lines.push("> ⚠️ **Haftungslücken**");
      lines.push("");
      lines.push("| Schaden | Betrag | Grund |");
      lines.push("|---------|--------|-------|");
      for (const l of luecken) {
        lines.push(
          `| ${l.schaden ?? ""} | €${Number(l.betrag ?? 0).toLocaleString("de-DE")} | ${l.grund ?? ""} |`
        );
      }
      lines.push("");
    }

    if (doppel.length > 0) {
      lines.push("> ⚠️ **Doppelgefahren (Kumulationsrisiko)**");
      lines.push("");
      lines.push("| Schaden | Gegner A | Gegner B | Betrag | Risiko |");
      lines.push("|---------|----------|----------|--------|--------|");
      for (const d of doppel) {
        lines.push(
          `| ${d.schaden ?? ""} | ${d.gegner_a ?? ""} | ${d.gegner_b ?? ""} | €${Number(d.betrag ?? 0).toLocaleString("de-DE")} | ${d.risiko ?? ""} |`
        );
      }
      lines.push("");
    }

    lines.push(
      `**Gesamtschaden:** €${totalSumme.toLocaleString("de-DE")} | **Haftungssumme:** €${haftungSumme.toLocaleString("de-DE")}`
    );
    lines.push("");
    lines.push(`**Empfehlung:** ${empfehlung}`);
  } else {
    lines.push("*Cross-Case Matrix konnte nicht generiert werden — keine Daten verfügbar.*");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await safePutPage(
    engine,
    slug,
    {
      type: "cross_case_matrix",
      title: parsed.title ?? `Cross-Case Haftungsmatrix — ${mandateId ?? caseSlug}`,
      compiled_truth: md,
      frontmatter: {
        ...(parsed.frontmatter ?? {}),
        mandate_id: mandateId,
        case_slugs: allSlugs,
      },
    },
    sourceStamp
  );

  return slug;
}

// ── Phase D1: Institutionen-Checkliste ─────────────────────────

async function runInstitutionChecklistLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  jurisdiction: "at" | "de" | "ch" | "eu";
  verfahrenstyp: "straf" | "zivil" | "arbeitsrecht" | "verwaltungsrecht" | "sonstiges";
  additionalOpponents?: LegalPipelineData["additional_opponents"];
  sourceStamp?: string;
  lawSourceIds?: string[];
}): Promise<string> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    jurisdiction,
    verfahrenstyp,
    additionalOpponents,
    sourceStamp,
    lawSourceIds,
  } = opts;

  const opponentInfo = additionalOpponents?.length
    ? `\nAdditional opponents:\n${additionalOpponents.map((o) => `- ${o.name} (${o.rolle}${o.verfahrensschiene ? `, ${o.verfahrensschiene}` : ""})`).join("\n")}`
    : "";

  const prompt = [
    "Prüfe, welche Institutionen für diesen Fall benachrichtigt werden müssen.",
    "",
    `Akte: ${caseSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    `Verfahrenstyp: ${verfahrenstyp}`,
    `Forensischer Bericht: forensic-reports/${caseSlug}`,
    `Entitäten: entities/${caseSlug}`,
    opponentInfo,
    "",
    "Lade den forensischen Bericht und die Entitäten mit get_page.",
    "Prüfe dann pro Institution, ob sie relevant ist.",
    "",
    'Gib JSON zurück: { institutions: [...], urgent_count: N, warning_count: N, info_count: N, empfehlung: "..." }',
  ].join("\n");

  const json = await runSpecialistLayer({
    ctx,
    queue,
    specialistName: "institution-checklist",
    prompt,
    sourceStamp,
    layerId: "institution-checklist",
  });

  const slug = `institution-checklists/${caseSlug}`;
  const lines: string[] = [];
  lines.push(`# Institutionen-Checkliste — ${caseSlug}`);
  lines.push("");
  lines.push(`**Jurisdiktion:** ${jurisdiction} | **Verfahrenstyp:** ${verfahrenstyp}`);
  lines.push("");

  if (json) {
    const institutions = Array.isArray(json.institutions)
      ? (json.institutions as Record<string, unknown>[])
      : [];
    const urgentCount = Number(json.urgent_count ?? 0);
    const warningCount = Number(json.warning_count ?? 0);
    const infoCount = Number(json.info_count ?? 0);
    const empfehlung = String(json.empfehlung ?? "");

    if (institutions.length > 0) {
      lines.push("| Institution | Priorität | Grund | Frist | Draft-Typ | Adresse |");
      lines.push("|-------------|-----------|-------|-------|-----------|---------|");
      for (const inst of institutions) {
        const priorityStr =
          inst.priority === "URGENT"
            ? "🚨 URGENT"
            : inst.priority === "WARNUNG"
              ? "⚠️ WARNUNG"
              : "ℹ️ INFO";
        lines.push(
          `| ${inst.name ?? ""} | ${priorityStr} | ${inst.reason ?? ""} | ${inst.deadline ?? "—"} | ${inst.draft_type ?? "—"} | ${inst.address ?? "—"} |`
        );
      }
      lines.push("");
    } else {
      lines.push("*Keine Institutionen-Meldung erforderlich.*");
      lines.push("");
    }

    lines.push(
      `**🚨 URGENT:** ${urgentCount} | **⚠️ WARNUNG:** ${warningCount} | **ℹ️ INFO:** ${infoCount}`
    );
    lines.push("");
    lines.push(`**Empfehlung:** ${empfehlung}`);
  } else {
    lines.push("*Institutionen-Checkliste konnte nicht generiert werden.*");
  }

  const md = lines.join("\n");
  const parsed = parseMarkdown(md);
  await safePutPage(
    engine,
    slug,
    {
      type: "institution_checklist",
      title: parsed.title ?? `Institutionen-Checkliste — ${caseSlug}`,
      compiled_truth: md,
      frontmatter: { ...(parsed.frontmatter ?? {}) },
    },
    sourceStamp
  );

  return slug;
}

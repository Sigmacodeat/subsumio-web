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
 *   Layer 4: Law Matcher (Haiku) → legal_grounding_map page (§-Retrieval)
 *   Layer 5: Damage+Deadline Extractor (Sonnet) → damage_table + deadline_calendar pages
 *   Layer 5b: Deadline Validator (Sonnet) → deadline_validation page (§-cross-check)
 *   Layer 6: Legal Drafter (Sonnet) → legal_draft pages (jurisdiction-aware: AT/DE/CH/EU)
 *   Layer 6.5: Counter-Argument Layer (Opponent-Simulator) → counter-arguments page
 *              + Draft Rebuttal (revised drafts with refutations)
 *   Layer 7: Ensemble Critic (3-Model Consensus: Opus + DeepSeek + Grok)
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
import { parseMarkdown } from "../../markdown.ts";
import { groundQuotes, normalizeForMatch, tryParseJSON } from "../../legal/llm-util.ts";
import { BudgetTracker, BudgetExhausted } from "../../budget/budget-tracker.ts";
import { classifyLegalDocument, legalDocTypeLabel } from "../../legal/doc-classifier.ts";
import { runContradictionProbe } from "../../eval-contradictions/runner.ts";
import { writeRunRow } from "../../eval-contradictions/trends.ts";

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
  /** Contradiction probe auto-trigger result (Layer 8, non-blocking) */
  contradiction_run_id?: string;
  contradiction_findings?: number;
  /** Ensemble Critic verdict from Layer 7 (3-model consensus) */
  ensemble_verdict?: EnsembleCriticVerdict;
  /** Number of critic feedback loop retries (0 = first run, max 2) */
  retry_count?: number;
  /** Counter-arguments from Layer 6.5 (Opponent-Simulator) */
  counter_arguments?: CounterArgument[];
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
  };
  retry_count: number;
}

interface MapResult {
  batch_idx: number;
  text: string;
  result: unknown;
}

// ── Batching constants ──────────────────────────────────────

const HAIKU_BATCH_SIZE = 12; // ~600K tokens per batch
const SONNET_BATCH_SIZE = 4; // ~200K tokens per batch
const MAX_TURNS_DEFAULT = 20;
const CHILD_TIMEOUT_MS = 30 * 60 * 1000; // 30 min per child
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

    const sourceStamp =
      typeof data.source_id === "string" && data.source_id ? data.source_id : undefined;
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
      };
    }

    // Determine which layers to run
    const rerunLayers = Array.isArray(data.rerun_layers) ? new Set(data.rerun_layers) : null;
    const shouldRunLayer = (n: number): boolean => {
      if (resumeFromLayer) return n >= resumeFromLayer;
      if (rerunLayers) return rerunLayers.has(n);
      return true;
    };

    // ── Load all sub-page texts (haystack for validation) ────
    const allTexts = await loadAllSubPages(engine, data.part_slugs, sourceStamp);
    const allText = allTexts.join("\n\n");

    // ── Layer 0: Semantic document classification (heuristic, $0) ──
    // Classify each sub-page and stamp frontmatter with doc_type.
    // Enables filtered search ("only witness statements") and targeted
    // contradiction detection ("compare all medical reports").
    if (shouldRunLayer(0)) {
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
      if (shouldRunLayer(1)) {
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
          contextJson: "",
        });
        onTable = extractOnEntries(onResult);
        let errors = await validateOnEntries(onTable, allText);

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
            contextJson: "",
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
          });
          onTable = extractOnEntries(retryResult);
          errors = await validateOnEntries(onTable, allText);
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 1 retry still has ${errors.length} validation errors — proceeding with best effort`
            );
          }
        }

        const onIndexSlug = `on-indexes/${data.case_slug}`;
        await writeOnIndexPage(engine, onIndexSlug, data.case_slug, onTable, sourceStamp);
        await updateLayerState(ctx, state, stateSlug, 1, "completed", engine, sourceStamp, [
          onIndexSlug,
        ]);
      } else {
        // Load existing ON table from page
        onTable = await loadOnTableFromPage(engine, data.case_slug, sourceStamp);
        await updateLayerState(ctx, state, stateSlug, 1, "skipped", engine, sourceStamp);
      }

      // ── Layer 2: Entity-Extractor (with retry) ─────────────
      if (shouldRunLayer(2)) {
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
          contextJson: JSON.stringify({ on_table: onTable }),
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
            contextJson: JSON.stringify({ on_table: onTable }),
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
          });
          entities = extractEntityEntries(retryResult);
          errors = await validateEntityEntries(entities, allText);
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 2 retry still has ${errors.length} validation errors — proceeding with best effort`
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
      if (shouldRunLayer(3)) {
        await updateLayerState(ctx, state, stateSlug, 3, "running", engine, sourceStamp);
        const contextJson = JSON.stringify({
          on_table: onTable,
          entities,
          manual_overrides: data.manual_overrides,
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
          contextJson,
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
            contextJson,
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
          });
          forensicReport = extractForensicReport(retryResult);
          errors = await validateForensicReport(forensicReport, onTable, entities, allText);
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 3 retry still has ${errors.length} validation errors — proceeding with best effort`
            );
          }
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
      if (shouldRunLayer(4)) {
        await updateLayerState(ctx, state, stateSlug, 4, "running", engine, sourceStamp);
        legalGroundingMap = await runLawMatcherLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          forensicReport,
          onTable,
          entities,
          sourceStamp,
        });
        let errors = await validateLegalGroundingMap(legalGroundingMap, onTable);

        if (errors.length > 0) {
          console.warn(
            `[legal-pipeline] Layer 4 validation: ${errors.length} errors — proceeding with best effort (non-blocking)`
          );
        }

        const groundingSlug = `legal-grounding/${data.case_slug}`;
        await writeLegalGroundingMapPage(
          engine,
          groundingSlug,
          data.case_slug,
          legalGroundingMap,
          sourceStamp
        );
        await updateLayerState(ctx, state, stateSlug, 4, "completed", engine, sourceStamp, [
          groundingSlug,
        ]);
      } else {
        await updateLayerState(ctx, state, stateSlug, 4, "skipped", engine, sourceStamp);
      }

      // ── Layer 5: Damage + Deadline Extractor (with retry) ──
      if (shouldRunLayer(5)) {
        await updateLayerState(ctx, state, stateSlug, 5, "running", engine, sourceStamp);
        const contextJson = JSON.stringify({
          on_table: onTable,
          entities,
          forensic_report: forensicReport,
          legal_grounding_map: legalGroundingMap,
          manual_overrides: data.manual_overrides,
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
          contextJson,
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
            contextJson,
            retryFeedback: "KORREKTUR ERFORDERLICH:\n" + errors.join("\n"),
          });
          const retryExtracted = extractDamageResult(retryResult);
          damageTable = retryExtracted.damage_table;
          deadlineCalendar = retryExtracted.deadline_calendar;
          dmgErrors = await validateDamageTable(damageTable, onTable, allText);
          dlnErrors = await validateDeadlineCalendar(deadlineCalendar, onTable, allText);
          errors = [...dmgErrors, ...dlnErrors];
          if (errors.length > 0) {
            console.warn(
              `[legal-pipeline] Layer 5 retry still has ${errors.length} validation errors — proceeding with best effort`
            );
          }
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

        // ── Layer 5b: Deadline Validation ───────────────────
        // Validates extracted deadlines against statutory limitation rules
        // (§ 1489 ABGB, § 195 BGB, Art 82 DSGVO, etc.) to prevent
        // liability from using unverified or expired deadlines.
        const outputSlugs = [damageSlug, deadlineSlug];
        try {
          const deadlineValidationSlug = await runDeadlineValidationLayer({
            ctx,
            queue,
            engine,
            caseSlug: data.case_slug,
            deadlineSlug,
            jurisdiction: data.jurisdiction ?? "at",
            sourceStamp,
          });
          if (deadlineValidationSlug) outputSlugs.push(deadlineValidationSlug);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          state.warnings = [...(state.warnings ?? []), `Deadline validation failed: ${msg}`];
          console.warn(`[legal-pipeline] Deadline validation error: ${msg}`);
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
      if (shouldRunLayer(6)) {
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
          sourceStamp,
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
      if (shouldRunLayer(6) && state.layers[6]?.output_slugs?.length) {
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
            sourceStamp,
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
              sourceStamp,
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
      if (shouldRunLayer(7)) {
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
          sourceStamp,
          retryCount,
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
            sourceStamp,
            retryCount,
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
          sourceStamp,
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
  contextJson: string;
  /** Extra context appended to contextJson for retry runs (validation errors) */
  retryFeedback?: string;
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
    contextJson,
    retryFeedback,
  } = opts;
  const def = resolveSpecialist(specialistName);
  if (!def) throw new Error(`legal-pipeline: unknown specialist "${specialistName}"`);

  // ── Map phase: batch sub-pages and submit ALL in parallel ─────
  const batches = batchTexts(allTexts, batchSize);
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
    };
    if (def.model) childData.model = def.model;
    if (sourceStamp) childData._source_id = sourceStamp;

    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: "continue",
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

  const reduceChild = await queue.add(
    "subagent",
    reduceChildData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
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
  sourceStamp?: string;
}): Promise<LegalGroundingEntry[]> {
  const { ctx, queue, engine, caseSlug, forensicReport, onTable, entities, sourceStamp } = opts;
  const def = resolveSpecialist("law-matcher");
  if (!def) throw new Error("legal-pipeline: law-matcher specialist not found");

  const contextJson = JSON.stringify({
    on_table: onTable,
    entities,
    forensic_report: forensicReport,
  });

  const prompt = [
    "## AUFGABE: Legal Grounding — Match forensische Befunde gegen Gesetzeskorpus",
    "",
    `Akte: ${caseSlug}`,
    "",
    "Du erhältst den forensischen Bericht, die ON-Tabelle und die Entity-Liste.",
    "Für JEDEN Amtshaftungspunkt und Jede unterlassene Maßnahme:",
    "1. Extrahiere die rechtlichen Kernbegriffe",
    "2. Suche im Brain (law-at/de/ch/eu) nach relevanten §§ mit search/query",
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

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
      max_stalled: 3,
    },
    { allowProtectedSubmit: true }
  );

  const result = await waitForChild(ctx, child.id);
  return extractLegalGroundingMap(result);
}

// ── Draft Layer (Jurisdiction-Aware Packages) ──────────────

interface DraftPackage {
  type: string;
  title: string;
}

/** Per-jurisdiction draft packages.
 *  AT: Amtshaftung, Strafantrag, Einspruch, DSGVO, Klage, Versand
 *  DE: Amtshaftung (§ 839 BGB), Strafanzeige, Widerspruch, DSGVO, Klage, Versand
 *  CH: Staatshaftung (Art 61 BV), Strafanzeige, Beschwerde, DSGVO, Klage, Versand
 *  EU: Generic EU-level complaint + DSGVO + Versand
 */
const DRAFT_PACKAGES_BY_JURISDICTION: Record<"at" | "de" | "ch" | "eu", DraftPackage[]> = {
  at: [
    { type: "ahg_antrag", title: "AHG-Antrag (§ 8 AHG an Finanzprokuratur)" },
    { type: "strafantrag", title: "Strafantrag (§ 28 StPO an STA)" },
    { type: "einspruch", title: "Einspruch (§ 106 StPO)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
    { type: "klage_entwurf", title: "Klageentwurf (AHG-Klage LG ZRS)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
  de: [
    { type: "amtshaftung_anspruch", title: "Amtshaftungsanspruch (§ 839 BGB i.V.m. Art 34 GG)" },
    { type: "strafanzeige", title: "Strafanzeige (§ 158 StPO an STA)" },
    { type: "widerspruch", title: "Widerspruch (§ 69 VwGO)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
    { type: "klage_entwurf", title: "Klageentwurf (Landgericht Zivilkammer)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
  ch: [
    { type: "staatshaftung", title: "Staatshaftungsanspruch (Art 61 BV)" },
    { type: "strafanzeige", title: "Strafanzeige (Art 118 StPO an Staatsanwaltschaft)" },
    { type: "beschwerde", title: "Beschwerde (Art 80 BGG)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO / nDSG)" },
    { type: "klage_entwurf", title: "Klageentwurf (Bezirks-/Kantonsgericht)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
  eu: [
    { type: "eu_beschwerde", title: "EU-Beschwerde (an EU-Institution)" },
    { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
    { type: "menschrechts_beschwerde", title: "EMRK-Beschwerde (Art 13 EMRK)" },
    { type: "versand_checkliste", title: "Versand-Checkliste" },
  ],
};

/** Backward-compatible default (AT). */
const DRAFT_PACKAGES = DRAFT_PACKAGES_BY_JURISDICTION.at;

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
  sourceStamp?: string;
}): Promise<{ counterArguments: CounterArgument[]; counterSlug: string }> {
  const { ctx, queue, engine, caseSlug, draftSlugs, forensicReportSlug, sourceStamp } = opts;
  const def = resolveSpecialist("opponent-simulator");
  if (!def) throw new Error("legal-pipeline: opponent-simulator specialist not found");

  const prompt = [
    "Du bist die GEGENSEITE. Lies alle Entwürfe und den forensischen Bericht, und widerlege die Klageargumentation.",
    "",
    `Akte: ${caseSlug}`,
    `Entwurf-Pages: ${draftSlugs.join(", ")}`,
    forensicReportSlug ? `Forensischer Bericht: ${forensicReportSlug}` : "",
    "",
    "Lade jede Page mit get_page und analysiere systematisch die Schwächen.",
    "Suche im Brain (law-at, law-de, law-ch, law-eu) nach §§ die GEGEN die Klage sprechen.",
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

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
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
  sourceStamp?: string;
}): Promise<string[]> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    draftSlugs,
    counterArguments,
    jurisdiction = "at",
    sourceStamp,
  } = opts;
  const def = resolveSpecialist("legal-drafter");
  if (!def) throw new Error("legal-pipeline: legal-drafter specialist not found");
  const packages = DRAFT_PACKAGES_BY_JURISDICTION[jurisdiction] ?? DRAFT_PACKAGES;

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

    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: "continue",
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
    const pkg = DRAFT_PACKAGES.find((p) => p.type === pkgType)!;
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
  sourceStamp?: string;
}): Promise<string | null> {
  const { ctx, queue, engine, caseSlug, deadlineSlug, jurisdiction, sourceStamp } = opts;
  const def = resolveSpecialist("deadline-validator");
  if (!def) throw new Error("legal-pipeline: deadline-validator specialist not found");

  const prompt = [
    "Prüfe alle extrahierten Fristen gegen die gesetzlichen Verjährungsregeln.",
    "",
    `Akte: ${caseSlug}`,
    `Fristenkalender: ${deadlineSlug}`,
    `Jurisdiktion: ${jurisdiction}`,
    "",
    "Lade den Fristenkalender mit get_page und validiere jede Frist.",
    `Suche im Brain (law-${jurisdiction}, law-eu) nach den relevanten Verjährungs-§§.`,
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

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
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
  sourceStamp?: string;
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
    sourceStamp,
  } = opts;
  const def = resolveSpecialist("legal-drafter");
  if (!def) throw new Error("legal-pipeline: legal-drafter specialist not found");

  const packages = DRAFT_PACKAGES_BY_JURISDICTION[jurisdiction] ?? DRAFT_PACKAGES;

  const contextJson = JSON.stringify({
    on_table: onTable,
    entities,
    forensic_report: forensicReport,
    legal_grounding_map: legalGroundingMap,
    damage_table: damageTable,
    deadline_calendar: deadlineCalendar,
    manual_overrides: manualOverrides,
    jurisdiction,
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

    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: "continue",
        max_stalled: 3,
      },
      { allowProtectedSubmit: true }
    );
    childIds.push(child.id);
  }

  const slugs: string[] = [];
  for (let i = 0; i < childIds.length; i++) {
    const result = await waitForChild(ctx, childIds[i]!);
    const slug = `legal-drafts/${caseSlug}-${packages[i]!.type}`;
    await writeLegalDraftPage(engine, slug, caseSlug, packages[i]!, result, sourceStamp);
    slugs.push(slug);
  }
  return slugs;
}

// ── Ensemble Critic Layer (3-Model Consensus) ──────────────

/** Models for the ensemble critic — diverse perspectives for robust quality gate. */
const ENSEMBLE_CRITIC_MODELS = [
  "anthropic:claude-opus-4-7", // Highest legal quality (BenGER 82.2)
  "deepseek:deepseek-chat", // Different training, cost-effective (LEXam 57.42)
  "xai:grok-4.3", // Different perspective, fast (HAQQ 29.0)
];

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
  sourceStamp?: string;
}): Promise<string | null> {
  const { ctx, queue, engine, caseSlug, outputSlugs, legalGroundingMap, sourceStamp } = opts;
  const def = resolveSpecialist("subsumption-checker");
  if (!def) throw new Error("legal-pipeline: subsumption-checker specialist not found");

  const groundingSlugs = legalGroundingMap ? [`legal-grounding-maps/${caseSlug}`] : [];

  const prompt = [
    "Prüfe die juristische Subsumtion (Obersatz → Untersatz → Schluss) aller Pipeline-Outputs.",
    "",
    `Akte: ${caseSlug}`,
    `Output-Pages: ${outputSlugs.join(", ")}`,
    `Legal Grounding Map: ${groundingSlugs.join(", ")}`,
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

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
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
  const score =
    typeof json.overall_subsumption_score === "number" ? json.overall_subsumption_score : 0;
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
  sourceStamp?: string;
  retryCount?: number;
}): Promise<{ verdict: EnsembleCriticVerdict; auditSlug: string }> {
  const {
    ctx,
    queue,
    engine,
    caseSlug,
    partSlugs,
    state,
    legalGroundingMap,
    sourceStamp,
    retryCount = 0,
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
  try {
    const subsumptionResult = await runSubsumptionCheck({
      ctx,
      queue,
      engine,
      caseSlug,
      outputSlugs,
      legalGroundingMap,
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

  const prompt = [
    "Überprüfe alle Pipeline-Outputs für diese Akte auf Halluzinationen, Citation-Accuracy, Vollständigkeit und juristische Logik.",
    "",
    `Akte: ${caseSlug}`,
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
    "8. SUBSUMTION: Ist der juristische Syllogismus (Obersatz → Untersatz → Schluss) korrekt?",
    "",
    subsumptionContext
      ? `## SUBSUMPTIONS-PRÜFUNG (vorab durchgeführt):\n${subsumptionContext}\n`
      : "",
    "Gib ein JSON zurück:",
    '{ "total_score": 0-100, "recommendation": "publish|revise|reject", "issues": [...], "layer_scores": { "1": 90, "2": 85, ... } }',
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

    const child = await queue.add(
      "subagent",
      childData,
      {
        parent_job_id: ctx.id,
        on_child_fail: "continue",
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
  const totalScore = typeof json.total_score === "number" ? json.total_score : 50;
  const rec = json.recommendation;
  const recommendation = rec === "publish" || rec === "revise" || rec === "reject" ? rec : "revise";
  const issues = Array.isArray(json.issues) ? json.issues.filter((i) => typeof i === "string") : [];
  const layerScores =
    typeof json.layer_scores === "object" && json.layer_scores !== null
      ? (json.layer_scores as Record<string, number>)
      : {};
  return { total_score: totalScore, recommendation, issues, layer_scores: layerScores };
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

  return {
    recommendation,
    total_score: totalScore,
    issues: [...issueSet],
    layer_scores: layerScores,
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
        contextJson: "",
        retryFeedback,
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
        contextJson: JSON.stringify({ on_table: onTable }),
        retryFeedback,
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
      state.layers[4]!.output_slugs = [groundingSlug];
      break;
    }
    case 5: {
      // Damage+Deadline Extractor
      const contextJson = JSON.stringify({
        on_table: onTable,
        entities,
        forensic_report: forensicReport,
        legal_grounding_map: legalGroundingMap,
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
      state.layers[5]!.output_slugs = [damageSlug, deadlineSlug];
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
        sourceStamp,
      });
      state.layers[6]!.output_slugs = draftSlugs;
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
  sourceStamp?: string;
}): Promise<string> {
  const { ctx, queue, engine, caseSlug, partSlugs, state, legalGroundingMap, sourceStamp } = opts;
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

  const child = await queue.add(
    "subagent",
    childData,
    {
      parent_job_id: ctx.id,
      on_child_fail: "continue",
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
  sourceStamp?: string;
}): Promise<{ run_id: string; total_findings: number } | null> {
  const { engine, caseSlug, state, partSlugs, sourceStamp } = opts;

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

function buildDraftPrompt(
  pkg: (typeof DRAFT_PACKAGES)[number],
  caseSlug: string,
  contextJson: string
): string {
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
}

interface EntityEntry {
  name: string;
  type: string;
  role: string;
  aliases: string[];
  on_references: string[];
  quote: string;
  metadata?: Record<string, unknown>;
}

interface ForensicReport {
  summary: Record<string, unknown>;
  chronologie: Array<Record<string, unknown>>;
  unterlassene_massnahmen: Array<Record<string, unknown>>;
  nicht_vernommene_personen: Array<Record<string, unknown>>;
  geldfluss: Array<Record<string, unknown>>;
  amtshaftungspunkte: Array<Record<string, unknown>>;
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
  source_text: string;
  confidence: string;
  verified: boolean;
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
  sourceId?: string
): Promise<void> {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "ON-Verzeichnis — ${caseSlug}"`);
  lines.push(`type: on_index`);
  lines.push(`case_ref: ${caseSlug}`);
  lines.push(`total_on: ${entries.length}`);
  lines.push(`total_pages: 0`);
  lines.push("---");
  lines.push("");
  lines.push("| ON | Datum | Typ | Seiten | Personen | Verfahren | Anwälte |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const e of entries) {
    lines.push(
      `| ${e.on_nummer} | ${e.datum} | ${e.typ} | ${e.seiten} | ${e.personen.join(", ")} | ${e.verfahren ?? ""} | ${(e.anwaelte ?? []).join(", ")} |`
    );
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
    lines.push(`aliases: [${e.aliases.map((a) => `"${a}"`).join(", ")}]`);
    lines.push(`on_references: [${e.on_references.map((r) => `"${r}"`).join(", ")}]`);
    lines.push("---");
    lines.push("");
    lines.push(`> ${e.quote}`);
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

async function writeLegalDraftPage(
  engine: BrainEngine,
  slug: string,
  caseSlug: string,
  pkg: (typeof DRAFT_PACKAGES)[number],
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
  const score = parsed && typeof parsed.total_score === "number" ? parsed.total_score : 0;
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
  const md = `---\ntitle: "Pipeline-State — ${state.case_slug}"\ntype: pipeline_state\ncase_ref: ${state.case_slug}\nstatus: ${state.status}\ncurrent_layer: ${state.current_layer}\n---\n\n${JSON.stringify(state, null, 2)}`;
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
    });
  }
  return entities;
}

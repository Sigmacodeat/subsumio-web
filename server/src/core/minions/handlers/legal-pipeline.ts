/**
 * Legal Pipeline Handler — 6-Layer Agent Pipeline V2 (v0.44).
 *
 * Automatische Fallaufarbeitung nach Upload eines Gerichtsakts.
 * Feste 6-Layer-Sequenz mit Map-Reduce, Cross-Layer-Validation,
 * Pipeline-State-Tracking und strukturierten Page-Outputs.
 *
 * Architektur:
 *   Layer 1: ON-Scanner (Haiku) → on_index page
 *   Layer 2: Entity-Extractor (Haiku) → entity pages
 *   Layer 3: Forensic Analyst (Sonnet) → forensic_report page
 *   Layer 4: Damage+Deadline Extractor (Sonnet) → damage_table + deadline_calendar pages
 *   Layer 5: Legal Drafter (Sonnet) → legal_draft pages (6 Pakete parallel)
 *   Layer 6: Legal Critic (Opus) → quality_audit page
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
   * and continues from the specified layer (3-6). Requires that
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
  status: "pending" | "running" | "completed" | "failed" | "revised" | "awaiting_review";
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
    if (shouldRunLayer(1)) {
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
            total: 7,
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

      // ── Layer 4: Damage + Deadline Extractor (with retry) ──
      if (shouldRunLayer(4)) {
        await updateLayerState(ctx, state, stateSlug, 4, "running", engine, sourceStamp);
        const contextJson = JSON.stringify({
          on_table: onTable,
          entities,
          forensic_report: forensicReport,
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
          console.warn(`[legal-pipeline] Layer 4 validation: ${errors.length} errors, retrying...`);
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
              `[legal-pipeline] Layer 4 retry still has ${errors.length} validation errors — proceeding with best effort`
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
        await updateLayerState(ctx, state, stateSlug, 4, "completed", engine, sourceStamp, [
          damageSlug,
          deadlineSlug,
        ]);
      } else {
        await updateLayerState(ctx, state, stateSlug, 4, "skipped", engine, sourceStamp);
      }

      // ── Layer 5: Legal Drafter (6 Pakete parallel) ────────
      if (shouldRunLayer(5)) {
        await updateLayerState(ctx, state, stateSlug, 5, "running", engine, sourceStamp);
        const draftSlugs = await runDraftLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          onTable,
          entities,
          forensicReport,
          damageTable,
          deadlineCalendar,
          manualOverrides: data.manual_overrides,
          sourceStamp,
        });
        await updateLayerState(
          ctx,
          state,
          stateSlug,
          5,
          "completed",
          engine,
          sourceStamp,
          draftSlugs
        );
      } else {
        await updateLayerState(ctx, state, stateSlug, 5, "skipped", engine, sourceStamp);
      }

      // ── Layer 6: Legal Critic ──────────────────────────────
      if (shouldRunLayer(6)) {
        await updateLayerState(ctx, state, stateSlug, 6, "running", engine, sourceStamp);
        const auditSlug = await runCriticLayer({
          ctx,
          queue,
          engine,
          caseSlug: data.case_slug,
          partSlugs: data.part_slugs,
          state,
          sourceStamp,
        });
        await updateLayerState(ctx, state, stateSlug, 6, "completed", engine, sourceStamp, [
          auditSlug,
        ]);
      } else {
        await updateLayerState(ctx, state, stateSlug, 6, "skipped", engine, sourceStamp);
      }

      // ── Finalize ───────────────────────────────────────────
      state.status = "completed";
      state.current_layer = 6;
      state.total_duration_ms = Date.now() - startTime;
      state.cost_spent_usd = budget.totalSpent;
      state.updated_at = new Date().toISOString();
      await persistPipelineState(engine, stateSlug, state, sourceStamp);

      await ctx.updateProgress({ step: 7, total: 7, message: "Pipeline completed" });

      return {
        case_slug: data.case_slug,
        status: "completed",
        layers: state.layers,
        total_duration_ms: state.total_duration_ms,
        cost_spent_usd: budget.totalSpent,
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

// ── Draft Layer (6 Pakete parallel) ─────────────────────────

const DRAFT_PACKAGES = [
  { type: "ahg_antrag", title: "AHG-Antrag (§ 8 AHG an Finanzprokuratur)" },
  { type: "strafantrag", title: "Strafantrag (§ 28 StPO an STA)" },
  { type: "einspruch", title: "Einspruch (§ 106 StPO)" },
  { type: "dsgvo_beschwerde", title: "DSGVO-Beschwerde (Art 82 DSGVO)" },
  { type: "klage_entwurf", title: "Klageentwurf (AHG-Klage LG ZRS)" },
  { type: "versand_checkliste", title: "Versand-Checkliste" },
];

async function runDraftLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  onTable: OnEntry[];
  entities: EntityEntry[];
  forensicReport: ForensicReport | null;
  damageTable: DamageEntry[];
  deadlineCalendar: DeadlineEntry[];
  manualOverrides?: LegalPipelineData["manual_overrides"];
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
    damageTable,
    deadlineCalendar,
    manualOverrides,
    sourceStamp,
  } = opts;
  const def = resolveSpecialist("legal-drafter");
  if (!def) throw new Error("legal-pipeline: legal-drafter specialist not found");

  const contextJson = JSON.stringify({
    on_table: onTable,
    entities,
    forensic_report: forensicReport,
    damage_table: damageTable,
    deadline_calendar: deadlineCalendar,
    manual_overrides: manualOverrides,
  });

  const childIds: number[] = [];
  for (const pkg of DRAFT_PACKAGES) {
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
    const slug = `legal-drafts/${caseSlug}-${DRAFT_PACKAGES[i]!.type}`;
    await writeLegalDraftPage(engine, slug, caseSlug, DRAFT_PACKAGES[i]!, result, sourceStamp);
    slugs.push(slug);
  }
  return slugs;
}

// ── Critic Layer ────────────────────────────────────────────

async function runCriticLayer(opts: {
  ctx: MinionJobContext;
  queue: MinionQueue;
  engine: BrainEngine;
  caseSlug: string;
  partSlugs: string[];
  state: PipelineState;
  sourceStamp?: string;
}): Promise<string> {
  const { ctx, queue, engine, caseSlug, partSlugs, state, sourceStamp } = opts;
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
    "5. Jede §-Angabe ist verifizierbar",
    "6. Keine Fristen wurden berechnet (alle verbatim)",
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

interface OnEntry {
  on_nummer: string;
  datum: string;
  typ: string;
  seiten: string;
  personen: string[];
  verfahren?: string;
  anwaelte?: string[];
  quote: string;
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

// ── Extraction helpers ──────────────────────────────────────

function extractOnEntries(result: unknown): OnEntry[] {
  const parsed =
    typeof result === "string" ? tryParseJSON(result) : (result as Record<string, unknown> | null);
  if (!parsed) return [];
  const entries = parsed.on_entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(
    (e): e is OnEntry =>
      e != null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).on_nummer === "string" &&
      typeof (e as Record<string, unknown>).quote === "string"
  );
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

// ── Validation (Cross-Layer) ────────────────────────────────

async function validateOnEntries(entries: OnEntry[], allText: string): Promise<string[]> {
  const haystack = normalizeForMatch(allText);
  const errors: string[] = [];
  for (const e of entries) {
    const q = normalizeForMatch(e.quote);
    if (q.length >= 8 && !haystack.includes(q)) {
      errors.push(`ON ${e.on_nummer}: Zitat nicht im Originalakt gefunden`);
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
    console.error(
      `[legal-pipeline] Failed to persist state: ${e instanceof Error ? e.message : String(e)}`
    );
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
  const entries: OnEntry[] = [];
  const rows = text
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("|---") && !l.startsWith("| ON"));
  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 5) {
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

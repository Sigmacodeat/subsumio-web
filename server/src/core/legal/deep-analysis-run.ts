/**
 * Async arm of Deep Analysis: the run state of a background job.
 *
 * A deep analysis reads up to 25 documents and makes ONE long chat call over
 * all of them. Run synchronously it blocked the request for minutes and was
 * lost when the lawyer closed the tab. The run now lives on a brain page
 * (type `deep_analysis_run`, slug `deep_analysis/<id>`): the frontmatter holds
 * the machine-readable state (phase, documents, report, error), compiled_truth
 * a short markdown summary. The web route polls the page; the handler
 * (core/minions/handlers/deep-analysis.ts) writes it.
 *
 * Same pattern as core/legal/tabular-review.ts, including the transactional
 * read-modify-write (SELECT ... FOR UPDATE) so a cancel request and the job
 * never clobber each other, and the JSONB invariant (raw object into
 * $1::jsonb, never JSON.stringify).
 */

import type { BrainEngine } from "../engine.ts";
import type { DeepAnalysisReport } from "./deep-analysis.ts";

export const DEEP_ANALYSIS_PAGE_TYPE = "deep_analysis_run";
export const DEEP_ANALYSIS_SLUG_PREFIX = "deep_analysis/";

export type DeepAnalysisRunStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** What the run is doing right now — shown to the lawyer while waiting. */
export type DeepAnalysisPhase = "queued" | "loading" | "analysing" | "grounding" | "finished";

export const PHASE_LABELS: Record<DeepAnalysisPhase, string> = {
  queued: "In der Warteschlange",
  loading: "Dokumente werden gelesen",
  analysing: "Analyse läuft",
  grounding: "Zitate werden geprüft",
  finished: "Fertig",
};

export interface DeepAnalysisRunDoc {
  slug: string;
  title: string;
}

export interface DeepAnalysisRunState {
  run_slug: string;
  title: string;
  status: DeepAnalysisRunStatus;
  phase: DeepAnalysisPhase;
  docs: DeepAnalysisRunDoc[];
  prompt: string | null;
  jurisdiction: string;
  case_slug: string | null;
  report: DeepAnalysisReport | null;
  error: string | null;
  /** The lawyer asked to stop. Honoured between phases (see below). */
  cancel_requested: boolean;
  /**
   * The cancel arrived after the model call had started. The run finished and
   * the result is kept — the work was paid for either way.
   */
  cancel_too_late: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  job_id: string | null;
  source_id: string;
  created_by_user_id?: string;
  matter_scope?: string[] | "all";
  acl_groups?: string[] | "all";
}

export function newDeepAnalysisRunState(opts: {
  run_slug: string;
  title: string;
  docs: DeepAnalysisRunDoc[];
  prompt?: string | null;
  jurisdiction: string;
  case_slug?: string | null;
  source_id: string;
  created_by_user_id?: string;
  matter_scope?: string[] | "all";
  acl_groups?: string[] | "all";
}): DeepAnalysisRunState {
  return {
    run_slug: opts.run_slug,
    title: opts.title,
    status: "queued",
    phase: "queued",
    docs: opts.docs,
    prompt: opts.prompt ?? null,
    jurisdiction: opts.jurisdiction,
    case_slug: opts.case_slug ?? null,
    report: null,
    error: null,
    cancel_requested: false,
    cancel_too_late: false,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    job_id: null,
    source_id: opts.source_id,
    ...(opts.created_by_user_id ? { created_by_user_id: opts.created_by_user_id } : {}),
    ...(opts.matter_scope !== undefined ? { matter_scope: opts.matter_scope } : {}),
    ...(opts.acl_groups !== undefined ? { acl_groups: opts.acl_groups } : {}),
  };
}

const STATUSES: DeepAnalysisRunStatus[] = ["queued", "running", "done", "failed", "cancelled"];
const PHASES: DeepAnalysisPhase[] = ["queued", "loading", "analysing", "grounding", "finished"];

/** Defensive parse of a frontmatter blob back into a run state. */
export function parseDeepAnalysisRunState(frontmatter: unknown): DeepAnalysisRunState | null {
  try {
    const fm =
      typeof frontmatter === "string"
        ? (JSON.parse(frontmatter) as Record<string, unknown>)
        : (frontmatter as Record<string, unknown> | null);
    if (!fm || typeof fm !== "object" || !Array.isArray(fm.docs)) return null;
    const status = STATUSES.includes(fm.status as DeepAnalysisRunStatus)
      ? (fm.status as DeepAnalysisRunStatus)
      : "queued";
    const phase = PHASES.includes(fm.phase as DeepAnalysisPhase)
      ? (fm.phase as DeepAnalysisPhase)
      : "queued";
    return {
      run_slug: String(fm.run_slug ?? ""),
      title: String(fm.title ?? "Tiefenanalyse"),
      status,
      phase,
      docs: (fm.docs as Array<Record<string, unknown>>)
        .map((d) => ({ slug: String(d?.slug ?? ""), title: String(d?.title ?? d?.slug ?? "") }))
        .filter((d) => d.slug),
      prompt: typeof fm.prompt === "string" ? fm.prompt : null,
      jurisdiction: String(fm.jurisdiction ?? "all"),
      case_slug: typeof fm.case_slug === "string" ? fm.case_slug : null,
      report: (fm.report as DeepAnalysisReport | null) ?? null,
      error: typeof fm.error === "string" ? fm.error : null,
      cancel_requested: fm.cancel_requested === true,
      cancel_too_late: fm.cancel_too_late === true,
      created_at: String(fm.created_at ?? new Date().toISOString()),
      started_at: typeof fm.started_at === "string" ? fm.started_at : null,
      finished_at: typeof fm.finished_at === "string" ? fm.finished_at : null,
      job_id: typeof fm.job_id === "string" ? fm.job_id : null,
      source_id: String(fm.source_id ?? "default"),
      ...(typeof fm.created_by_user_id === "string"
        ? { created_by_user_id: fm.created_by_user_id }
        : {}),
      ...(fm.matter_scope !== undefined
        ? { matter_scope: fm.matter_scope as string[] | "all" }
        : {}),
      ...(fm.acl_groups !== undefined ? { acl_groups: fm.acl_groups as string[] | "all" } : {}),
    };
  } catch {
    return null;
  }
}

export function deepAnalysisRunMarkdown(state: DeepAnalysisRunState): string {
  const lines = [
    `# ${state.title}`,
    "",
    `Status: ${state.status} (${PHASE_LABELS[state.phase]})`,
    `Dokumente: ${state.docs.length}`,
  ];
  if (state.report?.executive_summary) {
    lines.push("", "## Zusammenfassung", state.report.executive_summary);
  }
  if (state.error) lines.push("", `Fehler: ${state.error}`);
  return lines.join("\n");
}

export async function writeDeepAnalysisRun(
  engine: BrainEngine,
  state: DeepAnalysisRunState
): Promise<void> {
  await engine.putPage(
    state.run_slug,
    {
      type: DEEP_ANALYSIS_PAGE_TYPE,
      title: state.title,
      compiled_truth: deepAnalysisRunMarkdown(state),
      frontmatter: { ...(state as unknown as Record<string, unknown>) },
    },
    { sourceId: state.source_id }
  );
}

export async function readDeepAnalysisRun(
  engine: BrainEngine,
  runSlug: string,
  sourceId?: string
): Promise<DeepAnalysisRunState | null> {
  const page = await engine.getPage(runSlug, sourceId !== undefined ? { sourceId } : undefined);
  if (!page || page.type !== DEEP_ANALYSIS_PAGE_TYPE) return null;
  return parseDeepAnalysisRunState(page.frontmatter);
}

/**
 * Transactional read-modify-write. The page row is locked, so a cancel
 * request from the browser and the job's own phase updates serialize.
 */
export async function patchDeepAnalysisRun(
  engine: BrainEngine,
  runSlug: string,
  sourceId: string,
  mutate: (state: DeepAnalysisRunState) => void
): Promise<DeepAnalysisRunState | null> {
  return engine.transaction(async (tx) => {
    const rows = await tx.executeRaw<{ frontmatter: unknown }>(
      `SELECT frontmatter FROM pages
        WHERE source_id = $1 AND slug = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [sourceId, runSlug]
    );
    if (rows.length === 0) return null;
    const state = parseDeepAnalysisRunState(rows[0]!.frontmatter);
    if (!state) return null;
    mutate(state);
    await tx.executeRaw(
      `UPDATE pages
          SET frontmatter = $1::jsonb, compiled_truth = $2, updated_at = now()
        WHERE source_id = $3 AND slug = $4`,
      [
        state as unknown as Record<string, unknown>,
        deepAnalysisRunMarkdown(state),
        sourceId,
        runSlug,
      ]
    );
    return state;
  });
}

/** What the browser is allowed to see — no tenant or ACL stamps. */
export function deepAnalysisRunSummary(state: DeepAnalysisRunState) {
  return {
    run_slug: state.run_slug,
    title: state.title,
    status: state.status,
    phase: state.phase,
    phase_label: PHASE_LABELS[state.phase],
    documents: state.docs,
    document_count: state.docs.length,
    case_slug: state.case_slug,
    report: state.report,
    error: state.error,
    cancel_requested: state.cancel_requested,
    cancel_too_late: state.cancel_too_late,
    created_at: state.created_at,
    started_at: state.started_at,
    finished_at: state.finished_at,
  };
}

/**
 * tabular-review — shared core for Tabular Review (N documents × M questions
 * → answer table with citations).
 *
 * Two consumers import from here:
 *
 *   1. The synchronous MVP route POST /api/legal/tabular-review (web-api.ts)
 *      uses `reviewTabularDocumentSync`. Its behavior is SHAPE-LOCKED and
 *      must not change: one chat call per document over all questions,
 *      content clipped at 16k chars, maxTokens 1200, document-level
 *      `{slug, title}` citations.
 *
 *   2. The asynchronous `tabular-review` Minion job
 *      (core/minions/handlers/tabular-review.ts) uses
 *      `reviewTabularDocumentQuotes` — verbatim quote citations verified
 *      against the document via groundQuotes — plus the run-state
 *      persistence helpers (`newTabularRunState`, `writeTabularRun`,
 *      `readTabularRun`, `patchTabularRun`).
 *
 * Async run state lives on a brain page (type `tabular_review`, slug
 * `tabular_review/<id>`): the frontmatter carries the full machine-readable
 * TabularRunState (status, progress, questions, rows, estimate, timestamps),
 * compiled_truth a best-effort markdown summary. Per-row progress updates go
 * through `patchTabularRun` (transactional read-modify-write with
 * SELECT ... FOR UPDATE) so a retry job and the polling GET route never
 * observe torn state and concurrent jobs can't clobber each other's rows.
 */

import type { BrainEngine } from "../engine.ts";
import {
  clipText,
  asStringArray,
  groundQuotes,
  resolveDocumentText,
  type LegalLLM,
} from "./llm-util.ts";
import { canonicalLookup } from "../model-pricing.ts";

// ── Constants ───────────────────────────────────────────────

/** Document text is clipped at 16k chars before prompting (sync + async). */
export const TABULAR_REVIEW_MAX_CHARS = 16000;
/** Sync route output budget — locked by the existing route's behavior. */
export const TABULAR_REVIEW_SYNC_MAX_TOKENS = 1200;
/** Page type of the async run-state page. */
export const TABULAR_REVIEW_PAGE_TYPE = "tabular_review";
/** Run-state slug prefix: tabular_review/<id>. */
export const TABULAR_REVIEW_SLUG_PREFIX = "tabular_review/";

/**
 * Output-token budget per document for the async (quote) variant. Scales
 * with question count so 50-question runs don't truncate; the sync variant
 * always uses TABULAR_REVIEW_SYNC_MAX_TOKENS (behavior-locked).
 */
export function tabularReviewMaxTokens(questionCount: number): number {
  return Math.min(8000, Math.max(TABULAR_REVIEW_SYNC_MAX_TOKENS, questionCount * 150));
}

// ── Shared cell/doc types ───────────────────────────────────

export interface TabularDocRef {
  slug: string;
  title: string;
}

/** Sync route cell shape (locked): document-level citation. */
export interface TabularSyncCell {
  answer: string;
  citations: TabularDocRef[];
}

export interface TabularSyncDocResult {
  slug: string;
  title: string;
  cells: TabularSyncCell[];
}

/** Async run cell shape: verified verbatim quotes from the document. */
export interface TabularQuoteCell {
  answer: string;
  citations: string[];
}

export interface TabularQuoteDocResult {
  slug: string;
  title: string;
  cells: TabularQuoteCell[];
}

// ── Prompts + parsing (per-document logic, shared) ─────────

const SYNC_SYSTEM_PROMPT =
  "Du beantwortest Fragen ausschließlich auf Basis des bereitgestellten Dokuments. " +
  'Antworte knapp und faktisch. Wenn das Dokument eine Frage nicht beantwortet, schreibe genau "nicht im Dokument". ' +
  "Antworte als JSON-Array von Strings, je ein Eintrag pro Frage in Reihenfolge.";

const QUOTE_SYSTEM_PROMPT =
  "Du beantwortest Fragen ausschließlich auf Basis des bereitgestellten Dokuments. " +
  "Antworte knapp und faktisch. Wenn das Dokument eine Frage nicht beantwortet, schreibe als answer genau " +
  '"nicht im Dokument". Belege jede beantwortete Frage mit 1–2 wörtlichen Zitaten (quotes) aus dem Dokument ' +
  "(exakter Wortlaut, keine Ellipsen, keine Umformulierungen). " +
  'Antworte als JSON-Array von Objekten {"answer": string, "quotes": string[]}, je ein Eintrag pro Frage in Reihenfolge.';

function numberedQuestions(questions: string[]): string {
  return questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
}

function buildUserPrompt(title: string, clippedContent: string, questions: string[]): string {
  return `DOKUMENT "${title}":\n\n${clippedContent}\n\nFRAGEN:\n${numberedQuestions(questions)}`;
}

/** Parse the sync shape (JSON array of strings), tolerating prose around it. */
export function parseTabularAnswerArray(text: string): string[] {
  try {
    const m = text.match(/\[[\s\S]*\]/);
    const parsed = m ? JSON.parse(m[0]) : [];
    return Array.isArray(parsed) ? parsed.map((a) => String(a)) : [];
  } catch {
    return [];
  }
}

interface ParsedAnswerQuotes {
  answer: string;
  quotes: string[];
}

/** Parse the quote shape (JSON array of {answer, quotes}); bare strings tolerated. */
export function parseTabularAnswerQuotes(text: string): ParsedAnswerQuotes[] {
  try {
    const m = text.match(/\[[\s\S]*\]/);
    const parsed = m ? JSON.parse(m[0]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item): ParsedAnswerQuotes => {
      if (typeof item === "string") return { answer: item, quotes: [] };
      const obj = (item ?? {}) as Record<string, unknown>;
      const rawAnswer = obj.answer;
      return {
        answer:
          typeof rawAnswer === "string" ? rawAnswer : rawAnswer == null ? "—" : String(rawAnswer),
        quotes: asStringArray(obj.quotes),
      };
    });
  } catch {
    return [];
  }
}

/** "—" cells for documents without analyzable text. */
function emptyCells<T>(questions: string[], make: () => T): T[] {
  return questions.map(() => make());
}

/**
 * Sync-variant per-document review — extracted verbatim from the original
 * POST /api/legal/tabular-review handler. Throws on LLM failure (the route
 * catches per document and renders `Fehler: <msg>` cells, unchanged).
 */
export async function reviewTabularDocumentSync(
  llm: LegalLLM,
  input: { slug: string; title: string; questions: string[]; text: string }
): Promise<TabularSyncDocResult> {
  const { clipped } = clipText(input.text, TABULAR_REVIEW_MAX_CHARS);
  if (!clipped.trim()) {
    return {
      slug: input.slug,
      title: input.title,
      cells: emptyCells(input.questions, () => ({ answer: "—", citations: [] })),
    };
  }
  const raw = await llm({
    system: SYNC_SYSTEM_PROMPT,
    user: buildUserPrompt(input.title, clipped, input.questions),
    maxTokens: TABULAR_REVIEW_SYNC_MAX_TOKENS,
  });
  const answers = parseTabularAnswerArray(raw);
  const cells: TabularSyncCell[] = input.questions.map((_, i) => {
    const answer = answers[i] ?? "—";
    const grounded = answer && answer !== "—" && !/^nicht im dokument$/i.test(answer);
    return { answer, citations: grounded ? [{ slug: input.slug, title: input.title }] : [] };
  });
  return { slug: input.slug, title: input.title, cells };
}

/**
 * Async-variant per-document review: same one-call-over-all-questions shape,
 * but the model must attach verbatim quotes per answer. Every quote is
 * verified against the (clipped) document text via groundQuotes; ungrounded
 * quotes are dropped, so persisted citations are hallucination-safe.
 * Throws on LLM failure (the job marks the row status=error and continues).
 */
export async function reviewTabularDocumentQuotes(
  llm: LegalLLM,
  input: { slug: string; title: string; questions: string[]; text: string }
): Promise<TabularQuoteDocResult> {
  const { clipped } = clipText(input.text, TABULAR_REVIEW_MAX_CHARS);
  if (!clipped.trim()) {
    return {
      slug: input.slug,
      title: input.title,
      cells: emptyCells(input.questions, () => ({ answer: "—", citations: [] })),
    };
  }
  const raw = await llm({
    system: QUOTE_SYSTEM_PROMPT,
    user: buildUserPrompt(input.title, clipped, input.questions),
    maxTokens: tabularReviewMaxTokens(input.questions.length),
  });
  const parsed = parseTabularAnswerQuotes(raw);
  const cells: TabularQuoteCell[] = input.questions.map((_, i) => {
    const item = parsed[i];
    const answer = item ? item.answer : "—";
    const substantive = !!(answer && answer !== "—" && !/^nicht im dokument$/i.test(answer.trim()));
    if (!substantive || !item) return { answer, citations: [] };
    const { grounded } = groundQuotes(item.quotes, (q) => q, clipped, {
      label: "TABULAR_QUOTE",
    });
    return { answer, citations: grounded.slice(0, 3) };
  });
  return { slug: input.slug, title: input.title, cells };
}

/**
 * Resolve a document's analyzable text via the canonical llm-util resolver
 * (compiled_truth of the named page). Provided for callers without an
 * ACL-enforcing op context; the job and the sync route fetch pages through
 * the ACL-checked get_page op and pass `text` directly instead.
 */
export async function resolveTabularReviewText(
  engine: BrainEngine,
  opts: { slug: string; sourceId?: string }
): Promise<{ text: string; notFound?: boolean }> {
  const resolved = await resolveDocumentText(engine, {
    slug: opts.slug,
    ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
  });
  return { text: resolved.text, ...(resolved.notFound ? { notFound: true } : {}) };
}

// ── Estimate ────────────────────────────────────────────────

export interface TabularRunEstimate {
  llm_calls: number;
  approx_input_tokens: number;
  approx_output_tokens: number;
  approx_usd: number;
}

/** Chars around the document in the user prompt: DOKUMENT "":\n\n + \n\nFRAGEN:\n */
const PROMPT_WRAPPER_CHARS = 32;

/**
 * Honest best-effort cost estimate for a run: one chat call per document,
 * input ≈ clipped doc length + prompt overhead (system + numbered questions),
 * output ≈ tabularReviewMaxTokens(questions) per call. Priced via the
 * canonical pricing table; 0 when the model is unknown (estimate, not a cap).
 */
export function estimateTabularRun(opts: {
  questions: string[];
  /** Per-document resolved text length in chars (0 when unknown/missing). */
  docChars: number[];
  modelId?: string;
}): TabularRunEstimate {
  const overhead =
    QUOTE_SYSTEM_PROMPT.length + numberedQuestions(opts.questions).length + PROMPT_WRAPPER_CHARS;
  let approxInput = 0;
  for (const len of opts.docChars) {
    approxInput += Math.ceil((Math.min(Math.max(len, 0), TABULAR_REVIEW_MAX_CHARS) + overhead) / 4);
  }
  const approxOutput = opts.docChars.length * tabularReviewMaxTokens(opts.questions.length);
  const pricing = opts.modelId ? canonicalLookup(opts.modelId) : undefined;
  const usd = pricing
    ? (approxInput / 1_000_000) * pricing.input + (approxOutput / 1_000_000) * pricing.output
    : 0;
  return {
    llm_calls: opts.docChars.length,
    approx_input_tokens: approxInput,
    approx_output_tokens: approxOutput,
    approx_usd: Math.round(usd * 10_000) / 10_000,
  };
}

// ── Run state (persisted on the tabular_review page frontmatter) ──

export type TabularRunStatus = "queued" | "running" | "done" | "partial" | "failed";

export interface TabularRowState {
  slug: string;
  title: string;
  status: "pending" | "done" | "error";
  cells: TabularQuoteCell[];
  error: string | null;
}

export interface TabularRunProgress {
  total: number;
  done: number;
  failed: number;
}

export interface TabularRunState {
  run_slug: string;
  title: string;
  status: TabularRunStatus;
  progress: TabularRunProgress;
  questions: string[];
  rows: TabularRowState[];
  estimate: TabularRunEstimate;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  job_id: string | null;
  concurrency: number;
  /** Tenant stamp — the page's source_id, mirrored for job re-submission. */
  source_id: string;
  /** Request context stamps so the job reads documents with the same
   *  matter-scope/ACL/ethical-wall posture as the submitting caller. */
  created_by_user_id?: string;
  matter_scope?: string[] | "all";
  acl_groups?: string[] | "all";
  /** Whether document resolution hit a cap (explicit list/case/fallback). */
  truncated?: boolean;
  /** Actual spend recorded by the job's BudgetTracker (best-effort). */
  cost_spent_usd?: number;
}

export function newTabularRunState(opts: {
  run_slug: string;
  title: string;
  questions: string[];
  docs: TabularDocRef[];
  estimate: TabularRunEstimate;
  concurrency: number;
  source_id: string;
  created_by_user_id?: string;
  matter_scope?: string[] | "all";
  acl_groups?: string[] | "all";
  truncated?: boolean;
}): TabularRunState {
  return {
    run_slug: opts.run_slug,
    title: opts.title,
    status: "queued",
    progress: { total: opts.docs.length, done: 0, failed: 0 },
    questions: opts.questions,
    rows: opts.docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      status: "pending" as const,
      cells: [],
      error: null,
    })),
    estimate: opts.estimate,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error: null,
    job_id: null,
    concurrency: opts.concurrency,
    source_id: opts.source_id,
    ...(opts.created_by_user_id ? { created_by_user_id: opts.created_by_user_id } : {}),
    ...(opts.matter_scope !== undefined ? { matter_scope: opts.matter_scope } : {}),
    ...(opts.acl_groups !== undefined ? { acl_groups: opts.acl_groups } : {}),
    ...(opts.truncated !== undefined ? { truncated: opts.truncated } : {}),
  };
}

/** Recompute progress counters from the rows (single source of truth). */
export function recomputeTabularProgress(rows: TabularRowState[]): TabularRunProgress {
  let done = 0;
  let failed = 0;
  for (const r of rows) {
    if (r.status === "done") done++;
    else if (r.status === "error") failed++;
  }
  return { total: rows.length, done, failed };
}

/**
 * Terminal status after a job finishes its target rows:
 * done = every row done; partial = finished but ≥1 row error or unprocessed
 * pending rows remain. "failed" is never recomputed here — it is set
 * explicitly when the job itself dies (timeout/abort/unexpected error).
 */
export function terminalTabularRunStatus(state: TabularRunState): TabularRunStatus {
  const p = recomputeTabularProgress(state.rows);
  if (p.failed === 0 && p.done === p.total) return "done";
  return "partial";
}

/** Defensive parse of a frontmatter blob back into a TabularRunState. */
export function parseTabularRunState(frontmatter: unknown): TabularRunState | null {
  try {
    const fm =
      typeof frontmatter === "string"
        ? (JSON.parse(frontmatter) as Record<string, unknown>)
        : (frontmatter as Record<string, unknown> | null);
    if (!fm || typeof fm !== "object") return null;
    if (!Array.isArray(fm.questions) || !Array.isArray(fm.rows)) return null;
    const rows: TabularRowState[] = (fm.rows as Array<Record<string, unknown>>).map((r) => ({
      slug: String(r.slug ?? ""),
      title: String(r.title ?? r.slug ?? ""),
      status:
        r.status === "done" || r.status === "error" || r.status === "pending"
          ? r.status
          : "pending",
      cells: Array.isArray(r.cells)
        ? (r.cells as Array<Record<string, unknown>>).map((c) => ({
            answer: String(c?.answer ?? "—"),
            citations: asStringArray(c?.citations),
          }))
        : [],
      error: typeof r.error === "string" ? r.error : null,
    }));
    const rawStatus = String(fm.status ?? "queued");
    const status: TabularRunStatus = (
      ["queued", "running", "done", "partial", "failed"] as const
    ).includes(rawStatus as TabularRunStatus)
      ? (rawStatus as TabularRunStatus)
      : "queued";
    const rawEstimate = (fm.estimate ?? {}) as Record<string, unknown>;
    const rawProgress = (fm.progress ?? {}) as Record<string, unknown>;
    return {
      run_slug: String(fm.run_slug ?? ""),
      title: String(fm.title ?? ""),
      status,
      progress: {
        total: Number(rawProgress.total ?? rows.length) || 0,
        done: Number(rawProgress.done ?? 0) || 0,
        failed: Number(rawProgress.failed ?? 0) || 0,
      },
      questions: (fm.questions as unknown[]).map((q) => String(q)),
      rows,
      estimate: {
        llm_calls: Number(rawEstimate.llm_calls ?? 0) || 0,
        approx_input_tokens: Number(rawEstimate.approx_input_tokens ?? 0) || 0,
        approx_output_tokens: Number(rawEstimate.approx_output_tokens ?? 0) || 0,
        approx_usd: Number(rawEstimate.approx_usd ?? 0) || 0,
      },
      created_at: String(fm.created_at ?? ""),
      started_at: typeof fm.started_at === "string" ? fm.started_at : null,
      finished_at: typeof fm.finished_at === "string" ? fm.finished_at : null,
      error: typeof fm.error === "string" ? fm.error : null,
      job_id: typeof fm.job_id === "string" ? fm.job_id : null,
      concurrency: Number(fm.concurrency ?? 4) || 4,
      source_id: String(fm.source_id ?? "default"),
      ...(typeof fm.created_by_user_id === "string"
        ? { created_by_user_id: fm.created_by_user_id }
        : {}),
      ...(fm.matter_scope !== undefined
        ? { matter_scope: fm.matter_scope as string[] | "all" }
        : {}),
      ...(fm.acl_groups !== undefined ? { acl_groups: fm.acl_groups as string[] | "all" } : {}),
      ...(fm.truncated !== undefined ? { truncated: fm.truncated === true } : {}),
      ...(typeof fm.cost_spent_usd === "number" ? { cost_spent_usd: fm.cost_spent_usd } : {}),
    };
  } catch {
    return null;
  }
}

/** Contract-shaped API view of a run (GET /api/legal/tabular-review/{slug}). */
export function tabularRunToApiResponse(state: TabularRunState): Record<string, unknown> {
  return {
    run_slug: state.run_slug,
    title: state.title,
    status: state.status,
    progress: state.progress,
    questions: state.questions,
    rows: state.rows,
    estimate: state.estimate,
    created_at: state.created_at,
    started_at: state.started_at,
    finished_at: state.finished_at,
    error: state.error,
  };
}

// ── Run-state persistence ───────────────────────────────────

const MARKDOWN_ROW_CAP = 100;
const MARKDOWN_CELL_CAP = 200;

function mdCell(s: string): string {
  const flat = s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  return flat.length > MARKDOWN_CELL_CAP ? `${flat.slice(0, MARKDOWN_CELL_CAP)}…` : flat;
}

/** Best-effort markdown summary of the run (status header + result table). */
export function tabularRunMarkdown(state: TabularRunState): string {
  const p = state.progress;
  const lines: string[] = [];
  lines.push(`# Tabular Review — ${state.title}`);
  lines.push("");
  lines.push(
    `- Status: **${state.status}** · ${p.done}/${p.total} Dokumente fertig` +
      (p.failed > 0 ? ` · ${p.failed} Fehler` : "")
  );
  lines.push(
    `- Erstellt: ${state.created_at}` +
      (state.finished_at ? ` · Beendet: ${state.finished_at}` : "")
  );
  lines.push(
    `- Schätzung: ${state.estimate.llm_calls} LLM-Calls, ~${state.estimate.approx_input_tokens} Input-Token, ` +
      `~${state.estimate.approx_output_tokens} Output-Token, ~$${state.estimate.approx_usd.toFixed(4)} (Schätzung)` +
      (typeof state.cost_spent_usd === "number"
        ? ` · tatsächlich ~$${state.cost_spent_usd.toFixed(4)}`
        : "")
  );
  if (state.error) lines.push(`- Fehler: ${state.error}`);
  lines.push("");
  const header = ["Dokument", ...state.questions.map((q) => mdCell(q))];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  for (const row of state.rows.slice(0, MARKDOWN_ROW_CAP)) {
    const cells =
      row.status === "error"
        ? state.questions.map(() => `Fehler: ${mdCell(row.error ?? "unknown")}`)
        : row.status === "pending"
          ? state.questions.map(() => "…")
          : row.cells.map((c) => {
              const cites = c.citations.length > 0 ? ` — „${mdCell(c.citations[0] ?? "")}“` : "";
              return `${mdCell(c.answer)}${cites}`;
            });
    lines.push(`| ${mdCell(row.title)} | ${cells.join(" | ")} |`);
  }
  if (state.rows.length > MARKDOWN_ROW_CAP) {
    lines.push("");
    lines.push(
      `_… ${state.rows.length - MARKDOWN_ROW_CAP} weitere Zeilen im JSON-Run-State (frontmatter)._`
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Create (or fully overwrite) the run-state page. Used for the initial
 * write at start time; incremental progress goes through patchTabularRun.
 */
export async function writeTabularRun(engine: BrainEngine, state: TabularRunState): Promise<void> {
  await engine.putPage(
    state.run_slug,
    {
      type: TABULAR_REVIEW_PAGE_TYPE,
      title: state.title,
      compiled_truth: tabularRunMarkdown(state),
      frontmatter: { ...(state as unknown as Record<string, unknown>) },
    },
    { sourceId: state.source_id }
  );
}

/**
 * Read a run-state page and parse its frontmatter. Returns null when the
 * page is missing or not a tabular_review run.
 */
export async function readTabularRun(
  engine: BrainEngine,
  runSlug: string,
  sourceId?: string
): Promise<TabularRunState | null> {
  const page = await engine.getPage(runSlug, sourceId !== undefined ? { sourceId } : undefined);
  if (!page || page.type !== TABULAR_REVIEW_PAGE_TYPE) return null;
  return parseTabularRunState(page.frontmatter);
}

/**
 * Transactional read-modify-write of the run state. The row is locked
 * (SELECT ... FOR UPDATE) so concurrent jobs (e.g. two retries) serialize
 * instead of clobbering each other's row updates. `mutate` edits the parsed
 * state in place; progress counters are recomputed from the rows after it
 * runs. When `refreshMarkdown` is set, compiled_truth (the markdown summary)
 * is rewritten too — used at run start/finish, not per row.
 *
 * frontmatter is written as a raw object into a $1::jsonb parameter (never
 * JSON.stringify into a ::jsonb cast — see the repo-wide JSONB invariant).
 */
export async function patchTabularRun(
  engine: BrainEngine,
  runSlug: string,
  sourceId: string,
  mutate: (state: TabularRunState) => void,
  opts: { refreshMarkdown?: boolean } = {}
): Promise<TabularRunState | null> {
  return engine.transaction(async (tx) => {
    const rows = await tx.executeRaw<{ frontmatter: unknown }>(
      `SELECT frontmatter FROM pages
        WHERE source_id = $1 AND slug = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [sourceId, runSlug]
    );
    if (rows.length === 0) return null;
    const state = parseTabularRunState(rows[0]!.frontmatter);
    if (!state) return null;
    mutate(state);
    state.progress = recomputeTabularProgress(state.rows);
    if (opts.refreshMarkdown) {
      await tx.executeRaw(
        `UPDATE pages
            SET frontmatter = $1::jsonb, compiled_truth = $2, updated_at = now()
          WHERE source_id = $3 AND slug = $4`,
        [state as unknown as Record<string, unknown>, tabularRunMarkdown(state), sourceId, runSlug]
      );
    } else {
      await tx.executeRaw(
        `UPDATE pages
            SET frontmatter = $1::jsonb, updated_at = now()
          WHERE source_id = $2 AND slug = $3`,
        [state as unknown as Record<string, unknown>, sourceId, runSlug]
      );
    }
    return state;
  });
}

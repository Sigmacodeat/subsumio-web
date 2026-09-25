/**
 * Legal Case Scanner — on-demand matter review.
 *
 * A lawyer or admin asks for a scan of one matter, a selection or all open
 * matters they may see. The scan never runs on its own: there is no nightly
 * run and the queued `legal-case-scanner` job starts no agent runs.
 *
 * Two steps, both driven by the engine route `/api/legal/case-scanner`
 * (the web app bills in between):
 *
 *   1. `selectCaseScanTargets` — which matters the request covers: only
 *      `legal_case` pages of the caller's source that the caller may see
 *      (matter scope / ethical walls), open ones for "all open", capped at
 *      `CASE_SCAN_MAX_CASES`. Also collects the review hints for the prompt
 *      (urgent deadlines, thin evidence, stale or missing analysis).
 *   2. `launchCaseScanRuns` — one supervisor run per matter, submitted via the
 *      trusted-submitter path (the route is the web app's authenticated,
 *      matter-checked entry point), each with its own spend cap and no fixed
 *      model (the supervisor uses the deployment's utility tier). The result
 *      page is marked for review ("Eingang prüfen"); nothing is written into
 *      the matter itself.
 *
 * The queued `legal-case-scanner` job (operators via CLI) keeps only the
 * judikatur watch — RIS lookups, no model calls.
 */

import type { MinionJobContext } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { MinionQueue } from "../queue.ts";
import { setOwnerBudget } from "../budget-tracker.ts";
import {
  jobOwnerStamp,
  matterScopeAllows,
  readJobMatterAccess,
  type MatterScope,
} from "../../matter-access.ts";

/** Most matters one scan request may cover (preview and start). */
export const CASE_SCAN_MAX_CASES = 50;

/** Spend cap per launched supervisor run (same default as a manual agent run). */
export const CASE_SCAN_RUN_BUDGET_CENTS = Number(
  process.env.SUBSUMIO_AGENT_DEFAULT_BUDGET_CENTS ?? 300
);

/** Marks a supervisor run (and its result page) as a case scan awaiting review. */
export const CASE_SCAN_REVIEW_ORIGIN = "case_scan";

/** Matter statuses that are not "open" for an all-open scan. */
const CLOSED_CASE_STATUSES = new Set([
  "closed",
  "done",
  "settled",
  "won",
  "lost",
  "archived",
  "abgeschlossen",
  "cancelled",
  "canceled",
  "tombstoned",
]);

export type CaseScanScope = "case" | "selection" | "all_open";

export interface CaseScanSelection {
  scope: CaseScanScope;
  caseSlugs?: string[];
  lookAheadDays?: number;
  evidenceThreshold?: number;
  /** Clamped to CASE_SCAN_MAX_CASES. */
  limit?: number;
  sourceId?: string;
  /** The caller's matter scope; undefined = unrestricted (CLI). */
  matterScope?: MatterScope;
}

export interface CaseScanTarget {
  slug: string;
  title: string;
  client_name?: string;
  court?: string;
  status?: string;
  urgent_deadlines: Array<{ title: string; due_date: string }>;
  evidence_count: number;
  last_agent_run?: string;
  reasons: string[];
}

export interface CaseScanSkip {
  case_slug: string;
  /** not_found covers "does not exist" and "not visible to the caller" alike. */
  reason: "not_found" | "closed" | "over_limit";
}

export interface CaseScanSelectionResult {
  cases: CaseScanTarget[];
  skipped: CaseScanSkip[];
  /** True when more open matters matched than the limit allows. */
  truncated: boolean;
  limit: number;
}

function parseFrontmatter(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw ?? {}) as Record<string, unknown>;
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) return CASE_SCAN_MAX_CASES;
  return Math.min(Math.floor(limit), CASE_SCAN_MAX_CASES);
}

/**
 * The matters a scan request covers, in the caller's source and view.
 * A matter the caller may not see reads exactly like one that does not exist.
 */
export async function selectCaseScanTargets(
  engine: BrainEngine,
  sel: CaseScanSelection
): Promise<CaseScanSelectionResult> {
  const limit = clampLimit(sel.limit);
  const lookAhead = typeof sel.lookAheadDays === "number" ? sel.lookAheadDays : 7;
  const evidenceThreshold = typeof sel.evidenceThreshold === "number" ? sel.evidenceThreshold : 1;
  const sourceId = sel.sourceId && sel.sourceId.length > 0 ? sel.sourceId : "default";
  const skipped: CaseScanSkip[] = [];

  let rows: Array<{ slug: string; title: string; frontmatter: unknown }>;
  let truncated = false;

  if (sel.scope === "all_open") {
    const all = await engine.executeRaw<{ slug: string; title: string; frontmatter: unknown }>(
      `SELECT slug, title, frontmatter
         FROM pages
        WHERE type = 'legal_case'
          AND deleted_at IS NULL
          AND source_id = $1
        ORDER BY updated_at DESC`,
      [sourceId]
    );
    const open = all.filter((r) => {
      if (!matterScopeAllows(sel.matterScope, r.slug, r.slug)) return false;
      const status = String(parseFrontmatter(r.frontmatter).status ?? "").toLowerCase();
      return !CLOSED_CASE_STATUSES.has(status);
    });
    truncated = open.length > limit;
    rows = open.slice(0, limit);
  } else {
    const requested = [
      ...new Set((sel.caseSlugs ?? []).filter((s) => typeof s === "string" && s.length > 0)),
    ];
    const wanted = requested.slice(0, limit);
    for (const slug of requested.slice(limit)) skipped.push({ case_slug: slug, reason: "over_limit" });
    const found =
      wanted.length === 0
        ? []
        : await engine.executeRaw<{ slug: string; title: string; frontmatter: unknown }>(
            `SELECT slug, title, frontmatter
               FROM pages
              WHERE type = 'legal_case'
                AND deleted_at IS NULL
                AND source_id = $2
                AND slug = ANY($1::text[])`,
            [wanted, sourceId]
          );
    const bySlug = new Map(found.map((r) => [r.slug, r]));
    rows = [];
    for (const slug of wanted) {
      const row = bySlug.get(slug);
      if (!row || !matterScopeAllows(sel.matterScope, slug, slug)) {
        skipped.push({ case_slug: slug, reason: "not_found" });
        continue;
      }
      const status = String(parseFrontmatter(row.frontmatter).status ?? "").toLowerCase();
      if (status === "tombstoned") {
        skipped.push({ case_slug: slug, reason: "not_found" });
        continue;
      }
      rows.push(row);
    }
  }

  const cases: CaseScanTarget[] = [];
  for (const row of rows) {
    cases.push(await describeCase(engine, row, sourceId, lookAhead, evidenceThreshold));
  }
  return { cases, skipped, truncated, limit };
}

/** Review hints for one matter (they shape the prompt, never the selection). */
async function describeCase(
  engine: BrainEngine,
  row: { slug: string; title: string; frontmatter: unknown },
  sourceId: string,
  lookAhead: number,
  evidenceThreshold: number
): Promise<CaseScanTarget> {
  const fm = parseFrontmatter(row.frontmatter);
  const caseSlug = row.slug;
  const reasons: string[] = [];
  const urgentDeadlines: Array<{ title: string; due_date: string }> = [];

  const deadlineRows = await engine.executeRaw<{ title: string; frontmatter: unknown }>(
    `SELECT title, frontmatter
       FROM pages
      WHERE type = 'legal_deadline'
        AND deleted_at IS NULL
        AND (frontmatter->>'case_slug' = $1
             OR frontmatter->>'case' = $1
             OR frontmatter->>'legal_case' = $1)
        AND source_id = $2
      ORDER BY updated_at DESC`,
    [caseSlug, sourceId]
  );
  for (const dRow of deadlineRows) {
    const dFm = parseFrontmatter(dRow.frontmatter);
    const dueDate = String(dFm.due_date ?? "");
    const status = String(dFm.status ?? "");
    if (dueDate && status !== "done") {
      const daysUntil = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
      if (daysUntil <= lookAhead) {
        urgentDeadlines.push({ title: dRow.title, due_date: dueDate });
        if (!reasons.includes("urgent_deadline")) reasons.push("urgent_deadline");
      }
    }
  }

  const evidenceRows = await engine.executeRaw<{ cnt: string }>(
    `SELECT count(*)::text AS cnt
       FROM pages
      WHERE type = 'evidence'
        AND deleted_at IS NULL
        AND (frontmatter->>'case_slug' = $1
             OR frontmatter->>'case' = $1
             OR frontmatter->>'legal_case' = $1)
        AND source_id = $2`,
    [caseSlug, sourceId]
  );
  const evidenceCount = parseInt(evidenceRows[0]?.cnt ?? "0", 10);
  if (evidenceCount < evidenceThreshold) reasons.push("insufficient_evidence");

  const agentRunRows = await engine.executeRaw<{ created_at: Date | string }>(
    `SELECT created_at
       FROM pages
      WHERE type = 'agent_run'
        AND deleted_at IS NULL
        AND (frontmatter->>'case_slug' = $1
             OR frontmatter->>'case' = $1)
        AND source_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [caseSlug, sourceId]
  );
  let lastAgentRun: string | undefined;
  if (agentRunRows.length > 0) {
    const at = new Date(agentRunRows[0]!.created_at);
    lastAgentRun = at.toISOString();
    if (Math.floor((Date.now() - at.getTime()) / 86_400_000) > 30) reasons.push("stale_analysis");
  } else {
    reasons.push("no_prior_analysis");
  }

  return {
    slug: caseSlug,
    title: row.title,
    client_name: String(fm.client_name ?? ""),
    court: String(fm.court ?? ""),
    status: String(fm.status ?? ""),
    urgent_deadlines: urgentDeadlines,
    evidence_count: evidenceCount,
    last_agent_run: lastAgentRun,
    reasons,
  };
}

export interface CaseScanLaunchOpts {
  sourceId?: string;
  /** The caller's matter stamp (children inherit it). */
  matterStamp: Record<string, unknown>;
  ownerUserId?: string;
  /** Groups the runs of one scan request (status lookup, billing reference). */
  scanId: string;
  budgetCents?: number;
}

export interface CaseScanLaunchResult {
  launched: Array<{ case_slug: string; job_id: number }>;
  failed: Array<{ case_slug: string; reason: string }>;
}

/**
 * One supervisor run per matter. Only for the trusted engine route that has
 * already checked the caller's view of every matter — the runs are submitted
 * on the trusted path the protected `supervisor` name requires.
 */
export async function launchCaseScanRuns(
  engine: BrainEngine,
  cases: CaseScanTarget[],
  opts: CaseScanLaunchOpts
): Promise<CaseScanLaunchResult> {
  const queue = new MinionQueue(engine);
  const budgetCents =
    typeof opts.budgetCents === "number" && opts.budgetCents > 0
      ? opts.budgetCents
      : CASE_SCAN_RUN_BUDGET_CENTS;
  const launched: CaseScanLaunchResult["launched"] = [];
  const failed: CaseScanLaunchResult["failed"] = [];

  for (const caseItem of cases) {
    try {
      const job = await queue.add(
        "supervisor",
        {
          prompt: buildScanPrompt(caseItem),
          // No fixed planner model: the supervisor uses the deployment's
          // utility tier (provider-prefixed; EU-only applies via the stamp
          // the queue adds inside an EU-only request).
          force_specialists: ["legal-researcher", "legal-analyst"],
          skip_critic: false,
          ...(opts.sourceId ? { _source_id: opts.sourceId } : {}),
          ...opts.matterStamp,
          // Each scan run is about exactly this matter (context + listing).
          ...jobOwnerStamp(opts.ownerUserId, caseItem.slug),
          _review_origin: CASE_SCAN_REVIEW_ORIGIN,
          _case_scan_id: opts.scanId,
        } as Record<string, unknown>,
        { timeout_ms: 600_000, max_attempts: 2 },
        { allowProtectedSubmit: true }
      );
      // Every scan run gets the same spend cap as a manually started agent
      // run — without an owner budget a supervisor tree is uncapped.
      await setOwnerBudget(engine, job.id, budgetCents / 100);
      launched.push({ case_slug: caseItem.slug, job_id: job.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[legal-case-scanner] Failed to queue supervisor for ${caseItem.slug}: ${msg}`);
      failed.push({ case_slug: caseItem.slug, reason: "queue_failed" });
    }
  }
  return { launched, failed };
}

export interface LegalCaseScannerData {
  max_cases?: number;
  _source_id?: string;
  _matter_scope?: string[] | "all";
  _matter_read_only?: string[];
}

/**
 * The queued `legal-case-scanner` job: judikatur watch only. It starts no
 * agent runs — scans are started on demand through the engine route.
 */
export async function legalCaseScannerHandler(
  ctx: MinionJobContext,
  engine: BrainEngine
): Promise<Record<string, unknown>> {
  const data = (ctx.data ?? {}) as unknown as LegalCaseScannerData;
  const maxCases = typeof data.max_cases === "number" ? data.max_cases : CASE_SCAN_MAX_CASES;
  const sourceStamp =
    typeof data._source_id === "string" && data._source_id ? data._source_id : undefined;
  const matterScope = readJobMatterAccess(data).scope;

  let judikatur: Record<string, unknown> = { skipped: true };
  // The watch walks every matter of the source; a job limited to one user's
  // matters does not run it.
  if (matterScope !== undefined && matterScope !== "all") {
    judikatur = { skipped: "matter_scoped" };
  } else {
    try {
      const { runJudikaturWatch } = await import("../../legal/judikatur-watch.ts");
      const watch = await runJudikaturWatch(engine, {
        fetchImpl: fetch,
        sourceId: sourceStamp,
        maxAkten: maxCases,
      });
      judikatur = {
        akten: watch.akten,
        normen: watch.normen,
        neue_entscheidungen: watch.neueEntscheidungen,
        alert_slugs: watch.alertSlugs,
        fehler: watch.fehler.length,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[legal-case-scanner] Judikatur-Wächter failed (non-blocking): ${msg}`);
      judikatur = { error: msg };
    }
  }

  return {
    // Agent runs are on demand only (engine route, billed by the web app).
    triggered: 0,
    agent_runs: "on_demand_only",
    judikatur_watch: judikatur,
  };
}

export function buildScanPrompt(caseItem: CaseScanTarget): string {
  const lines: string[] = [];
  lines.push(`Überprüfe die Akte "${caseItem.title}" (${caseItem.slug}).`);
  lines.push("");

  if (caseItem.reasons.includes("urgent_deadline")) {
    lines.push("## Kritische Fristen");
    for (const d of caseItem.urgent_deadlines) {
      lines.push(`- ${d.title} (fällig am ${d.due_date})`);
    }
    lines.push("");
  }

  if (caseItem.reasons.includes("insufficient_evidence")) {
    lines.push(
      `## Beweislage (${caseItem.evidence_count} Dokumente — möglicherweise unvollständig)`
    );
    lines.push("Prüfe, ob wichtige Beweismittel fehlen.");
    lines.push("");
  }

  if (caseItem.reasons.includes("stale_analysis")) {
    lines.push(`## Letzte Analyse: ${caseItem.last_agent_run} (über 30 Tage alt)`);
    lines.push("Prüfe, ob sich Rechtsprechung oder Gesetzeslage geändert hat.");
    lines.push("");
  }

  if (caseItem.reasons.includes("no_prior_analysis")) {
    lines.push("## Keine vorherige Agent-Analyse vorhanden");
    lines.push("Führe eine vollständige Erst-Analyse durch.");
    lines.push("");
  }

  lines.push("## Aufgaben");
  lines.push("1. Recherchiere aktuelle Rechtsprechung zu relevanten Normen");
  lines.push("2. Prüfe Fristen-Status und dringende Handlungen");
  lines.push("3. Bewerte Evidence-Lücken");
  lines.push("4. Identifiziere Risiken und Empfehlungen");
  lines.push("5. Dokumentiere alle Erkenntnisse strukturiert mit Quellenangaben");
  lines.push("");
  lines.push(
    "Das Ergebnis ist ein Prüfpunkt für die Anwältin / den Anwalt: nichts in die Akte schreiben."
  );

  return lines.join("\n");
}

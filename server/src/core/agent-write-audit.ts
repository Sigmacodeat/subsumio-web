/**
 * Read-only audit: pages agent runs wrote without a matter binding.
 *
 * Before agent writes were bound (matter-access agentWriteBinding), a run a
 * web user started could write a page without `case_slug`. Such a page is
 * visible firm-wide and may carry text from matters colleagues are walled
 * from. This report lists every such page that still exists so an operator
 * can review it. It never changes or deletes anything.
 *
 * A page counts as written by an agent run when any of its provenance says so:
 *
 *   subagent_namespace  slug `wiki/agents/<job id>/…` (subagent put_page)
 *   agent_run_page      supervisor result: slug `agent-runs/…`, type
 *                       `agent_run` or frontmatter `agent_job_id`
 *   tool_execution      a completed put_page tool call of a subagent job
 *                       (subagent_tool_executions) wrote this slug
 *
 * Unbound = no frontmatter `case_slug` and not in a private area
 * (`chat-sessions/private/…`). Each row carries the job that wrote it, when
 * the job still exists, and whether that job was started by a web user
 * (owner or matter-access stamp) — those are the ones to review first.
 */
import type { BrainEngine } from "./engine.ts";
import { PRIVATE_CHAT_PREFIX } from "./matter-access.ts";

export type AgentWriteOrigin = "subagent_namespace" | "agent_run_page" | "tool_execution";

/**
 *   web_run        the writing job was started by a web user: review first
 *   unstamped_run  CLI / operator cron job: no user's matter access involved
 *   job_unknown    the job no longer exists (pruned): review
 */
export type AgentWriteRisk = "web_run" | "unstamped_run" | "job_unknown";

export interface AgentWriteAuditRow {
  slug: string;
  source_id: string;
  type: string | null;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  origin: AgentWriteOrigin;
  job_id: number | null;
  job_name: string | null;
  job_created_at: string | null;
  owner_user_id: string | null;
  /** The job had a matter-access stamp (`_matter_scope` / `_matter_read_only`). */
  job_matter_stamped: boolean;
  /** Pipeline-style binding the walls do not evaluate (only `case_slug` counts). */
  case_ref: string | null;
  risk: AgentWriteRisk;
}

export interface AgentWriteAuditOpts {
  sourceId?: string;
  /** Only pages created at or after this time. */
  since?: Date;
}

export interface AgentWriteAuditReport {
  rows: AgentWriteAuditRow[];
  counts: Record<AgentWriteRisk, number> & { total: number };
}

interface PageRow {
  slug: string;
  source_id: string;
  type: string | null;
  title: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  fm_job_id: string | null;
  case_ref: string | null;
}

interface JobRow {
  id: number;
  name: string;
  created_at: Date | string | null;
  owner: string | null;
  job_case: string | null;
  matter_stamped: boolean | string | null;
}

function iso(v: Date | string | null): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function jobIdFromSlug(slug: string): number | null {
  const ns = /^wiki\/agents\/(\d+)\//.exec(slug);
  if (ns) return Number(ns[1]);
  const run = /^agent-runs\/supervisor-(\d+)-/.exec(slug);
  if (run) return Number(run[1]);
  return null;
}

function toJobId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

const UNBOUND = `deleted_at IS NULL
   AND COALESCE(frontmatter->>'case_slug', '') = ''
   AND slug NOT LIKE '${PRIVATE_CHAT_PREFIX}%'`;

export async function auditUnboundAgentPages(
  engine: BrainEngine,
  opts: AgentWriteAuditOpts = {}
): Promise<AgentWriteAuditReport> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.sourceId) {
    params.push(opts.sourceId);
    filters.push(`AND source_id = $${params.length}`);
  }
  if (opts.since) {
    params.push(opts.since.toISOString());
    filters.push(`AND created_at >= $${params.length}::timestamptz`);
  }
  const cols = `slug, source_id, type, title, created_at, updated_at,
                frontmatter->>'agent_job_id' AS fm_job_id,
                frontmatter->>'case_ref' AS case_ref`;

  const found = new Map<
    string,
    { page: PageRow; origin: AgentWriteOrigin; jobId: number | null }
  >();
  const key = (p: PageRow) => `${p.source_id}\u0000${p.slug}`;

  const direct = await engine.executeRaw<PageRow>(
    `SELECT ${cols} FROM pages
      WHERE ${UNBOUND}
        AND (slug LIKE 'wiki/agents/%'
             OR slug LIKE 'agent-runs/%'
             OR type = 'agent_run'
             OR frontmatter->>'agent_job_id' IS NOT NULL)
        ${filters.join(" ")}`,
    params
  );
  for (const p of direct) {
    const origin: AgentWriteOrigin = p.slug.startsWith("wiki/agents/")
      ? "subagent_namespace"
      : "agent_run_page";
    found.set(key(p), { page: p, origin, jobId: toJobId(p.fm_job_id) ?? jobIdFromSlug(p.slug) });
  }

  // put_page calls recorded for subagent jobs (covers trusted-workspace slugs
  // outside wiki/agents/). The table may be missing on very old brains.
  let execs: Array<{ job_id: number | string; slug: string | null }> = [];
  try {
    execs = await engine.executeRaw<{ job_id: number | string; slug: string | null }>(
      `SELECT DISTINCT job_id, input->>'slug' AS slug
         FROM subagent_tool_executions
        WHERE tool_name IN ('brain_put_page', 'put_page') AND status = 'complete'`
    );
  } catch {
    execs = [];
  }
  const execJob = new Map<string, number>();
  for (const e of execs) {
    const id = toJobId(e.job_id);
    if (e.slug && id !== null && !execJob.has(e.slug)) execJob.set(e.slug, id);
  }
  if (execJob.size > 0) {
    const slugParam = params.length + 1;
    const viaTools = await engine.executeRaw<PageRow>(
      `SELECT ${cols} FROM pages
        WHERE ${UNBOUND}
          AND slug = ANY($${slugParam}::text[])
          ${filters.join(" ")}`,
      [...params, [...execJob.keys()]]
    );
    for (const p of viaTools) {
      const existing = found.get(key(p));
      if (existing) {
        if (existing.jobId === null) existing.jobId = execJob.get(p.slug) ?? null;
        continue;
      }
      found.set(key(p), { page: p, origin: "tool_execution", jobId: execJob.get(p.slug) ?? null });
    }
  }

  const jobIds = [...new Set([...found.values()].map((f) => f.jobId).filter((id) => id !== null))];
  const jobs = new Map<number, JobRow>();
  if (jobIds.length > 0) {
    const rows = await engine.executeRaw<JobRow>(
      `SELECT id, name, created_at,
              data->>'_owner_user_id' AS owner,
              data->>'_case_slug' AS job_case,
              (data->'_matter_scope' IS NOT NULL OR data->'_matter_read_only' IS NOT NULL)
                AS matter_stamped
         FROM minion_jobs
        WHERE id = ANY($1::int[])`,
      [jobIds]
    );
    for (const r of rows) jobs.set(Number(r.id), r);
  }

  const rows: AgentWriteAuditRow[] = [...found.values()].map(({ page, origin, jobId }) => {
    const job = jobId !== null ? jobs.get(jobId) : undefined;
    const stamped = job?.matter_stamped === true || job?.matter_stamped === "t";
    const owner = job?.owner ?? null;
    const risk: AgentWriteRisk = !job
      ? "job_unknown"
      : owner || stamped || job.job_case
        ? "web_run"
        : "unstamped_run";
    return {
      slug: page.slug,
      source_id: page.source_id,
      type: page.type,
      title: page.title,
      created_at: iso(page.created_at),
      updated_at: iso(page.updated_at),
      origin,
      job_id: jobId,
      job_name: job?.name ?? null,
      job_created_at: iso(job?.created_at ?? null),
      owner_user_id: owner,
      job_matter_stamped: stamped,
      case_ref: page.case_ref,
      risk,
    };
  });

  const rank: Record<AgentWriteRisk, number> = { web_run: 0, job_unknown: 1, unstamped_run: 2 };
  rows.sort(
    (a, b) =>
      rank[a.risk] - rank[b.risk] ||
      (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
      a.slug.localeCompare(b.slug)
  );
  const counts = { web_run: 0, unstamped_run: 0, job_unknown: 0, total: rows.length };
  for (const r of rows) counts[r.risk]++;
  return { rows, counts };
}

/**
 * gbrain pages — page-level operator commands. v0.26.5+.
 *
 * The first subcommand: `pages purge-deleted [--older-than HOURS] [--dry-run]`.
 * Manual escape hatch alongside the autopilot purge phase. Hard-deletes pages
 * whose `deleted_at` is older than the cutoff; cascades to content_chunks,
 * page_links, chunk_relations via existing FKs.
 *
 * `pages audit-agent-writes` is a read-only report of pages agent runs wrote
 * without a matter binding (core/agent-write-audit.ts). CLI only — it is not
 * an operation, so neither MCP nor the HTTP API can reach it.
 *
 * `pages backfill-case-slug` stamps the canonical case_slug on pages bound to
 * a matter only by case_ref & co. (core/case-slug-backfill.ts). Dry run by
 * default; CLI only, like the audit.
 */
import type { BrainEngine } from "../core/engine.ts";

const SOFT_DELETE_TTL_HOURS_DEFAULT = 72;

function parseOlderThanHours(args: string[]): number {
  const idx = args.indexOf("--older-than");
  if (idx === -1 || idx === args.length - 1) return SOFT_DELETE_TTL_HOURS_DEFAULT;
  const raw = args[idx + 1];
  // Accept bare numbers (hours) or `<N>h` / `<N>d`. Reject anything ambiguous.
  const trimmed = raw.trim();
  const dayMatch = trimmed.match(/^(\d+)d$/);
  if (dayMatch) return Math.max(0, parseInt(dayMatch[1], 10) * 24);
  const hourMatch = trimmed.match(/^(\d+)h?$/);
  if (hourMatch) return Math.max(0, parseInt(hourMatch[1], 10));
  console.error(
    `Invalid --older-than value: "${raw}". Expected hours (e.g. 72 or 72h) or days (e.g. 3d).`
  );
  process.exit(2);
}

async function runPurgeDeleted(engine: BrainEngine, args: string[]): Promise<void> {
  const olderThanHours = parseOlderThanHours(args);
  const dryRun = args.includes("--dry-run");
  const json = args.includes("--json");

  if (dryRun) {
    // Use listPages with includeDeleted to enumerate the recoverable set, then
    // count how many would be purged given the cutoff. Stays read-only.
    const candidates = await engine.listPages({ includeDeleted: true, limit: 10000 });
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const wouldPurge = candidates.filter(
      (p) => p.deleted_at && p.deleted_at instanceof Date && p.deleted_at.getTime() < cutoff
    );
    if (json) {
      console.log(
        JSON.stringify(
          {
            dry_run: true,
            older_than_hours: olderThanHours,
            count: wouldPurge.length,
            slugs: wouldPurge.map((p) => p.slug),
          },
          null,
          2
        )
      );
      return;
    }
    console.log(
      `(dry-run) Would purge ${wouldPurge.length} page(s) soft-deleted more than ${olderThanHours}h ago.`
    );
    for (const p of wouldPurge)
      console.log(`  ${p.slug}  deleted_at=${p.deleted_at?.toISOString()}`);
    return;
  }

  const { purgeDeletedPagesWithFiles } = await import("../core/file-store.ts");
  const { loadConfig } = await import("../core/config.ts");
  const result = await purgeDeletedPagesWithFiles(engine, olderThanHours, loadConfig()?.storage);
  if (json) {
    console.log(
      JSON.stringify(
        { older_than_hours: olderThanHours, count: result.count, slugs: result.slugs },
        null,
        2
      )
    );
    return;
  }
  if (result.count === 0) {
    console.log(`No pages to purge (older than ${olderThanHours}h).`);
  } else {
    console.log(`Purged ${result.count} page(s) (older than ${olderThanHours}h):`);
    for (const slug of result.slugs) console.log(`  ${slug}`);
  }
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

async function runAuditAgentWrites(engine: BrainEngine, args: string[]): Promise<void> {
  const json = args.includes("--json");
  const sourceId = flagValue(args, "--source");
  const sinceRaw = flagValue(args, "--since");
  let since: Date | undefined;
  if (sinceRaw !== undefined) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) {
      console.error(`Invalid --since value: "${sinceRaw}". Expected a date (e.g. 2026-09-01).`);
      process.exit(2);
    }
  }
  const { auditUnboundAgentPages } = await import("../core/agent-write-audit.ts");
  const report = await auditUnboundAgentPages(engine, { sourceId, since });
  if (json) {
    console.log(JSON.stringify({ read_only: true, ...report }, null, 2));
    return;
  }
  const c = report.counts;
  console.log(
    `Agent pages without a matter binding: ${c.total} ` +
      `(web user runs: ${c.web_run}, job unknown: ${c.job_unknown}, CLI/cron: ${c.unstamped_run}).`
  );
  console.log("Read-only report — nothing was changed. Review web user runs first.");
  for (const r of report.rows) {
    const job =
      r.job_id !== null ? `job ${r.job_id}${r.job_name ? ` (${r.job_name})` : ""}` : "job ?";
    const who = r.owner_user_id ? ` owner=${r.owner_user_id}` : "";
    const ref = r.case_ref ? ` case_ref=${r.case_ref}` : "";
    console.log(
      `  [${r.risk}] ${r.source_id}:${r.slug}  ${job}${who}${ref}  created=${r.created_at ?? "?"}`
    );
  }
}

async function runBackfillCaseSlug(engine: BrainEngine, args: string[]): Promise<void> {
  const json = args.includes("--json");
  const apply = args.includes("--apply");
  if (apply && args.includes("--dry-run")) {
    console.error("Pass either --apply or --dry-run, not both.");
    process.exit(2);
  }
  const sourceId = flagValue(args, "--source");
  const { backfillCaseSlugs } = await import("../core/case-slug-backfill.ts");
  const report = await backfillCaseSlugs(engine, { sourceId, apply });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const c = report.counts;
  const done = report.dry_run ? `would stamp: ${c.would_stamp}` : `stamped: ${c.stamped}`;
  console.log(
    `${report.dry_run ? "(dry-run) " : ""}Pages bound to a matter without case_slug: ${c.total} ` +
      `(${done}, ambiguous: ${c.ambiguous}, unresolved: ${c.unresolved}).`
  );
  if (report.dry_run) console.log("Nothing was changed. Re-run with --apply to write case_slug.");
  console.log(
    "Ambiguous and unresolved pages stay unstamped; the matter walls hide them from walled users."
  );
  for (const r of report.rows) {
    const target = r.matters.length > 0 ? ` -> ${r.matters.join(", ")}` : "";
    const missing =
      r.unresolved_refs.length > 0 ? ` unresolved=${r.unresolved_refs.join(", ")}` : "";
    const deleted = r.deleted ? " (deleted)" : "";
    console.log(
      `  [${r.status}] ${r.source_id}:${r.slug}${deleted}  refs=${r.refs.join(", ")}${target}${missing}`
    );
  }
}

function printHelp(): void {
  console.log(`gbrain pages — page-level operator commands (v0.26.5)

Subcommands:
  purge-deleted [--older-than HOURS|Nd] [--dry-run] [--json]
                                    Hard-delete soft-deleted pages older than the cutoff
                                    (default 72h). Cascades to chunks/links/edges.
                                    Mirror of the autopilot purge phase.
  audit-agent-writes [--source ID] [--since DATE] [--json]
                                    Read-only: list pages agent runs wrote without a
                                    matter binding (no case_slug, not private), with the
                                    writing job and whether a web user started it.
  backfill-case-slug [--source ID] [--apply] [--json]
                                    Stamp the canonical case_slug on pages bound to a
                                    matter only by case_ref & co. Dry run unless --apply;
                                    reports pages whose reference names no matter
                                    (unresolved) or several (ambiguous). Idempotent.

Notes:
  Soft-delete a page via the MCP \`delete_page\` op. Restore via \`restore_page\`.
  This command is the manual operator escape hatch — the autopilot cycle's
  purge phase already calls the same library function on every run.
`);
}

export async function runPages(engine: BrainEngine, args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "purge-deleted":
      return runPurgeDeleted(engine, rest);
    case "audit-agent-writes":
      return runAuditAgentWrites(engine, rest);
    case "backfill-case-slug":
      return runBackfillCaseSlug(engine, rest);
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(`Unknown subcommand: ${sub}`);
      printHelp();
      process.exit(2);
  }
}

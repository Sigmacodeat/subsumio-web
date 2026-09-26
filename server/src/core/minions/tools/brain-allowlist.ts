/**
 * Derive the subagent brain-tool registry from src/core/operations.ts.
 *
 * Single source of truth: the MCP server already maps OPERATIONS → tool defs.
 * We reuse the same ParamDef-shape → JSONSchema conversion (lives in
 * buildToolDefs for MCP) and wrap each allowed op with an execute() that
 * invokes its handler under a subagent-tagged OperationContext.
 *
 * Filtering is NAME-based (not by OperationContext.remote, which is a
 * call-time flag, not operation metadata — codex catch). The allow-list
 * below is reviewed manually; adding a new op here is an explicit security
 * decision.
 *
 * put_page: allowed, but the subagent tool-schema wraps its `slug` with a
 * per-subagent namespace regex so the model can only write under
 * `wiki/agents/<subagentId>/...`. The put_page operation also has a server-
 * side fail-closed check (see src/core/operations.ts) that catches any
 * dispatcher bug where viaSubagent=true but subagentId is missing.
 *
 * In v0.15 every allow-list op is treated as idempotent for the two-phase
 * replay path. put_page with a deterministic slug is idempotent at the row
 * level; repeats re-derive the same embedding over identical content.
 */

import matter from "../../yaml-matter.ts";
import type { BrainEngine } from "../../engine.ts";
import type { GBrainConfig } from "../../config.ts";
import { operations, OperationError } from "../../operations.ts";
import type { Operation, OperationContext, AuthInfo } from "../../operations.ts";
import {
  bindingPrivatePrefix,
  isForeignPrivateSlug,
  matterIsReadOnly,
  type AgentWriteBinding,
  type MatterScope,
} from "../../matter-access.ts";
import {
  hasMatterBindingFields,
  loadMatterIndex,
  pageBindingAllowed,
  pageMatterBinding,
  resolveRowBindings,
  type MatterBinding,
} from "../../matter-binding.ts";
import { paramDefToSchema } from "../../../mcp/tool-defs.ts";
import type { ToolCtx, ToolDef } from "../types.ts";

/**
 * v0.15 brain-tool allow-list. Review carefully when extending. Op names
 * verified against origin/master:src/core/operations.ts (post shell-jobs +
 * Knowledge Runtime).
 *
 * Read-only (all safe):
 *   query, search, get_page, list_pages, file_list, file_url,
 *   get_backlinks, traverse_graph, resolve_slugs, get_ingest_log
 *
 * Conditional write:
 *   put_page (namespace-enforced by the tool schema + server-side check)
 *
 * Every name below MUST exist in src/core/operations.ts OPERATIONS; the
 * brain-allowlist test pins this invariant so an upstream rename fails CI
 * instead of silently dropping a tool.
 */
export const BRAIN_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  "query",
  "search",
  "get_page",
  "list_pages",
  "file_list",
  "file_url",
  "get_backlinks",
  "traverse_graph",
  // v114 (#1941): read-only provenance discovery. Edge-WRITE ops (add_link /
  // remove_link) are deliberately NOT allowlisted — exposing graph writes to
  // subagents is a separate trust decision.
  "list_link_sources",
  "resolve_slugs",
  "get_ingest_log",
  "put_page",
  // v0.29 — Salience + Anomaly Detection. Both read-only. `get_recent_transcripts`
  // is intentionally NOT included: subagent calls always have ctx.remote=true,
  // and the v0.29 trust gate rejects remote callers — adding it here would be
  // a footgun (subagent calls op, gets permission_denied, looks like a bug).
  // The cycle synthesize phase already calls discoverTranscripts directly.
  "get_recent_salience",
  "find_anomalies",
  // v0.32.6 — Contradiction probe surface (read-only). Reads pre-computed
  // eval_contradictions_runs results. The agent can surface known
  // contradictions without triggering a new probe run.
  "find_contradictions",
]);

/**
 * Allow-listed ops whose handlers do NOT (or cannot) scope to the caller's
 * source: file_list/file_url read the global `files` table and are
 * localOnly admin ops; get_ingest_log / get_recent_salience /
 * find_anomalies query without a source_id filter. They stay available to
 * local, host-only subagent runs (no source stamp), but are REMOVED from
 * the registry of any tenant-stamped job — otherwise a tenant's agent
 * could read other firms' files and activity.
 */
export const TENANT_UNSAFE_TOOLS: ReadonlySet<string> = new Set([
  "file_list",
  "file_url",
  "get_ingest_log",
  "get_recent_salience",
  "find_anomalies",
  // Takes aggregates and code intelligence read brain-wide as well.
  "takes_list",
  "takes_scorecard",
  "takes_calibration",
  "code_def",
  "code_refs",
]);

/**
 * True when an MCP client is bound to a firm's source (anything other than
 * the host `default` source). Such clients never get TENANT_UNSAFE_TOOLS.
 */
export function isTenantBoundClient(auth: {
  sourceId?: string;
  allowedSources?: readonly string[];
}): boolean {
  if ((auth.sourceId ?? "default") !== "default") return true;
  return (auth.allowedSources ?? []).some((s) => s !== "default");
}

/**
 * Tools a matter-scoped job (a web caller with an ethical wall, restricted
 * matters or a client-viewer allow-list) may use. Each one either filters by
 * `ctx.matterScope` inside its op handler (query, search, get_page,
 * list_pages) or is filtered by the matter guard below (graph reads,
 * resolve_slugs, find_contradictions, put_page). Everything else is dropped
 * from such a job's registry — a new allow-listed op stays invisible to
 * walled jobs until it is added here with its filtering.
 */
export const MATTER_SCOPED_TOOLS: ReadonlySet<string> = new Set([
  "query",
  "search",
  "get_page",
  "list_pages",
  "get_backlinks",
  "traverse_graph",
  "resolve_slugs",
  "find_contradictions",
  "put_page",
]);

/**
 * v0.41 Approach C: per-tool usage_hint surfaced verbatim in the subagent
 * system prompt's tool preamble. Each entry tells the model WHEN to reach
 * for the tool (the description tells the model HOW). One line per tool;
 * no embedded newlines.
 *
 * Field-report driver: the renderer in `src/core/minions/system-prompt.ts`
 * surfaces these so a model with `shell` + brain tools in its registry
 * knows brain tools write to the gbrain DB (NOT local files) and to reach
 * for shell when the task asks for filesystem work.
 *
 * Keyed by OP name (pre-`brain_` prefix). Optional — tools without an entry
 * just render as `- \`name\`` with no hint suffix.
 */
export const BRAIN_TOOL_USAGE_HINTS: Readonly<Record<string, string>> = {
  query:
    "Use for natural-language semantic search across the brain (vector + keyword hybrid). Returns ranked passages with citations. First choice when the user asks a question of the brain.",
  search:
    'Use for hybrid keyword + vector search returning ranked page hits. Use over `query` when you want page-level not chunk-level results (e.g. "find pages about X").',
  get_page:
    "Read a brain page by its slug. Returns the full markdown body + frontmatter + linked pages.",
  list_pages:
    'List pages by type or slug-prefix filter. Use when you need to enumerate (e.g. "list all `people/` pages") instead of search.',
  file_list:
    "List uploaded files (attachments) by slug-prefix or content type. NOT the local filesystem — only files the brain has stored.",
  file_url: "Get a presigned URL for a brain-stored file. Read-only; expires.",
  get_backlinks: 'List every page that links TO the given slug. Use for "what references this".',
  traverse_graph:
    "Walk the typed-edge graph starting from a slug (e.g. `works_at`, `founded`, `invested_in`). Use for relationship queries.",
  list_link_sources:
    "List the distinct link provenances in the brain with edge counts (e.g. `citation-graph`, `manual`). Use to discover which edge-writers have populated the graph.",
  resolve_slugs:
    'Resolve free-form entity names to canonical slugs (e.g. "Alice" → `people/alice-example`). Use before any tool that takes a slug if the user gave a name not a slug.',
  get_ingest_log: "Read the brain ingestion log for diagnostic / verification queries.",
  put_page:
    "Write a markdown page to the gbrain DATABASE (NOT the local filesystem). Page becomes searchable + linkable. Slug must match the agent's allowed namespace.",
  get_recent_salience:
    'Read pages ranked by emotional + activity salience over a recency window. Use for "what\'s been on my mind lately".',
  find_anomalies:
    'Read cohort-level activity outliers (e.g. tag-cohort or type-cohort with unusual recent volume). Use for "what\'s unusual lately".',
  find_contradictions:
    'Read suspected contradictions from the latest probe run (chunk-pairs flagged by the judge). Use when the user asks "what\'s inconsistent" or to check for conflicting statements in a case.',
};

/** Matches Anthropic's tool-name constraint. No dots. */
const ANTHROPIC_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function sanitizeToolName(opName: string): string {
  // Prefix with brain_ and replace any non-conforming char. For the v0.15
  // allow-list, every op name is already a valid simple identifier, so this
  // is defense-in-depth.
  const prefixed = `brain_${opName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  return prefixed.slice(0, 64);
}

/**
 * Convert an Operation.params (ParamDef) map to an Anthropic-compatible
 * JSONSchema.input_schema. Same shape MCP uses inline — ParamDef.type
 * narrows to a subset of JSONSchema types.
 */
function paramsToInputSchema(op: Operation): Record<string, unknown> {
  return {
    type: "object" as const,
    properties: Object.fromEntries(
      Object.entries(op.params).map(([k, v]) => [k, paramDefToSchema(v)])
    ),
    required: Object.entries(op.params)
      .filter(([, v]) => v.required)
      .map(([k]) => k),
  };
}

/**
 * For put_page specifically, the tool schema shown to the model constrains
 * `slug`. Two modes:
 *
 *  - Default (legacy): slug MUST start with `wiki/agents/<subagentId>/`,
 *    enforced by both the JSONSchema `pattern` and the server-side check.
 *  - Trusted-workspace (v0.23 dream cycle): when `allowedSlugPrefixes` is
 *    set, the model is told the allowed prefixes in plain English (no
 *    regex pattern — the prefix list is authoritative server-side, and
 *    JSONSchema can't express "matches any of these globs" cleanly).
 */
function namespacedPutPageSchema(
  op: Operation,
  subagentId: number,
  allowedSlugPrefixes?: readonly string[],
  writeBinding?: AgentWriteBinding
): Record<string, unknown> {
  const base = paramsToInputSchema(op);
  const props = (base.properties as Record<string, Record<string, unknown>>) ?? {};
  const bindingNote =
    writeBinding?.kind === "matter"
      ? ` Every page you write is bound to matter "${writeBinding.caseSlug}" (case_slug is set automatically; another case_slug is refused), and only pages of that matter can be updated.`
      : writeBinding?.kind === "private"
        ? ` Pages you write are kept privately for the user who started this run (stored under "${writeBinding.prefix}" followed by your slug). Keep using your own slug with put_page and get_page; it is mapped automatically.`
        : writeBinding?.kind === "refuse"
          ? " This run may not write pages (no matter and no owner to keep them for)."
          : "";
  if (props.slug) {
    if (allowedSlugPrefixes && allowedSlugPrefixes.length > 0) {
      props.slug = {
        ...props.slug,
        description:
          `Page slug. MUST match one of these prefix globs: ${allowedSlugPrefixes.join(", ")}. ` +
          `Slugs use lowercase alphanumeric segments separated by '/'. No leading slash, no '.md' extension, no underscores.` +
          bindingNote,
      };
    } else {
      props.slug = {
        ...props.slug,
        description:
          `Page slug. MUST start with "wiki/agents/${subagentId}/" (agents can only write under their own namespace).` +
          bindingNote,
        pattern: `^wiki/agents/${subagentId}/.+`,
      };
    }
  }
  return { ...base, properties: props };
}

/** Args required to build the registry for a given subagent job. */
export interface BuildBrainToolsOpts {
  subagentId: number;
  engine: BrainEngine;
  config: GBrainConfig;
  /** Optional filter: only include names in this set. */
  allowedNames?: ReadonlySet<string>;
  /**
   * Connected-gbrains brain id (v0.19+, PR 0 plumbing only).
   *
   * CURRENT BEHAVIOR: `brainId` is stamped onto each tool-call's
   * `OperationContext.brainId` for audit / logging, but `ctx.engine` is
   * still the engine passed in here (the parent job's engine). Ops
   * targeting mounted brains via brainId WITHOUT a registry lookup will
   * silently run against the parent engine.
   *
   * FUTURE (PR 1): `buildOpContext` will call `BrainRegistry.getBrain
   * (brainId).engine` to select the right engine per dispatch. Once
   * wired, `opCtx.engine` will match `opCtx.brainId`. Until then, treat
   * brainId as metadata only.
   */
  brainId?: string;
  /**
   * Trusted-workspace allow-list (v0.23). When set, put_page is bounded
   * to slugs matching these prefix globs instead of the legacy
   * `wiki/agents/<id>/...` namespace. Trust comes from PROTECTED_JOB_NAMES
   * (MCP can't submit subagent jobs) — this flows from
   * SubagentHandlerData.allowed_slug_prefixes via the handler.
   */
  allowedSlugPrefixes?: readonly string[];
  /**
   * v0.43 — Tenant source for multi-tenant jobs (web-api `_source_id`
   * stamp). Every tool-call OperationContext scopes to this source so a
   * tenant's agent reads/writes ONLY the tenant's brain. Defaults to
   * 'default' (host source) for local jobs.
   */
  sourceId?: string;
  /**
   * Federated READ sources (law corpus) this subagent may search alongside
   * its own source. Threaded into `ctx.auth.allowedSources` so that
   * `sourceScopeOpts()` returns `{sourceIds: [...]}` — giving the subagent
   * search tools access to the law corpus scoped by jurisdiction.
   *
   * Set by the legal pipeline from `JURISDICTION_LAW_SOURCES[jurisdiction]`.
   * Without this, the Law Matcher cannot search the law corpus at all.
   */
  sourceIds?: string[];
  /**
   * The web caller's effective matter scope (job data `_matter_scope`).
   * Undefined = unrestricted (CLI / cron jobs without a user). Threaded into
   * `ctx.matterScope`; read results outside it are dropped and writes into
   * out-of-scope matters are refused.
   */
  matterScope?: MatterScope;
  /** Matters the caller may only read (job data `_matter_read_only`). */
  matterReadOnly?: readonly string[];
  /**
   * The web caller's document ACL groups (job data `_acl_groups`, see
   * matter-access readJobAclGroups). Undefined / "all" = no document filter
   * (host jobs, firm admins); a list — even an empty one — restricts every
   * read to open pages and pages of those groups.
   */
  aclGroups?: string[] | "all";
  /**
   * Where the pages this run writes may go (matter-access agentWriteBinding
   * of the job data). Undefined = free, today's behaviour (CLI, cron).
   */
  writeBinding?: AgentWriteBinding;
}

interface OpContextDeps {
  engine: BrainEngine;
  config: GBrainConfig;
  subagentId: number;
  jobId: number;
  signal?: AbortSignal;
  brainId?: string;
  allowedSlugPrefixes?: readonly string[];
  sourceId?: string;
  sourceIds?: string[];
  matterScope?: MatterScope;
  aclGroups?: string[] | "all";
}

function buildOpContext(deps: OpContextDeps): OperationContext {
  return {
    engine: deps.engine,
    config: deps.config,
    logger: {
      info: (msg: string) => process.stderr.write(`[subagent-tool:${deps.jobId}] ${msg}\n`),
      warn: (msg: string) => process.stderr.write(`[subagent-tool:${deps.jobId}] WARN: ${msg}\n`),
      error: (msg: string) => process.stderr.write(`[subagent-tool:${deps.jobId}] ERROR: ${msg}\n`),
    },
    dryRun: false,
    remote: true, // match MCP trust boundary for auto-link skip
    // v0.43 multi-tenant: tenant jobs carry their source; local jobs keep
    // the host default. NEVER hardcode 'default' here — a tenant agent
    // reading/writing the host source is a cross-tenant data leak.
    sourceId: deps.sourceId ?? "default",
    // Federated READ sources (law corpus) — threaded into ctx.auth.allowedSources
    // so sourceScopeOpts() returns {sourceIds: [...]} for scoped search access.
    ...(deps.sourceIds && deps.sourceIds.length > 0
      ? {
          auth: { token: "", clientId: "", scopes: [], allowedSources: deps.sourceIds } as AuthInfo,
        }
      : {}),
    jobId: deps.jobId,
    subagentId: deps.subagentId,
    viaSubagent: true, // FAIL-CLOSED: put_page etc. enforce namespace
    brainId: deps.brainId,
    allowedSlugPrefixes: deps.allowedSlugPrefixes ? [...deps.allowedSlugPrefixes] : undefined,
    ...(deps.matterScope !== undefined ? { matterScope: deps.matterScope } : {}),
    ...(deps.aclGroups !== undefined ? { aclGroups: deps.aclGroups } : {}),
  };
}

// ── Matter guard ─────────────────────────────────────────────

function pageNotFound(slug: string): OperationError {
  return new OperationError("page_not_found", `Page not found: ${slug}`);
}

function frontmatterCaseSlug(fm: unknown): string | undefined {
  if (!fm || typeof fm !== "object") return undefined;
  const raw = (fm as Record<string, unknown>).case_slug;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** Sources a tool call reads from (the job's own source plus federated reads). */
function readSources(ctx: OperationContext): string[] {
  return [
    ...new Set(
      [ctx.sourceId, ...(ctx.auth?.allowedSources ?? [])].filter(
        (s): s is string => typeof s === "string" && s.length > 0
      )
    ),
  ];
}

/**
 * What a guarded tool call may see: the job's matter scope and, for runs a
 * web user started (a write binding other than free), no private area but
 * the owner's own — the stamp is frozen at submission, a colleague's private
 * area created later would not be in its deny list.
 */
interface Visibility {
  scope: MatterScope;
  /** undefined: private areas are not checked; "": every private area is hidden. */
  ownPrivate?: string;
}

function hiddenPrivate(vis: Visibility, slug: string | undefined): boolean {
  return vis.ownPrivate !== undefined && isForeignPrivateSlug(slug, vis.ownPrivate || undefined);
}

/**
 * The subset of `slugs` the job may see. A page belongs to a matter by its
 * slug path and by every frontmatter matter binding (case_slug, case_ref, …;
 * see core/matter-binding.ts); when a slug exists in several of the job's
 * sources, every copy must be in scope.
 */
async function visibleSlugs(
  ctx: OperationContext,
  vis: Visibility,
  slugs: readonly string[]
): Promise<Set<string>> {
  const scope = vis.scope;
  const unique = [...new Set(slugs.filter((s) => typeof s === "string" && s.length > 0))];
  const visible = new Set<string>();
  if (unique.length === 0) return visible;
  const sources = readSources(ctx);
  const bindings = await resolveRowBindings(
    ctx.engine,
    unique.map((slug) => ({ slug })),
    { sourceId: sources[0] ?? ctx.sourceId, sources }
  );
  unique.forEach((slug, i) => {
    const binding = bindings[i]!;
    if (hiddenPrivate(vis, slug)) return;
    if (binding.matters.some((m) => hiddenPrivate(vis, m))) return;
    if (pageBindingAllowed(scope, slug, binding)) visible.add(slug);
  });
  for (const slug of await aclDeniedSlugs(ctx, [...visible])) visible.delete(slug);
  return visible;
}

/**
 * Slugs whose stored page (any copy in the call's read sources) the caller's
 * document-level ACL groups do not reach. Empty when `ctx.aclGroups` is
 * undefined / "all".
 */
async function aclDeniedSlugs(ctx: OperationContext, slugs: string[]): Promise<Set<string>> {
  const denied = new Set<string>();
  const groups = ctx.aclGroups;
  if (groups === undefined || groups === "all" || slugs.length === 0) return denied;
  const rows = await ctx.engine.executeRaw<{ id: number; slug: string }>(
    `SELECT id, slug FROM pages WHERE slug = ANY($1::text[]) AND source_id = ANY($2::text[])`,
    [slugs, readSources(ctx)]
  );
  if (rows.length === 0) return denied;
  const { filterPagesByACL } = await import("../../acl.ts");
  const ok = new Set(
    await filterPagesByACL(
      ctx.engine,
      rows.map((r) => Number(r.id)),
      groups
    )
  );
  for (const r of rows) if (!ok.has(Number(r.id))) denied.add(r.slug);
  return denied;
}

async function assertSlugVisible(
  ctx: OperationContext,
  vis: Visibility,
  slug: unknown
): Promise<void> {
  const s = typeof slug === "string" ? slug : "";
  if (!s || !(await visibleSlugs(ctx, vis, [s])).has(s)) throw pageNotFound(s);
}

/**
 * Refuse a put_page into a matter the job may not see or may only read:
 * checked against the target slug, the matters the new content binds (every
 * binding field, resolved) and the matters of the page it would overwrite.
 */
async function assertPutPageAllowed(
  ctx: OperationContext,
  scope: MatterScope,
  readOnly: readonly string[],
  params: Record<string, unknown>
): Promise<void> {
  const slug = typeof params.slug === "string" ? params.slug : "";
  const sourceId = ctx.sourceId ?? "default";
  const bindings: MatterBinding[] = [{ matters: [], unresolved: [] }];
  if (typeof params.content === "string") {
    let claimed: Record<string, unknown> | undefined;
    try {
      const { parseMarkdown } = await import("../../markdown.ts");
      const parsed = parseMarkdown(params.content, `${slug}.md`);
      claimed = { ...(parsed.frontmatter ?? {}), ...(parsed.type ? { type: parsed.type } : {}) };
    } catch {
      // Unparseable content carries no matter claim; the op rejects it itself.
    }
    if (claimed && hasMatterBindingFields(claimed)) {
      const index = await loadMatterIndex(ctx.engine, sourceId);
      bindings.push(pageMatterBinding({ slug, frontmatter: claimed }, index));
    }
  }
  if (slug) {
    // A page the caller's document ACL hides cannot be overwritten either.
    if ((await aclDeniedSlugs(ctx, [slug])).size > 0) throw pageNotFound(slug);
    bindings.push(
      ...(await resolveRowBindings(ctx.engine, [{ slug, source_id: sourceId }], { sourceId }))
    );
  }
  for (const b of bindings) {
    if (!pageBindingAllowed(scope, slug, b)) throw pageNotFound(slug);
    const matters = b.matters.length > 0 ? b.matters : [undefined];
    if (matters.some((m) => matterIsReadOnly([...readOnly], slug, m))) {
      throw new OperationError(
        "permission_denied",
        `Matter of ${slug} is read-only for this job's user.`
      );
    }
  }
}

/** Drop everything outside the job's matter scope from a tool result. */
async function filterToolResult(
  opName: string,
  ctx: OperationContext,
  vis: Visibility,
  result: unknown
): Promise<unknown> {
  switch (opName) {
    // The op handlers already filter by ctx.matterScope; this second pass
    // also resolves each slug's frontmatter case_slug in the database, so a
    // result row that lacks case_slug cannot carry a walled document out.
    case "search":
    case "query":
    case "list_pages": {
      if (!Array.isArray(result)) return result;
      const rows = result as Array<{ slug?: unknown }>;
      const ok = await visibleSlugs(
        ctx,
        vis,
        rows.map((r) => (typeof r?.slug === "string" ? r.slug : ""))
      );
      return rows.filter((r) => typeof r?.slug === "string" && ok.has(r.slug));
    }
    case "get_page": {
      // Fuzzy lookups answer with candidate slugs instead of a page.
      if (!result || typeof result !== "object") return result;
      const page = result as { slug?: unknown; frontmatter?: unknown };
      if (
        typeof page.slug === "string" &&
        (hiddenPrivate(vis, page.slug) || hiddenPrivate(vis, frontmatterCaseSlug(page.frontmatter)))
      ) {
        throw pageNotFound(page.slug);
      }
      const r = result as { candidates?: unknown };
      if (!Array.isArray(r.candidates)) return result;
      const slugs = r.candidates.filter((s): s is string => typeof s === "string");
      const ok = await visibleSlugs(ctx, vis, slugs);
      return { ...r, candidates: slugs.filter((s) => ok.has(s)) };
    }
    case "get_backlinks": {
      if (!Array.isArray(result)) return result;
      const links = result as Array<{ from_slug?: string; to_slug?: string }>;
      const ok = await visibleSlugs(
        ctx,
        vis,
        links.flatMap((l) => [l.from_slug ?? "", l.to_slug ?? ""])
      );
      return links.filter((l) => ok.has(l.from_slug ?? "") && ok.has(l.to_slug ?? ""));
    }
    case "traverse_graph": {
      if (!Array.isArray(result)) return result;
      const items = result as Array<Record<string, unknown>>;
      const isPath = items.some((i) => typeof i.from_slug === "string");
      if (isPath) {
        const ok = await visibleSlugs(
          ctx,
          vis,
          items.flatMap((i) => [String(i.from_slug ?? ""), String(i.to_slug ?? "")])
        );
        return items.filter((i) => ok.has(String(i.from_slug)) && ok.has(String(i.to_slug)));
      }
      const nodes = items as Array<{ slug?: string; links?: Array<{ to_slug?: string }> }>;
      const ok = await visibleSlugs(
        ctx,
        vis,
        nodes.flatMap((n) => [n.slug ?? "", ...(n.links ?? []).map((l) => l.to_slug ?? "")])
      );
      return nodes
        .filter((n) => ok.has(n.slug ?? ""))
        .map((n) => ({ ...n, links: (n.links ?? []).filter((l) => ok.has(l.to_slug ?? "")) }));
    }
    case "resolve_slugs": {
      if (!Array.isArray(result)) return result;
      const slugs = result.filter((s): s is string => typeof s === "string");
      const ok = await visibleSlugs(ctx, vis, slugs);
      return slugs.filter((s) => ok.has(s));
    }
    case "find_contradictions": {
      if (!result || typeof result !== "object") return result;
      const r = result as {
        contradictions?: Array<{ a?: { slug?: string }; b?: { slug?: string } }>;
      };
      if (!Array.isArray(r.contradictions)) return result;
      const ok = await visibleSlugs(
        ctx,
        vis,
        r.contradictions.flatMap((c) => [c.a?.slug ?? "", c.b?.slug ?? ""])
      );
      const kept = r.contradictions.filter(
        (c) => ok.has(c.a?.slug ?? "") && ok.has(c.b?.slug ?? "")
      );
      // total_in_run would count walled findings — report only what is visible.
      return { ...r, contradictions: kept, total_in_run: kept.length };
    }
    default:
      return result;
  }
}

/**
 * Build the subagent brain-tool registry. One ToolDef per allow-listed op,
 * with a namespace-wrapped schema for put_page.
 *
 * Call this once per subagent-job claim; the registry is keyed to the job's
 * subagentId + engine handle, so it's not shareable across jobs.
 */
export function buildBrainTools(opts: BuildBrainToolsOpts): ToolDef[] {
  const filter = opts.allowedNames ?? BRAIN_TOOL_ALLOWLIST;
  // A job carrying a source stamp (web-api `_source_id`, supervisor-propagated)
  // is a tenant job — drop every tool that cannot honour source isolation.
  const tenantJob = typeof opts.sourceId === "string" && opts.sourceId.length > 0;
  // A job carrying a restricted matter scope only gets tools that honour it.
  const matterScope = opts.matterScope;
  const aclGroups = opts.aclGroups;
  // A document-ACL-restricted job gets the same filtered tool set as a
  // matter-scoped one: each of those tools honours ctx.aclGroups.
  const scopedJob = Array.isArray(matterScope) || Array.isArray(aclGroups);
  const readOnly = opts.matterReadOnly ?? [];
  const picked: Operation[] = operations.filter(
    (op) =>
      BRAIN_TOOL_ALLOWLIST.has(op.name) &&
      filter.has(op.name) &&
      // Subagent calls always run remote=true; a localOnly op would only
      // ever be refused, so never advertise it to the model.
      !op.localOnly &&
      !(tenantJob && TENANT_UNSAFE_TOOLS.has(op.name)) &&
      !(scopedJob && !MATTER_SCOPED_TOOLS.has(op.name))
  );

  const writeBinding = opts.writeBinding;
  return picked.map<ToolDef>((op) => {
    const schema =
      op.name === "put_page"
        ? namespacedPutPageSchema(op, opts.subagentId, opts.allowedSlugPrefixes, writeBinding)
        : paramsToInputSchema(op);

    const toolName = sanitizeToolName(op.name);
    if (!ANTHROPIC_NAME_RE.test(toolName)) {
      throw new Error(`brain tool name ${toolName} does not match Anthropic constraint`);
    }

    return {
      name: toolName,
      description: op.description,
      input_schema: schema,
      // v0.15 ships only idempotent brain tools (every allow-listed op is
      // deterministic over its input; put_page re-writes the same slug).
      idempotent: true,
      // v0.41 Approach C: surface usage_hint to the system-prompt renderer.
      // Keyed by the unprefixed op name. Undefined when no hint is registered.
      usage_hint: BRAIN_TOOL_USAGE_HINTS[op.name],
      async execute(input: unknown, ctx: ToolCtx): Promise<unknown> {
        const opCtx = buildOpContext({
          engine: ctx.engine,
          config: opts.config,
          subagentId: opts.subagentId,
          jobId: ctx.jobId,
          signal: ctx.signal,
          brainId: opts.brainId,
          allowedSlugPrefixes: opts.allowedSlugPrefixes,
          sourceId: opts.sourceId,
          sourceIds: opts.sourceIds,
          matterScope,
          aclGroups,
        });
        // Same trust boundary as HTTP/MCP dispatch: subagent calls are
        // remote, so localOnly ops are refused even if a registry was built
        // without the tenant filter above.
        if (op.localOnly && opCtx.remote !== false) {
          throw new Error(`permission_denied: ${op.name} is local-only`);
        }
        const params = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
        return runMatterGuarded(op, opCtx, params, matterScope, readOnly, writeBinding);
      },
    };
  });
}

/**
 * Bind a put_page of a web user's run (see matter-access agentWriteBinding):
 *
 *   matter   the page gets the run's matter as case_slug; content claiming
 *            another matter is refused, and so is overwriting a page that is
 *            not already part of the run's matter (firm-wide pages included).
 *   private  the page moves into the owner's private area
 *            (`chat-sessions/private/<owner>/<slug>`); a matter the content
 *            claims stays as an additional restriction.
 *   refuse   no page may be written.
 *
 * Returns the context and params to run the op with.
 */
async function bindAgentWrite(
  opCtx: OperationContext,
  binding: AgentWriteBinding,
  params: Record<string, unknown>
): Promise<{ ctx: OperationContext; params: Record<string, unknown> }> {
  if (binding.kind === "free") return { ctx: opCtx, params };
  if (binding.kind === "refuse") {
    throw new OperationError(
      "permission_denied",
      "This agent run has no matter and no owner to keep pages for; a page it wrote would be visible firm-wide, so it may not write pages."
    );
  }
  const slug = typeof params.slug === "string" ? params.slug : "";
  const content = typeof params.content === "string" ? params.content : "";
  // Missing slug/content: nothing to bind, the op rejects the call itself.
  if (!slug || typeof params.content !== "string") return { ctx: opCtx, params };

  let data: Record<string, unknown>;
  let body: string;
  try {
    const parsed = matter(content);
    // gray-matter caches parse results by input: never mutate its object.
    data = { ...(parsed.data as Record<string, unknown>) };
    body = parsed.content;
  } catch {
    throw new OperationError(
      "invalid_params",
      "put_page content has unreadable frontmatter; the page could not be bound to its matter or owner."
    );
  }
  const claimed = frontmatterCaseSlug(data);
  if (typeof opCtx.jobId === "number") data.agent_job_id = opCtx.jobId;

  if (binding.kind === "matter") {
    if (claimed && claimed !== binding.caseSlug) {
      throw new OperationError(
        "permission_denied",
        `This agent run is bound to matter ${binding.caseSlug}; it may not write pages of ${claimed}.`
      );
    }
    const existing = await opCtx.engine.executeRaw<{ case_slug: string | null }>(
      `SELECT frontmatter->>'case_slug' AS case_slug FROM pages
        WHERE slug = $1 AND source_id = $2 AND deleted_at IS NULL`,
      [slug, opCtx.sourceId ?? "default"]
    );
    const inMatter = (c: string | null | undefined) =>
      c === binding.caseSlug ||
      slug === binding.caseSlug ||
      slug.startsWith(`${binding.caseSlug}/`);
    if (existing.some((r) => !inMatter(r.case_slug))) {
      throw new OperationError(
        "permission_denied",
        `Page ${slug} exists outside matter ${binding.caseSlug}; this agent run may only update pages of its matter.`
      );
    }
    data.case_slug = binding.caseSlug;
    return { ctx: opCtx, params: { ...params, content: matter.stringify(body, data) } };
  }

  // private
  const target = slug.startsWith(binding.prefix) ? slug : `${binding.prefix}${slug}`;
  data.agent_owner_id = binding.ownerUserId;
  data.visibility = "private";
  return {
    ctx: { ...opCtx, agentPrivatePrefix: binding.prefix },
    params: { ...params, slug: target, content: matter.stringify(body, data) },
  };
}

/**
 * Run an operation under a matter scope: tools that cannot filter by matter
 * are refused for a restricted scope, reads are filtered, writes into walled
 * or read-only matters are refused. Without scope, read-only matters and a
 * write binding the op runs unchanged. Shared by subagent brain tools and MCP
 * tokens bound to a web user.
 *
 * `writeBinding` (agent runs a web user started): put_page is bound to the
 * run's matter or the owner's private area, every other writing op is refused
 * — a page, link, timeline entry or fact that is not bound would be visible
 * firm-wide — and reads never reach a colleague's private area.
 */
export async function runMatterGuarded(
  op: Operation,
  opCtx: OperationContext,
  params: Record<string, unknown>,
  matterScope: MatterScope | undefined,
  readOnly: readonly string[] = [],
  writeBinding: AgentWriteBinding = { kind: "free" }
): Promise<unknown> {
  const bound = writeBinding.kind !== "free";
  const aclRestricted = Array.isArray(opCtx.aclGroups);
  if (matterScope === undefined && readOnly.length === 0 && !bound && !aclRestricted) {
    return op.handler(opCtx, params);
  }
  // A restricted scope must not reach a tool it cannot filter, even if the
  // registry offering it was bypassed.
  const scope: MatterScope = matterScope ?? "all";
  if ((Array.isArray(scope) || aclRestricted) && !MATTER_SCOPED_TOOLS.has(op.name)) {
    throw new OperationError(
      "permission_denied",
      `${op.name} is not available to matter-scoped callers`
    );
  }
  const vis: Visibility = {
    scope,
    ...(bound ? { ownPrivate: bindingPrivatePrefix(writeBinding) ?? "" } : {}),
  };
  if (op.name === "put_page") {
    const b = await bindAgentWrite(opCtx, writeBinding, params);
    await assertPutPageAllowed(b.ctx, scope, readOnly, b.params);
    const result = await op.handler(b.ctx, b.params);
    if (writeBinding.kind === "private") {
      // A first page may create the owner's private area: cached deny lists
      // must learn about it.
      const { notifyMatterAccessChanged } = await import("../../matter-access-db.ts");
      notifyMatterAccessChanged(b.ctx.sourceId ?? "default");
    }
    return result;
  }
  if (bound && (op.mutating === true || (op.scope !== undefined && op.scope !== "read"))) {
    throw new OperationError(
      "permission_denied",
      `${op.name} writes outside a matter; agent runs started by a user may only write bound pages (put_page).`
    );
  }
  if (bound && op.name === "get_page" && writeBinding.kind === "private") {
    // The run's own pages live in the owner's private area; the model keeps
    // addressing them by its agent-namespace slug.
    const own = typeof opCtx.subagentId === "number" ? `wiki/agents/${opCtx.subagentId}/` : "";
    if (own && typeof params.slug === "string" && params.slug.startsWith(own)) {
      params = { ...params, slug: `${writeBinding.prefix}${params.slug}` };
    }
  }
  if (scope === "all" && !bound) return op.handler(opCtx, params);
  if (typeof params.slug === "string" && hiddenPrivate(vis, params.slug)) {
    throw pageNotFound(params.slug);
  }
  if (op.name === "get_backlinks" || op.name === "traverse_graph") {
    await assertSlugVisible(opCtx, vis, params.slug);
  }
  return filterToolResult(op.name, opCtx, vis, await op.handler(opCtx, params));
}

/**
 * Apply the caller's `allowed_tools` subset to a registry. Unknown tool
 * names throw a clear error at load time (NOT silently ignored) so
 * subagent defs with a typo don't ship to prod wondering why a tool
 * never fires.
 */
export function filterAllowedTools(registry: ToolDef[], allowedToolNames: string[]): ToolDef[] {
  const indexByName = new Map(registry.map((t) => [t.name, t]));
  // Also index by the un-prefixed op name (for friendlier allowed_tools entries).
  const indexByShort = new Map(registry.map((t) => [t.name.replace(/^brain_/, ""), t]));
  const seen = new Set<string>();
  const picked: ToolDef[] = [];
  for (const requested of allowedToolNames) {
    const match = indexByName.get(requested) ?? indexByShort.get(requested);
    if (!match) {
      throw new Error(
        `subagent allowed_tools references unknown tool "${requested}". ` +
          `Known: ${[...indexByName.keys()].join(", ")}`
      );
    }
    if (seen.has(match.name)) continue;
    seen.add(match.name);
    picked.push(match);
  }
  return picked;
}

/** Exported for unit tests (stable surface). */
export const __testing = {
  sanitizeToolName,
  paramsToInputSchema,
  namespacedPutPageSchema,
  ANTHROPIC_NAME_RE,
};

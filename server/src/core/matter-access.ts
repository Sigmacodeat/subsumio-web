/**
 * Who may see and change which matter.
 *
 * A matter's access rules live in its case page's `frontmatter.permissions`:
 *
 *   visibility     "full" (default) — everyone in the firm, by role
 *                  "restricted"     — the matter team, active grants and admins
 *                  "confidential"   — the matter team and active grants only
 *   allowed_users  the matter team (user ids; role names are accepted too)
 *   grants         per-person access a colleague was given, "read" or "write",
 *                  optionally until `expires_at`
 *   blocked_users  the ethical wall: nobody listed here sees the matter,
 *                  whatever their role or grants (admins included)
 *
 * Client viewers see only matters they are on the team of or were granted,
 * whatever the visibility.
 *
 * The engine applies these rules to every web request that carries a signed
 * identity token (see web-api's matterAccessMiddleware): walled and hidden
 * matters become deny entries in the caller's matter scope, read-only matters
 * refuse writes.
 */

/** Matter scope: "all", or slug prefixes. `*` allows everything not denied; `!prefix` denies. */
export type MatterScope = string[] | "all";

export type MatterAccessLevel = "none" | "read" | "write";

export interface MatterGrant {
  user_id: string;
  level: "read" | "write";
  expires_at?: string;
  granted_by?: string;
  granted_at?: string;
}

export interface MatterPermissions {
  visibility?: "full" | "restricted" | "confidential";
  allowed_users?: string[];
  blocked_users?: string[];
  grants?: MatterGrant[];
}

export interface MatterAccessUser {
  userId: string;
  role?: string;
}

const SCOPE_ALL_EXCEPT = "*";

function underPrefix(prefix: string, candidate: string | undefined): boolean {
  return candidate !== undefined && (candidate === prefix || candidate.startsWith(`${prefix}/`));
}

/**
 * The one matter-scope predicate. A page is in scope when no deny entry covers
 * it and either the scope allows everything (`"all"`, `*`) or an allow entry
 * covers the page or the matter it belongs to. An empty scope denies all.
 */
export function matterScopeAllows(
  scope: MatterScope | undefined,
  slug: string,
  caseSlug?: string
): boolean {
  if (scope === undefined || scope === "all") return true;
  if (scope.length === 0) return false;
  let allowAll = false;
  const allow: string[] = [];
  for (const entry of scope) {
    if (entry === SCOPE_ALL_EXCEPT) allowAll = true;
    else if (entry.startsWith("!")) {
      const denied = entry.slice(1);
      if (underPrefix(denied, slug) || underPrefix(denied, caseSlug)) return false;
    } else allow.push(entry);
  }
  if (allowAll) return true;
  return allow.some((p) => underPrefix(p, slug) || underPrefix(p, caseSlug));
}

/** `scope` narrowed so the given matters are denied. */
export function withDeniedMatters(scope: MatterScope, denied: string[]): MatterScope {
  if (denied.length === 0) return scope;
  const deny = denied.map((slug) => `!${slug}`);
  if (scope === "all") return [SCOPE_ALL_EXCEPT, ...deny];
  if (scope.length === 0) return scope;
  return [...scope, ...deny];
}

function roleLevel(role: string | undefined): MatterAccessLevel {
  if (role === "admin" || role === "lawyer" || role === "assistant") return "write";
  return "read";
}

function minLevel(a: MatterAccessLevel, b: MatterAccessLevel): MatterAccessLevel {
  const rank = { none: 0, read: 1, write: 2 } as const;
  return rank[a] <= rank[b] ? a : b;
}

function maxLevel(a: MatterAccessLevel, b: MatterAccessLevel): MatterAccessLevel {
  const rank = { none: 0, read: 1, write: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

export function activeGrant(grant: MatterGrant, now: number = Date.now()): boolean {
  if (!grant.expires_at) return true;
  const until = Date.parse(grant.expires_at);
  return Number.isFinite(until) && until > now;
}

/** What `user` may do with a matter whose permissions are `perms`. */
export function matterAccessLevel(
  user: MatterAccessUser,
  perms: MatterPermissions | undefined | null,
  now: number = Date.now()
): MatterAccessLevel {
  const role = user.role;
  const base = roleLevel(role);
  const p = perms ?? {};
  if ((p.blocked_users ?? []).includes(user.userId)) return "none";

  const onTeam = (p.allowed_users ?? []).some((u) => u === user.userId || (role && u === role));
  const granted = (p.grants ?? [])
    .filter((g) => g.user_id === user.userId && activeGrant(g, now))
    .reduce<MatterAccessLevel>((acc, g) => maxLevel(acc, g.level), "none");
  const personal: MatterAccessLevel = onTeam ? base : minLevel(granted, base);

  if (role === "client_viewer") return onTeam ? "read" : minLevel(granted, "read");

  const visibility = p.visibility ?? "full";
  if (visibility === "full") return base;
  if (visibility === "restricted" && role === "admin") return base;
  return personal;
}

export interface MatterAccessRow {
  slug: string;
  permissions: MatterPermissions | null;
}

export interface CallerMatterAccess {
  /** Matters the caller may not see at all. */
  denied: string[];
  /** Matters the caller may read but not change. */
  readOnly: string[];
  /** For client viewers: the only matters they may see. */
  allowOnly?: string[];
}

/** Access of one caller across the firm's matters. */
export function callerMatterAccess(
  user: MatterAccessUser,
  rows: MatterAccessRow[],
  now: number = Date.now()
): CallerMatterAccess {
  const denied: string[] = [];
  const readOnly: string[] = [];
  const visible: string[] = [];
  for (const row of rows) {
    const level = matterAccessLevel(user, row.permissions, now);
    if (level === "none") denied.push(row.slug);
    else {
      visible.push(row.slug);
      if (level === "read") readOnly.push(row.slug);
    }
  }
  return user.role === "client_viewer"
    ? { denied, readOnly, allowOnly: visible }
    : { denied, readOnly };
}

/** The caller's matter scope after applying the matter access rules. */
export function scopeForCaller(scope: MatterScope, access: CallerMatterAccess): MatterScope {
  if (access.allowOnly) {
    return scope === "all"
      ? access.allowOnly
      : access.allowOnly.filter((slug) => matterScopeAllows(scope, slug));
  }
  return withDeniedMatters(scope, access.denied);
}

/**
 * Background agent work (supervisor, subagents, case scanner) runs long after
 * the web request that started it. The caller's effective matter scope and
 * read-only matters travel with the job in these data keys, and every job the
 * work spawns inherits them.
 */
export const JOB_MATTER_SCOPE_KEY = "_matter_scope";
export const JOB_MATTER_READ_ONLY_KEY = "_matter_read_only";

export interface JobMatterAccess {
  /** undefined = no restriction (CLI, cron, callers without an identity). */
  scope?: MatterScope;
  /** Matters the job may read but not write. */
  readOnly: string[];
}

/** The job-data stamp for a caller's matter access; `{}` when unrestricted. */
export function jobMatterStamp(
  scope: MatterScope | undefined,
  readOnly: string[] | undefined
): Record<string, unknown> {
  const ro = readOnly ?? [];
  if ((scope === undefined || scope === "all") && ro.length === 0) return {};
  return {
    [JOB_MATTER_SCOPE_KEY]: scope === undefined || scope === "all" ? "all" : [...scope],
    ...(ro.length > 0 ? { [JOB_MATTER_READ_ONLY_KEY]: [...ro] } : {}),
  };
}

function isSlugList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0);
}

/**
 * Read a job's matter access. Absent keys mean an unrestricted job; present
 * but malformed keys deny everything — a damaged stamp must never widen to
 * "all".
 */
export function readJobMatterAccess(data: unknown): JobMatterAccess {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rawScope = d[JOB_MATTER_SCOPE_KEY];
  const rawReadOnly = d[JOB_MATTER_READ_ONLY_KEY];
  const hasScope = JOB_MATTER_SCOPE_KEY in d;
  const hasReadOnly = JOB_MATTER_READ_ONLY_KEY in d;
  if (!hasScope && !hasReadOnly) return { readOnly: [] };
  const scopeOk = !hasScope || rawScope === "all" || isSlugList(rawScope);
  const readOnlyOk = !hasReadOnly || isSlugList(rawReadOnly);
  if (!scopeOk || !readOnlyOk) return { scope: [], readOnly: [] };
  return {
    scope: hasScope ? (rawScope as MatterScope) : "all",
    readOnly: hasReadOnly ? [...(rawReadOnly as string[])] : [],
  };
}

/** The stamp a job passes on to the jobs it spawns (same access, re-validated). */
export function inheritedJobMatterStamp(data: unknown): Record<string, unknown> {
  const access = readJobMatterAccess(data);
  if (access.scope === undefined) return {};
  return {
    [JOB_MATTER_SCOPE_KEY]: access.scope === "all" ? "all" : [...access.scope],
    ...(access.readOnly.length > 0 ? { [JOB_MATTER_READ_ONLY_KEY]: [...access.readOnly] } : {}),
  };
}

/**
 * Who started a piece of agent work, and the one matter it is explicitly
 * about. Both are set by the engine route that accepted the request (never
 * taken from caller-supplied job data) and inherited by every spawned job.
 */
export const JOB_OWNER_KEY = "_owner_user_id";
export const JOB_CASE_KEY = "_case_slug";

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** The web user who started the job, if recorded. */
export function readJobOwner(data: unknown): string | undefined {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return nonEmptyString(d[JOB_OWNER_KEY]);
}

/** The matter the job is explicitly bound to, if any. */
export function readJobCase(data: unknown): string | undefined {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return nonEmptyString(d[JOB_CASE_KEY]);
}

/** Owner + matter stamp for a new job (`{}` for what is unknown). */
export function jobOwnerStamp(ownerUserId?: string, caseSlug?: string): Record<string, unknown> {
  return {
    ...(nonEmptyString(ownerUserId) ? { [JOB_OWNER_KEY]: ownerUserId } : {}),
    ...(nonEmptyString(caseSlug) ? { [JOB_CASE_KEY]: caseSlug } : {}),
  };
}

/**
 * Everything a spawned agent job inherits from its parent: the matter access
 * stamp, the owner and the bound matter.
 */
export function inheritedAgentStamps(data: unknown): Record<string, unknown> {
  return {
    ...inheritedJobMatterStamp(data),
    ...jobOwnerStamp(readJobOwner(data), readJobCase(data)),
  };
}

function parseScope(scope: MatterScope | undefined): {
  allowAll: boolean;
  allow: string[];
  deny: string[];
} {
  if (scope === undefined || scope === "all") return { allowAll: true, allow: [], deny: [] };
  const out = { allowAll: false, allow: [] as string[], deny: [] as string[] };
  for (const e of scope) {
    if (e === SCOPE_ALL_EXCEPT) out.allowAll = true;
    else if (e.startsWith("!")) out.deny.push(e.slice(1));
    else out.allow.push(e);
  }
  return out;
}

/**
 * True when everything `inner` may reach, `outer` may reach too — i.e. work
 * done under `inner` cannot carry content `outer` may not see. Conservative:
 * an unprovable case answers false. Deny entries of `outer` under
 * `ignoreDenyPrefix` are not checked (see agentRunVisibility).
 */
export function scopeCovers(
  outer: MatterScope | undefined,
  inner: MatterScope | undefined,
  ignoreDenyPrefix?: string
): boolean {
  if (outer === undefined || outer === "all") return true;
  const o = parseScope(outer);
  const i = parseScope(inner);
  for (const d of o.deny) {
    if (ignoreDenyPrefix && d.startsWith(ignoreDenyPrefix)) continue;
    if (matterScopeAllows(inner, d)) return false;
  }
  if (!o.allowAll) {
    if (i.allowAll) return false;
    if (!i.allow.every((a) => matterScopeAllows(outer, a))) return false;
  }
  return true;
}

/**
 * How much of an agent run a web caller may see:
 *
 *   full      prompt, progress, result, messages
 *   metadata  status, timing, tokens, model — no content (admins only)
 *   none      the run does not exist for the caller
 *
 * A caller sees their own runs, and colleagues' runs that are bound to a
 * matter the caller may see and could not have reached any matter (or
 * private conversation) hidden from the caller. Walls bind admins too: they
 * get the metadata of every other run, never its content. A walled or
 * revoked matter also hides the content of one's own runs about it.
 * Callers without an identity (CLI, cron, trusted server calls) see all.
 */
export type AgentRunVisibility = "full" | "metadata" | "none";

export interface AgentRunViewer {
  userId?: string;
  role?: string;
  scope?: MatterScope;
}

export function agentRunVisibility(viewer: AgentRunViewer, jobData: unknown): AgentRunVisibility {
  const scope = viewer.scope;
  if (!viewer.userId && (scope === undefined || scope === "all")) return "full";
  const owner = readJobOwner(jobData);
  const caseSlug = readJobCase(jobData);
  const runScope = readJobMatterAccess(jobData).scope;
  const caseVisible = caseSlug === undefined || matterScopeAllows(scope, caseSlug, caseSlug);
  const fallback: AgentRunVisibility = viewer.role === "admin" ? "metadata" : "none";
  if (owner !== undefined && owner === viewer.userId) {
    // Colleagues' private conversations that appeared after the run started
    // were never reachable by it; only matter walls are re-checked.
    return caseVisible && scopeCovers(scope, runScope, PRIVATE_CHAT_PREFIX) ? "full" : "metadata";
  }
  if (caseSlug !== undefined && caseVisible && scopeCovers(scope, runScope)) return "full";
  return fallback;
}

/** True when `slug` (or the matter it belongs to) is one of the read-only matters. */
export function matterIsReadOnly(readOnly: string[], slug: string, caseSlug?: string): boolean {
  return readOnly.some((m) => matterScopeAllows([m], slug, caseSlug));
}

/** Where the web app keeps private Copilot conversations: `chat-sessions/private/<owner>/<id>`. */
export const PRIVATE_CHAT_PREFIX = "chat-sessions/private/";

/** The owner segment of a private conversation's slug, as the web app writes it. */
export function chatOwnerSegment(userId: string): string {
  return userId.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Deny entries hiding everyone else's private conversations from `userId`. */
export function privateChatDenies(owners: string[], userId: string): string[] {
  const me = chatOwnerSegment(userId);
  return owners.filter((o) => o && o !== me).map((o) => `${PRIVATE_CHAT_PREFIX}${o}`);
}

/**
 * One user's private area, `chat-sessions/private/<owner>/`: their Copilot
 * conversations and the pages their agent runs keep for them alone. Everyone
 * else's matter scope denies it (privateChatDenies), and search never shows
 * `chat-sessions/`.
 */
export function privateAreaPrefix(userId: string): string {
  return `${PRIVATE_CHAT_PREFIX}${chatOwnerSegment(userId)}/`;
}

/**
 * Where the pages an agent run writes may go.
 *
 *   free     no stamp at all (CLI, operator cron): unchanged behaviour.
 *   matter   the run is about one matter: every page it writes is bound to it
 *            (frontmatter case_slug), and it may only update pages of that
 *            matter.
 *   private  a web user's run without a matter: every page it writes goes to
 *            the user's private area, never firm-wide.
 *   refuse   the run carries a matter-access stamp but neither a matter nor an
 *            owner to keep the page for: it may not write pages at all.
 *
 * Any web-started run counts — an owner or a matter stamp alone is enough —
 * because even a caller without walls may read matters colleagues are walled
 * from, or private conversations of their own.
 */
export type AgentWriteBinding =
  | { kind: "free" }
  | { kind: "matter"; caseSlug: string; ownerUserId?: string }
  | { kind: "private"; ownerUserId: string; prefix: string }
  | { kind: "refuse" };

export function agentWriteBinding(data: unknown): AgentWriteBinding {
  const caseSlug = readJobCase(data);
  const owner = readJobOwner(data);
  if (caseSlug) return { kind: "matter", caseSlug, ...(owner ? { ownerUserId: owner } : {}) };
  if (owner) return { kind: "private", ownerUserId: owner, prefix: privateAreaPrefix(owner) };
  if (readJobMatterAccess(data).scope !== undefined) return { kind: "refuse" };
  return { kind: "free" };
}

/** The private area of the run's owner, when known. */
export function bindingPrivatePrefix(binding: AgentWriteBinding): string | undefined {
  if (binding.kind === "private") return binding.prefix;
  if (binding.kind === "matter" && binding.ownerUserId) {
    return privateAreaPrefix(binding.ownerUserId);
  }
  return undefined;
}

/**
 * True for a slug in somebody's private area other than `ownPrefix`. A run's
 * stamp is frozen when it starts; a colleague's private area created later is
 * not in its deny list, so bound runs check the prefix structurally.
 */
export function isForeignPrivateSlug(slug: string | undefined, ownPrefix?: string): boolean {
  if (!slug || !slug.startsWith(PRIVATE_CHAT_PREFIX)) return false;
  return !(ownPrefix && slug.startsWith(ownPrefix));
}

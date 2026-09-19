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

/**
 * Who may see and change which matter — the web app's copy of the rule the
 * engine enforces (server/src/core/matter-access.ts). The engine is the
 * enforcement point; this copy decides what the access page offers and who
 * may grant. `matter-access.test.ts` pins both to the same answers.
 *
 * Rules live in the case page's `frontmatter.permissions`: visibility
 * ("full" | "restricted" | "confidential"), the matter team (`allowed_users`),
 * per-person `grants` with an optional expiry, and the ethical wall
 * (`blocked_users`, which applies to admins too).
 */

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

import type { KanzleiRole } from "@/lib/auth/store";

/**
 * Who may see which accounts of the firm.
 *
 * - A client account (`client_viewer`) sees only itself — never colleagues'
 *   clients (the client relationship itself is confidential) and not the
 *   staff directory.
 * - Firm staff see each other. Client accounts are visible to admins, who
 *   manage them, and — where a route passes `includeClients` — to staff who
 *   need to pick them (e.g. granting matter access).
 * - Unknown/missing roles see nothing but themselves (fail-closed).
 */
export const STAFF_ROLES: ReadonlySet<string> = new Set(["admin", "lawyer", "assistant"]);

export function isStaffRole(role: string | null | undefined): role is KanzleiRole {
  return typeof role === "string" && STAFF_ROLES.has(role);
}

export function visibleOrgMembers<T extends { id: string; role?: string | null }>(
  viewer: { id: string; role?: string | null },
  members: T[],
  opts: { includeClients?: boolean } = {}
): T[] {
  if (!isStaffRole(viewer.role)) return members.filter((m) => m.id === viewer.id);
  const showClients = viewer.role === "admin" || opts.includeClients === true;
  return members.filter((m) => m.id === viewer.id || isStaffRole(m.role) || showClients);
}

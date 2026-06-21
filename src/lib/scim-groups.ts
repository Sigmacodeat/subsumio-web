import type { SCIMGroup } from "@/lib/scim";

export interface StoredScimGroup extends SCIMGroup {
  /** Org this group belongs to — every route must filter/check this before reading or writing. */
  _orgId: string;
}

// In-memory group store (groups are synced from WorkOS but not persisted to the user store)
// In production with Postgres, this would use a dedicated table.
// Keyed by group id; every entry is tagged with the owning org (_orgId) so one
// tenant's IdP can never list, read, or write another tenant's groups.
export const groups: Map<string, StoredScimGroup> = new Map();

export function listGroupsForOrg(orgId: string): StoredScimGroup[] {
  return Array.from(groups.values()).filter((g) => g._orgId === orgId);
}

export function getGroupForOrg(id: string, orgId: string): StoredScimGroup | undefined {
  const group = groups.get(id);
  return group && group._orgId === orgId ? group : undefined;
}

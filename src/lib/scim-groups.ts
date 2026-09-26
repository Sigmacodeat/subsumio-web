import type { SCIMGroup, SCIMPatchOperation } from "@/lib/scim";

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

type GroupMembers = NonNullable<SCIMGroup["members"]>;

function memberIdsOf(value: unknown): Set<string> {
  const ids = new Set<string>();
  const list = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of list) {
    const id = typeof item === "string" ? item : (item as { value?: unknown } | null)?.value;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

/** `members[value eq "u1"]` → "u1" (the filter form of a single-member removal). */
function memberFilterId(path: string): string | null {
  const m = /^members\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i.exec(path.trim());
  return m ? m[1] : null;
}

/**
 * Applies one SCIM PATCH operation to a group (RFC 7644 §3.5.2). A `remove`
 * of members with a value list or a `members[value eq "…"]` filter removes
 * only those members; only a bare `remove members` clears the list.
 */
export function applyGroupPatch(group: SCIMGroup, op: SCIMPatchOperation): void {
  const path = op.path || "";
  const lowerPath = path.toLowerCase();
  const kind = op.op.toLowerCase();

  if (
    (kind === "replace" || kind === "add") &&
    path === "" &&
    op.value &&
    typeof op.value === "object"
  ) {
    // Path-less form: each attribute of the value object.
    for (const [key, value] of Object.entries(op.value as Record<string, unknown>)) {
      applyGroupPatch(group, { op: op.op, path: key, value });
    }
    return;
  }

  switch (kind) {
    case "replace":
    case "add":
      if (lowerPath === "displayname") {
        group.displayName = String(op.value);
      } else if (lowerPath === "members" && Array.isArray(op.value)) {
        const newMembers = op.value as GroupMembers;
        if (kind === "add") {
          group.members = [...(group.members || []), ...newMembers];
        } else {
          group.members = newMembers;
        }
      }
      break;
    case "remove": {
      const filterId = memberFilterId(path);
      if (filterId) {
        group.members = (group.members || []).filter((m) => m.value !== filterId);
      } else if (lowerPath === "members") {
        const ids = memberIdsOf(op.value);
        group.members = ids.size ? (group.members || []).filter((m) => !ids.has(m.value)) : [];
      }
      // displayName is required and cannot be removed.
      break;
    }
  }
}

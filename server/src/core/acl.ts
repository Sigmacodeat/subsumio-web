/**
 * Subsumio R3: Document-level ACL helpers.
 *
 * Provides SQL-level filtering and CRUD operations for page-level access control.
 * The enforcement model is:
 *   - Pages with NO page_permissions rows are open (open-by-default).
 *   - Pages WITH page_permissions rows are restricted to members of those groups.
 *   - aclGroups = undefined or "all" → no filtering (trusted admin / legacy).
 *   - aclGroups = string[] → only pages where the caller's groups have a matching row.
 */

import type { BrainEngine } from "./engine.ts";

export interface AccessGroup {
  id: string;
  source_id: string;
  name: string;
  created_at: string;
  member_count?: number;
}

export interface PagePermission {
  page_id: number;
  group_id: string;
  group_name?: string;
  permission: "read" | "write";
  created_at: string;
}

/**
 * Check if a page is accessible given the caller's ACL groups.
 * Returns true if:
 *   - aclGroups is undefined or "all" (no enforcement)
 *   - The page has no page_permissions rows (open-by-default)
 *   - The page has a permission row matching one of the caller's groups
 */
export async function isPageAccessible(
  engine: BrainEngine,
  pageId: number,
  aclGroups: string[] | "all" | undefined
): Promise<boolean> {
  if (aclGroups === undefined || aclGroups === "all" || aclGroups.length === 0) {
    return true;
  }

  const [row] = await engine.executeRaw<{ count: number; matching: number }>(
    `SELECT
       (SELECT count(*)::int FROM page_permissions WHERE page_id = $1) AS count,
       (SELECT count(*)::int FROM page_permissions WHERE page_id = $1 AND group_id = ANY($2::uuid[])) AS matching`,
    [pageId, aclGroups]
  );

  if (!row) return true;
  // No permissions rows = open access
  if (row.count === 0) return true;
  // Has permissions → must match at least one group
  return row.matching > 0;
}

/**
 * Filter page IDs by ACL accessibility. Returns the subset of pageIds
 * that the caller's groups can access.
 */
export async function filterPagesByACL(
  engine: BrainEngine,
  pageIds: number[],
  aclGroups: string[] | "all" | undefined
): Promise<number[]> {
  if (aclGroups === undefined || aclGroups === "all" || aclGroups.length === 0) {
    return pageIds;
  }
  if (pageIds.length === 0) return [];

  const accessible = await engine.executeRaw<{ page_id: number }>(
    `SELECT p.id AS page_id
     FROM pages p
     WHERE p.id = ANY($1::int[])
       AND (
         NOT EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = p.id)
         OR EXISTS (
           SELECT 1 FROM page_permissions pp
           WHERE pp.page_id = p.id AND pp.group_id = ANY($2::uuid[])
         )
       )`,
    [pageIds, aclGroups]
  );

  return accessible.map((r) => r.page_id);
}

/**
 * Get a SQL fragment that filters pages by ACL when joined.
 * Returns a WHERE clause fragment that can be ANDed into existing queries.
 * Uses $N placeholders starting at paramOffset.
 */
export function aclFilterClause(
  aclGroups: string[] | "all" | undefined,
  paramOffset: number
): { clause: string; params: string[] } | null {
  if (aclGroups === undefined || aclGroups === "all" || aclGroups.length === 0) {
    return null;
  }

  return {
    clause: `AND (
      NOT EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = p.id)
      OR EXISTS (
        SELECT 1 FROM page_permissions pp
        WHERE pp.page_id = p.id AND pp.group_id = ANY($${paramOffset}::uuid[])
      )
    )`,
    params: [JSON.stringify(aclGroups)],
  };
}

// ── CRUD Operations ──

export async function listAccessGroups(
  engine: BrainEngine,
  sourceId: string
): Promise<AccessGroup[]> {
  const rows = await engine.executeRaw<AccessGroup>(
    `SELECT g.id::text AS id, g.source_id, g.name, g.created_at::text AS created_at,
       (SELECT count(*)::int FROM access_group_members m WHERE m.group_id = g.id) AS member_count
     FROM access_groups g
     WHERE g.source_id = $1
     ORDER BY g.name`,
    [sourceId]
  );
  return rows;
}

export async function createAccessGroup(
  engine: BrainEngine,
  sourceId: string,
  name: string
): Promise<AccessGroup> {
  const [row] = await engine.executeRaw<AccessGroup>(
    `INSERT INTO access_groups (source_id, name)
     VALUES ($1, $2)
     ON CONFLICT (source_id, name) DO NOTHING
     RETURNING id::text AS id, source_id, name, created_at::text AS created_at`,
    [sourceId, name]
  );
  if (!row) {
    const [existing] = await engine.executeRaw<AccessGroup>(
      `SELECT id::text AS id, source_id, name, created_at::text AS created_at
       FROM access_groups WHERE source_id = $1 AND name = $2`,
      [sourceId, name]
    );
    return existing!;
  }
  return row;
}

export async function deleteAccessGroup(engine: BrainEngine, groupId: string): Promise<boolean> {
  const [row] = await engine.executeRaw<{ id: string }>(
    `DELETE FROM access_groups WHERE id = $1::uuid RETURNING id::text`,
    [groupId]
  );
  return !!row;
}

export async function addGroupMember(
  engine: BrainEngine,
  groupId: string,
  userId: string,
  sourceId: string
): Promise<void> {
  await engine.executeRaw(
    `INSERT INTO access_group_members (group_id, user_id, source_id)
     VALUES ($1::uuid, $2, $3)
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [groupId, userId, sourceId]
  );
}

export async function removeGroupMember(
  engine: BrainEngine,
  groupId: string,
  userId: string
): Promise<boolean> {
  const [row] = await engine.executeRaw<{ group_id: string }>(
    `DELETE FROM access_group_members WHERE group_id = $1::uuid AND user_id = $2
     RETURNING group_id::text`,
    [groupId, userId]
  );
  return !!row;
}

export async function listGroupMembers(
  engine: BrainEngine,
  groupId: string
): Promise<{ user_id: string; created_at: string }[]> {
  return engine.executeRaw<{ user_id: string; created_at: string }>(
    `SELECT user_id, created_at::text AS created_at
     FROM access_group_members
     WHERE group_id = $1::uuid
     ORDER BY created_at`,
    [groupId]
  );
}

export async function getUserGroups(
  engine: BrainEngine,
  userId: string,
  sourceId: string
): Promise<string[]> {
  const rows = await engine.executeRaw<{ group_id: string }>(
    `SELECT group_id::text AS group_id
     FROM access_group_members
     WHERE user_id = $1 AND source_id = $2`,
    [userId, sourceId]
  );
  return rows.map((r) => r.group_id);
}

export async function setPagePermission(
  engine: BrainEngine,
  pageId: number,
  groupId: string,
  permission: "read" | "write"
): Promise<void> {
  await engine.executeRaw(
    `INSERT INTO page_permissions (page_id, group_id, permission)
     VALUES ($1, $2::uuid, $3)
     ON CONFLICT (page_id, group_id) DO UPDATE SET permission = $3`,
    [pageId, groupId, permission]
  );
}

export async function removePagePermission(
  engine: BrainEngine,
  pageId: number,
  groupId: string
): Promise<boolean> {
  const [row] = await engine.executeRaw<{ page_id: number }>(
    `DELETE FROM page_permissions WHERE page_id = $1 AND group_id = $2::uuid
     RETURNING page_id`,
    [pageId, groupId]
  );
  return !!row;
}

export async function getPagePermissions(
  engine: BrainEngine,
  pageId: number
): Promise<PagePermission[]> {
  return engine.executeRaw<PagePermission>(
    `SELECT pp.page_id, pp.group_id::text AS group_id, g.name AS group_name,
       pp.permission, pp.created_at::text AS created_at
     FROM page_permissions pp
     JOIN access_groups g ON g.id = pp.group_id
     WHERE pp.page_id = $1
     ORDER BY g.name`,
    [pageId]
  );
}

// ── Ethical Wall (Engine-Layer) ──────────────────────────────────────
//
// The web-app ethical-wall.ts checks `blocked_users` in PermissionInfo,
// but that only covers HTTP/dashboard callers. These engine-layer functions
// ensure MCP/CLI/subagent callers are also subject to ethical wall enforcement.
//
// The blocked_users list is stored per-source in the `source_config` table
// under a `blocked_users` JSON key, set by the dashboard ethical-wall UI.
// This mirrors the web-app contract but makes it enforceable at the
// engine layer where operations.ts can call it.

/**
 * Check if a user is blocked on a given source (ethical wall).
 * Reads the `blocked_users` array from `source_config`.
 * Returns true if the user is in the blocked list.
 */
export async function isUserBlockedOnSource(
  engine: BrainEngine,
  userId: string,
  sourceId: string
): Promise<boolean> {
  try {
    const [row] = await engine.executeRaw<{ blocked_users?: string[] }>(
      `SELECT (config->'blocked_users')::jsonb AS blocked_users
       FROM source_config WHERE source_id = $1`,
      [sourceId]
    );
    if (!row?.blocked_users) return false;
    return row.blocked_users.includes(userId);
  } catch {
    // source_config table missing or no blocked_users key → fail open
    return false;
  }
}

/**
 * Filter a list of user IDs by ethical wall blocking on a source.
 * Returns { allowed, blocked } partition.
 */
export async function filterUsersByEthicalWallEngine(
  engine: BrainEngine,
  userIds: string[],
  sourceId: string
): Promise<{ allowed: string[]; blocked: string[] }> {
  if (userIds.length === 0) return { allowed: [], blocked: [] };
  try {
    const [row] = await engine.executeRaw<{ blocked_users?: string[] }>(
      `SELECT (config->'blocked_users')::jsonb AS blocked_users
       FROM source_config WHERE source_id = $1`,
      [sourceId]
    );
    if (!row?.blocked_users || row.blocked_users.length === 0) {
      return { allowed: [...userIds], blocked: [] };
    }
    const blockedSet = new Set(row.blocked_users);
    const allowed: string[] = [];
    const blocked: string[] = [];
    for (const uid of userIds) {
      if (blockedSet.has(uid)) blocked.push(uid);
      else allowed.push(uid);
    }
    return { allowed, blocked };
  } catch {
    return { allowed: [...userIds], blocked: [] };
  }
}

/**
 * Combined ethical wall + ACL check for a page access decision.
 * Ethical wall takes precedence: if blocked, deny regardless of ACL.
 *
 * Usage in operations.ts read handlers:
 *   const blocked = await isUserBlockedOnSource(engine, ctx.userId, ctx.sourceId);
 *   if (blocked) throw new OperationError("permission_denied", "ethical wall");
 */
export async function checkEthicalWallEngine(
  engine: BrainEngine,
  userId: string | undefined,
  sourceId: string
): Promise<{ allowed: boolean; reason: string }> {
  if (!userId) return { allowed: true, reason: "no_user_id" };
  const blocked = await isUserBlockedOnSource(engine, userId, sourceId);
  if (blocked) {
    return { allowed: false, reason: "user_blocked_by_ethical_wall" };
  }
  return { allowed: true, reason: "not_blocked" };
}

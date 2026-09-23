/**
 * Database side of the matter access rules (core/matter-access.ts): the
 * access rules of every matter in a source, and the effective scope of one
 * user. Shared by the web API middleware and the MCP token path so both
 * apply exactly the same walls.
 */
import type { BrainEngine } from "./engine.ts";
import {
  PRIVATE_CHAT_PREFIX,
  callerMatterAccess,
  privateChatDenies,
  scopeForCaller,
  withDeniedMatters,
  type MatterAccessRow,
  type MatterAccessUser,
  type MatterScope,
} from "./matter-access.ts";

export interface SourceMatterAccess {
  rows: MatterAccessRow[];
  /** Owner segments of private Copilot conversations (chat-sessions/private/<owner>/…). */
  chatOwners: string[];
}

/** The access rules of every matter in `sourceId` that has any. */
export async function loadSourceMatterAccess(
  engine: BrainEngine,
  sourceId: string
): Promise<SourceMatterAccess> {
  const raw = await engine.executeRaw<{ slug: string; permissions: unknown }>(
    `SELECT slug, frontmatter->'permissions' AS permissions
       FROM pages
      WHERE source_id = $1
        AND type = 'legal_case'
        AND deleted_at IS NULL
        AND frontmatter->'permissions' IS NOT NULL`,
    [sourceId]
  );
  const owners = await engine.executeRaw<{ owner: string }>(
    `SELECT DISTINCT split_part(slug, '/', 3) AS owner
       FROM pages
      WHERE source_id = $1
        AND slug LIKE $2
        AND deleted_at IS NULL`,
    [sourceId, `${PRIVATE_CHAT_PREFIX}%`]
  );
  return {
    rows: raw.map((r) => ({
      slug: r.slug,
      permissions: (typeof r.permissions === "string"
        ? JSON.parse(r.permissions)
        : r.permissions) as MatterAccessRow["permissions"],
    })),
    chatOwners: owners.map((o) => o.owner),
  };
}

/**
 * One user's effective matter scope and read-only matters, starting from
 * `base` (the scope a signed token already carried; "all" otherwise).
 * Walls, restricted matters and grants apply to every role, admins included;
 * other people's private conversations are always hidden.
 */
export function callerMatterScope(
  base: MatterScope,
  user: MatterAccessUser,
  known: SourceMatterAccess
): { scope: MatterScope; readOnly: string[] } {
  const access = callerMatterAccess(user, known.rows);
  return {
    scope: withDeniedMatters(
      scopeForCaller(base, access),
      privateChatDenies(known.chatOwners, user.userId)
    ),
    readOnly: access.readOnly,
  };
}

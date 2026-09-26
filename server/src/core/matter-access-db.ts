/**
 * Database side of the matter access rules (core/matter-access.ts): the
 * access rules of every matter in a source, and the effective scope of one
 * user. Shared by the web API middleware and the MCP token path so both
 * apply exactly the same walls.
 */
import type { BrainEngine } from "./engine.ts";
import {
  ID_COPY_DOC_TYPE,
  KYC_RECORD_TYPE,
  PRIVATE_CHAT_PREFIX,
  callerMatterAccess,
  privateChatDenies,
  scopeForCaller,
  staffOnlyDenies,
  withDeniedMatters,
  type MatterAccessRow,
  type MatterAccessUser,
  type MatterScope,
} from "./matter-access.ts";

/**
 * Callers that cache a source's matter access (the web API middleware) hear
 * about writes that change it — a new private area, a changed case page — so
 * the cache does not serve stale deny lists. In-process only: a separate
 * worker process cannot reach the web API's cache, which then refreshes
 * within its short TTL.
 */
const accessListeners = new Set<(sourceId: string) => void>();

export function onMatterAccessChanged(listener: (sourceId: string) => void): () => void {
  accessListeners.add(listener);
  return () => accessListeners.delete(listener);
}

export function notifyMatterAccessChanged(sourceId: string): void {
  for (const listener of accessListeners) {
    try {
      listener(sourceId);
    } catch {
      // A listener failure must not fail the write that triggered it.
    }
  }
}

export interface SourceMatterAccess {
  rows: MatterAccessRow[];
  /** Owner segments of private Copilot conversations (chat-sessions/private/<owner>/…). */
  chatOwners: string[];
  /**
   * Firm-internal records only staff may read: KYC records and the ID copies
   * filed with them (see staffOnlyDenies). Deleted ones count too, so the
   * trash does not reopen them.
   */
  staffOnlySlugs: string[];
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
  const kyc = await engine.executeRaw<{ slug: string; id_copy: string | null }>(
    `SELECT slug, frontmatter->'identification'->>'document_file_slug' AS id_copy
       FROM pages
      WHERE source_id = $1
        AND type = $2`,
    [sourceId, KYC_RECORD_TYPE]
  );
  // Containment on the frontmatter GIN index — no per-row JSON extraction.
  const idCopies = await engine.executeRaw<{ slug: string }>(
    `SELECT slug
       FROM pages
      WHERE source_id = $1
        AND frontmatter @> jsonb_build_object('doc_type', $2::text)`,
    [sourceId, ID_COPY_DOC_TYPE]
  );
  const staffOnly = new Set<string>();
  for (const r of kyc) {
    staffOnly.add(r.slug);
    if (typeof r.id_copy === "string" && r.id_copy) staffOnly.add(r.id_copy);
  }
  for (const r of idCopies) staffOnly.add(r.slug);
  return {
    rows: raw.map((r) => ({
      slug: r.slug,
      permissions: (typeof r.permissions === "string"
        ? JSON.parse(r.permissions)
        : r.permissions) as MatterAccessRow["permissions"],
    })),
    chatOwners: owners.map((o) => o.owner),
    staffOnlySlugs: [...staffOnly],
  };
}

/**
 * One user's effective matter scope and read-only matters, starting from
 * `base` (the scope a signed token already carried; "all" otherwise).
 * Walls, restricted matters and grants apply to every role, admins included;
 * other people's private conversations are always hidden, and firm-internal
 * records (KYC) from everyone who is not firm staff.
 */
export function callerMatterScope(
  base: MatterScope,
  user: MatterAccessUser,
  known: SourceMatterAccess
): { scope: MatterScope; readOnly: string[] } {
  const access = callerMatterAccess(user, known.rows);
  return {
    scope: withDeniedMatters(scopeForCaller(base, access), [
      ...privateChatDenies(known.chatOwners, user.userId),
      // KYC records and ID copies are for firm staff only (AML tipping-off
      // ban) — client accounts never reach them, not even on their matter.
      ...staffOnlyDenies(user.role, known.staffOnlySlugs ?? []),
    ]),
    readOnly: access.readOnly,
  };
}

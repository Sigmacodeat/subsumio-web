/**
 * Archive/restore cascade for a matter's documents — one implementation for
 * the matter page (DELETE/PATCH /api/pages/<akte>) and the Papierkorb
 * (POST /api/trash).
 *
 * The engine cannot filter by frontmatter and returns at most 100 rows per
 * list request, so the documents of a matter are found by paging through the
 * whole `document` type (keyset cursor, strict: a failed page aborts instead
 * of looking like "no more documents") and filtering on `case_slug`.
 *
 * Restore semantics (same on both routes): only documents the archive
 * cascade tombstoned (`tombstone_reason: "case_archived"`) come back.
 * Documents someone deleted on purpose stay deleted.
 */

import { enginePatchPage } from "@/lib/engine";
import { listEnginePages, type ListedPage } from "@/lib/engine-pages";

/** Upper bound for the firm-wide document scan behind a cascade. */
export const CASCADE_SCAN_MAX = 100_000;
const CASCADE_BATCH = 5;

/** Restoring a matter is a lawyer/admin decision on every route. */
export const CASE_RESTORE_ROLES: ReadonlySet<string> = new Set(["admin", "lawyer"]);

export function canRestoreCase(role: string | undefined | null): boolean {
  return !!role && CASE_RESTORE_ROLES.has(role);
}

export interface CascadeFailure {
  slug: string;
  status?: number;
  error?: string;
}

export interface CascadeResult {
  attempted: true;
  matched: number;
  succeeded: number;
  failed: CascadeFailure[];
}

/** Every document page of the firm (including deleted ones). Throws on a failed read. */
async function listAllDocuments(headers: Record<string, string>): Promise<ListedPage[]> {
  const docs = await listEnginePages(headers, "document", CASCADE_SCAN_MAX, {
    includeTombstoned: true,
    strict: true,
  });
  if (docs.length >= CASCADE_SCAN_MAX) {
    throw new Error(`document scan truncated at ${CASCADE_SCAN_MAX}`);
  }
  return docs;
}

async function patchAll(
  headers: Record<string, string>,
  docs: ListedPage[],
  frontmatter: Record<string, unknown>
): Promise<CascadeResult> {
  const failed: CascadeFailure[] = [];
  let succeeded = 0;
  for (let i = 0; i < docs.length; i += CASCADE_BATCH) {
    const results = await Promise.all(
      docs.slice(i, i + CASCADE_BATCH).map(async (doc): Promise<CascadeFailure | null> => {
        try {
          const res = await enginePatchPage(
            headers,
            { slug: doc.slug, frontmatter },
            { timeoutMs: 15_000 }
          );
          return res.ok ? null : { slug: doc.slug, status: res.status };
        } catch (err) {
          return { slug: doc.slug, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    for (const r of results) {
      if (r) failed.push(r);
      else succeeded++;
    }
  }
  return { attempted: true, matched: docs.length, succeeded, failed };
}

function listingFailure(err: unknown): CascadeResult {
  return {
    attempted: true,
    matched: 0,
    succeeded: 0,
    failed: [{ slug: "*", error: err instanceof Error ? err.message : String(err) }],
  };
}

/**
 * Why a matter's pages were hidden:
 *  - "case_archived": the matter was archived (Aktenabschluss). The pages are
 *    retained records — never in the Papierkorb, never purged.
 *  - "case_deleted": the matter itself went to the Papierkorb; its pages go
 *    with it and are purged with it after the trash window.
 */
export type CaseCascadeReason = "case_archived" | "case_deleted";

/**
 * Hide every page of the matter. Archiving tombstones the active pages;
 * deleting also moves the pages an earlier archive hid into the Papierkorb
 * (a matter whose retention period has run is deleted from the archive).
 * Pages someone deleted on purpose keep their own reason and timestamp.
 */
export async function tombstoneCaseDocuments(
  headers: Record<string, string>,
  caseSlugForms: ReadonlySet<string>,
  actorEmail: string,
  reason: CaseCascadeReason,
  now = new Date().toISOString()
): Promise<CascadeResult> {
  let docs: ListedPage[];
  try {
    docs = await listAllDocuments(headers);
  } catch (err) {
    return listingFailure(err);
  }
  const matched = docs.filter((d) => {
    const fm = d.frontmatter ?? {};
    if (!caseSlugForms.has(fm.case_slug as string)) return false;
    if (fm.status !== "tombstoned") return true;
    return reason === "case_deleted" && fm.tombstone_reason === "case_archived";
  });
  return patchAll(headers, matched, {
    status: "tombstoned",
    tombstoned_at: now,
    tombstoned_by: actorEmail,
    tombstone_reason: reason,
  });
}

/** Archive cascade (`tombstone_reason: "case_archived"`) — retained, not trash. */
export async function archiveCaseDocuments(
  headers: Record<string, string>,
  caseSlugForms: ReadonlySet<string>,
  actorEmail: string,
  now = new Date().toISOString()
): Promise<CascadeResult> {
  return tombstoneCaseDocuments(headers, caseSlugForms, actorEmail, "case_archived", now);
}

/**
 * Bring back the pages a matter cascade hid (`fromReason`). Manually deleted
 * pages of the matter stay in the Papierkorb. `backToArchive`: the matter is
 * restored from the Papierkorb into the archive — its pages go back to being
 * archived with it instead of becoming active.
 */
export async function restoreCaseDocuments(
  headers: Record<string, string>,
  caseSlugForms: ReadonlySet<string>,
  actorEmail: string,
  now = new Date().toISOString(),
  opts: { fromReason?: CaseCascadeReason; backToArchive?: boolean } = {}
): Promise<CascadeResult> {
  const fromReason = opts.fromReason ?? "case_archived";
  let docs: ListedPage[];
  try {
    docs = await listAllDocuments(headers);
  } catch (err) {
    return listingFailure(err);
  }
  const matched = docs.filter((d) => {
    const fm = d.frontmatter ?? {};
    return (
      fm.status === "tombstoned" &&
      fm.tombstone_reason === fromReason &&
      caseSlugForms.has(fm.case_slug as string)
    );
  });
  if (opts.backToArchive) {
    return patchAll(headers, matched, {
      tombstone_reason: "case_archived",
      restored_at: now,
      restored_by: actorEmail,
    });
  }
  // Merge semantics: `null` removes the key.
  return patchAll(headers, matched, {
    status: null,
    restored_at: now,
    restored_by: actorEmail,
    tombstoned_at: null,
    tombstoned_by: null,
    tombstone_reason: null,
  });
}

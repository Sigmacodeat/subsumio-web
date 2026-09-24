import { isTombstoned } from "@/lib/tombstone";

/**
 * Shared Papierkorb model — used by /api/trash (list + restore) and
 * /api/cron/trash-purge (retention expiry). Deletion in this codebase is
 * frontmatter-based:
 *  - legal_case pages become `status: "archived"` (+ archived_at/archived_by),
 *    their documents are cascade-tombstoned (`tombstone_reason: "case_archived"`).
 *  - every other page becomes `status: "tombstoned"` (+ tombstoned_at …).
 */
export const TRASH_TYPES = [
  "legal_case",
  "document",
  "intake_request",
  "legal_contact",
  "legal_deadline",
  "deadline",
  "invoice",
  "note",
  "time_entry",
  "task",
] as const;

export interface TrashItem {
  slug: string;
  title: string;
  type: string;
  /** "case" = archived matter (restores its documents), "item" = tombstoned page. */
  kind: "case" | "item";
  deleted_at?: string;
  deleted_by?: string;
  case_slug?: string;
  /** "manual_delete" | "case_archived" | "archived" */
  reason?: string;
  legal_hold?: boolean;
}

interface TrashSourcePage {
  slug: string;
  title?: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

export function toTrashItem(page: TrashSourcePage): TrashItem | null {
  const fm = page.frontmatter ?? {};
  const isArchivedCase = page.type === "legal_case" && fm.status === "archived";
  if (!isArchivedCase && !isTombstoned(page)) return null;
  return {
    slug: page.slug,
    title: page.title || page.slug,
    type: page.type ?? String(fm.type ?? "document"),
    kind: isArchivedCase ? "case" : "item",
    deleted_at: (isArchivedCase ? fm.archived_at : fm.tombstoned_at) as string | undefined,
    deleted_by: (isArchivedCase ? fm.archived_by : fm.tombstoned_by) as string | undefined,
    case_slug: fm.case_slug as string | undefined,
    reason: (isArchivedCase ? "archived" : fm.tombstone_reason) as string | undefined,
    legal_hold: fm.legal_hold === true,
  };
}

/** MS the item stays restorable — deleted_at + retentionDays. */
export function trashPurgeAt(item: TrashItem, retentionDays: number): Date | null {
  if (!item.deleted_at) return null;
  const deleted = new Date(item.deleted_at).getTime();
  if (!Number.isFinite(deleted)) return null;
  return new Date(deleted + retentionDays * 86_400_000);
}

/** Past the retention window? Items without a deletion timestamp never expire. */
export function isTrashExpired(item: TrashItem, retentionDays: number, now = new Date()): boolean {
  const purgeAt = trashPurgeAt(item, retentionDays);
  return purgeAt !== null && purgeAt.getTime() <= now.getTime();
}

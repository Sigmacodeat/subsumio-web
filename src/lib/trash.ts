import { isTombstoned } from "@/lib/tombstone";
import { caseRetentionState, type CaseRetentionState } from "@/lib/case-retention";

/**
 * Shared Papierkorb model — used by /api/trash (list + restore) and
 * /api/cron/trash-purge (retention expiry). Deletion in this codebase is
 * frontmatter-based:
 *  - Archivieren (Aktenabschluss) ist KEIN Löschen: die Akte wird
 *    `status: "archived"` (+ archived_at/closed_at/retention_until), ihre
 *    Seiten werden mit `tombstone_reason: "case_archived"` ausgeblendet. Beides
 *    liegt NICHT im Papierkorb und wird nie automatisch gelöscht — es läuft
 *    die Aufbewahrungsfrist (src/lib/case-retention.ts).
 *  - Löschen einer (nicht abgeschlossenen) Akte: `status: "tombstoned"`,
 *    ihre Seiten mit `tombstone_reason: "case_deleted"` — beides im Papierkorb.
 *  - every other page becomes `status: "tombstoned"` (+ tombstoned_at …).
 */
/**
 * Page types that belong to a matter (`case_slug`) and follow it: archived
 * with it (retained), deleted with it (Papierkorb), restored with it. Invoices
 * (§ 132 BAO, Storno only), KYC records (own retention) and document versions
 * (purged with their document) have their own rules and are not listed.
 */
export const CASE_DEPENDENT_TYPES = [
  "document",
  "legal_deadline",
  "deadline",
  "legal_note",
  "legal_phone_note",
  "note",
  "time_entry",
  "expense",
  "task",
  "chat_session",
  "document_request",
  "shared_item",
  "calendar_event",
] as const;

/** Every type the Papierkorb lists — the matter types plus their dependents. */
export const TRASH_TYPES = [
  "legal_case",
  ...CASE_DEPENDENT_TYPES,
  "intake_request",
  "legal_contact",
  "invoice",
] as const;

export interface TrashItem {
  slug: string;
  title: string;
  type: string;
  /** "case" = deleted matter (restores its pages), "item" = tombstoned page. */
  kind: "case" | "item";
  deleted_at?: string;
  deleted_by?: string;
  case_slug?: string;
  /** "manual_delete" | "case_deleted" | "retention_expired" … */
  reason?: string;
  legal_hold?: boolean;
  /** Matters only: retention state at listing time (a running period blocks the purge). */
  retention?: CaseRetentionState;
}

interface TrashSourcePage {
  slug: string;
  title?: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

/**
 * A page as a Papierkorb entry — or null when it is not in the trash. Archived
 * matters and the pages archived with them (`tombstone_reason:
 * "case_archived"`) are retained records, not trash: they never show up here
 * and never expire.
 */
export function toTrashItem(page: TrashSourcePage, now: Date = new Date()): TrashItem | null {
  const fm = page.frontmatter ?? {};
  if (!isTombstoned(page)) return null;
  if (fm.tombstone_reason === "case_archived") return null;
  const type = page.type ?? String(fm.type ?? "document");
  const isCase = type === "legal_case";
  return {
    slug: page.slug,
    title: page.title || page.slug,
    type,
    kind: isCase ? "case" : "item",
    deleted_at: fm.tombstoned_at as string | undefined,
    deleted_by: fm.tombstoned_by as string | undefined,
    case_slug: fm.case_slug as string | undefined,
    reason: fm.tombstone_reason as string | undefined,
    legal_hold: fm.legal_hold === true,
    ...(isCase ? { retention: caseRetentionState(fm, now) } : {}),
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

/**
 * Some web delete paths mark a non-matter record `status: "tombstoned"` via a
 * merge-update instead of calling the engine's `DELETE /api/pages/{slug}`
 * (soft-delete via `deleted_at`). The engine does not filter tombstones: they
 * still come back from `list_pages` and count against its row cap, so lists,
 * reminders and digests must leave such records out themselves.
 */
export function isTombstoned(
  page: { frontmatter?: Record<string, unknown> } | null | undefined
): boolean {
  return page?.frontmatter?.status === "tombstoned";
}

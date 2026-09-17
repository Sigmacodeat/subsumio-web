/**
 * Deleting a non-matter record marks it `status: "tombstoned"` (the engine has
 * no delete). Lists, reminders and digests must leave such records out.
 */
export function isTombstoned(
  page: { frontmatter?: Record<string, unknown> } | null | undefined
): boolean {
  return page?.frontmatter?.status === "tombstoned";
}

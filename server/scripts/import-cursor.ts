/**
 * Pure helper for batch-import-from-disk.ts's resume cursor, split out so it
 * is importable (and testable) without pulling in the CLI's top-level
 * arg-parsing, which exits the process when --source/--disk-dir are absent.
 */

/**
 * Whether a file needs (re-)importing: unseen slugs always do; a
 * previously-imported slug does too, but only if its source file's mtime no
 * longer matches what got recorded at last import.
 *
 * `alreadyImported` presence alone used to be the whole story: once a slug
 * was in it, every later pipeline run skipped that file forever, even after
 * normalize-corpus.ts or a RIS metadata sync rewrote it with corrected
 * frontmatter. Found 2026-09-21 via 960 law-at-landesrecht pages stuck on a
 * pre-canonical-schema frontmatter (`nor_id` instead of `doc_id`) for days
 * despite the fixed file sitting right next to them on disk. Gating on mtime
 * instead means a rewritten file is picked up again automatically; an
 * untouched file still costs nothing (same mtime, still skipped) — and
 * importFromContent's own content_hash check still guards against wasted
 * re-chunk/re-embed work when the rewrite didn't actually change anything.
 */
export function needsImport(
  slug: string,
  fileMtimeMs: number,
  alreadyImported: Set<string>,
  mtimeAt: Record<string, number>
): boolean {
  if (!alreadyImported.has(slug)) return true;
  const knownMtime = mtimeAt[slug];
  return knownMtime === undefined || knownMtime !== fileMtimeMs;
}

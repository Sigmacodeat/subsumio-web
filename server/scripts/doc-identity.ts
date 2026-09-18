/**
 * One legal document = one active page, whatever file name it arrives under.
 *
 * Several generations of fetchers and the normalizer named the same RIS
 * document differently ("g309-2126636-1", "2016-12-27-g309-2126636-1",
 * "ecli-at-bvwg-…"), and the importer derived the page slug from the file
 * name. Every new naming scheme therefore created a second page for the same
 * decision. Importers now look up the RIS document number first and update
 * the page that already carries it.
 */

import { dokumentnummerOf } from "./judikatur-file";

/** The RIS document number of a corpus file: frontmatter doc_id, else from source_url. */
export function docIdFromContent(content: string): string | null {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!fm) return null;
  const docId = fm.match(/^doc_id:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  if (docId && docId !== "null") return docId;
  const url = fm.match(/^source_url:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
  return url ? dokumentnummerOf(url) : null;
}

interface RawExecutor {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** doc id → slug of the active page that carries it, for one source. */
export async function loadActiveDocSlugs(
  engine: RawExecutor,
  sourceId: string
): Promise<Map<string, string>> {
  const rows = (await engine.executeRaw(
    `SELECT slug, frontmatter->>'doc_id' AS doc_id, frontmatter->>'source_url' AS source_url
       FROM pages
      WHERE source_id = $1 AND deleted_at IS NULL
      ORDER BY id`,
    [sourceId]
  )) as Array<{ slug: string; doc_id: string | null; source_url: string | null }>;
  const map = new Map<string, string>();
  for (const r of rows) {
    const id =
      r.doc_id && r.doc_id !== "null"
        ? r.doc_id
        : r.source_url
          ? dokumentnummerOf(r.source_url)
          : null;
    if (id && !map.has(id)) map.set(id, r.slug);
  }
  return map;
}

/** The slug to write: the existing page's slug when the document is known. */
export function resolveSlug(
  known: Map<string, string>,
  docId: string | null,
  defaultSlug: string
): string {
  return (docId && known.get(docId)) || defaultSlug;
}

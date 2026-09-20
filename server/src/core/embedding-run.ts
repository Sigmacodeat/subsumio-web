/**
 * What a chunk looks like on its way to the embedding model, and which
 * chunks are worth sending at all.
 *
 * Both the ongoing top-up run (`scripts/auto-embed-pg.ts`) and a run that
 * fills a second column for a model switch (`scripts/embed-into-column.ts`)
 * must build the identical string for a given chunk. If they drift, the
 * vectors in the two columns describe subtly different texts, and the
 * difference only shows up as worse answers long after the money is spent.
 * So the rule and the wrapping live here once.
 */

import {
  buildContextualPrefix,
  buildLegalContextualPrefix,
  isCourtDecisionPage,
  isLegalPage,
  sanitizeTitle,
  wrapChunkForEmbedding,
} from "./embedding-context.ts";

/**
 * Chunks too short to carry a legal statement. Measured on 2026-09-20:
 * 47,941 live chunks fall under this, almost all of them list artefacts —
 * "Kein RS", "vgl", or a bare citation header ("TE OGH 1986-06-17 10 Os
 * 38/86"). Embedded they cost money and come back as noise on unrelated
 * questions.
 */
export const MIN_EMBED_CHARS = 80;

/** The same rule as SQL, for the candidate queries. `alias` is the chunk table's. */
export function noiseFilterSql(alias = "c"): string {
  return `length(btrim(${alias}.chunk_text)) >= ${MIN_EMBED_CHARS}`;
}

/** pgvector wants "[1,2,3]", not JSON. */
export function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

export interface PendingChunk {
  id: number;
  chunk_text: string;
  chunk_source: string | null;
  page_id: number;
}

interface MinimalEngine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
}

interface PageRow {
  id: number;
  title: string | null;
  type: string | null;
  frontmatter: Record<string, unknown> | null;
}

/**
 * The context line a page contributes to each of its chunks — the string
 * that turns "§ 1295" into "AT ABGB § 1295". The legal test is the one the
 * prefix builder expects; anything looser sends statutes through the
 * generic builder and loses the law's name.
 */
export function pagePrefix(page: Pick<PageRow, "title" | "type" | "frontmatter">): string | null {
  const fm = page.frontmatter ?? {};
  const safeTitle = sanitizeTitle(page.title ?? "");
  const legal =
    isLegalPage(fm) ||
    isCourtDecisionPage(fm) ||
    ["law", "statute", "court_decision", "judgement"].includes(page.type ?? "");
  return legal
    ? buildLegalContextualPrefix(safeTitle, fm, null)
    : buildContextualPrefix(safeTitle, null);
}

/** Every chunk of the batch, wrapped in its page's context, ready to embed. */
export async function wrapWithPageContext(
  engine: MinimalEngine,
  chunks: PendingChunk[]
): Promise<string[]> {
  const pageIds = [...new Set(chunks.map((c) => c.page_id))];
  const rows = (await engine.executeRaw(
    `SELECT id, title, type, frontmatter FROM pages WHERE id = ANY($1::int[])`,
    [pageIds]
  )) as PageRow[];

  const prefixByPage = new Map<number, string | null>();
  for (const p of rows) prefixByPage.set(p.id, pagePrefix(p));

  return chunks.map((c) =>
    wrapChunkForEmbedding(c.chunk_text, prefixByPage.get(c.page_id) ?? null, c.chunk_source)
  );
}

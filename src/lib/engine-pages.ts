import { ENGINE_URL } from "@/lib/engine";
import { isTombstoned } from "@/lib/tombstone";

/**
 * The engine clamps every page listing to this many rows per request
 * (clampSearchLimit in server/src/core/operations.ts, list_pages — and the
 * /api/pages route applies the same cap). Requesting more silently yields 100.
 */
export const ENGINE_LIST_MAX = 100;

export interface ListedPage {
  slug: string;
  title: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
  updated_at?: string;
  created_at?: string;
  /** Always empty in listings — the engine sends bodies only for single-page reads. */
  content?: string;
}

/**
 * Up to `limit` pages of a type, most recently updated first. Pages through
 * the engine's keyset cursor (`x-next-cursor`), which is computed on the
 * pre-filter SQL window — so rows hidden by matter scope, ACLs or tombstones
 * no longer look like "end of list" (they used to abort offset loops early
 * and silently drop the rest). Falls back to offset paging for engines that
 * do not send the header. Deleted (tombstoned) pages are left out unless
 * asked for. Returns what was read so far when a batch fails.
 */
export async function listEnginePages(
  headers: Record<string, string>,
  /** Page type; pass "" to list across types (e.g. slug_prefix scans). */
  type: string,
  limit: number,
  opts: {
    includeTombstoned?: boolean;
    timeoutMs?: number;
    slugPrefix?: string;
    /** Throw when a batch fails instead of returning what was read so far —
     *  for callers that must not mistake a failed read for "nothing there". */
    strict?: boolean;
  } = {}
): Promise<ListedPage[]> {
  const typeParam = type ? `type=${encodeURIComponent(type)}&` : "";
  const prefix = opts.slugPrefix ? `&slug_prefix=${encodeURIComponent(opts.slugPrefix)}` : "";
  const out = new Map<string, ListedPage>();
  let fetched = 0;
  let cursor: string | undefined;
  // A batch may come back empty when every scanned row was filtered
  // (matter scope / ACL / tombstones) — `fetched` then stays put, so bound
  // the loop by iterations, not only by the fetched budget.
  let iterations = 0;
  const MAX_ITERATIONS = 1000;
  try {
    for (;;) {
      if (++iterations > MAX_ITERATIONS) break;
      const size = Math.min(ENGINE_LIST_MAX, limit - fetched);
      if (size <= 0) break;
      const pageParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : `&offset=${fetched}`;
      const res = await fetch(
        `${ENGINE_URL}/api/pages?${typeParam}limit=${size}${pageParam}${prefix}`,
        { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) }
      );
      if (!res.ok) {
        if (opts.strict) throw new Error(`list ${type} failed: HTTP ${res.status}`);
        break;
      }
      const raw = (await res.json()) as unknown;
      const batch = (
        Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { pages?: unknown[] })?.pages)
            ? (raw as { pages: unknown[] }).pages
            : []
      ) as ListedPage[];
      fetched += batch.length;
      for (const page of batch) if (page?.slug) out.set(page.slug, page);
      const next = res.headers.get("x-next-cursor");
      if (next && next !== cursor) {
        // Cursor advances past every scanned row, filtered or not — an empty
        // batch here just means "everything in this window was filtered".
        cursor = next;
        continue;
      }
      if (next === cursor) break; // defensive: engine repeated a cursor
      // No cursor metadata: fall back to the classic "full batch means more"
      // offset heuristic for engines that predate the header.
      if (batch.length < size) break;
    }
  } catch (err) {
    if (opts.strict) throw err;
    // keep what was read
  }
  const pages = [...out.values()];
  return opts.includeTombstoned ? pages : pages.filter((p) => !isTombstoned(p));
}

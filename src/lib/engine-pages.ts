import { ENGINE_URL } from "@/lib/engine";
import { isTombstoned } from "@/lib/tombstone";

/** The engine returns at most this many pages per list request. */
export const ENGINE_LIST_MAX = 200;

export interface ListedPage {
  slug: string;
  title: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
  updated_at?: string;
  created_at?: string;
}

/**
 * Up to `limit` pages of a type, most recently updated first, read in batches of
 * 200 (a single larger request silently returns 200). Deleted (tombstoned) pages
 * are left out unless asked for. Returns what was read so far when a batch fails.
 */
export async function listEnginePages(
  headers: Record<string, string>,
  type: string,
  limit: number,
  opts: { includeTombstoned?: boolean; timeoutMs?: number } = {}
): Promise<ListedPage[]> {
  const out = new Map<string, ListedPage>();
  try {
    for (let offset = 0; offset < limit; offset += ENGINE_LIST_MAX) {
      const size = Math.min(ENGINE_LIST_MAX, limit - offset);
      const res = await fetch(
        `${ENGINE_URL}/api/pages?type=${encodeURIComponent(type)}&limit=${size}&offset=${offset}`,
        { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) }
      );
      if (!res.ok) break;
      const raw = (await res.json()) as unknown;
      const batch = (
        Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { pages?: unknown[] })?.pages)
            ? (raw as { pages: unknown[] }).pages
            : []
      ) as ListedPage[];
      for (const page of batch) if (page?.slug) out.set(page.slug, page);
      if (batch.length < size) break;
    }
  } catch {
    // keep what was read
  }
  const pages = [...out.values()];
  return opts.includeTombstoned ? pages : pages.filter((p) => !isTombstoned(p));
}

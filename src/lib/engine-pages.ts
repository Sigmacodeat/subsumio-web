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

export interface ListEnginePagesOpts {
  includeTombstoned?: boolean;
  timeoutMs?: number;
  slugPrefix?: string;
  /** Throw when a batch fails instead of returning what was read so far —
   *  for callers that must not mistake a failed read for "nothing there". */
  strict?: boolean;
  /**
   * Throw EnginePagesTruncatedError when `limit` is reached while the engine
   * still has more rows — for decisions that must see the complete set
   * (money guards, deadlines). Without it, check `truncated` on the
   * detailed result.
   */
  failOnTruncate?: boolean;
  /**
   * Frontmatter equality filter applied by the engine in SQL (`fm.<key>`),
   * any pair matches — e.g. `{ case_slug }` for one matter's pages or
   * `{ invoice_number }` for one invoice, instead of reading the whole type.
   * Keys: snake_case identifiers, at most 5.
   */
  frontmatter?: Record<string, string>;
}

export interface ListEnginePagesResult {
  pages: ListedPage[];
  /** `limit` was reached while the engine still reported more rows. */
  truncated: boolean;
  /** A batch failed (non-strict mode) — `pages` is what was read before. */
  failed: boolean;
}

/** The listing hit its limit while more rows existed. */
export class EnginePagesTruncatedError extends Error {
  constructor(
    public readonly type: string,
    public readonly limit: number
  ) {
    super(`list ${type || "*"} truncated at ${limit}`);
    this.name = "EnginePagesTruncatedError";
  }
}

/**
 * Up to `limit` pages of a type, most recently updated first. Pages through
 * the engine's keyset cursor (`x-next-cursor`), which is computed on the
 * pre-filter SQL window — so rows hidden by matter scope, ACLs or tombstones
 * no longer look like "end of list" (they used to abort offset loops early
 * and silently drop the rest). Falls back to offset paging for engines that
 * do not send the header. Deleted (tombstoned) pages are left out unless
 * asked for. Returns what was read so far when a batch fails; the result
 * says whether it is complete (`truncated` / `failed`).
 */
export async function listEnginePagesDetailed(
  headers: Record<string, string>,
  /** Page type; pass "" to list across types (e.g. slug_prefix scans). */
  type: string,
  limit: number,
  opts: ListEnginePagesOpts = {}
): Promise<ListEnginePagesResult> {
  const typeParam = type ? `type=${encodeURIComponent(type)}&` : "";
  const prefix = opts.slugPrefix ? `&slug_prefix=${encodeURIComponent(opts.slugPrefix)}` : "";
  const fm = Object.entries(opts.frontmatter ?? {})
    .map(([k, v]) => `&fm.${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("");
  const out = new Map<string, ListedPage>();
  let fetched = 0;
  let cursor: string | undefined;
  // Whether the engine indicated rows beyond what was read so far.
  let more = false;
  let failed = false;
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
        `${ENGINE_URL}/api/pages?${typeParam}limit=${size}${pageParam}${prefix}${fm}`,
        { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) }
      );
      if (!res.ok) {
        if (opts.strict) throw new Error(`list ${type} failed: HTTP ${res.status}`);
        failed = true;
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
        more = true;
        continue;
      }
      more = false;
      if (next === cursor) break; // defensive: engine repeated a cursor
      // No cursor metadata: fall back to the classic "full batch means more"
      // offset heuristic for engines that predate the header.
      if (batch.length < size) break;
      more = true;
    }
  } catch (err) {
    if (opts.strict) throw err;
    failed = true;
    // keep what was read
  }
  const truncated = !failed && more;
  if (truncated && opts.failOnTruncate) throw new EnginePagesTruncatedError(type, limit);
  const pages = [...out.values()];
  return {
    pages: opts.includeTombstoned ? pages : pages.filter((p) => !isTombstoned(p)),
    truncated,
    failed,
  };
}

/** Pages only — see listEnginePagesDetailed for completeness flags. */
export async function listEnginePages(
  headers: Record<string, string>,
  /** Page type; pass "" to list across types (e.g. slug_prefix scans). */
  type: string,
  limit: number,
  opts: ListEnginePagesOpts = {}
): Promise<ListedPage[]> {
  return (await listEnginePagesDetailed(headers, type, limit, opts)).pages;
}

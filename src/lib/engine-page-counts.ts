import { ENGINE_URL } from "@/lib/engine";

/**
 * Pages per type and status, counted by the engine in one query
 * (`GET /api/page-status-counts`) instead of listing every page. The engine
 * applies the caller's source, document ACL and matter access; deleted and
 * tombstoned pages are never counted.
 */

export interface PageStatusCount {
  type: string;
  /** Lower-cased status value ("" when the page has none). */
  status: string;
  count: number;
  /** Pages of this group dated on or before `dateBefore`. */
  before_count: number;
}

export interface PageStatusCounts {
  counts: PageStatusCount[];
  /** false: the engine could not count every page — the numbers are a lower bound. */
  complete: boolean;
}

export interface PageStatusCountQuery {
  types: string[];
  statusField?: string;
  dateFields?: string[];
  /** "YYYY-MM-DD" — also count the pages dated on or before this day. */
  dateBefore?: string;
}

/** Throws when the engine does not answer with counts (callers mark degraded). */
export async function fetchPageStatusCounts(
  headers: Record<string, string>,
  query: PageStatusCountQuery,
  opts: { timeoutMs?: number } = {}
): Promise<PageStatusCounts> {
  const params = new URLSearchParams({ types: query.types.join(",") });
  if (query.statusField) params.set("status_field", query.statusField);
  if (query.dateFields && query.dateFields.length > 0) {
    params.set("date_fields", query.dateFields.join(","));
  }
  if (query.dateBefore) params.set("date_before", query.dateBefore);
  const res = await fetch(`${ENGINE_URL}/api/page-status-counts?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
  });
  if (!res.ok) throw new Error(`page_status_counts_${res.status}`);
  const body = (await res.json()) as Partial<PageStatusCounts>;
  if (!Array.isArray(body.counts)) throw new Error("page_status_counts_malformed");
  return {
    counts: body.counts.map((c) => ({
      type: String(c.type ?? ""),
      status: String(c.status ?? "").toLowerCase(),
      count: Number(c.count) || 0,
      before_count: Number(c.before_count) || 0,
    })),
    complete: body.complete === true,
  };
}

/** Sum of `count` (or `before_count`) over the groups a predicate keeps. */
export function sumCounts(
  counts: PageStatusCount[],
  keep: (c: PageStatusCount) => boolean,
  field: "count" | "before_count" = "count"
): number {
  return counts.reduce((n, c) => (keep(c) ? n + c[field] : n), 0);
}

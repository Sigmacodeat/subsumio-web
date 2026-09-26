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
  /** Distinct pages of this group (differs from `count` only with `arrayField`). */
  page_count: number;
  /** Lower-cased value per `groupFields` entry ("" when absent). */
  fields: Record<string, string>;
  /** Filled or not per `presentFields` entry. */
  present: Record<string, boolean>;
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
  /** false: undated pages are never "before" (no creation-day fallback). */
  dateFallback?: boolean;
  /** Further frontmatter fields to group by (max 5). */
  groupFields?: string[];
  /** Frontmatter fields grouped by whether they are filled (max 3). */
  presentFields?: string[];
  /**
   * Count the object elements of this frontmatter array instead of pages;
   * group, presence and date fields are then read from the element, the
   * status field from the page.
   */
  arrayField?: string;
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
  if (query.dateFallback === false) params.set("date_fallback", "0");
  if (query.groupFields && query.groupFields.length > 0) {
    params.set("group_fields", query.groupFields.join(","));
  }
  if (query.presentFields && query.presentFields.length > 0) {
    params.set("present_fields", query.presentFields.join(","));
  }
  if (query.arrayField) params.set("array_field", query.arrayField);
  const res = await fetch(`${ENGINE_URL}/api/page-status-counts?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
  });
  if (!res.ok) throw new Error(`page_status_counts_${res.status}`);
  const body = (await res.json()) as Partial<PageStatusCounts>;
  if (!Array.isArray(body.counts)) throw new Error("page_status_counts_malformed");
  // An engine that ignores the extra keys would answer ungrouped numbers —
  // read as "every page matches"; fail instead (callers mark degraded).
  const wantsFields = (query.groupFields ?? []).length > 0;
  const wantsPresent = (query.presentFields ?? []).length > 0;
  for (const c of body.counts) {
    if (
      (wantsFields && (typeof c.fields !== "object" || c.fields === null)) ||
      (wantsPresent && (typeof c.present !== "object" || c.present === null)) ||
      (query.arrayField && c.page_count === undefined)
    ) {
      throw new Error("page_status_counts_unsupported");
    }
  }
  return {
    counts: body.counts.map((c) => {
      const count = Number(c.count) || 0;
      const fields: Record<string, string> = {};
      for (const f of query.groupFields ?? []) {
        fields[f] = String(c.fields?.[f] ?? "").toLowerCase();
      }
      const present: Record<string, boolean> = {};
      for (const f of query.presentFields ?? []) present[f] = c.present?.[f] === true;
      return {
        type: String(c.type ?? ""),
        status: String(c.status ?? "").toLowerCase(),
        count,
        before_count: Number(c.before_count) || 0,
        page_count: c.page_count === undefined ? count : Number(c.page_count) || 0,
        fields,
        present,
      };
    }),
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

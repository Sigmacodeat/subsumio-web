/**
 * Counting pages per type and status (a frontmatter field) in SQL, for
 * dashboard badges: one query instead of listing every page of a type.
 *
 * Scope: the caller's sources, the document ACL (see acl.ts: "all"/undefined
 * = no filter, [] = open pages only, a list = open pages or pages of those
 * groups) and — in the operation — the matter scope. Deleted and tombstoned
 * pages are never counted.
 *
 * Optionally each group also counts the pages whose date (the first
 * non-empty of `dateFields`, else — unless `dateFallback` is false — the
 * creation day) is on or before `dateBefore` (YYYY-MM-DD) — e.g. deadlines
 * due within the next days.
 *
 * Besides the status field, a count may group by further frontmatter fields
 * (`groupFields`, lower-cased value) and by whether fields are filled
 * (`presentFields`), so a badge can apply a filter over several fields to
 * the grouped numbers. With `arrayField` the count runs over the object
 * elements of that frontmatter array (e.g. the suggested deadlines of a
 * matter): the status field stays the page's, group/presence/date fields
 * are read from the element, and `page_count` is the number of distinct
 * pages per group.
 */

/** Frontmatter keys a count may group or filter by. */
export const STATUS_FIELD_RE = /^[a-z_][a-z0-9_]{0,63}$/;
/** Page types a count may name. */
export const COUNT_TYPE_RE = /^[a-z][a-z0-9_-]{0,63}$/;
export const COUNT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COUNT_MAX_TYPES = 10;
export const COUNT_MAX_DATE_FIELDS = 3;
export const COUNT_MAX_GROUP_FIELDS = 5;
export const COUNT_MAX_PRESENT_FIELDS = 3;

export interface PageStatusCountOpts {
  types: string[];
  /** Frontmatter field to group by (default "status"). */
  statusField?: string;
  dateFields?: string[];
  dateBefore?: string;
  /** false: pages without a date are never "before" (no creation-day fallback). */
  dateFallback?: boolean;
  /** Further frontmatter fields to group by (lower-cased value). */
  groupFields?: string[];
  /** Frontmatter fields grouped by whether they are filled. */
  presentFields?: string[];
  /** Count the object elements of this frontmatter array instead of pages. */
  arrayField?: string;
  sourceId?: string;
  sourceIds?: string[];
  aclGroups?: string[] | "all";
}

export interface PageStatusCount {
  type: string;
  /** Lower-cased value of the status field ("" when absent). */
  status: string;
  count: number;
  /** Pages of this group dated on or before `dateBefore` (0 without it). */
  before_count: number;
  /** Distinct pages of this group (= count unless `arrayField` is set). */
  page_count: number;
  /** Lower-cased value per `groupFields` entry ("" when absent). */
  fields?: Record<string, string>;
  /** Filled or not per `presentFields` entry. */
  present?: Record<string, boolean>;
}

export interface CountSql {
  sql: string;
  params: unknown[];
}

/** Validates the options; returns an error code or null. */
export function validateCountOpts(opts: PageStatusCountOpts): string | null {
  if (!Array.isArray(opts.types) || opts.types.length === 0) return "types_required";
  if (opts.types.length > COUNT_MAX_TYPES) return "too_many_types";
  if (!opts.types.every((t) => typeof t === "string" && COUNT_TYPE_RE.test(t))) {
    return "invalid_type";
  }
  if (opts.statusField !== undefined && !STATUS_FIELD_RE.test(opts.statusField)) {
    return "invalid_status_field";
  }
  const dateFields = opts.dateFields ?? [];
  if (dateFields.length > COUNT_MAX_DATE_FIELDS) return "too_many_date_fields";
  if (!dateFields.every((f) => typeof f === "string" && STATUS_FIELD_RE.test(f))) {
    return "invalid_date_field";
  }
  if (opts.dateBefore !== undefined && !COUNT_DATE_RE.test(opts.dateBefore)) {
    return "invalid_date_before";
  }
  const groupFields = opts.groupFields ?? [];
  if (groupFields.length > COUNT_MAX_GROUP_FIELDS) return "too_many_group_fields";
  if (!groupFields.every((f) => typeof f === "string" && STATUS_FIELD_RE.test(f))) {
    return "invalid_group_field";
  }
  const presentFields = opts.presentFields ?? [];
  if (presentFields.length > COUNT_MAX_PRESENT_FIELDS) return "too_many_present_fields";
  if (!presentFields.every((f) => typeof f === "string" && STATUS_FIELD_RE.test(f))) {
    return "invalid_present_field";
  }
  if (opts.arrayField !== undefined && !STATUS_FIELD_RE.test(opts.arrayField)) {
    return "invalid_array_field";
  }
  return null;
}

/**
 * The shared FROM/WHERE and select expressions (plain SQL, identical on
 * Postgres and PGLite). Field names travel as parameters, never as SQL text.
 */
function baseParts(opts: PageStatusCountOpts): {
  from: string;
  where: string;
  statusExpr: string;
  /** Extra key columns: `g<i>` (group values), `p<i>` (presence). */
  keySelect: string;
  keyCount: number;
  dateExpr: string | null;
  params: unknown[];
} {
  const params: unknown[] = [opts.types, opts.statusField ?? "status"];
  const statusExpr = `lower(COALESCE(p.frontmatter->>$2, ''))`;
  const where: string[] = [
    `p.deleted_at IS NULL`,
    `p.type = ANY($1::text[])`,
    `COALESCE(p.frontmatter->>'status', '') <> 'tombstoned'`,
  ];
  let from = `pages p`;
  // Group, presence and date fields: the array element in array mode, else the page.
  let src = `p.frontmatter`;
  if (opts.arrayField !== undefined) {
    params.push(opts.arrayField);
    const arr = `p.frontmatter->$${params.length}`;
    from = `pages p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(${arr}) = 'array' THEN ${arr} ELSE '[]'::jsonb END) AS e(value)`;
    where.push(`jsonb_typeof(e.value) = 'object'`);
    src = `e.value`;
  }
  const keys: string[] = [];
  (opts.groupFields ?? []).forEach((f, i) => {
    params.push(f);
    keys.push(`lower(COALESCE(${src}->>$${params.length}, '')) AS g${i}`);
  });
  (opts.presentFields ?? []).forEach((f, i) => {
    params.push(f);
    keys.push(`(COALESCE(${src}->>$${params.length}, '') <> '') AS p${i}`);
  });
  const sources =
    opts.sourceIds && opts.sourceIds.length > 0
      ? opts.sourceIds
      : opts.sourceId
        ? [opts.sourceId]
        : null;
  if (sources) {
    params.push(sources);
    where.push(`p.source_id = ANY($${params.length}::text[])`);
  }
  const acl = opts.aclGroups;
  if (Array.isArray(acl)) {
    const open = `NOT EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = p.id)`;
    if (acl.length === 0) {
      where.push(open);
    } else {
      params.push(acl);
      where.push(
        `(${open} OR EXISTS (SELECT 1 FROM page_permissions pp WHERE pp.page_id = p.id AND pp.group_id = ANY($${params.length}::uuid[])))`
      );
    }
  }
  let dateExpr: string | null = null;
  if (opts.dateBefore !== undefined) {
    const parts = (opts.dateFields ?? []).map((f) => {
      params.push(f);
      return `NULLIF(left(${src}->>$${params.length}, 10), '')`;
    });
    if (opts.dateFallback !== false) {
      parts.push(`to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
    }
    dateExpr = parts.length > 0 ? `COALESCE(${parts.join(", ")})` : `NULL::text`;
  }
  return {
    from,
    where: where.join(" AND "),
    statusExpr,
    keySelect: keys.map((k) => `, ${k}`).join(""),
    keyCount: keys.length,
    dateExpr,
    params,
  };
}

/** Grouped counts in SQL (callers without a matter restriction). */
export function buildCountByStatusSql(opts: PageStatusCountOpts): CountSql {
  const { from, where, statusExpr, keySelect, keyCount, dateExpr, params } = baseParts(opts);
  let beforeExpr = `0`;
  if (dateExpr) {
    params.push(opts.dateBefore);
    beforeExpr = `COUNT(*) FILTER (WHERE ${dateExpr} <= $${params.length})`;
  }
  const groupBy = Array.from({ length: 2 + keyCount }, (_, i) => i + 1).join(", ");
  return {
    sql: `SELECT p.type AS type, ${statusExpr} AS status${keySelect},
                 COUNT(*)::int AS count, (${beforeExpr})::int AS before_count,
                 COUNT(DISTINCT p.id)::int AS page_count
            FROM ${from}
           WHERE ${where}
           GROUP BY ${groupBy}
           ORDER BY ${groupBy}`,
    params,
  };
}

/**
 * One small row per page (per array element in array mode; binding fields
 * only) for callers with a matter restriction: the matter filter resolves
 * each page's bindings, then the rows are aggregated in code. At most `cap`
 * rows (+1 to detect more).
 */
export function buildCountRowsSql(
  opts: PageStatusCountOpts,
  bindingSelect: string,
  cap: number
): CountSql {
  const { from, where, statusExpr, keySelect, dateExpr, params } = baseParts(opts);
  let beforeExpr = `false`;
  if (dateExpr) {
    params.push(opts.dateBefore);
    beforeExpr = `COALESCE(${dateExpr} <= $${params.length}, false)`;
  }
  params.push(cap + 1);
  return {
    sql: `SELECT p.id AS page_id, p.slug, p.source_id, p.type,
                 ${bindingSelect} AS frontmatter,
                 ${statusExpr} AS status${keySelect}, ${beforeExpr} AS before
            FROM ${from}
           WHERE ${where}
           LIMIT $${params.length}`,
    params,
  };
}

function isTrue(v: unknown): boolean {
  return v === true || v === "t" || v === "true";
}

/** The `fields` / `present` maps of one row (omitted when not requested). */
function rowKeys(
  r: Record<string, unknown>,
  opts: Pick<PageStatusCountOpts, "groupFields" | "presentFields">
): Pick<PageStatusCount, "fields" | "present"> {
  const out: Pick<PageStatusCount, "fields" | "present"> = {};
  const groupFields = opts.groupFields ?? [];
  const presentFields = opts.presentFields ?? [];
  if (groupFields.length > 0) {
    out.fields = Object.fromEntries(groupFields.map((f, i) => [f, String(r[`g${i}`] ?? "")]));
  }
  if (presentFields.length > 0) {
    out.present = Object.fromEntries(presentFields.map((f, i) => [f, isTrue(r[`p${i}`])]));
  }
  return out;
}

export function normalizeCountRows(
  rows: Array<Record<string, unknown>>,
  opts: Pick<PageStatusCountOpts, "groupFields" | "presentFields"> = {}
): PageStatusCount[] {
  return rows.map((r) => ({
    type: String(r.type ?? ""),
    status: String(r.status ?? ""),
    count: Number(r.count ?? 0),
    before_count: Number(r.before_count ?? 0),
    page_count: Number(r.page_count ?? r.count ?? 0),
    ...rowKeys(r, opts),
  }));
}

/** Aggregate per-page (per-element) rows into grouped counts (sorted like the SQL). */
export function aggregateCountRows(
  rows: Array<Record<string, unknown>>,
  opts: Pick<PageStatusCountOpts, "groupFields" | "presentFields"> = {}
): PageStatusCount[] {
  const groups = new Map<string, { g: PageStatusCount; pages: Set<string> }>();
  for (const r of rows) {
    const type = String(r.type ?? "");
    const status = String(r.status ?? "");
    const keys = rowKeys(r, opts);
    const key = JSON.stringify([type, status, keys.fields ?? null, keys.present ?? null]);
    const entry = groups.get(key) ?? {
      g: { type, status, count: 0, before_count: 0, page_count: 0, ...keys },
      pages: new Set<string>(),
    };
    entry.g.count++;
    if (isTrue(r.before)) entry.g.before_count++;
    entry.pages.add(String(r.page_id ?? r.slug ?? entry.g.count));
    entry.g.page_count = entry.pages.size;
    groups.set(key, entry);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e.g);
}

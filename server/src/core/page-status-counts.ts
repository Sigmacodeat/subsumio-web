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
 * non-empty of `dateFields`, else the creation day) is on or before
 * `dateBefore` (YYYY-MM-DD) — e.g. deadlines due within the next days.
 */

/** Frontmatter keys a count may group or filter by. */
export const STATUS_FIELD_RE = /^[a-z_][a-z0-9_]{0,63}$/;
/** Page types a count may name. */
export const COUNT_TYPE_RE = /^[a-z][a-z0-9_-]{0,63}$/;
export const COUNT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COUNT_MAX_TYPES = 10;
export const COUNT_MAX_DATE_FIELDS = 3;

export interface PageStatusCountOpts {
  types: string[];
  /** Frontmatter field to group by (default "status"). */
  statusField?: string;
  dateFields?: string[];
  dateBefore?: string;
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
  return null;
}

/**
 * The shared WHERE clause and select expressions (plain SQL, identical on
 * Postgres and PGLite). Field names travel as parameters, never as SQL text.
 */
function baseParts(opts: PageStatusCountOpts): {
  where: string;
  statusExpr: string;
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
      return `NULLIF(left(p.frontmatter->>$${params.length}, 10), '')`;
    });
    parts.push(`to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
    dateExpr = `COALESCE(${parts.join(", ")})`;
  }
  return { where: where.join(" AND "), statusExpr, dateExpr, params };
}

/** Grouped counts in SQL (callers without a matter restriction). */
export function buildCountByStatusSql(opts: PageStatusCountOpts): CountSql {
  const { where, statusExpr, dateExpr, params } = baseParts(opts);
  let beforeExpr = `0`;
  if (dateExpr) {
    params.push(opts.dateBefore);
    beforeExpr = `COUNT(*) FILTER (WHERE ${dateExpr} <= $${params.length})`;
  }
  return {
    sql: `SELECT p.type AS type, ${statusExpr} AS status,
                 COUNT(*)::int AS count, (${beforeExpr})::int AS before_count
            FROM pages p
           WHERE ${where}
           GROUP BY 1, 2
           ORDER BY 1, 2`,
    params,
  };
}

/**
 * One small row per page (binding fields only) for callers with a matter
 * restriction: the matter filter resolves each page's bindings, then the
 * rows are aggregated in code. At most `cap` rows (+1 to detect more).
 */
export function buildCountRowsSql(
  opts: PageStatusCountOpts,
  bindingSelect: string,
  cap: number
): CountSql {
  const { where, statusExpr, dateExpr, params } = baseParts(opts);
  let beforeExpr = `false`;
  if (dateExpr) {
    params.push(opts.dateBefore);
    beforeExpr = `(${dateExpr} <= $${params.length})`;
  }
  params.push(cap + 1);
  return {
    sql: `SELECT p.id AS page_id, p.slug, p.source_id, p.type,
                 ${bindingSelect} AS frontmatter,
                 ${statusExpr} AS status, ${beforeExpr} AS before
            FROM pages p
           WHERE ${where}
           LIMIT $${params.length}`,
    params,
  };
}

export function normalizeCountRows(rows: Array<Record<string, unknown>>): PageStatusCount[] {
  return rows.map((r) => ({
    type: String(r.type ?? ""),
    status: String(r.status ?? ""),
    count: Number(r.count ?? 0),
    before_count: Number(r.before_count ?? 0),
  }));
}

/** Aggregate per-page rows into grouped counts (sorted like the SQL). */
export function aggregateCountRows(
  rows: Array<{ type?: unknown; status?: unknown; before?: unknown }>
): PageStatusCount[] {
  const groups = new Map<string, PageStatusCount>();
  for (const r of rows) {
    const type = String(r.type ?? "");
    const status = String(r.status ?? "");
    const key = `${type}\u0000${status}`;
    const g = groups.get(key) ?? { type, status, count: 0, before_count: 0 };
    g.count++;
    if (r.before === true || r.before === "t") g.before_count++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) =>
    a.type === b.type ? (a.status < b.status ? -1 : 1) : a.type < b.type ? -1 : 1
  );
}

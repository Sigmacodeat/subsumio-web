import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { SOURCE_LABELS, type IngestLogPage } from "@/lib/corpus-labels";

const log = logger("api/admin/corpus-ingest-log");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ACTIONS = new Set(["added", "updated", "removed", "rejected"]);

/**
 * GET /api/admin/corpus-ingest-log?source=&action=&day=YYYY-MM-DD&q=&limit=&offset=
 *
 * Which document entered or changed in the law corpus, when, from where
 * (table corpus_ingest_log). Each row carries the page's RIS link so the
 * operator can open the official document.
 */
export const GET = createHandler(
  { action: "platform.operator" },
  async (_ctx, _body, _query, req) => {
    const pool = getSharedPgPool();
    if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || null;
    const action = url.searchParams.get("action") || null;
    const day = url.searchParams.get("day") || null;
    const q = url.searchParams.get("q")?.trim() || null;
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
      200
    );
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
    if (action && !ACTIONS.has(action)) return apiError("invalid_action", "Unbekannte Aktion", 400);
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day))
      return apiError("invalid_day", "Tag als JJJJ-MM-TT", 400);

    const where: string[] = ["l.source_id LIKE 'law-at%'"];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      // Every "?" in one condition refers to the same parameter.
      where.push(sql.replaceAll("?", `$${params.length}`));
    };
    if (source) add("l.source_id = ?", source);
    if (action) add("l.action = ?", action);
    if (day) add("(l.occurred_at AT TIME ZONE 'Europe/Vienna')::date = ?::date", day);
    if (q) add("(l.title ILIKE ? OR l.doc_id ILIKE ? OR l.slug ILIKE ?)", `%${q}%`);
    const whereSql = where.join(" AND ");

    try {
      const [rows, total] = await Promise.all([
        pool.query(
          `SELECT l.id, l.occurred_at, l.source_id, l.doc_id, l.slug, l.title, l.action, l.origin,
                p.frontmatter->>'source_url' AS ris_url
         FROM corpus_ingest_log l
         LEFT JOIN pages p ON p.source_id = l.source_id AND p.slug = l.slug AND p.deleted_at IS NULL
         WHERE ${whereSql}
         ORDER BY l.occurred_at DESC, l.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
          params
        ),
        pool.query(`SELECT count(*)::int AS n FROM corpus_ingest_log l WHERE ${whereSql}`, params),
      ]);
      const page: IngestLogPage = {
        total: total.rows[0]?.n ?? 0,
        limit,
        offset,
        entries: rows.rows.map((r) => ({
          id: Number(r.id),
          occurredAt: new Date(r.occurred_at).toISOString(),
          sourceId: r.source_id,
          sourceLabel: SOURCE_LABELS[r.source_id] ?? r.source_id,
          docId: r.doc_id,
          slug: r.slug,
          title: r.title,
          action: r.action,
          origin: r.origin,
          risUrl: r.ris_url ?? null,
        })),
      };
      return apiSuccess(page);
    } catch (err) {
      log.error("[corpus-ingest-log] query failed:", (err as Error).message);
      return apiError("ingest_log_failed", "Protokoll konnte nicht geladen werden", 500);
    }
  }
);

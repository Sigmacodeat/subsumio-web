import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  source: z.string().min(1).max(100).default("all"),
  role: z.string().max(200).default("all"), // comma-separated
  q: z.string().max(200).default(""),
  sort: z.enum(["length_asc", "length_desc", "newest", "oldest", "role"]).default("newest"),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

interface ChunkRow {
  id: string;
  chunkIndex: number;
  chunkRole: string;
  chunkTextPreview: string;
  chunkLength: number;
  court: string | null;
  ecli: string | null;
  caseNumber: string | null;
  statuteAbbr: string | null;
  paragraphRef: string | null;
  embeddingStatus: "embedded" | "pending";
  pageSlug: string;
  pageTitle: string;
  sourceId: string;
}

const SORT_MAP: Record<string, [string, "ASC" | "DESC"]> = {
  length_asc: ["char_length(cc.chunk_text)", "ASC"],
  length_desc: ["char_length(cc.chunk_text)", "DESC"],
  newest: ["cc.created_at", "DESC"],
  oldest: ["cc.created_at", "ASC"],
  role: ["cc.chunk_role", "ASC"],
};

/**
 * GET /api/admin/chunk-inspector
 *
 * Paginierte Chunk-Liste mit Filter, Suche, Sortierung (server-side).
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
    cacheMaxAge: 15,
  },
  async (_ctx, _body, q) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }

    const { source, role, q: search, sort, page, pageSize } = q;
    const [sortCol, sortDir] = SORT_MAP[sort] ?? SORT_MAP.newest;

    // Build WHERE clauses
    const conditions: string[] = ["p.deleted_at IS NULL"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (source !== "all") {
      conditions.push(`p.source_id = $${paramIdx++}`);
      params.push(source);
    }

    if (role !== "all" && role.length > 0) {
      const roles = role
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      if (roles.length > 0) {
        const placeholders = roles.map((_, i) => `$${paramIdx + i}`).join(",");
        paramIdx += roles.length;
        conditions.push(`cc.chunk_role IN (${placeholders})`);
        params.push(...roles);
      }
    }

    if (search.length >= 2) {
      conditions.push(`cc.chunk_text ILIKE $${paramIdx++}`);
      // Escape LIKE-special chars: % _ \
      params.push(`%${search.replace(/[%_\\]/g, "\\$&")}%`);
    }

    const whereClause = conditions.join(" AND ");
    const offset = (page - 1) * pageSize;

    // Count total — separate from data query, uses simpler JOIN
    let countResult, idResult, textResult;
    try {
      countResult = await pool.query(
        `
      SELECT COUNT(*)::bigint AS total
      FROM content_chunks cc
      JOIN pages p ON cc.page_id = p.id
      WHERE ${whereClause}
    `,
        params
      );
      const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

      // Fetch page — two-stage query to avoid expensive LEFT() over all rows.
      // Stage 1: find chunk IDs + metadata (fast, no text extraction)
      const idQuery = `
      SELECT
        cc.id::text,
        cc.chunk_index,
        cc.chunk_role,
        cc.court,
        cc.ecli,
        cc.case_number,
        cc.statute_abbr,
        cc.paragraph_ref,
        (cc.embedding IS NOT NULL) AS is_embedded,
        p.slug AS page_slug,
        p.title AS page_title,
        p.source_id
      FROM content_chunks cc
      JOIN pages p ON cc.page_id = p.id
      WHERE ${whereClause}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
      const idParams = [...params, pageSize, offset];
      idResult = await pool.query(idQuery, idParams);

      if (idResult.rows.length === 0) {
        return apiSuccess([], { page, limit: pageSize, total });
      }

      // Stage 2: fetch text previews only for the page's chunk IDs
      const chunkIds = idResult.rows.map((r) => r.id);
      const placeholders = chunkIds.map((_, i) => `$${i + 1}`).join(",");
      textResult = await pool.query(
        `SELECT id::text, LEFT(chunk_text, 200) AS preview, length(chunk_text) AS full_length FROM content_chunks WHERE id IN (${placeholders})`,
        chunkIds
      );
    } catch (err) {
      console.error("[chunk-inspector] query failed:", (err as Error).message);
      return apiSuccess([], { page, limit: pageSize, total: 0 });
    }

    const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
    const textMap = new Map(
      textResult.rows.map((r) => [
        r.id,
        { preview: r.preview ?? "", length: parseInt(r.full_length ?? "0", 10) },
      ])
    );

    const chunks: ChunkRow[] = idResult.rows.map((r) => {
      const t = textMap.get(r.id) ?? { preview: "", length: 0 };
      return {
        id: r.id,
        chunkIndex: parseInt(r.chunk_index ?? "0", 10),
        chunkRole: r.chunk_role ?? "",
        chunkTextPreview: t.preview,
        chunkLength: t.length,
        court: r.court ?? null,
        ecli: r.ecli ?? null,
        caseNumber: r.case_number ?? null,
        statuteAbbr: r.statute_abbr ?? null,
        paragraphRef: r.paragraph_ref ?? null,
        embeddingStatus: r.is_embedded ? "embedded" : "pending",
        pageSlug: r.page_slug ?? "",
        pageTitle: r.page_title ?? "",
        sourceId: r.source_id ?? "",
      };
    });

    return apiSuccess(chunks, { page, limit: pageSize, total });
  }
);

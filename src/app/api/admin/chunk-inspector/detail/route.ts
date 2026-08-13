import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  id: z.string().min(1).max(100),
});

interface ChunkDetail {
  id: string;
  chunkIndex: number;
  chunkRole: string;
  chunkText: string;
  chunkLength: number;
  court: string | null;
  ecli: string | null;
  caseNumber: string | null;
  statuteAbbr: string | null;
  paragraphRef: string | null;
  documentType: string | null;
  legalArea: string | null;
  decisionDate: string | null;
  embeddingStatus: "embedded" | "pending";
  embeddedAt: string | null;
  model: string | null;
  tokenCount: number | null;
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  sourceId: string;
  chunkerVersion: number | null;
  frontmatter: Record<string, unknown> | null;
}

/**
 * GET /api/admin/chunk-inspector/detail?id=<chunk_id>
 *
 * Voller Chunk + Parent-Page-Metadaten für den Detail-Dialog.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
    cacheMaxAge: 30,
  },
  async (_ctx, _body, q) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }

    let result;
    try {
      result = await pool.query(
        `
      SELECT
        cc.id::text,
        cc.chunk_index,
        cc.chunk_role,
        cc.chunk_text,
        length(cc.chunk_text) AS chunk_length,
        cc.court,
        cc.ecli,
        cc.case_number,
        cc.statute_abbr,
        cc.paragraph_ref,
        cc.document_type,
        cc.legal_area,
        cc.decision_date,
        (cc.embedding IS NOT NULL) AS is_embedded,
        cc.embedded_at,
        cc.model,
        cc.token_count,
        p.id::text AS page_id,
        p.slug AS page_slug,
        p.title AS page_title,
        p.source_id,
        p.chunker_version,
        p.frontmatter
      FROM content_chunks cc
      JOIN pages p ON cc.page_id = p.id
      WHERE cc.id = $1
      LIMIT 1
      `,
        [q.id]
      );
    } catch (err) {
      console.error("[chunk-inspector/detail] query failed:", (err as Error).message);
      return apiError("not_found", "Chunk nicht gefunden", 404);
    }

    if (result.rows.length === 0) {
      return apiError("not_found", "Chunk nicht gefunden", 404);
    }

    const r = result.rows[0];
    const detail: ChunkDetail = {
      id: r.id,
      chunkIndex: parseInt(r.chunk_index ?? "0", 10),
      chunkRole: r.chunk_role ?? "",
      chunkText: r.chunk_text ?? "",
      chunkLength: parseInt(r.chunk_length ?? "0", 10),
      court: r.court ?? null,
      ecli: r.ecli ?? null,
      caseNumber: r.case_number ?? null,
      statuteAbbr: r.statute_abbr ?? null,
      paragraphRef: r.paragraph_ref ?? null,
      documentType: r.document_type ?? null,
      legalArea: r.legal_area ?? null,
      decisionDate: r.decision_date ? new Date(r.decision_date).toISOString().slice(0, 10) : null,
      embeddingStatus: r.is_embedded ? "embedded" : "pending",
      embeddedAt: r.embedded_at ? new Date(r.embedded_at).toISOString() : null,
      model: r.model ?? null,
      tokenCount: r.token_count ? parseInt(r.token_count, 10) : null,
      pageId: r.page_id,
      pageSlug: r.page_slug,
      pageTitle: r.page_title,
      sourceId: r.source_id,
      chunkerVersion: r.chunker_version ? parseInt(r.chunker_version, 10) : null,
      frontmatter: r.frontmatter ?? null,
    };

    return apiSuccess(detail);
  }
);

// ── PATCH: Chunk-Text und Metadaten bearbeiten ────────────────────────────

const patchSchema = z.object({
  id: z.string().min(1).max(100),
  chunkText: z.string().min(1).max(500_000).optional(),
  chunkRole: z.string().max(100).optional(),
  court: z.string().max(200).nullable().optional(),
  caseNumber: z.string().max(200).nullable().optional(),
  ecli: z.string().max(200).nullable().optional(),
  statuteAbbr: z.string().max(100).nullable().optional(),
  paragraphRef: z.string().max(200).nullable().optional(),
});

/**
 * PATCH /api/admin/chunk-inspector/detail
 *
 * Aktualisiert Chunk-Text und/oder Metadaten.
 * Setzt embedding auf NULL (force re-embed bei nächster Pipeline-Run).
 */
export const PATCH = createHandler(
  {
    action: "admin.*",
    body: patchSchema,
    rateTier: "heavy",
    audit: (_ctx, body) => ({
      action: "admin.chunk_edit" as const,
      entityType: "content_chunk",
      details: { chunkId: body.id, fields: Object.keys(body).filter((k) => k !== "id") },
    }),
  },
  async (_ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }

    const { id, chunkText, chunkRole, court, caseNumber, ecli, statuteAbbr, paragraphRef } = body;

    // Build SET clauses dynamically
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (chunkText !== undefined) {
      sets.push(`chunk_text = $${idx++}`);
      params.push(chunkText);
      // Text geändert → Embedding invalidieren. BUG 62: model = NULL muss
      // auch gesetzt werden (wie BUG 32/61). Sonst umgeht auto-embed-pg.ts
      // seinen Claim-Mechanismus und parallele Worker könnten doppelt embedden.
      sets.push(`embedding = NULL`);
      sets.push(`embedded_at = NULL`);
      sets.push(`model = NULL`);
    }
    if (chunkRole !== undefined) {
      sets.push(`chunk_role = $${idx++}`);
      params.push(chunkRole);
    }
    if (court !== undefined) {
      sets.push(`court = $${idx++}`);
      params.push(court);
    }
    if (caseNumber !== undefined) {
      sets.push(`case_number = $${idx++}`);
      params.push(caseNumber);
    }
    if (ecli !== undefined) {
      sets.push(`ecli = $${idx++}`);
      params.push(ecli);
    }
    if (statuteAbbr !== undefined) {
      sets.push(`statute_abbr = $${idx++}`);
      params.push(statuteAbbr);
    }
    if (paragraphRef !== undefined) {
      sets.push(`paragraph_ref = $${idx++}`);
      params.push(paragraphRef);
    }

    if (sets.length === 0) {
      return apiError("bad_request", "Keine Felder zum Aktualisieren", 400);
    }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    try {
      const result = await pool.query(
        `UPDATE content_chunks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id::text`,
        params
      );

      if (result.rows.length === 0) {
        return apiError("not_found", "Chunk nicht gefunden", 404);
      }

      return apiSuccess({ id: result.rows[0].id, updated: true });
    } catch (err) {
      console.error("[chunk-inspector/detail] PATCH failed:", (err as Error).message);
      return apiError("internal_error", "Aktualisierung fehlgeschlagen", 500);
    }
  }
);

// ── DELETE: Chunk löschen ─────────────────────────────────────────────────

const deleteSchema = z.object({
  id: z.string().min(1).max(100),
});

/**
 * DELETE /api/admin/chunk-inspector/detail
 *
 * Löscht einen Chunk hart (nicht soft-delete, da Chunks keine deleted_at-Spalte haben).
 */
export const DELETE = createHandler(
  {
    action: "admin.*",
    body: deleteSchema,
    rateTier: "heavy",
    audit: (_ctx, body) => ({
      action: "admin.chunk_delete" as const,
      entityType: "content_chunk",
      details: { chunkId: body.id },
    }),
  },
  async (_ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }

    try {
      const result = await pool.query(
        `DELETE FROM content_chunks WHERE id = $1 RETURNING id::text`,
        [body.id]
      );

      if (result.rows.length === 0) {
        return apiError("not_found", "Chunk nicht gefunden", 404);
      }

      return apiSuccess({ id: result.rows[0].id, deleted: true });
    } catch (err) {
      console.error("[chunk-inspector/detail] DELETE failed:", (err as Error).message);
      return apiError("internal_error", "Löschen fehlgeschlagen", 500);
    }
  }
);

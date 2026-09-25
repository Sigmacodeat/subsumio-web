import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { apiError } from "@/lib/api-response";
import { listAuditLogsPage, logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit-labels";
import { hasValidInternalSecret } from "@/lib/auth/internal";
import type { NextRequest } from "next/server";

import { logger } from "@/lib/logger";
const log = logger("api/audit");

export const dynamic = "force-dynamic";

const auditQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 100, 500))
    .default("100"),
  /** Keyset cursor from the previous page's `nextCursor` — older entries. */
  cursor: z.string().max(200).optional(),
});

const auditPostSchema = z.object({
  action: z.string().max(100),
  entity_type: z.string().max(100),
  entity_id: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  /** Tenant (engine source id) the entry belongs to; absent → system chain. */
  brain_id: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,128}$/)
    .optional(),
});

export const GET = createHandler(
  {
    // Kanzleiweites Protokoll (alle Akten, Nutzer, IPs) — nur Admins.
    action: "audit.read",
    rateTier: "standard",
    query: auditQuerySchema,
  },
  async (ctx, _body, query) => {
    // Zweite, unabhängige Sperre neben der Rollenmatrix (fail-closed).
    if (ctx.user?.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }
    // System of record is the Postgres audit table written by logAudit()
    // (hash-chained, GoBD). The previous implementation listed engine pages of
    // type audit_log — nothing ever writes those, so the page stayed empty.
    try {
      const { entries, nextCursor } = await listAuditLogsPage({
        brainId: ctx.brainId,
        action: query.action,
        entityType: query.entityType,
        from: query.from,
        to: query.to ? `${query.to}T23:59:59.999Z` : undefined,
        limit: query.limit,
        cursor: query.cursor,
      });
      return Response.json({ entries, total: entries.length, nextCursor });
    } catch (err) {
      if (err instanceof RangeError) {
        return apiError("invalid_cursor", "Ungültige Seitenmarke", 400);
      }
      log.error("[audit] failed:", err instanceof Error ? err.message : String(err));
      // Kein leeres Protokoll vortäuschen — ein Lesefehler ist ein Fehler.
      return apiError("audit_unavailable", "Audit log is temporarily unavailable", 503);
    }
  }
);

/**
 * POST /api/audit — internal endpoint for the engine to write audit entries.
 * Authenticated via x-internal-secret header (engine→web internal calls).
 */
export async function POST(req: NextRequest) {
  if (!hasValidInternalSecret(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const parsed = auditPostSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "invalid_body" }, { status: 400 });
    }
    const body = parsed.data;

    await logAudit(body.action as AuditAction, body.entity_type, {
      brainId: body.brain_id ?? SYSTEM_BRAIN,
      entityId: body.entity_id,
      details: body.details,
    });

    return Response.json({ ok: true });
  } catch (err) {
    log.error("[audit POST] failed:", err instanceof Error ? err.message : String(err));
    return Response.json(
      { error: "audit_write_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

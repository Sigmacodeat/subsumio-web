import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit-labels";
import { hasValidInternalSecret } from "@/lib/auth/internal";
import type { NextRequest } from "next/server";

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
});

const auditPostSchema = z.object({
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: auditQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=audit_log&limit=${query.limit}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return Response.json({ entries: [], total: 0 });
      }

      const pages = (await res.json()) as Array<{
        slug: string;
        title: string;
        created_at: string;
        frontmatter?: Record<string, unknown>;
      }>;

      const entries = pages.map((p) => {
        const fm = p.frontmatter || {};
        const details =
          fm.details && typeof fm.details === "object"
            ? (fm.details as Record<string, unknown>)
            : undefined;
        return {
          id: p.slug,
          action: String(fm.action || ""),
          entityType: String(fm.entity_type || ""),
          entityId: fm.entity_id ? String(fm.entity_id) : undefined,
          timestamp: String(fm.timestamp || p.created_at || ""),
          details,
        };
      });

      const filtered = entries.filter((e) => {
        if (query.action && !e.action.includes(query.action!)) return false;
        if (query.entityType && e.entityType !== query.entityType) return false;
        if (query.from && e.timestamp < query.from) return false;
        if (query.to && e.timestamp > `${query.to}T23:59:59`) return false;
        return true;
      });

      return Response.json({ entries: filtered, total: filtered.length });
    } catch (err) {
      console.error("[audit] failed:", err instanceof Error ? err.message : String(err));
      return Response.json({ entries: [], total: 0 });
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
    const body = auditPostSchema.parse(await req.json());

    await logAudit(body.action as AuditAction, body.entity_type, {
      entityId: body.entity_id,
      details: body.details,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[audit POST] failed:", err instanceof Error ? err.message : String(err));
    return Response.json(
      { error: "audit_write_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

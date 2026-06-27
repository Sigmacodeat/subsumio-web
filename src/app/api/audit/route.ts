
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const auditQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().transform((v) => Math.min(parseInt(v, 10) || 100, 500)).default("100"),
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
        const details = fm.details && typeof fm.details === "object"
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
  },
);

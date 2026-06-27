import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

const permissionPostSchema = z.object({
  slug: z.string().min(1).max(512),
  group_id: z.string().min(1).max(200),
  permission: z.enum(["read", "write"]).default("read"),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, req) => {
    try {
      const slug = req.url.split("/").pop();
      if (!slug || slug.length > 512) {
        return apiError("slug_required", "Slug fehlt", 400);
      }
      const res = await fetch(`${ENGINE_URL}/api/acls/permissions/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return apiError("acl_fetch_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[acls/permissions] get failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Berechtigungen konnten nicht geladen werden", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: permissionPostSchema,
    audit: (_ctx, body) => ({
      action: "acl.set_permission" as const,
      entityType: "acl_permission",
      details: { slug: body.slug, groupId: body.group_id, permission: body.permission },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/acls/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: body.slug,
          group_id: body.group_id,
          permission: body.permission,
          signal: AbortSignal.timeout(15_000),
        }),
      });
      if (!res.ok) {
        return apiError("acl_set_permission_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[acls/permissions] set failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Berechtigung konnte nicht gesetzt werden", 500);
    }
  }
);

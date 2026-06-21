import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, req) => {
    try {
      const slug = req.url.split("/").pop();
      if (!slug) {
        return apiError("slug_required", "Slug fehlt", 400);
      }
      const res = await fetch(`${ENGINE_URL}/api/acls/permissions/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
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
  },
  async (ctx, body, _query, _req) => {
    try {
      const b = body as Record<string, unknown> | undefined;
      const slug = b?.slug;
      const groupId = b?.group_id;
      const permission = b?.permission;
      if (typeof slug !== "string" || typeof groupId !== "string") {
        return apiError("slug_and_group_id_required", "Slug und Gruppen-ID sind erforderlich", 400);
      }
      const res = await fetch(`${ENGINE_URL}/api/acls/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug,
          group_id: groupId,
          permission: permission === "write" ? "write" : "read",
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

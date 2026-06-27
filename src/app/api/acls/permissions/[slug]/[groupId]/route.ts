import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (_ctx, _body, _query) => ({
      action: "acl.remove_permission" as const,
      entityType: "acl_permission",
      details: {},
    }),
  },
  async (ctx, _body, _query, req) => {
    try {
      const parts = req.url.split("/");
      const groupId = parts.pop();
      const slug = parts[parts.length - 1];
      if (!slug || !groupId) {
        return apiError("slug_and_group_id_required", "Slug und Gruppen-ID fehlen", 400);
      }
      const res = await fetch(
        `${ENGINE_URL}/api/acls/permissions/${encodeURIComponent(slug)}/${encodeURIComponent(groupId)}`,
        {
          method: "DELETE",
          headers: ctx.headers,
        }
      );
      if (!res.ok) {
        return apiError(
          "acl_remove_permission_failed",
          `Engine returned ${res.status}`,
          res.status
        );
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[acls/permissions] delete failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Berechtigung konnte nicht entfernt werden", 500);
    }
  }
);

import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    try {
      const groupId = req.url.split("/").pop();
      if (!groupId) {
        return apiError("group_id_required", "Gruppen-ID fehlt", 400);
      }
      const res = await fetch(`${ENGINE_URL}/api/acls/groups/${encodeURIComponent(groupId)}`, {
        method: "DELETE",
        headers: ctx.headers,
      });
      if (!res.ok) {
        return apiError("acl_delete_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[acls/groups] delete failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Gruppe konnte nicht gelöscht werden", 500);
    }
  }
);

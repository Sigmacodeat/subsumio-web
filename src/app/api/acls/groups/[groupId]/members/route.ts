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
      const parts = req.url.split("/");
      const groupId = parts[parts.length - 2];
      if (!groupId) {
        return apiError("group_id_required", "Gruppen-ID fehlt", 400);
      }
      const res = await fetch(
        `${ENGINE_URL}/api/acls/groups/${encodeURIComponent(groupId)}/members`,
        {
          headers: ctx.headers,
        }
      );
      if (!res.ok) {
        return apiError("acl_fetch_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error(
        "[acls/members] list failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Mitglieder konnten nicht geladen werden", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
  },
  async (ctx, body, _query, req) => {
    try {
      const parts = req.url.split("/");
      const groupId = parts[parts.length - 2];
      if (!groupId) {
        return apiError("group_id_required", "Gruppen-ID fehlt", 400);
      }
      const userId = (body as Record<string, unknown> | undefined)?.user_id;
      if (typeof userId !== "string" || !userId.trim()) {
        return apiError("user_id_required", "Benutzer-ID ist erforderlich", 400);
      }
      const res = await fetch(
        `${ENGINE_URL}/api/acls/groups/${encodeURIComponent(groupId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({ user_id: userId.trim() }),
        }
      );
      if (!res.ok) {
        return apiError("acl_add_member_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error("[acls/members] add failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Mitglied konnte nicht hinzugefügt werden", 500);
    }
  }
);

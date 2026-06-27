import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

const addMemberSchema = z.object({
  user_id: z.string().min(1).max(200),
});

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
    body: addMemberSchema,
    audit: (_ctx, body, _query) => ({
      action: "acl.add_member" as const,
      entityType: "acl_group",
      details: { userId: body.user_id },
    }),
  },
  async (ctx, body, _query, req) => {
    try {
      const parts = req.url.split("/");
      const groupId = parts[parts.length - 2];
      if (!groupId) {
        return apiError("group_id_required", "Gruppen-ID fehlt", 400);
      }
      const res = await fetch(
        `${ENGINE_URL}/api/acls/groups/${encodeURIComponent(groupId)}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({ user_id: body.user_id }),
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

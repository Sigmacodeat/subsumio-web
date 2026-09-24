import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

import { logger } from "@/lib/logger";
const log = logger("api/acls/groups/[groupId]/members/[userId]");

/** `/api/acls/groups/<groupId>/members/<userId>` → both ids, URL-decoded. */
function idsFromUrl(url: string): { groupId: string; userId: string } | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("members");
  if (i < 1 || i + 1 >= parts.length) return null;
  try {
    const groupId = decodeURIComponent(parts[i - 1]);
    const userId = decodeURIComponent(parts[i + 1]);
    return groupId && userId ? { groupId, userId } : null;
  } catch {
    return null;
  }
}

/**
 * Remove a member from an ACL group / ethical wall. Admin-only (settings.write),
 * audit-logged like adding a member.
 */
export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (_ctx, _body, _query, req) => {
      const ids = req ? idsFromUrl(req.url) : null;
      return {
        action: "acl.remove_member" as const,
        entityType: "acl_group",
        entityId: ids?.groupId,
        details: { userId: ids?.userId },
      };
    },
  },
  async (ctx, _body, _query, req) => {
    const ids = idsFromUrl(req.url);
    if (!ids) return apiError("member_id_required", "Gruppen- oder Benutzer-ID fehlt", 400);
    try {
      const res = await fetch(
        `${ENGINE_URL}/api/acls/groups/${encodeURIComponent(ids.groupId)}/members/${encodeURIComponent(ids.userId)}`,
        {
          method: "DELETE",
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) {
        return apiError("acl_remove_member_failed", `Engine returned ${res.status}`, res.status);
      }
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (data.success === false) {
        return apiError("member_not_found", "Mitglied ist nicht in dieser Gruppe", 404);
      }
      return Response.json({ success: true });
    } catch (err) {
      log.error("[acls/members] remove failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Mitglied konnte nicht entfernt werden", 500);
    }
  }
);

import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { syncFromWorkOS, saveSyncStatus, isWorkosDirectorySyncConfigured } from "@/lib/scim";

export const dynamic = "force-dynamic";

/**
 * POST /api/scim/sync
 * Trigger a manual sync from WorkOS Directory Sync.
 * Admin-only (RBAC via scim.write action).
 */
export const POST = createHandler(
  {
    action: "scim.write",
    rateTier: "heavy",
    audit: (_ctx, _body, _query) => ({
      action: "scim.sync_manual" as const,
      entityType: "system",
    }),
    maxDuration: 60,
  },
  async (ctx, _body, _query, _req) => {
    if (!isWorkosDirectorySyncConfigured()) {
      return apiError(
        "workos_not_configured",
        "WorkOS Directory Sync is not configured. Set WORKOS_API_KEY and WORKOS_DIRECTORY_ID.",
        503
      );
    }
    if (!ctx.user.orgId) {
      return apiError("no_org", "You must belong to an org to run a Directory Sync.", 400);
    }

    try {
      const result = await syncFromWorkOS(ctx.user.orgId);
      await saveSyncStatus(result);
      return apiSuccess(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[scim/sync] error:", msg);
      return apiError("sync_failed", `Sync failed: ${msg}`, 500);
    }
  }
);

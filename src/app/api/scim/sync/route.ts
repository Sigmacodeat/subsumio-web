import { getOrgStore } from "@/lib/auth/store";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import {
  DirectoryNotConfiguredError,
  syncFromWorkOS,
  saveSyncStatus,
  isWorkosDirectorySyncConfigured,
} from "@/lib/scim";

import { logger } from "@/lib/logger";
const log = logger("api/scim/sync");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (!ctx.user.orgId) {
      return apiError("no_org", "You must belong to an org to run a Directory Sync.", 400);
    }
    // Directory sync creates and deactivates accounts: firm owner only.
    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org || org.ownerId !== ctx.user.id) {
      return apiError(
        "owner_only",
        "Nur die Inhaberin oder der Inhaber der Kanzlei darf synchronisieren",
        403
      );
    }
    // Only a directory connected to THIS firm is ever pulled.
    if (!isWorkosDirectorySyncConfigured(org)) {
      return apiError(
        "directory_not_configured",
        "Für diese Kanzlei ist kein Verzeichnis (WorkOS Directory Sync) verbunden.",
        409
      );
    }

    try {
      const result = await syncFromWorkOS(org.id);
      await saveSyncStatus(org.id, result);
      return apiSuccess(result);
    } catch (err) {
      if (err instanceof DirectoryNotConfiguredError) {
        return apiError(
          "directory_not_configured",
          "Für diese Kanzlei ist kein Verzeichnis (WorkOS Directory Sync) verbunden.",
          409
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[scim/sync] error:", msg);
      return apiError("sync_failed", "Sync fehlgeschlagen", 500);
    }
  }
);

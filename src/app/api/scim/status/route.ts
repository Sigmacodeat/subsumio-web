import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getSyncStatus } from "@/lib/scim";

export const dynamic = "force-dynamic";

/**
 * GET /api/scim/status
 * Returns SCIM configuration status, last sync info, and user counts.
 * Admin-only (RBAC via scim.read action).
 */
export const GET = createHandler(
  {
    action: "scim.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (_ctx, _body, _query, _req) => {
    const status = await getSyncStatus();
    return apiSuccess(status);
  }
);

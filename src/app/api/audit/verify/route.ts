import { createHandler, apiSuccess } from "@/lib/api-handler";
import { verifyAuditChain } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/audit/verify
 *
 * Verifies the integrity of the audit log hash chain for the current brain.
 * Detects tampered entries (hash mismatch), chain breaks (prev_hash mismatch),
 * and reports pre-fix entries that cannot be verified (missing hash_payload).
 *
 * Returns:
 *   { ok: boolean, verified: number, unverifiable: number, broken: [...], totalEntries: number }
 */
export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "system.integrity_check" as const,
      entityType: "audit_chain",
      entityId: ctx.brainId,
      details: {},
    }),
  },
  async (ctx) => {
    const result = await verifyAuditChain(ctx.brainId);

    if (result.ok) {
      return apiSuccess({
        ok: true,
        verified: result.verified,
        unverifiable: result.unverifiable,
        broken: result.broken,
        totalEntries: result.totalEntries,
      });
    }

    // Chain is broken — return 200 with ok=false so the client can show details
    return apiSuccess({
      ok: false,
      verified: result.verified,
      unverifiable: result.unverifiable,
      broken: result.broken,
      totalEntries: result.totalEntries,
    });
  }
);

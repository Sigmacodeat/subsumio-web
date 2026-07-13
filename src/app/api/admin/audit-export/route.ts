/**
 * T7.4 / WP7.4.2 — Admin Audit Export
 *
 * Exports the full audit chain for a given brain/tenant with
 * hash chain verification metadata. Admin-only.
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { listAuditLogs } from "@/lib/audit";
import {
  verifyAuditChain,
  formatVerificationReport,
  type AuditChainEntry,
} from "@/lib/audit-chain-verification";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  brain_id: z.string().min(1).max(200),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action_filter: z.string().optional(),
  entity_type: z.string().optional(),
  limit: z.number().min(1).max(10000).default(5000),
  verify_chain: z.boolean().default(true),
});

export const POST = createHandler(
  {
    action: "admin.audit_export",
    rateTier: "heavy",
    body: exportSchema,
    audit: (ctx, body) => ({
      action: "admin.audit_export",
      entityType: "audit_log",
      entityId: body.brain_id,
      details: {
        from: body.from,
        to: body.to,
        action_filter: body.action_filter,
        verify_chain: body.verify_chain,
        by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required for audit export", 403);
    }

    const entries = await listAuditLogs({
      brainId: body.brain_id,
      action: body.action_filter,
      entityType: body.entity_type,
      from: body.from,
      to: body.to,
      limit: body.limit,
    });

    // Transform to chain entries (reverse to chronological order)
    const chainEntries: AuditChainEntry[] = entries
      .map((e) => ({
        id: e.id,
        brain_id: body.brain_id,
        action: e.action,
        entity_type: e.entityType,
        entity_id: e.entityId ?? null,
        user_id: e.userId ?? null,
        user_email: e.userEmail ?? null,
        details: e.details ?? null,
        ip: e.ip ?? null,
        hash: e.hash ?? null,
        prev_hash: e.prev_hash ?? null,
        created_at: e.timestamp,
      }))
      .reverse();

    let verification = null;
    if (body.verify_chain && chainEntries.length > 0) {
      const result = verifyAuditChain(chainEntries);
      verification = {
        valid: result.valid,
        totalEntries: result.totalEntries,
        verifiedEntries: result.verifiedEntries,
        brokenAt: result.brokenAt,
        errors: result.errors,
        firstHash: result.firstHash,
        lastHash: result.lastHash,
        report: formatVerificationReport(result),
      };
    }

    return apiSuccess({
      exported_at: new Date().toISOString(),
      exported_by: ctx.user.email,
      brain_id: body.brain_id,
      entry_count: entries.length,
      entries,
      verification,
    });
  }
);

/**
 * GET /api/admin/settlement-queue
 *
 * Lists failed pipeline settlements queued for retry. The engine writes to
 * pipeline_settlement_queue when settlePipeline() fails (web app transient
 * down, 402 overage unpaid, network timeout). This endpoint lets an admin
 * see which pipelines have uncollected/refunded credits and re-trigger
 * settlement manually via POST.
 *
 * Query params:
 *   - status: filter by status (pending | succeeded | exhausted). Default: pending.
 *   - limit: max rows (default 50, max 200).
 */

import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

const retrySchema = z.object({
  pipeline_key: z.string().min(1),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    admin: true,
    cacheMaxAge: 10,
  },
  async (ctx, _body, query, _req) => {
    // Admin-only: settlement queue contains sensitive billing data
    // (owner_ids, credit amounts, error messages). Non-admin users must
    // not see other users' failed settlements.
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }
    const status = (query.status as string) ?? "pending";
    const limit = Math.min(Number(query.limit ?? 50), 200);

    if (!["pending", "succeeded", "exhausted", "all"].includes(status)) {
      return apiError("invalid_status", "status must be pending|succeeded|exhausted|all", 400);
    }

    try {
      const res = await fetch(
        `${ENGINE_URL}/api/admin/settlement-queue?status=${encodeURIComponent(status)}&limit=${limit}`,
        {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`engine returned ${res.status}: ${text}`);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error("[admin/settlement-queue] engine unreachable:", err);
      return Response.json({
        queue: [],
        engine_reachable: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
);

/**
 * POST /api/admin/settlement-queue
 *
 * Manually retry a failed settlement. The engine re-calls settlePipeline()
 * for the given pipeline_key. Useful when the web app was transiently down
 * during pipeline completion and the automated retry hasn't fired yet.
 *
 * Body: { pipeline_key: string }
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    admin: true,
    body: retrySchema,
    audit: (ctx, body, _query, _req) => ({
      action: "admin.settlement_retry",
      entityType: "settlement",
      entityId: body?.pipeline_key ?? "",
      details: { user: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    // Admin-only: retrying settlements can re-charge users' credits.
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }
    if (!body?.pipeline_key || typeof body.pipeline_key !== "string") {
      return apiError("missing_pipeline_key", "pipeline_key is required", 400);
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/admin/settlement-queue/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({ pipeline_key: body.pipeline_key }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`engine returned ${res.status}: ${text}`);
      }
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      return apiError(
        "settlement_retry_failed",
        err instanceof Error ? err.message : String(err),
        500
      );
    }
  }
);

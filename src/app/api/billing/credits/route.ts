/**
 * Credit Balance & Transactions API
 *
 * GET /api/billing/credits          — balance + recent transactions
 * POST /api/billing/credits/auto-reload — update auto-reload settings
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  getBalance,
  getTransactions,
  setAutoReload,
  CREDIT_PACKS,
  CREDIT_COSTS,
  type OwnerType,
} from "@/lib/billing/credits";

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;

    const [balance, transactions] = await Promise.all([
      getBalance(ownerId, ownerType),
      getTransactions(ownerId, ownerType, { limit: 50 }),
    ]);

    return Response.json({
      balance,
      transactions,
      creditPacks: CREDIT_PACKS,
      creditCosts: CREDIT_COSTS,
    });
  }
);

const autoReloadSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().int().min(1).max(1000).optional(),
  packId: z.enum(["starter", "standard", "pro", "firm"]).optional().nullable(),
});

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    body: autoReloadSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "billing",
      details: {
        autoReload: body.enabled,
        threshold: body.threshold,
        packId: body.packId,
        user: ctx.user.email,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;

    await setAutoReload(ownerId, ownerType, {
      enabled: body.enabled,
      threshold: body.threshold,
      packId: body.packId,
    });

    return Response.json({ ok: true });
  }
);

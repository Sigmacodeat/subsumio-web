/**
 * Admin Spend Caps API — Credit-Limits pro User verwalten.
 *
 * GET  /api/admin/spend-caps?owner_id=X&owner_type=user  — aktuelles Cap
 * POST /api/admin/spend-caps                              — Cap setzen/aktualisieren
 * DELETE /api/admin/spend-caps?owner_id=X&owner_type=user — Cap entfernen
 *
 * Wie OpenAI's granular credit usage limits für custom roles.
 */

import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  setSpendCap,
  getNegativeBalanceConfig,
  setNegativeBalanceConfig,
  type OwnerType,
} from "@/lib/billing/credits";

const spendCapQuerySchema = z.object({
  owner_id: z.string().min(1),
  owner_type: z.enum(["user", "org"]),
});

const spendCapSchema = z.object({
  owner_id: z.string().min(1),
  owner_type: z.enum(["user", "org"]),
  credit_limit: z.number().min(0).nullable(),
  period: z.enum(["daily", "weekly", "monthly", "total"]).default("monthly"),
  /** Negative Balance Settings (OpenAI-style processing delay grace) */
  allow_negative_balance: z.boolean().optional(),
  max_negative_balance: z.number().min(0).optional(),
});

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    admin: true,
    body: spendCapSchema,
    audit: (ctx, body, _query, _req) => ({
      action: "settings.update" as const,
      entityType: "billing",
      details: {
        ownerId: body.owner_id,
        limit: body.credit_limit,
        period: body.period,
        admin: ctx.user.email,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    await setSpendCap(body.owner_id, body.owner_type as OwnerType, body.credit_limit, body.period);

    if (body.allow_negative_balance !== undefined && body.max_negative_balance !== undefined) {
      await setNegativeBalanceConfig(
        body.owner_id,
        body.owner_type as OwnerType,
        body.allow_negative_balance,
        body.max_negative_balance
      );
    }

    return Response.json({ ok: true });
  }
);

export const GET = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    admin: true,
    query: spendCapQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    if (!query) return apiError("invalid_request", "owner_id required", 400);
    const negConfig = await getNegativeBalanceConfig(query.owner_id, query.owner_type as OwnerType);
    return Response.json({ ok: true, ...negConfig });
  }
);

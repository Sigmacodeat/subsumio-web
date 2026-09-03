/**
 * Budget Alerts API — Trigger Budget-Alert Prüfung.
 *
 * POST /api/billing/budget-alerts
 * Wird nach Credit-Deduktionen aufgerufen (von pipeline-settle, deductCredits, etc.)
 * Prüft ob 50%/75%/90% Threshold unterschritten wurde → sendet Email.
 *
 * Wie OpenAI's automatische "Your credit balance is low" Emails.
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { checkAndSendBudgetAlert, getBalance, type OwnerType } from "@/lib/billing/credits";

const budgetAlertSchema = z.object({
  /** Optional: explizite Balance (sonst wird aktuelle Balance gelesen) */
  balance: z.number().optional(),
});

export const POST = createHandler(
  {
    action: "billing.read",
    rateTier: "standard",
    body: budgetAlertSchema,
    audit: (ctx, body) => ({
      action: "billing.budget_alert" as const,
      entityType: "budget_alert",
      details: {
        owner_type: ctx.user.orgId ? "org" : "user",
        balance: body.balance,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const ownerType: OwnerType = ctx.user.orgId ? "org" : "user";
    const ownerId = ctx.user.orgId ?? ctx.user.id;

    const { balance } =
      body.balance !== undefined ? { balance: body.balance } : await getBalance(ownerId, ownerType);

    const result = await checkAndSendBudgetAlert(ownerId, ownerType, ctx.user.email, balance);

    return Response.json({
      ok: true,
      ...result,
    });
  }
);

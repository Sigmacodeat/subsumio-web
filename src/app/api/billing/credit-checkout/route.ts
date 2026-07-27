/**
 * Credit Checkout — Stripe One-Time Payment
 *
 * Creates a Stripe Checkout Session with mode="payment" for credit pack purchases.
 * After successful payment, the webhook adds credits to the user's balance.
 */

import { z } from "zod";
import { isBillingConfigured } from "@/lib/billing/plans";
import { getCreditPack } from "@/lib/billing/credits";
import { createHandler, apiError } from "@/lib/api-handler";

const creditCheckoutSchema = z.object({
  packId: z.enum(["starter", "standard", "pro", "firm"]),
});

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    body: creditCheckoutSchema,
    audit: (ctx, body) => ({
      action: "billing.credit_purchase" as const,
      entityType: "billing",
      details: { packId: body.packId, user: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    if (!isBillingConfigured()) {
      return apiError(
        "billing_not_configured",
        "Stripe is not connected yet. Set STRIPE_SECRET_KEY to enable credit purchases.",
        501
      );
    }

    const pack = getCreditPack(body.packId);
    if (!pack) {
      return apiError("invalid_pack", "Unknown credit pack", 400);
    }

    const priceId = process.env[pack.stripePriceEnv];
    if (!priceId) {
      return apiError(
        "price_not_configured",
        `Missing env ${pack.stripePriceEnv} for credit pack "${pack.name}".`,
        501
      );
    }

    const origin = req.nextUrl.origin;
    const params = new URLSearchParams({
      mode: "payment",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: ctx.user.id,
      customer_email: ctx.user.email,
      "metadata[pack_id]": pack.id,
      "metadata[credits]": String(pack.credits),
      "metadata[user_id]": ctx.user.id,
      "metadata[purchase_type]": "credits",
      success_url: `${origin}/dashboard/billing?credit_status=success&pack=${pack.id}`,
      cancel_url: `${origin}/dashboard/billing?credit_status=cancelled`,
      ...(ctx.user.referredBy ? { "metadata[referred_by]": ctx.user.referredBy } : {}),
    });

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      error?: { message?: string };
      url?: string;
    };
    if (!resp.ok) {
      return apiError("stripe_error", data?.error?.message ?? "Stripe request failed", 502);
    }
    return Response.json({ url: data.url });
  }
);

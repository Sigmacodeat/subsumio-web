import { z } from "zod";
import { isBillingConfigured, stripePriceId, BILLABLE_PLANS } from "@/lib/billing/plans";
import { createHandler, apiError } from "@/lib/api-handler";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "team"]),
});

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    body: checkoutSchema,
    audit: (ctx, body) => ({
      action: "billing.upgrade" as const,
      entityType: "billing",
      details: { plan: body.plan, user: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    if (!isBillingConfigured()) {
      return apiError(
        "billing_not_configured",
        "Stripe is not connected yet. Set STRIPE_SECRET_KEY, STRIPE_PRICE_PRO and STRIPE_PRICE_TEAM to enable checkout.",
        501
      );
    }

    const priceId = stripePriceId(body.plan);
    if (!priceId) {
      return apiError(
        "price_not_configured",
        `Missing env ${BILLABLE_PLANS[body.plan].stripePriceEnv}.`,
        501
      );
    }

    const origin = req.nextUrl.origin;
    const params = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: ctx.user.id,
      customer_email: ctx.user.email,
      "metadata[plan]": body.plan,
      "metadata[user_id]": ctx.user.id,
      success_url: `${origin}/dashboard/billing?status=success`,
      cancel_url: `${origin}/dashboard/billing?status=cancelled`,
      ...(ctx.user.referredBy ? { "metadata[referred_by]": ctx.user.referredBy } : {}),
    });

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
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

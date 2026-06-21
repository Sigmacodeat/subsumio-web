import { createHandler, apiError } from "@/lib/api-handler";

export const POST = createHandler(
  {
    action: "billing.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "billing.upgrade" as const,
      entityType: "billing",
      details: { user: ctx.user.email, action: "portal_session" },
    }),
  },
  async (ctx, _body, _query, req) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return apiError("billing_not_configured", "Stripe is not connected.", 501);
    }
    if (!ctx.user.stripeCustomerId) {
      return apiError("no_customer", "No Stripe customer ID found. Upgrade first.", 400);
    }

    const origin = req.nextUrl.origin;
    const params = new URLSearchParams({
      customer: ctx.user.stripeCustomerId,
      return_url: `${origin}/dashboard/billing`,
    });

    const resp = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
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

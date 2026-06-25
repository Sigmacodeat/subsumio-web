/**
 * Billing — Proration Preview & Plan-Wechsel
 *
 * GET  /api/billing/proration?newPriceId=...&quantity=...
 *      Berechnet Proration-Vorschau (sofortige Zahlung + nächste Rechnung)
 *
 * POST /api/billing/proration
 *      Führt Plan-Wechsel mit Proration durch
 */

import { NextRequest } from "next/server";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { z } from "zod";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";

const planChangeSchema = z.object({
  newPriceId: z.string().min(1),
  quantity: z.number().int().min(1).optional().default(1),
});

// ── Stripe Helper (no SDK — raw API) ─────────────────────────────────

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Stripe ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function stripePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const params = new URLSearchParams();
  flattenParams(body, params, "");
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Stripe ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function flattenParams(obj: Record<string, unknown>, params: URLSearchParams, prefix: string) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      flattenParams(value as Record<string, unknown>, params, fullKey);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "object") {
          flattenParams(v as Record<string, unknown>, params, `${fullKey}[${i}]`);
        } else {
          params.append(`${fullKey}[${i}]`, String(v));
        }
      });
    } else {
      params.append(fullKey, String(value));
    }
  }
}

// ── GET: Proration Preview ────────────────────────────────────────────

export const GET = createHandler(
  { action: "billing.read", rateTier: "standard" },
  async (ctx, _body, _query, req: NextRequest) => {
    if (!STRIPE_SECRET) return apiError("stripe_not_configured", "Stripe secret key not set", 501);

    const url = new URL(req.url);
    const newPriceId = url.searchParams.get("newPriceId");
    const quantity = parseInt(url.searchParams.get("quantity") ?? "1", 10);

    if (!newPriceId) return apiError("missing_price_id", "newPriceId is required", 400);

    const store = getStore();
    const user = await store.getById(ctx.user.id);
    const stripeCustomerId = user?.stripeCustomerId ?? null;
    if (!stripeCustomerId)
      return apiError("no_stripe_customer", "No Stripe customer ID found", 400);

    // Get active subscription
    const subs = await stripeGet<{
      data: Array<{ id: string; items: { data: Array<{ id: string; price: { id: string } }> } }>;
    }>(`/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=active&limit=1`);

    const sub = subs.data[0];
    if (!sub) return apiError("no_active_subscription", "No active subscription found", 400);

    const subItem = sub.items.data[0];
    if (!subItem) return apiError("no_subscription_item", "No subscription item found", 400);

    // Preview upcoming invoice with proration
    const preview = await stripeGet<{
      amount_due: number;
      currency: string;
      lines: {
        data: Array<{
          description: string;
          amount: number;
          period: { start: number; end: number };
        }>;
      };
      next_payment_attempt: number | null;
    }>(
      `/invoices/upcoming?customer=${stripeCustomerId}&subscription=${sub.id}` +
        `&subscription_items[0][id]=${subItem.id}` +
        `&subscription_items[0][price]=${newPriceId}` +
        `&subscription_items[0][quantity]=${quantity}` +
        `&subscription_proration_behavior=create_prorations`
    );

    const lineItems = preview.lines.data.map((line) => ({
      description: line.description,
      amount: line.amount / 100, // Cents → Euro
      currency: preview.currency.toUpperCase(),
      periodStart: new Date(line.period.start * 1000).toISOString(),
      periodEnd: new Date(line.period.end * 1000).toISOString(),
    }));

    return Response.json({
      immediateCharge: preview.amount_due / 100,
      currency: preview.currency.toUpperCase(),
      nextPaymentAt: preview.next_payment_attempt
        ? new Date(preview.next_payment_attempt * 1000).toISOString()
        : null,
      lineItems,
      subscriptionId: sub.id,
      currentPriceId: subItem.price.id,
      newPriceId,
      quantity,
    });
  }
);

// ── POST: Execute Plan Change with Proration ─────────────────────────

export const POST = createHandler(
  { action: "billing.write", rateTier: "standard", body: planChangeSchema },
  async (ctx, body, _query, _req) => {
    if (!STRIPE_SECRET) return apiError("stripe_not_configured", "Stripe secret key not set", 501);

    const { newPriceId, quantity } = body;
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    const stripeCustomerId = user?.stripeCustomerId ?? null;
    if (!stripeCustomerId)
      return apiError("no_stripe_customer", "No Stripe customer ID found", 400);

    // Get active subscription
    const subs = await stripeGet<{
      data: Array<{ id: string; items: { data: Array<{ id: string }> } }>;
    }>(`/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=active&limit=1`);

    const sub = subs.data[0];
    if (!sub) return apiError("no_active_subscription", "No active subscription found", 400);
    const subItem = sub.items.data[0];
    if (!subItem) return apiError("no_subscription_item", "No subscription item found", 400);

    // Execute plan change with immediate proration
    const updated = await stripePost<{
      id: string;
      status: string;
      current_period_end: number;
    }>(`/subscriptions/${sub.id}`, {
      items: [{ id: subItem.id, price: newPriceId, quantity }],
      proration_behavior: "create_prorations",
      billing_cycle_anchor: "unchanged",
    });

    return Response.json({
      ok: true,
      subscriptionId: updated.id,
      status: updated.status,
      currentPeriodEnd: new Date(updated.current_period_end * 1000).toISOString(),
    });
  }
);

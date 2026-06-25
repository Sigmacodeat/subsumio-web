/**
 * Billing — Seat Management
 *
 * GET  /api/billing/seats
 *      Aktuelle Seat-Nutzung, Mitglieder, Preis
 *
 * POST /api/billing/seats
 *      Seat-Anzahl ändern (up / downgrade)
 *      Body: { quantity: number }
 */

import { NextRequest } from "next/server";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { z } from "zod";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";

const seatChangeSchema = z.object({
  quantity: z.number().int().min(1, "minimum_one_seat"),
});

// ── Stripe helpers ────────────────────────────────────────────────────

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
  function flatten(obj: Record<string, unknown>, prefix: string) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v === null || v === undefined) continue;
      if (typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, key);
      else params.append(key, String(v));
    }
  }
  flatten(body, "");
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

// ── GET: Seat Usage ───────────────────────────────────────────────────

export const GET = createHandler(
  { action: "billing.read", rateTier: "standard" },
  async (ctx, _body, _query, _req: NextRequest) => {
    if (!STRIPE_SECRET) return apiError("stripe_not_configured", "Stripe secret key not set", 501);

    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    // Get members: users in the same org
    const allUsers = await store.list();
    const members = allUsers.filter((u) => u.orgId === ctx.user.orgId);
    const usedSeats = members.length;

    // Get subscription from Stripe for seat count and price
    let allocatedSeats = usedSeats;
    let pricePerSeat = 0;
    let currency = "EUR";
    let subscriptionId: string | null = null;

    if (user.stripeCustomerId) {
      try {
        const subs = await stripeGet<{
          data: Array<{
            id: string;
            quantity?: number;
            items: {
              data: Array<{
                quantity?: number;
                price: { unit_amount?: number; currency: string; id: string };
              }>;
            };
          }>;
        }>(
          `/subscriptions?customer=${encodeURIComponent(user.stripeCustomerId)}&status=active&limit=1`
        );

        const sub = subs.data[0];
        if (sub) {
          subscriptionId = sub.id;
          const item = sub.items.data[0];
          if (item) {
            allocatedSeats = item.quantity ?? sub.quantity ?? usedSeats;
            pricePerSeat = (item.price.unit_amount ?? 0) / 100;
            currency = item.price.currency.toUpperCase();
          }
        }
      } catch (err) {
        console.error("[seats] Stripe fetch error:", err);
        // Non-fatal — return usage without Stripe data
      }
    }

    return Response.json({
      allocated: allocatedSeats,
      used: usedSeats,
      available: Math.max(0, allocatedSeats - usedSeats),
      pricePerSeat,
      currency,
      subscriptionId,
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role ?? "member",
        lastActive: (m as { lastActiveAt?: string }).lastActiveAt ?? null,
      })),
    });
  }
);

// ── POST: Change Seat Count ───────────────────────────────────────────

export const POST = createHandler(
  { action: "billing.write", rateTier: "standard", body: seatChangeSchema },
  async (ctx, body, _query, _req) => {
    if (!STRIPE_SECRET) return apiError("stripe_not_configured", "Stripe secret key not set", 501);

    const { quantity } = body;
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    const stripeCustomerId = user?.stripeCustomerId ?? null;
    if (!stripeCustomerId)
      return apiError("no_stripe_customer", "No Stripe customer ID found", 400);

    // Validate: can't reduce below current member count
    const allUsers = await store.list();
    const members = allUsers.filter((u) => u.orgId === ctx.user.orgId);
    const usedSeats = members.length;
    if (quantity < usedSeats) {
      return apiError(
        "seat_count_too_low",
        `Cannot reduce to ${quantity} seats — ${usedSeats} seats currently in use. Remove members first.`,
        400
      );
    }

    // Get active subscription
    const subs = await stripeGet<{
      data: Array<{ id: string; items: { data: Array<{ id: string; price: { id: string } }> } }>;
    }>(`/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=active&limit=1`);

    const sub = subs.data[0];
    if (!sub) return apiError("no_active_subscription", "No active subscription found", 400);
    const subItem = sub.items.data[0];
    if (!subItem) return apiError("no_subscription_item", "No subscription item found", 400);

    // Preview proration before applying
    const preview = await stripeGet<{
      amount_due: number;
      currency: string;
      next_payment_attempt: number | null;
    }>(
      `/invoices/upcoming?customer=${stripeCustomerId}&subscription=${sub.id}` +
        `&subscription_items[0][id]=${subItem.id}` +
        `&subscription_items[0][price]=${subItem.price.id}` +
        `&subscription_items[0][quantity]=${quantity}` +
        `&subscription_proration_behavior=create_prorations`
    );

    // Apply seat change
    const updated = await stripePost<{
      id: string;
      status: string;
      current_period_end: number;
      items: { data: Array<{ quantity?: number }> };
    }>(`/subscriptions/${sub.id}`, {
      items: [{ id: subItem.id, quantity }],
      proration_behavior: "create_prorations",
    });

    return Response.json({
      ok: true,
      subscriptionId: updated.id,
      newQuantity: updated.items.data[0]?.quantity ?? quantity,
      status: updated.status,
      currentPeriodEnd: new Date(updated.current_period_end * 1000).toISOString(),
      prorationCharge: preview.amount_due / 100,
      currency: preview.currency.toUpperCase(),
    });
  }
);

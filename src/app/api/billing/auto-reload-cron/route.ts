/**
 * Auto-Reload Cron — checks credit balances and triggers Stripe purchases
 *
 * Called by a cron job (e.g. Vercel Cron, external scheduler).
 * For each owner with auto-reload enabled and balance ≤ threshold,
 * creates a Stripe Checkout Session (mode=payment) via the Stripe API.
 * After successful payment, the webhook adds credits to the balance.
 *
 * Security: requires CRON_SECRET header matching env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCreditPack, type OwnerType } from "@/lib/billing/credits";
import { isBillingConfigured } from "@/lib/billing/plans";
import { getStore, getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AutoReloadCandidate {
  ownerId: string;
  ownerType: OwnerType;
  balance: number;
  threshold: number;
  packId: string;
}

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = env("CRON_SECRET");
  if (!expected || cronSecret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const store = getStore();
  const pool = getSharedPgPool();

  let candidates: AutoReloadCandidate[] = [];

  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT owner_id, owner_type, balance, auto_reload_threshold, auto_reload_pack_id
         FROM subsumio_credit_balance
         WHERE auto_reload_enabled = true
           AND balance <= auto_reload_threshold
           AND auto_reload_pack_id IS NOT NULL`
      );
      candidates = rows.map(
        (r: {
          owner_id: string;
          owner_type: string;
          balance: number;
          auto_reload_threshold: number;
          auto_reload_pack_id: string;
        }) => ({
          ownerId: r.owner_id,
          ownerType: r.owner_type as OwnerType,
          balance: r.balance,
          threshold: r.auto_reload_threshold,
          packId: r.auto_reload_pack_id,
        })
      );
    } catch {
      // DB not available — skip
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ checked: 0, triggered: 0 });
  }

  let triggered = 0;
  const errors: string[] = [];
  const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";

  for (const candidate of candidates) {
    const pack = getCreditPack(candidate.packId);
    if (!pack) {
      errors.push(`Unknown pack: ${candidate.packId} for owner ${candidate.ownerId}`);
      continue;
    }

    let userId: string | undefined;
    let customerEmail: string | undefined;

    if (candidate.ownerType === "org") {
      try {
        if (!pool) throw new Error("no pool");
        const { rows } = await pool.query(
          `SELECT id, email FROM subsumio_users WHERE org_id = $1 LIMIT 1`,
          [candidate.ownerId]
        );
        userId = rows[0]?.id;
        customerEmail = rows[0]?.email;
      } catch {
        /* ignore */
      }
    } else {
      userId = candidate.ownerId;
      try {
        const user = await store.getById(candidate.ownerId);
        customerEmail = user?.email;
      } catch {
        /* ignore */
      }
    }

    if (!userId) {
      errors.push(`No user found for owner ${candidate.ownerId}`);
      continue;
    }

    const priceId = process.env[pack.stripePriceEnv];
    const params = new URLSearchParams({
      mode: "payment",
      client_reference_id: userId,
      "metadata[pack_id]": pack.id,
      "metadata[credits]": String(pack.credits),
      "metadata[user_id]": userId,
      "metadata[purchase_type]": "credits",
      "metadata[auto_reload]": "true",
      success_url: `${appUrl}/dashboard/billing?credit_status=success`,
      cancel_url: `${appUrl}/dashboard/billing?credit_status=cancelled`,
    });

    if (customerEmail) {
      params.set("customer_email", customerEmail);
    }

    if (priceId) {
      params.set("line_items[0][price]", priceId);
      params.set("line_items[0][quantity]", "1");
    }

    try {
      const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(30_000),
      });

      if (!resp.ok) {
        const errData = (await resp.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        errors.push(
          `Stripe error for ${candidate.ownerId}: ${errData?.error?.message ?? resp.statusText}`
        );
        continue;
      }

      const data = (await resp.json().catch(() => ({}))) as { url?: string };
      console.log(`[auto-reload] Created checkout session for ${candidate.ownerId}: ${data.url}`);
      triggered++;
    } catch (err) {
      errors.push(
        `Fetch error for ${candidate.ownerId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json({
    checked: candidates.length,
    triggered,
    errors: errors.length > 0 ? errors : undefined,
  });
}

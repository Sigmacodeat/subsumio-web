/**
 * Auto-Reload Cron — checks credit balances and triggers Stripe purchases
 *
 * Called by a cron job (e.g. Vercel Cron, external scheduler).
 * For each owner with auto-reload enabled and balance ≤ threshold,
 * creates a Stripe Checkout Session (mode=payment) via the Stripe API.
 * After successful payment, the webhook adds credits to the balance.
 *
 * Security: Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from "next/server";
import { createPublicHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { getCreditPack, type OwnerType } from "@/lib/billing/credits";
import { isBillingConfigured } from "@/lib/billing/plans";
import { getStore, getSharedPgPool } from "@/lib/auth/store";
import { validateCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AutoReloadCandidate {
  ownerId: string;
  ownerType: OwnerType;
  balance: number;
  threshold: number;
  packId: string;
}

export const GET = createPublicHandler({ maxDuration: 60 }, async (req: NextRequest) => {
  // Cron auth: timing-safe Bearer check + rate limiting (shared with /api/cron/*)
  const authError = await validateCronAuth(req);
  if (authError) return authError;

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
      // Read from consolidated saas_credit_balance (v136+).
      // available = included_credit + purchased_credit - used_credit
      // Dedup (v137+): only trigger if auto_reload_last_triggered_at is NULL
      // or older than 24h — prevents duplicate Checkout Sessions when the
      // user hasn't paid the previous one yet (cron runs every 2h).
      const { rows } = await pool.query(
        `SELECT org_id as owner_id,
                $2::text as owner_type,
                (included_credit + purchased_credit - used_credit) as balance,
                auto_reload_threshold,
                auto_reload_pack_id
         FROM saas_credit_balance
         WHERE auto_reload_enabled = true
           AND period_end > now()
           AND (included_credit + purchased_credit - used_credit) <= auto_reload_threshold
           AND auto_reload_pack_id IS NOT NULL
           AND (auto_reload_last_triggered_at IS NULL
                OR auto_reload_last_triggered_at < NOW() - INTERVAL '24 hours')
         ORDER BY period_start DESC`
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

      // Dedup: record trigger timestamp so the next cron run (within 24h)
      // doesn't create another Checkout Session for the same user.
      if (pool) {
        try {
          await pool.query(
            `UPDATE saas_credit_balance SET auto_reload_last_triggered_at = NOW()
             WHERE org_id = $1 AND period_end > now()`,
            [candidate.ownerId]
          );
        } catch {
          // best-effort — don't fail the cron for this
        }
      }
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
});

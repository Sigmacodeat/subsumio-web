/**
 * SaaS Billing Sync — Brücke zwischen Stripe Checkout und SaaS Billing Tables.
 *
 * Der Stripe Webhook (webhook/route.ts) aktualisiert nur den User-Store
 * (user.plan = "pro"/"team"). Die SaaS Billing Tables (saas_orgs,
 * saas_subscriptions, saas_credit_balance) wurden bisher nie befüllt.
 *
 * Dieses Modul stellt die Verbindung her:
 *   - createSaasOrgForUser: erstellt saas_orgs + saas_subscriptions
 *   - updateSaasPlan: aktualisiert plan bei upgrade/downgrade
 *   - cancelSaasOrg: markiert subscription als canceled
 *   - allocateIncludedCredits: befüllt saas_credit_balance
 *
 * Plan-Mapping: "pro"→"solo", "team"→"kanzlei" (via plans.ts:toSaasPlan)
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { toSaasPlan, BILLABLE_PLANS } from "@/lib/billing/plans";
import { PLANS } from "../../../server/src/core/saas-pricing";

/** Stripe plan ID ("pro" | "team") → SaaS PlanTier ("solo" | "kanzlei"). */
export type SaasPlanTier = "solo" | "kanzlei" | "enterprise";

/**
 * Erstellt einen saas_orgs Row + saas_subscriptions Row für einen User,
 * der gerade via Stripe abonniert hat. Idempotent: wenn bereits vorhanden,
 * wird nur der plan aktualisiert.
 *
 * @param userId User-ID (UUID)
 * @param userEmail User-Email (für org name/slug)
 * @param stripePlan Stripe plan ID ("pro" | "team")
 * @param stripeCustomerId Stripe Customer ID
 * @param stripeSubscriptionId Stripe Subscription ID (optional)
 * @returns saas_orgs.id oder null bei Fehler/PGLite
 */
export async function createSaasOrgForUser(
  userId: string,
  userEmail: string,
  stripePlan: "pro" | "team" | "enterprise",
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
  /** Override seats (from Stripe metadata). Falls back to BILLABLE_PLANS default. */
  seatsOverride?: number
): Promise<string | null> {
  const pool = getSharedPgPool();
  if (!pool) return null; // PGLite mode — SaaS billing tables not available

  const saasPlan = toSaasPlan(stripePlan);
  if (!saasPlan) return null;

  const defaultSeats = BILLABLE_PLANS[stripePlan as "pro" | "team"]?.seats ?? 1;
  const seats = seatsOverride ?? defaultSeats;
  const orgSlug = `user-${userId.slice(0, 8)}`;
  const orgName = userEmail || orgSlug;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if org already exists (by slug — idempotent)
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM saas_orgs WHERE slug = $1`,
      [orgSlug]
    );

    let orgId: string;

    if (existing.rows.length > 0) {
      // Update existing org: plan, seats, subscription
      orgId = existing.rows[0].id;
      await client.query(
        `UPDATE saas_orgs SET plan = $1, seats = $2, updated_at = now() WHERE id = $3`,
        [saasPlan, seats, orgId]
      );
    } else {
      // Create new org
      const orgResult = await client.query<{ id: string }>(
        `INSERT INTO saas_orgs (name, slug, plan, seats)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [orgName, orgSlug, saasPlan, seats]
      );
      orgId = orgResult.rows[0].id;
    }

    // Upsert subscription
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await client.query(
      `INSERT INTO saas_subscriptions
         (org_id, plan, seats, status, stripe_customer_id, stripe_subscription_id,
          current_period_start, current_period_end)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
       ON CONFLICT (org_id) WHERE status = 'active'
       DO UPDATE SET plan = $2, seats = $3, stripe_customer_id = $4,
                     stripe_subscription_id = $5, updated_at = now()`,
      [
        orgId,
        saasPlan,
        seats,
        stripeCustomerId ?? null,
        stripeSubscriptionId ?? null,
        now,
        periodEnd,
      ]
    );

    // Allocate included credits for the current period
    const includedCredit = PLANS[saasPlan].included_credit * seats;
    await client.query(
      `INSERT INTO saas_credit_balance
         (org_id, period_start, period_end, included_credit, used_credit, overage_eur)
       VALUES ($1, $2, $3, $4, 0, 0)
       ON CONFLICT (org_id, period_start)
       DO UPDATE SET included_credit = $4, updated_at = now()`,
      [orgId, now, periodEnd, includedCredit]
    );

    await client.query("COMMIT");
    return orgId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.warn(
      `[saas-billing-sync] createSaasOrgForUser failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  } finally {
    client.release();
  }
}

/**
 * Aktualisiert den Plan eines bestehenden saas_orgs Row (upgrade/downgrade).
 * Wird bei customer.subscription.updated aufgerufen.
 */
export async function updateSaasPlan(
  userId: string,
  stripePlan: "pro" | "team" | "enterprise"
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  const saasPlan = toSaasPlan(stripePlan);
  if (!saasPlan) return;

  const orgSlug = `user-${userId.slice(0, 8)}`;

  try {
    // Read existing seats BEFORE updating — don't overwrite user-customized
    // seat counts with the plan default. When a user changes seats via the
    // seats API (updateSaasSeats), Stripe fires customer.subscription.updated
    // which calls this function. If we overwrote seats with the default, we'd
    // undo the user's seat change (race condition).
    const existing = await pool.query<{ id: string; seats: number }>(
      `SELECT id, seats FROM saas_orgs WHERE slug = $1`,
      [orgSlug]
    );

    if (existing.rows.length === 0) return;
    const orgId = existing.rows[0].id;
    // Preserve existing seats for team plan (users can customize 5-50 seats).
    // For pro (Solo) plan, always reset to 1 — it's a single-user plan.
    // Without this, a team→pro downgrade would keep 10 seats → 10x included_credit.
    const defaultSeats = BILLABLE_PLANS[stripePlan as "pro" | "team"]?.seats ?? 1;
    const seats =
      stripePlan === "team" && existing.rows[0].seats > 0 ? existing.rows[0].seats : defaultSeats;

    await pool.query(
      `UPDATE saas_orgs SET plan = $1, seats = $2, updated_at = now()
       WHERE id = $3`,
      [saasPlan, seats, orgId]
    );

    await pool.query(
      `UPDATE saas_subscriptions SET plan = $1, seats = $2, updated_at = now()
       WHERE org_id = $3 AND status = 'active'`,
      [saasPlan, seats, orgId]
    );

    // Update included credits for current period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const includedCredit = PLANS[saasPlan].included_credit * seats;
    await pool.query(
      `INSERT INTO saas_credit_balance
         (org_id, period_start, period_end, included_credit, used_credit, overage_eur)
       VALUES ($1, $2, $3, $4, 0, 0)
       ON CONFLICT (org_id, period_start)
       DO UPDATE SET included_credit = $4, updated_at = now()`,
      [orgId, periodStart, periodEnd, includedCredit]
    );
  } catch (err) {
    console.warn(
      `[saas-billing-sync] updateSaasPlan failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Markiert die Subscription als canceled. Wird bei
 * customer.subscription.deleted aufgerufen.
 */
export async function cancelSaasOrg(userId: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  const orgSlug = `user-${userId.slice(0, 8)}`;

  try {
    const result = await pool.query(`SELECT id FROM saas_orgs WHERE slug = $1`, [orgSlug]);

    if (result.rows.length > 0) {
      const orgId = result.rows[0].id;
      await pool.query(
        `UPDATE saas_subscriptions SET status = 'canceled', cancel_at_period_end = true,
                 updated_at = now()
         WHERE org_id = $1 AND status = 'active'`,
        [orgId]
      );
      // Set included_credit to 0 for the current period — canceled orgs
      // don't get monthly included credits. purchased_credit is preserved
      // (user keeps what they bought). resetMonthlyPeriod skips canceled
      // orgs (status != 'active'), so no new period row is created.
      await pool.query(
        `UPDATE saas_credit_balance SET included_credit = 0, updated_at = now()
         WHERE org_id = $1 AND period_end > now()`,
        [orgId]
      );
    }
  } catch (err) {
    console.warn(
      `[saas-billing-sync] cancelSaasOrg failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Monthly Overage Billing — erstellt saas_invoices Row für den vergangenen Monat.
 *
 * Wird von einem Cron-Job (z.B. Vercel Cron / Supabase pg_cron) am 1. des Monats
 * aufgerufen. Für jede aktive Org:
 *   1. Aggregiert usage aus saas_usage_ledger
 *   2. Berechnet overage = max(0, usageSell - includedCredit)
 *   3. Erstellt saas_invoices Row (interne Aufzeichnung)
 *
 * TODO (V2): Overage via Stripe Usage-Based Billing abrechnen:
 *   - Stripe Subscription mit billing_scheme=per_unit + usage.type=metered
 *   - reportUsage() API aufrufen um Usage an Stripe zu melden
 *   - Stripe erstellt automatisch die Invoice mit Overage-Position
 *   - Aktuell wird Overage nur intern erfasst (saas_invoices), nicht von Stripe
 *     eingezogen. Für V1 acceptable da included credits (€60 Solo / €200 Kanzlei/seat)
 *     grosszügig bemessen sind und Overage selten auftritt.
 */
export async function billMonthlyOverage(): Promise<{ orgs: number; invoices: number }> {
  const pool = getSharedPgPool();
  if (!pool) return { orgs: 0, invoices: 0 };

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // Get all orgs with active subscriptions
    const orgs = await pool.query<{ id: string; plan: string; seats: number }>(
      `SELECT o.id, o.plan, o.seats
       FROM saas_orgs o
       JOIN saas_subscriptions s ON s.org_id = o.id
       WHERE s.status = 'active'
         AND s.current_period_start < $1`,
      [periodEnd]
    );

    let invoices = 0;
    for (const org of orgs.rows) {
      // Check if invoice already exists for this period (idempotent)
      const existing = await pool.query(
        `SELECT id FROM saas_invoices
         WHERE org_id = $1 AND period_start = $2`,
        [org.id, periodStart]
      );
      if (existing.rows.length > 0) continue; // already invoiced

      // Aggregate usage
      const usage = await pool.query<{ total_sell: number; total_cost: number }>(
        `SELECT
           COALESCE(SUM(sell_eur), 0) AS total_sell,
           COALESCE(SUM(cost_eur), 0) AS total_cost
         FROM saas_usage_ledger
         WHERE org_id = $1 AND created_at >= $2 AND created_at < $3`,
        [org.id, periodStart.toISOString(), periodEnd.toISOString()]
      );

      const usageSell = Number(usage.rows[0]?.total_sell ?? 0);
      const planConfig = PLANS[org.plan as "solo" | "kanzlei" | "enterprise"];
      if (!planConfig) continue;

      const seatSubtotal = org.seats * planConfig.monthly_seat_price;
      const includedCredit = org.seats * planConfig.included_credit;

      // Get purchased_credit for this period (credit packs cover overage)
      const creditResult = await pool.query<{ purchased_credit: number }>(
        `SELECT COALESCE(purchased_credit, 0) as purchased_credit
         FROM saas_credit_balance
         WHERE org_id = $1 AND period_start = $2`,
        [org.id, periodStart]
      );
      const purchasedCredit = Number(creditResult.rows[0]?.purchased_credit ?? 0);

      // Overage = usage beyond included AND purchased credits
      const overage = Math.max(0, usageSell - includedCredit - purchasedCredit);
      const total = seatSubtotal + overage;

      const insertResult = await pool.query<{ id: number }>(
        `INSERT INTO saas_invoices
           (org_id, period_start, period_end, seats, seat_subtotal_eur,
            included_credit_eur, usage_cost_eur, overage_cost_eur, total_eur,
            status, line_items)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', '[]'::jsonb)
         ON CONFLICT (org_id, period_start) DO NOTHING
         RETURNING id`,
        [
          org.id,
          periodStart,
          periodEnd,
          org.seats,
          seatSubtotal,
          includedCredit,
          usageSell,
          overage,
          total,
        ]
      );
      // Only count if a new invoice was actually inserted (ON CONFLICT
      // DO NOTHING returns 0 rows if invoice already existed).
      if (insertResult.rows.length > 0) invoices++;
    }

    return { orgs: orgs.rows.length, invoices };
  } catch (err) {
    console.warn(
      `[saas-billing-sync] billMonthlyOverage failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { orgs: 0, invoices: 0 };
  }
}

/**
 * Updates seat count in saas_orgs + saas_subscriptions after a Stripe
 * seat change. Also updates included_credit in saas_credit_balance for
 * the current period (more seats = more included credits).
 */
export async function updateSaasSeats(userId: string, seats: number): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  const orgSlug = `user-${userId.slice(0, 8)}`;

  try {
    const result = await pool.query<{ id: string; plan: string }>(
      `SELECT id, plan FROM saas_orgs WHERE slug = $1`,
      [orgSlug]
    );

    if (result.rows.length === 0) return;
    const org = result.rows[0];

    await pool.query(`UPDATE saas_orgs SET seats = $2, updated_at = now() WHERE id = $1`, [
      org.id,
      seats,
    ]);
    await pool.query(
      `UPDATE saas_subscriptions SET seats = $2, updated_at = now()
       WHERE org_id = $1 AND status = 'active'`,
      [org.id, seats]
    );

    // Update included credits for current period
    const planConfig = PLANS[org.plan as "solo" | "kanzlei" | "enterprise"];
    if (planConfig) {
      const includedCredit = seats * planConfig.included_credit;
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      await pool.query(
        `UPDATE saas_credit_balance SET included_credit = $3, updated_at = now()
         WHERE org_id = $1 AND period_start = $2`,
        [org.id, periodStart, includedCredit]
      );
    }
  } catch (err) {
    console.warn(
      `[saas-billing-sync] updateSaasSeats failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Reactivates a suspended/past_due subscription after successful payment.
 * Sets saas_subscriptions.status back to 'active'.
 */
export async function reactivateSaasSubscription(userId: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  const orgSlug = `user-${userId.slice(0, 8)}`;

  try {
    const result = await pool.query(`SELECT id FROM saas_orgs WHERE slug = $1`, [orgSlug]);

    if (result.rows.length > 0) {
      const orgId = result.rows[0].id;
      await pool.query(
        `UPDATE saas_subscriptions SET status = 'active', cancel_at_period_end = false,
                 updated_at = now()
         WHERE org_id = $1 AND status IN ('past_due', 'paused', 'canceled')`,
        [orgId]
      );
      // Restore included credits for the current period (were set to 0 on cancel).
      // Only if the period is still active — resetMonthlyPeriod will handle
      // future periods with the correct included_credit from PLANS.
      const planRows = await pool.query<{ plan: string; seats: number }>(
        `SELECT plan, seats FROM saas_subscriptions WHERE org_id = $1 AND status = 'active'`,
        [orgId]
      );
      if (planRows.rows.length > 0) {
        const plan = planRows.rows[0].plan as "solo" | "kanzlei";
        const seats = planRows.rows[0].seats;
        const { PLANS } = await import("../../../server/src/core/saas-pricing");
        const includedCredit = PLANS[plan].included_credit * seats;
        await pool.query(
          `UPDATE saas_credit_balance SET included_credit = $2, updated_at = now()
           WHERE org_id = $1 AND period_end > now()`,
          [orgId, includedCredit]
        );
      }
    }
  } catch (err) {
    console.warn(
      `[saas-billing-sync] reactivateSaasSubscription failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Monthly Period Reset — erstellt neue saas_credit_balance Rows für den
 * neuen Monat und überträgt purchased_credit (gekaufte Credits sind permanent).
 *
 * Wird am 1. jedes Monats VOR billMonthlyOverage aufgerufen:
 *   1. Für jede aktive Org: neuen saas_credit_balance Row für den neuen Monat
 *   2. included_credit aus dem SaaS Plan setzen (€60 Solo / €200 Kanzlei/seat)
 *   3. purchased_credit aus dem Vormonat übernehmen (gekauft = permanent)
 *   4. used_credit = 0 (frischer Monat)
 *   5. overage_eur = 0
 *
 * Idempotent: ON CONFLICT (org_id, period_start) DO NOTHING.
 */
export async function resetMonthlyPeriod(): Promise<{ orgs: number; rows: number }> {
  const pool = getSharedPgPool();
  if (!pool) return { orgs: 0, rows: 0 };

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const prevPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  try {
    // Get all orgs with active subscriptions
    const orgs = await pool.query<{ id: string; plan: string; seats: number }>(
      `SELECT o.id, o.plan, o.seats
       FROM saas_orgs o
       JOIN saas_subscriptions s ON s.org_id = o.id
       WHERE s.status = 'active'`,
      []
    );

    let rows = 0;
    for (const org of orgs.rows) {
      const planConfig = PLANS[org.plan as "solo" | "kanzlei" | "enterprise"];
      if (!planConfig) continue;

      const includedCredit = org.seats * planConfig.included_credit;

      // Get purchased_credit from previous period (carry over)
      const prevResult = await pool.query<{ purchased_credit: number }>(
        `SELECT COALESCE(purchased_credit, 0) as purchased_credit
         FROM saas_credit_balance
         WHERE org_id = $1 AND period_start = $2`,
        [org.id, prevPeriodStart]
      );
      const purchasedCredit = Number(prevResult.rows[0]?.purchased_credit ?? 0);

      // Insert new period row (idempotent)
      const result = await pool.query(
        `INSERT INTO saas_credit_balance
           (org_id, period_start, period_end, included_credit, used_credit,
            overage_eur, purchased_credit)
         VALUES ($1, $2, $3, $4, 0, 0, $5)
         ON CONFLICT (org_id, period_start) DO NOTHING
         RETURNING org_id`,
        [org.id, periodStart, periodEnd, includedCredit, purchasedCredit]
      );
      if (result.rows.length > 0) rows++;
    }

    return { orgs: orgs.rows.length, rows };
  } catch (err) {
    console.warn(
      `[saas-billing-sync] resetMonthlyPeriod failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return { orgs: 0, rows: 0 };
  }
}
